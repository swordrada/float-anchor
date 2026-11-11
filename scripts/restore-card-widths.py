#!/usr/bin/env python3
"""Undo evidenced width increases without reverting notes or later manual sizes.

Compare a pre-change backup with the exact bad layout snapshot. Only a current
width still equal to the bad snapshot is eligible. Writes a separate candidate.
"""
import argparse
import copy
import json
import math
from pathlib import Path


def index_cards(data):
    result = {}
    for board in data['canvases']:
        for card in board['cards']:
            key = (board['id'], card['id'])
            if key in result:
                raise ValueError(f'Duplicate card identity: {key}')
            result[key] = card
    return result


def restore_widths(current, before, applied):
    original, changed = index_cards(before), index_cards(applied)
    index_cards(current)  # Refuse ambiguous identities before producing a candidate.
    candidate = copy.deepcopy(current)
    restored, skipped = [], []
    for board in candidate['canvases']:
        for card in board['cards']:
            key = (board['id'], card['id'])
            old, bad = original.get(key), changed.get(key)
            if old is None or bad is None:
                continue
            widths = (old.get('width'), bad.get('width'), card.get('width'))
            if any(isinstance(w, bool) or not isinstance(w, (int, float)) or
                   not math.isfinite(w) or w <= 0 for w in widths):
                raise ValueError(f'Invalid card width: {key}')
            old_width, bad_width, current_width = widths
            if bad_width <= old_width or current_width == old_width:
                continue
            entry = {'canvasId': board['id'], 'canvas': board['name'], 'cardId': card['id'],
                     'originalWidth': old_width, 'appliedWidth': bad_width, 'currentWidth': current_width}
            if current_width != bad_width:
                skipped.append({**entry, 'reason': 'width changed after the layout repair'})
                continue
            card['width'] = old_width
            restored.append(entry)
    return candidate, {'restoredCount': len(restored), 'skippedCount': len(skipped),
                       'restored': restored, 'skipped': skipped}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    for name in ['data', 'before', 'applied', 'output', 'report']:
        parser.add_argument('--' + name, type=Path, required=True)
    args = parser.parse_args()
    inputs = {p.resolve() for p in [args.data, args.before, args.applied]}
    if args.output.resolve() in inputs or args.report.resolve() in inputs or args.output.resolve() == args.report.resolve():
        parser.error('Candidate and report must use separate paths from every input')
    candidate, report = restore_widths(*(json.loads(p.read_text()) for p in [args.data, args.before, args.applied]))
    args.output.write_text(json.dumps(candidate, ensure_ascii=False, indent=2) + '\n')
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({k: report[k] for k in ['restoredCount', 'skippedCount']}))
