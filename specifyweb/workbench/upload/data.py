from typing import List, Dict, Tuple, Any, NamedTuple, Optional, Union
from typing_extensions import Protocol

from .validation_schema import CellIssue, TableIssue, NewRow, RowValidation

Row = Dict[str, str]
Filter = Dict[str, Any]

class Exclude(NamedTuple):
    lookup: str
    table: str
    filter: Filter


class FilterPack(NamedTuple):
    filters: List[Filter]
    excludes: List[Exclude]

class ReportInfo(NamedTuple):
    "Records the table and wb cols an upload result refers to."
    tableName: str
    columns: List[str]


class Uploaded(NamedTuple):
    id: int
    info: ReportInfo

    def get_id(self) -> Optional[int]:
        return self.id

    def is_failure(self) -> bool:
        return False

    def validation_info(self) -> RowValidation:
        return RowValidation(
            cellIssues=[],
            tableIssues=[],
            newRows=[NewRow(
                tableName=self.info.tableName,
                columns=self.info.columns,
                id=self.id
            )]
        )

    def to_json(self):
        return { 'Uploaded': self._asdict() }


class Matched(NamedTuple):
    id: int
    info: ReportInfo

    def get_id(self) -> Optional[int]:
        return self.id

    def is_failure(self) -> bool:
        return False

    def validation_info(self) -> RowValidation:
        return RowValidation([], [], [])

    def to_json(self):
        return { 'Matched': self._asdict() }


class MatchedMultiple(NamedTuple):
    ids: List[int]
    info: ReportInfo

    def get_id(self) -> Optional[int]:
        return self.ids[0]

    def is_failure(self) -> bool:
        return True

    def validation_info(self) -> RowValidation:
        return RowValidation(
            cellIssues=[],
            newRows=[],
            tableIssues=[
                TableIssue(
                    tableName=self.info.tableName,
                    columns=self.info.columns,
                    issue="Multiple records matched."
        )])

    def to_json(self):
        return { 'MatchedMultiple': self._asdict() }

class NullRecord(NamedTuple):
    info: ReportInfo

    def get_id(self) -> Optional[int]:
        return None

    def is_failure(self) -> bool:
        return False

    def validation_info(self) -> RowValidation:
        return RowValidation([], [], [])

    def to_json(self):
        return { 'NullRecord': self._asdict() }

class FailedBusinessRule(NamedTuple):
    message: str
    info: ReportInfo

    def get_id(self) -> Optional[int]:
        return None

    def is_failure(self) -> bool:
        return True

    def validation_info(self) -> RowValidation:
        return RowValidation(
            cellIssues=[],
            newRows=[],
            tableIssues=[
                TableIssue(
                    tableName=self.info.tableName,
                    columns=self.info.columns,
                    issue=self.message
        )])

    def to_json(self):
        return { self.__class__.__name__: self._asdict() }

class FailedParsing(NamedTuple):
    failures: List[CellIssue]

    def get_id(self) -> Optional[int]:
        return None

    def is_failure(self) -> bool:
        return True

    def validation_info(self) -> RowValidation:
        return RowValidation(
            cellIssues=self.failures,
            newRows=[],
            tableIssues=[]
        )

    def to_json(self):
        return { self.__class__.__name__: self._asdict() }

class UploadResult(NamedTuple):
    record_result: Union[Uploaded, Matched, MatchedMultiple, NullRecord, FailedBusinessRule, FailedParsing]
    toOne: Dict[str, Any]
    toMany: Dict[str, Any]

    def get_id(self) -> Optional[int]:
        return self.record_result.get_id()

    def contains_failure(self) -> bool:
        return ( self.record_result.is_failure()
                 or any(result.contains_failure() for result in self.toOne.values())
                 or any(result.contains_failure() for results in self.toMany.values() for result in results)
        )

    def validation_info(self) -> RowValidation:
        info = self.record_result.validation_info()
        toOneInfos = [r.validation_info() for r in self.toOne.values()]
        toManyInfos = [rr.validation_info() for r in self.toMany.values() for rr in r]

        return RowValidation(
            cellIssues = info.cellIssues
                + [cellIssue for info in toOneInfos for cellIssue in info.cellIssues]
                + [cellIssue for info in toManyInfos for cellIssue in info.cellIssues],

            tableIssues = info.tableIssues
                + [tableIssue for info in toOneInfos for tableIssue in info.tableIssues]
                + [tableIssue for info in toManyInfos for tableIssue in info.tableIssues],

            newRows = info.newRows
                + [newRow for info in toOneInfos for newRow in info.newRows]
                + [newRow for info in toManyInfos for newRow in info.newRows]
        )

    def to_json(self):
        return { 'UploadResult': {
            'record_result': self.record_result.to_json(),
            'toOne': {k: v.to_json() for k,v in self.toOne.items()},
            'toMany': {k: [v.to_json() for v in vs] for k,vs in self.toMany.items()},
        }}


class Uploadable(Protocol):
    def filter_on(self, collection, path: str, row: Row) -> FilterPack:
        ...

    def upload_row(self, collection, row: Row) -> UploadResult:
        ...

    def to_json(self) -> Dict:
        ...
