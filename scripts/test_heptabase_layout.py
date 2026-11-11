import unittest
from heptabase_layout import connection_route, restore_layout


class LayoutTest(unittest.TestCase):
    def test_connection_anchors_are_not_dropped(self):
        self.assertEqual(connection_route({'type':'elbow','beginPos':'auto','endPos':'top','controlPoints':'[]'}),
                         {'routing':'elbow','fromSide':'auto','toSide':'top'})
        self.assertEqual(connection_route({'type':'elbow','begin_pos':'right','end_pos':'left'})['fromSide'],'right')

    def test_manual_lanes_survive_and_unknown_formats_fail(self):
        point = {'direction':'vertical','x':50,'y':80}
        self.assertEqual(connection_route({'type':'elbow','controlPoints':[point]})['controlPoints'],[point])
        with self.assertRaises(ValueError):
            connection_route({'type':'elbow','controlPoints':[{'x':50,'y':80}]})

    def test_source_corridors_and_staggered_columns_survive(self):
        source = [{'x':0,'y':0,'width':520,'height':200},
                  {'x':650,'y':300,'width':520,'height':300},
                  {'x':0,'y':400,'width':520,'height':200}]
        targets = [{'id':str(i),'width':373,'height':200,'content':'untouched'} for i in range(3)]
        restore_layout(list(zip(targets,source)))
        self.assertGreater(targets[1]['y'],targets[0]['y'])
        self.assertGreater(targets[1]['x']-(targets[0]['x']+targets[0]['width']),80)
        self.assertGreater(targets[2]['y']-(targets[0]['y']+targets[0]['height']),150)
        self.assertTrue(all(t['content']=='untouched' for t in targets))
        first = [t.copy() for t in targets]
        restore_layout(list(zip(targets,source)))
        self.assertEqual(first,targets)

    def test_mixed_source_and_custom_widths_never_stretch_other_cards(self):
        sources = [{'x': i * 700, 'y': 0, 'width': width, 'height': 200}
                   for i, width in enumerate([520, 1040, 520])]
        targets = [{'width': width, 'height': 200}
                   for width in [373, 373, 650]]
        restore_layout(list(zip(targets, sources)))
        self.assertEqual([t['width'] for t in targets], [373, 373, 650])
        self.assertGreater(targets[1]['x'], targets[0]['x'] + targets[0]['width'])
        first = [t.copy() for t in targets]
        restore_layout(list(zip(targets, sources)))
        self.assertEqual(first, targets)


if __name__ == '__main__':
    unittest.main()
