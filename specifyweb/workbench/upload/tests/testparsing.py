import io
import csv

from .base import UploadTestsBase, get_table
from ..data import Uploaded, ParseFailures, CellIssue
from ..upload import do_upload, do_upload_csv
from ..parsing import parse_coord
from ..upload_table import UploadTable

class ParsingTests(UploadTestsBase):
    def test_parse_latlong(self) -> None:
        tests = {
            '34.123 N': (34.123, 0),
            '36:07 N': (36 + 7/60, 2),
            '39:51:41 N': (39 + 51/60 + 41/60/60, 1),
            '00.07152778 N': (0.07152778, 0),
            '17:22.88 N': (17 + 22.88/60, 2),
            '39:51:41.02 N': (39 + 51/60 + 41.02/60/60, 1),
            '-39:51:41': (-(39 + 51/60 + 41/60/60), 1),
            '39:51:41 s': (-(39 + 51/60 + 41/60/60), 1),
            '39:51.41 w': (-(39 + 51.41/60), 2),
            '.34': (0.34, 0),
            '-.34': (-0.34, 0),
            '17:22.88 E': (17 + 22.88/60, 2),
            '28° N': (28, 0),
            '28° 19\' N': (28 + 19/60, 2),
            '28° 19\' 0.121" N': (28 + 19/60 + 0.121/60/60, 1),
            '115° 34\' 59.872" W': (-(115 + 34/60 + 59.872/60/60), 1),
            '1 01 S': (-(1 + 1/60), 2),
            '1 01 W': (-(1 + 1/60), 2),
            '0 01 S': (-(0 + 1/60), 2),
            '0 01 W': (-(0 + 1/60), 2),
            '-1 01': (-(1 + 1/60), 2),
            '-0 01': (-(0 + 1/60), 2),
            'foobar': None,
        }

        for k, v in tests.items():
            self.assertEqual(parse_coord(k), v)

    def test_parsing_errors_reported(self) -> None:
        reader = csv.DictReader(io.StringIO(
'''BMSM No.,Class,Superfamily,Family,Genus,Subgenus,Species,Subspecies,Species Author,Subspecies Author,Who ID First Name,Determiner 1 Title,Determiner 1 First Name,Determiner 1 Middle Initial,Determiner 1 Last Name,ID Date Verbatim,ID Date,ID Status,Country,State/Prov/Pref,Region,Site,Sea Basin,Continent/Ocean,Date Collected,Start Date Collected,End Date Collected,Collection Method,Verbatim Collecting method,No. of Specimens,Live?,W/Operc,Lot Description,Prep Type 1,- Paired valves,for bivalves - Single valves,Habitat,Min Depth (M),Max Depth (M),Fossil?,Stratum,Sex / Age,Lot Status,Accession No.,Original Label,Remarks,Processed by,Cataloged by,DateCataloged,Latitude1,Latitude2,Longitude1,Longitude2,Lat Long Type,Station No.,Checked by,Label Printed,Not for publication on Web,Realm,Estimated,Collected Verbatim,Collector 1 Title,Collector 1 First Name,Collector 1 Middle Initial,Collector 1 Last Name,Collector 2 Title,Collector 2 First Name,Collector 2 Middle Initial,Collector 2 Last name,Collector 3 Title,Collector 3 First Name,Collector 3 Middle Initial,Collector 3 Last Name,Collector 4 Title,Collector 4 First Name,Collector 4 Middle Initial,Collector 4 Last Name
1365,Gastropoda,Fissurelloidea,Fissurellidae,Diodora,,meta,,"(Ihering, 1927)",,,,,,, , ,,USA,LOUISIANA,,[Lat-long site],Gulf of Mexico,NW Atlantic O.,Date unk'n,,,,,6,0,0,Dry; shell,Dry,,,,71,74,0,,,,313,,Dredged,JSG,MJP,22/01/2003,28° 03.44' N,,92° 26.98' W,,Point,,JSG,19/06/2003,0,Marine,0,Emilio Garcia,,Emilio,,Garcia,,,,,,,,,,,,
1366,Gastropoda,Fissurelloidea,Fissurellidae,Emarginula,,phrixodes,,"Dall, 1927",,,,,,, , ,,USA,LOUISIANA,,[Lat-long site],Gulf of Mexico,NW Atlantic O.,Date unk'n,,,,,3,0,0,Dry; shell,Dry,,,In coral rubble,57,65,0,,,,313,,,JSG,MJP,22/01/2003,28° 06.07' N,,91° 02.42' W,,Point,D-7(1),JSG,19/06/2003,0,Marine,0,Emilio Garcia,,Emilio,,Garcia,,,,,,,,,,,,
1367,Gastropoda,Fissurelloidea,Fissurellidae,Emarginula,,sicula,,"J.E. Gray, 1825",,,,,,, , ,,USA,Foobar,,[Lat-long site],Gulf of Mexico,NW Atlantic O.,Date unk'n,foobar,,,,1,0,0,Dry; shell,Dry,,,In coral rubble,57,65,0,,,,313,,,JSG,MJP,22/01/2003,28° 06.07' N,,91° 02.42' W,,Point,D-7(1),JSG,19/06/2003,0,Marine,0,Emilio Garcia,,Emilio,,Garcia,,,,,,,,,,,,
1368,Gastropoda,Fissurelloidea,Fissurellidae,Emarginula,,tuberculosa,,"Libassi, 1859",,Emilio Garcia,,Emilio,,Garcia,Jan 2002,00/01/2002,,USA,LOUISIANA,off Louisiana coast,[Lat-long site],Gulf of Mexico,NW Atlantic O.,Date unk'n,,,,,11,0,0,Dry; shell,Dry,,,"Subtidal 65-91 m, in coralline [sand]",65,91,0,,,,313,,Dredged.  Original label no. 23331.,JSG,MJP,22/01/2003,27° 59.14' N,,91° 38.83' W,,Point,D-4(1),JSG,19/06/2003,0,Marine,0,Emilio Garcia,,Emilio,,Garcia,,,,,,,,,,,,
'''))
        upload_results = do_upload_csv(self.collection, reader, self.example_plan)
        failed_result = upload_results[2]
        self.assertIsInstance(failed_result.record_result, ParseFailures)
        for result in upload_results:
            if result is not failed_result:
                self.assertIsInstance(result.record_result, Uploaded)
                self.assertEqual(1, get_table('collectionobject').objects.filter(id=result.get_id()).count())


    def test_multiple_parsing_errors_reported(self) -> None:
        reader = csv.DictReader(io.StringIO(
'''BMSM No.,Class,Superfamily,Family,Genus,Subgenus,Species,Subspecies,Species Author,Subspecies Author,Who ID First Name,Determiner 1 Title,Determiner 1 First Name,Determiner 1 Middle Initial,Determiner 1 Last Name,ID Date Verbatim,ID Date,ID Status,Country,State/Prov/Pref,Region,Site,Sea Basin,Continent/Ocean,Date Collected,Start Date Collected,End Date Collected,Collection Method,Verbatim Collecting method,No. of Specimens,Live?,W/Operc,Lot Description,Prep Type 1,- Paired valves,for bivalves - Single valves,Habitat,Min Depth (M),Max Depth (M),Fossil?,Stratum,Sex / Age,Lot Status,Accession No.,Original Label,Remarks,Processed by,Cataloged by,DateCataloged,Latitude1,Latitude2,Longitude1,Longitude2,Lat Long Type,Station No.,Checked by,Label Printed,Not for publication on Web,Realm,Estimated,Collected Verbatim,Collector 1 Title,Collector 1 First Name,Collector 1 Middle Initial,Collector 1 Last Name,Collector 2 Title,Collector 2 First Name,Collector 2 Middle Initial,Collector 2 Last name,Collector 3 Title,Collector 3 First Name,Collector 3 Middle Initial,Collector 3 Last Name,Collector 4 Title,Collector 4 First Name,Collector 4 Middle Initial,Collector 4 Last Name
1367,Gastropoda,Fissurelloidea,Fissurellidae,Emarginula,,sicula,,"J.E. Gray, 1825",,,,,,, ,bad date,,USA,Foobar,,[Lat-long site],Gulf of Mexico,NW Atlantic O.,Date unk'n,foobar,,,,1,0,0,Dry; shell,Dry,,,In coral rubble,57,65,0,,,,313,,,JSG,MJP,22/01/2003,28° 06.07' N,,91° 02.42' W,,Point,D-7(1),JSG,19/06/2003,0,Marine,0,Emilio Garcia,,Emilio,,Garcia,,,,,,,,,,,,
'''))
        upload_results = do_upload_csv(self.collection, reader, self.example_plan)
        failed_result = upload_results[0].record_result
        self.assertIsInstance(failed_result, ParseFailures)
        assert isinstance(failed_result, ParseFailures) # make typechecker happy
        self.assertEqual([CellIssue(column='Start Date Collected', issue='bad date value: foobar'), CellIssue(column='ID Date', issue='bad date value: bad date')], failed_result.failures)

    def test_agent_type(self) -> None:
        plan = UploadTable(
            name='Agent',
            wbcols={
                'agenttype': 'agenttype',
                'lastname': 'lastname',
            },
            static={},
            toOne={},
            toMany={}
        )
        data = [
            {'agenttype': "Person", 'lastname': 'Doe'},
            {'agenttype': "Organization", 'lastname': 'Ministry of Silly Walks'},
            {'agenttype': "Extra Terrestrial", 'lastname': 'Zoidberg'},
            {'agenttype': "other", 'lastname': 'Juju'},
            {'agenttype': "group", 'lastname': 'Van Halen'},
        ]
        results = do_upload(self.collection, data, plan)

        result0 = results[0].record_result
        assert isinstance(result0, Uploaded)
        self.assertEqual(1, get_table('agent').objects.get(id=result0.get_id()).agenttype)

        result1 = results[1].record_result
        assert isinstance(result1, Uploaded)
        self.assertEqual(0, get_table('agent').objects.get(id=result1.get_id()).agenttype)

        result2 = results[2].record_result
        assert isinstance(result2, ParseFailures)
        self.assertEqual([CellIssue(column='agenttype', issue="bad agent type: Extra terrestrial. Expected one of ['Organization', 'Person', 'Other', 'Group']")], result2.failures)

        result3 = results[3].record_result
        assert isinstance(result3, Uploaded)
        self.assertEqual(2, get_table('agent').objects.get(id=result3.get_id()).agenttype)

        result4 = results[4].record_result
        assert isinstance(result4, Uploaded)
        self.assertEqual(3, get_table('agent').objects.get(id=result4.get_id()).agenttype)
