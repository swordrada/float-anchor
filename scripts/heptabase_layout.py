"""Preserve Heptabase's spatial relationships without replacing note content."""
import json

SIDES = {'auto', 'left', 'right', 'top', 'bottom'}
LABEL_SNAP_GAP = 4  # Match the canvas title gap in src/canvasSnapping.ts.


def connection_route(connection):
    def value(camel, snake, default=None):
        return connection.get(camel, connection.get(snake, default))
    kind = connection.get('type') or 'curve'
    if kind not in {'elbow', 'curve', 'straight', 'line'}:
        raise ValueError(f'Unsupported Heptabase connection type: {kind}')
    points = value('controlPoints', 'control_points', []) or []
    if isinstance(points, str):
        points = json.loads(points)
    if not isinstance(points, list) or any(not isinstance(p, dict) or
            (p.get('direction') not in {'horizontal', 'vertical'} and not (kind == 'curve' and 'direction' not in p)) or
            not all(isinstance(p.get(k), (int, float)) for k in ['x', 'y']) for p in points):
        raise ValueError('Unsupported manual control point format')
    start, end = value('beginPos', 'begin_pos', 'auto'), value('endPos', 'end_pos', 'auto')
    if start not in SIDES or end not in SIDES:
        raise ValueError(f'Unsupported connection anchors: {start}, {end}')
    result = {'routing': 'straight' if kind == 'line' else kind, 'fromSide': start, 'toSide': end}
    if points:
        result['controlPoints'] = [{k: p[k] for k in ['direction', 'x', 'y'] if k in p} for p in points]
    return result


def restore_layout(pairs, label_pairs=(), section_pairs=()):
    """Keep column offsets and blank routing corridors with one transform.

    Existing note sizes set the minimum spacing scale. Card widths belong to
    FloatAnchor and must never be scaled, including default-width cards next
    to manually resized cards. Expand vertical spacing uniformly to fit the
    text metrics; never compact or top-align columns.
    pairs are (mutable FloatAnchor entity, source entity with x/y/width/height).
    """
    if not pairs:
        return 1, 1
    scale_x = max(target['width'] / source['width'] for target, source in pairs)
    scale_y = max(scale_x, max((target.get('height', 200) + 12) / max(1, source.get('height', 200))
                               for target, source in pairs))
    for target, source in pairs:
        target.update(x=round(source['x'] * scale_x, 2), y=round(source['y'] * scale_y, 2),
                      height=round(source['height'] * scale_y - 12, 2))
    for target, source in [*label_pairs, *section_pairs]:
        target.update(x=round(source['x'] * scale_x, 2), y=round(source['y'] * scale_y, 2),
                      width=round(source['width'] * scale_x, 2))
        if 'height' in target:
            target['height'] = round(source['height'] * scale_y, 2)
    for target, source in label_pairs:
        # Titles sit directly above their original column, at the same 4px gap
        # as a dragged title. Labels use UI text metrics, not card scaling.
        below = [(t, s) for t, s in pairs if abs(s['x']-source['x']) < 2 and
                 0 <= s['y']-source['y'] <= source.get('height', 50)+20]
        if below:
            card, _ = min(below, key=lambda p: p[1]['y'])
            height = [14, 28, 22, 18, 15][target.get('level', 1)] * 1.3 + 14
            target['y'] = round(card['y'] - height - LABEL_SNAP_GAP, 2)
    return scale_x, scale_y


def transform_routes(connections, scale_x, scale_y):
    for connection in connections:
        for point in connection.get('controlPoints', []):
            point['x'] = round(point['x'] * scale_x, 2)
            point['y'] = round(point['y'] * scale_y, 2)
