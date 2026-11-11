#!/usr/bin/env python3
"""Restore imported layouts and routes from a read-only Heptabase DB.

Only writes a separate candidate file. Existing notes, IDs, memberships, and
non-imported objects remain intact; missing notes are reported, never recreated.
Ambiguous matches or unresolved route endpoints fail before changing the input.
"""
import argparse
import copy
import json
import math
import re
import sqlite3
import uuid
from collections import defaultdict
from pathlib import Path
from heptabase_layout import connection_route, restore_layout, transform_routes


def plain(node):
    return node.get('text', '') + ''.join(plain(c) for c in node.get('content', []))


def normalized(text):
    return re.sub(r'[^\w]', '', text).lower()


def match_entities(targets, sources, field, source_key):
    pairs, missing, used = [], [], set()
    pending = []
    for source in sources:
        eligible = [t for t in targets if source_key != 'card_id' or not t.get('sourceInstanceId') or t['sourceInstanceId'] == 'hepta:' + source['id']]
        sid = 'hepta:' + source[source_key]
        # Card instances distinguish multiple appearances of the same note.
        matches = [t for t in eligible if t.get('sourceInstanceId') == 'hepta:' + source['id']] if source_key == 'card_id' else []
        if not matches:
            matches = [t for t in eligible if t.get('sourceId') == sid]
        if not matches:
            matches = [t for t in eligible if t.get(field) == source['match_text']]
            if field == 'title' and len(normalized(source['match_text'])) > 30:
                matches += [t for t in eligible if not t.get('title') and t not in matches and
                            normalized(t.get('content', '')).startswith(normalized(source['match_text']))]
        if not matches and field == 'title':
            title = normalized(source['match_text'])
            if len(title) > 10:
                matches = [t for t in eligible if title in normalized(t.get('content', ''))]
        if not matches:
            missing.append({'id': source['id'], 'title': source['match_text']})
        else:
            pending.append((source, matches))
    # Old imports had no provenance IDs. For repeated notes, only accept a
    # complete equal-size group with unchanged left-to-right / top-to-bottom order.
    groups = defaultdict(list)
    for source, matches in pending:
        groups[tuple(sorted(t['id'] for t in matches))].append(source)
    for ids, group in groups.items():
        remaining = [t for t in targets if t['id'] in ids and t['id'] not in used]
        if len(group) > len(remaining) and source_key == 'card_id' and len({s['card_id'] for s in group}) == 1:
            # An omitted duplicate instance is not a missing note. Keep the
            # appearance closest to the surviving original column, and report it.
            ranked = sorted(group, key=lambda s: min(abs(t['x']-s['x']*373/520) for t in remaining))
            missing.extend({'id': s['id'], 'title': s['match_text'], 'reason': 'omitted duplicate instance'} for s in ranked[len(remaining):])
            group = ranked[:len(remaining)]
        if len(group) != len(remaining):
            raise ValueError(f"Ambiguous repeated note: {group[0]['match_text']}")
        order = lambda x: (round(x['x'], 1), x['y'])
        originals, candidates = sorted(group, key=order), sorted(remaining, key=order)
        for source, target in zip(originals, candidates):
            # The legacy importer scaled x by 373/520; reject unrelated locations.
            if len(group) > 1 and abs(target['x'] - source['x'] * 373 / 520) > max(source['width'], target['width']) * 2:
                raise ValueError(f"Repeated note needs explicit mapping: {source['match_text']}")
            used.add(target['id']); pairs.append((target, source))
    return pairs, missing


