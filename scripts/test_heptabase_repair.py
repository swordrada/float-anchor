import copy
import importlib.util
import json
import sqlite3
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('repair', Path(__file__).with_name('repair-heptabase-layout.py'))
repair = importlib.util.module_from_spec(spec); spec.loader.exec_module(repair)


class RepairTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:'); self.db.row_factory = sqlite3.Row
        self.db.executescript('''
        create table whiteboard(id text,name text,is_trashed integer);
        create table card(id text,title text,is_trashed integer);
        create table card_instance(id text,card_id text,whiteboard_id text,x real,y real,width real,height real);
        create table text_element(id text,whiteboard_id text,content text,x real,y real,width real,height real);
        create table section(id text,whiteboard_id text,title text,x real,y real,width real,height real);
        create table connection(id text,whiteboard_id text,begin_id text,end_id text,begin_object_type text,end_object_type text,begin_pos text,end_pos text,type text,control_points text);
        insert into whiteboard values ('wb','Imported',0);
        insert into card values ('note','Note',0);
        insert into card_instance values ('ci','note','wb',500,200,520,300);
        insert into section values ('sec','wb','Group',450,150,600,500);
        insert into connection values ('line','wb','label','sec','textElement','section','right','top','elbow','[]');
        ''')
        self.db.execute('insert into text_element values (?,?,?,?,?,?,?)',('label','wb',json.dumps({'text':'Heading'}),0,0,300,40))
        self.data={'canvases':[{'id':'local','name':'Imported','cards':[{'id':'c','title':'Note','content':'user edit','x':3,'y':5,'width':373,'height':200}],
          'labels':[{'id':'l','text':'Heading','level':3,'x':0,'y':4,'width':200}],
          'sections':[{'id':'s','name':'Group','x':4,'y':5,'width':400,'height':300,'cardIds':['c'],'color':'blue'}]},
          {'id':'own','name':'Local','cards':[]}]}

    def test_restores_sections_and_missing_routes_without_replacing_text_or_ids(self):
        report=repair.repair_all(self.data,self.db)
        b=self.data['canvases'][0]
        self.assertEqual(b['cards'][0]['content'],'user edit')
        self.assertEqual(b['cards'][0]['width'],373)
        self.assertEqual(b['sections'][0]['cardIds'],['c'])
        self.assertEqual(b['connections'][0]['fromCardId'],'l')
        self.assertEqual(b['connections'][0]['toCardId'],'s')
        self.assertEqual(report['boards'][0]['addedConnections'],1)
        self.assertEqual(report['untouchedBoards'],['Local'])
        first=copy.deepcopy(self.data); repair.repair_all(self.data,self.db)
        self.assertEqual(first,self.data)

    def test_unresolved_route_fails_atomically(self):
        self.db.execute("update connection set end_id='missing'")
        original=copy.deepcopy(self.data)
        with self.assertRaises(ValueError): repair.repair_all(self.data,self.db)
        self.assertEqual(original,self.data)

    def test_rendered_content_expands_layout_and_manual_lanes_together(self):
        self.db.execute('update connection set control_points=?', (json.dumps([{'direction':'horizontal','x':200,'y':100}]),))
        report=repair.repair_all(self.data,self.db,{'c':588})
        b=self.data['canvases'][0]
        self.assertEqual(report['boards'][0]['layoutScale'],{'x':373/520,'y':2})
        self.assertEqual((b['cards'][0]['x'],b['cards'][0]['y'],b['cards'][0]['height']),(358.65,400,588))
        self.assertEqual(b['connections'][0]['controlPoints'][0],{'direction':'horizontal','x':143.46,'y':200})
        first=copy.deepcopy(self.data); repair.repair_all(self.data,self.db,{'c':588})
        self.assertEqual(first,self.data)

    def test_old_manual_lane_is_cleared_when_source_reverts_to_automatic(self):
        self.data['canvases'][0]['connections']=[{'id':'old','fromCardId':'l','toCardId':'s','controlPoints':[{'direction':'vertical','x':20,'y':10}],'laneOffset':10}]
        repair.repair_all(self.data,self.db)
        c=self.data['canvases'][0]['connections'][0]
        self.assertEqual(c['id'],'old'); self.assertNotIn('controlPoints',c); self.assertNotIn('laneOffset',c)

    def test_deleted_notes_are_not_recreated(self):
        self.db.executescript("insert into card values ('deleted','Deleted',0); insert into card_instance values ('missing','deleted','wb',0,0,520,300);")
        r=repair.repair_all(self.data,self.db)
        self.assertEqual(len(self.data['canvases'][0]['cards']),1)
        self.assertEqual(r['boards'][0]['missingSourceCards'][0]['title'],'Deleted')

    def test_duplicate_note_instances_match_titleless_body_and_stay_distinct(self):
        title='A repeated long note title which was moved into the body of one appearance'
        sources=[{'id':'s1','card_id':'note','match_text':title,'x':0,'y':0,'width':520}, {'id':'s2','card_id':'note','match_text':title,'x':2000,'y':0,'width':520}]
        targets=[{'id':'a','title':title,'content':'text','x':0,'y':0,'width':373}, {'id':'b','title':'','content':title+'\nbody','x':1434,'y':0,'width':373}]
        pairs,missing=repair.match_entities(targets,sources,'title','card_id')
        self.assertEqual([(t['id'],s['id']) for t,s in pairs],[('a','s1'),('b','s2')]);self.assertEqual(missing,[])

    def test_invalid_duplicate_mapping_stops_instead_of_guessing(self):
        sources=[{'id':'s','card_id':'note','match_text':'Same','x':0,'y':0,'width':520}]
        targets=[{'id':i,'title':'Same','x':0,'y':0,'width':373} for i in ['a','b']]
        with self.assertRaises(ValueError): repair.match_entities(targets,sources,'title','card_id')
