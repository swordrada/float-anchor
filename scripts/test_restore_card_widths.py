import copy
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('widths', Path(__file__).with_name('restore-card-widths.py'))
widths = importlib.util.module_from_spec(spec)
spec.loader.exec_module(widths)


class RestoreWidthsTest(unittest.TestCase):
    def test_restores_only_evidenced_sizes_and_keeps_new_edits(self):
        before = {'canvases': [{'id': 'b', 'name': 'Board', 'cards': [
            {'id': str(i), 'width': w, 'content': 'old'} for i, w in enumerate([373, 420, 373, 373])]}]}
        applied = copy.deepcopy(before)
        for card in applied['canvases'][0]['cards']:
            card['width'] = 520
        current = copy.deepcopy(applied)
        cards = current['canvases'][0]['cards']
        cards[0].update(content='latest content', x=83, height=900)
        cards[2]['width'] = 450  # A subsequent manual resize must survive.
        cards.pop()  # Do not recreate deleted notes.
        cards.append({'id': 'new', 'width': 600})
        snapshot = copy.deepcopy(current)
        result, report = widths.restore_widths(current, before, applied)
        expected = copy.deepcopy(current)
        expected['canvases'][0]['cards'][0]['width'] = 373
        expected['canvases'][0]['cards'][1]['width'] = 420
        self.assertEqual(result, expected)
        self.assertEqual(current, snapshot)
        self.assertEqual((report['restoredCount'], report['skippedCount']), (2, 1))
        again, report = widths.restore_widths(result, before, applied)
        self.assertEqual(again, result)
        self.assertEqual(report['restoredCount'], 0)

    def test_duplicate_identity_is_rejected(self):
        data = {'canvases': [{'id': 'b', 'name': 'Board', 'cards': [{'id': 'a', 'width': 373}] * 2}]}
        with self.assertRaises(ValueError):
            widths.restore_widths(data, data, data)
