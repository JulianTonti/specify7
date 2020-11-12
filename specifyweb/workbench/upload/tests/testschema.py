from jsonschema import validate, Draft7Validator # type: ignore
import json

from ..upload_plan_schema import schema, parse_plan
from .. import validation_schema

from .base import UploadTestsBase
from . import example_plan


class SchemaTests(UploadTestsBase):
    maxDiff = None

    def test_schema_parsing(self) -> None:
        Draft7Validator.check_schema(schema)
        validate(example_plan.json, schema)
        plan = parse_plan(self.collection, example_plan.json).apply_scoping(self.collection)
        # have to test repr's here because NamedTuples of different
        # types can be equal if their fields are equal.
        self.assertEqual(repr(plan), repr(self.example_plan))

    def test_validation_schema_is_valid(self) -> None:
        Draft7Validator.check_schema(validation_schema.schema)

    def test_unparsing(self) -> None:
        self.assertEqual(example_plan.json, parse_plan(self.collection, example_plan.json).unparse())