def repair_board(board, db, source_id, measured_heights=None):
    before = copy.deepcopy(board)
    instances = [dict(r) for r in db.execute('select ci.*, c.title from card_instance ci join card c on c.id=ci.card_id where ci.whiteboard_id=? and not c.is_trashed', (source_id,))]
    for s in instances: s['match_text'] = s['title']
    pairs, missing_cards = match_entities(board['cards'], instances, 'title', 'card_id')
    labels = [dict(r) for r in db.execute('select * from text_element where whiteboard_id=?', (source_id,))]
    for s in labels: s['match_text'] = plain(json.loads(s['content'])).strip()
    labels = [s for s in labels if s['match_text']]
    label_pairs, missing_labels = match_entities(board.get('labels', []), labels, 'text', 'id')
    sections = [dict(r) for r in db.execute('select * from section where whiteboard_id=?', (source_id,))]
    for s in sections: s['match_text'] = s['title']
    section_pairs, missing_sections = match_entities(board.get('sections', []), sections, 'name', 'id')
    if missing_labels or missing_sections:
        raise ValueError(f"Missing source headings/sections: {missing_labels + missing_sections}")
    all_pairs = pairs + label_pairs + section_pairs
    mapping = {s['id']: t['id'] for t, s in all_pairs}
    restored, added = [], 0
    for row in db.execute('select * from connection where whiteboard_id=?', (source_id,)):
        source = dict(row)
        start, end = mapping.get(source['begin_id']), mapping.get(source['end_id'])
        if not start or not end:
            raise ValueError(f"Unresolved route endpoint: {source['id']} ({source['begin_object_type']} → {source['end_object_type']})")
        existing = board.setdefault('connections', [])
        matches = [c for c in existing if c.get('sourceId') == 'hepta:' + source['id']]
        if not matches:
            matches = [c for c in existing if c['fromCardId'] == start and c['toCardId'] == end and not c.get('sourceId')]
        if len(matches) > 1: raise ValueError('Ambiguous connection; refusing a partial repair')
        if matches: target = matches[0]
        else:
            target = {'id': str(uuid.uuid5(uuid.NAMESPACE_URL, f"heptabase:{board['id']}:{source['id']}"))}
            existing.append(target); added += 1
        for key in ['controlPoints', 'laneOffset']: target.pop(key, None)
        target.update(connection_route(source), fromCardId=start, toCardId=end,
                      anchorMode='heptabase', sourceId='hepta:' + source['id'])
        restored.append(target)
    for target, source in pairs:
        measured = (measured_heights or {}).get(target['id'], 0)
        if not isinstance(measured, (int, float)) or not math.isfinite(measured) or measured < 0:
            raise ValueError(f"Invalid measured height: {target['id']}")
        target['height'] = max(1, source['height'] - 12, measured)
        target['sourceId'] = 'hepta:' + source['card_id']
        target['sourceInstanceId'] = 'hepta:' + source['id']
    for target, source in label_pairs + section_pairs: target['sourceId'] = 'hepta:' + source['id']
    scale_x, scale_y = restore_layout(pairs, label_pairs, section_pairs)
    transform_routes(restored, scale_x, scale_y)
    moved = sum(any(abs(old.get(k, 0)-t.get(k, 0)) > 0.1 for k in ['x','y','width','height'])
                for key in ['cards','labels','sections'] for old in before.get(key, [])
                for t in board.get(key, []) if t['id'] == old['id'])
    # Keep the user's current focal point at the corresponding restored object.
    if moved and board.get('viewport'):
        vp = board['viewport']; scale = vp['scale']
        center = ((750-vp['panX'])/scale, (430-vp['panY'])/scale)
        matched_ids = {t['id'] for t, _ in all_pairs}
        old_objects = [t for key in ['cards','labels','sections'] for t in before.get(key, []) if t['id'] in matched_ids]
        if old_objects:
            old = min(old_objects, key=lambda t: (t['x']+t['width']/2-center[0])**2+(t['y']+t.get('height',40)/2-center[1])**2)
            target = next(t for t, _ in all_pairs if t['id'] == old['id'])
            vp['panX'] -= (target['x']-old['x'])*scale
            vp['panY'] -= (target['y']-old['y'])*scale
    return {'canvasId': board['id'], 'name': board['name'], 'cards': len(pairs), 'titles': len(label_pairs),
            'sections': len(section_pairs), 'connections': len(restored), 'addedConnections': added,
            'movedObjects': moved, 'layoutScale': {'x': scale_x, 'y': scale_y}, 'missingSourceCards': missing_cards,
            'preservedLocalObjects': sum(len(board.get(k, [])) for k in ['cards','labels','sections'])-len(all_pairs)}


def repair(data, db, name, measured_heights=None):
    boards = [c for c in data['canvases'] if c['name'] == name]
    source = db.execute('select id from whiteboard where name=? and not is_trashed', (name,)).fetchall()
    if len(boards) != 1 or len(source) != 1: raise ValueError('Expected one unambiguous board in each application')
    candidate = copy.deepcopy(boards[0])
    report = repair_board(candidate, db, source[0]['id'], measured_heights)
    boards[0].clear(); boards[0].update(candidate)
    return report


def repair_all(data, db, measured_heights=None):
    candidate = copy.deepcopy(data)
    reports, untouched = [], []
    for board in candidate['canvases']:
        source = db.execute('select id from whiteboard where name=? and not is_trashed', (board['name'],)).fetchall()
        if len(source) > 1: raise ValueError(f"Ambiguous board: {board['name']}")
        if not source: untouched.append(board['name']); continue
        reports.append(repair_board(board, db, source[0]['id'], measured_heights))
    data.clear(); data.update(candidate)
    return {'boards': reports, 'untouchedBoards': untouched}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--data', required=True, type=Path)
    parser.add_argument('--database', required=True, type=Path)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument('--canvas')
    selection.add_argument('--all', action='store_true')
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--report', type=Path)
    parser.add_argument('--measured-heights', type=Path, help='Optional JSON map of card IDs to rendered heights, measured at the current FloatAnchor widths')
    args = parser.parse_args()
    if args.output.resolve() == args.data.resolve(): parser.error('Use a separate output file; never patch a running app')
    data = json.loads(args.data.read_text())
    db = sqlite3.connect(f'file:{args.database.resolve()}?mode=ro', uri=True); db.row_factory = sqlite3.Row
    heights = json.loads(args.measured_heights.read_text()) if args.measured_heights else None
    result = repair_all(data, db, heights) if args.all else repair(data, db, args.canvas, heights)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n')
    if args.report: args.report.write_text(json.dumps(result, ensure_ascii=False, indent=2)+'\n')
    print(json.dumps(result, ensure_ascii=False, indent=2))
