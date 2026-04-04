#!/usr/bin/env python3
"""
Migrate Heptabase backup data to FloatAnchor format.

Usage:
  python3 scripts/migrate-heptabase.py <heptabase-backup-dir> [--output <path>]

If --output is not given, writes to the platform-default FloatAnchor data path.
"""

import json
import os
import sys
import uuid
import re
from pathlib import Path


FA_DEFAULT_WIDTH = 373
FA_GAP = 12
FA_TITLE_LINE_HEIGHT = 28
FA_BODY_LINE_HEIGHT = 20
FA_HEADER_PADDING = 24 + 8   # drag-handle(24) + card-header padding-top(8)
FA_BODY_PADDING = 8 + 14     # card-content padding top(8) + bottom(14)
FA_CHARS_PER_LINE = 24       # ~24 CJK chars per 373px at 14px font

HEPTA_CARD_WIDTH = 520       # Heptabase default card width
COORD_SCALE = FA_DEFAULT_WIDTH / HEPTA_CARD_WIDTH

SECTION_COLORS = ['#9ca3af', '#60a5fa', '#34d399', '#fb923c', '#f472b6']

HEPTABASE_COLOR_MAP = {
    'red': '#f472b6',
    'blue': '#60a5fa',
    'green': '#34d399',
    'yellow': '#fb923c',
    'purple': '#a78bfa',
    'orange': '#fb923c',
    'white': '#9ca3af',
    'gray': '#9ca3af',
    'grey': '#9ca3af',
}


def find_backup_root(given_path: str) -> str:
    p = Path(given_path)
    if (p / "All-Data.json").exists():
        return str(p)
    for child in sorted(p.iterdir()):
        if child.is_dir() and (child / "All-Data.json").exists():
            return str(child)
    print(f"ERROR: Cannot find All-Data.json under {given_path}")
    sys.exit(1)


def tiptap_to_markdown(node, depth=0) -> str:
    """Convert Heptabase TipTap/ProseMirror JSON to Markdown (best-effort)."""
    if isinstance(node, str):
        return node

    ntype = node.get("type", "")
    content = node.get("content", [])
    attrs = node.get("attrs", {})
    marks = node.get("marks", [])
    text = node.get("text", "")

    if ntype == "text":
        result = text
        for mark in marks:
            mt = mark["type"]
            ma = mark.get("attrs", {})
            if mt == "bold" or mt == "strong":
                result = f"**{result}**"
            elif mt == "italic":
                result = f"*{result}*"
            elif mt == "code":
                result = f"`{result}`"
            elif mt == "strike":
                result = f"~~{result}~~"
            elif mt == "link":
                href = ma.get("href", "")
                result = f"[{result}]({href})"
            elif mt == "textStyle":
                color = ma.get("color", "")
                if color:
                    result = f'<span style="color: {color}">{result}</span>'
            elif mt == "highlight":
                color = ma.get("color", "")
                if color:
                    result = f'<mark data-color="{color}" style="background-color: {color}">{result}</mark>'
        return result

    if ntype == "doc":
        parts = [tiptap_to_markdown(c, depth) for c in content]
        return "\n\n".join(p for p in parts if p is not None)

    if ntype == "paragraph":
        if not content:
            return "<br>"
        inline = "".join(tiptap_to_markdown(c, depth) for c in content)
        return inline

    if ntype == "heading":
        level = attrs.get("level", 1)
        inline = "".join(tiptap_to_markdown(c, depth) for c in content)
        return f"{'#' * level} {inline}"

    if ntype in ("bullet_list_item", "bulletList"):
        lines = []
        for c in content:
            sub = tiptap_to_markdown(c, depth + 1)
            if c.get("type") in ("bullet_list_item", "bulletList"):
                lines.append(sub)
            elif c.get("type") in ("numbered_list_item", "orderedList"):
                lines.append(sub)
            else:
                lines.append(f"{'  ' * depth}- {sub}")
        return "\n".join(lines)

    if ntype in ("numbered_list_item", "orderedList"):
        lines = []
        for i, c in enumerate(content):
            sub = tiptap_to_markdown(c, depth + 1)
            if c.get("type") in ("bullet_list_item", "bulletList", "numbered_list_item", "orderedList"):
                lines.append(sub)
            else:
                lines.append(f"{'  ' * depth}{i + 1}. {sub}")
        return "\n".join(lines)

    if ntype == "blockquote":
        inner = "\n\n".join(tiptap_to_markdown(c, depth) for c in content)
        return "\n".join(f"> {line}" for line in inner.split("\n"))

    if ntype == "codeBlock":
        lang = attrs.get("language", "")
        code = "".join(tiptap_to_markdown(c, depth) for c in content)
        return f"```{lang}\n{code}\n```"

    if ntype == "horizontalRule":
        return "---"

    if ntype == "image":
        src = attrs.get("src") or ""
        alt = attrs.get("alt") or ""
        file_id = attrs.get("fileId") or ""
        if not src and file_id:
            src = f"https://app.heptabase.com/api/files/{file_id}"
        if src:
            return f"![{alt}]({src})"
        return ""

    if ntype == "taskList":
        lines = []
        for c in content:
            lines.append(tiptap_to_markdown(c, depth))
        return "\n".join(lines)

    if ntype == "taskItem":
        checked = attrs.get("checked", False)
        mark = "x" if checked else " "
        inner = "".join(tiptap_to_markdown(c, depth) for c in content)
        return f"- [{mark}] {inner}"

    if content:
        return "\n\n".join(tiptap_to_markdown(c, depth) for c in content)

    return text


def tiptap_to_plain_text(node) -> str:
    """Extract plain text from TipTap JSON."""
    if isinstance(node, str):
        return node
    ntype = node.get("type", "")
    text = node.get("text", "")
    content = node.get("content", [])
    if ntype == "text":
        return text
    parts = [tiptap_to_plain_text(c) for c in content]
    return "".join(parts)


def sanitize_title_to_filename(title: str) -> str:
    return title.replace("/", "!")


def load_card_library_md(card_lib_dir: str) -> dict:
    result = {}
    if not os.path.isdir(card_lib_dir):
        return result
    for fname in os.listdir(card_lib_dir):
        if fname.endswith(".md"):
            fpath = os.path.join(card_lib_dir, fname)
            with open(fpath, "r", encoding="utf-8") as f:
                result[fname[:-3]] = f.read()
    return result


def get_card_markdown(card, md_library: dict) -> str:
    title = card.get("title", "")
    sanitized = sanitize_title_to_filename(title)

    if sanitized in md_library:
        return md_library[sanitized]

    for key in md_library:
        if sanitized.startswith(key) or key.startswith(sanitized):
            return md_library[key]

    raw_content = card.get("content", "")
    if not raw_content:
        return ""
    try:
        doc = json.loads(raw_content)
        md = tiptap_to_markdown(doc)
        return md
    except (json.JSONDecodeError, TypeError):
        return raw_content


def strip_first_heading(md_text: str, title: str = "") -> str:
    """Remove the first heading from markdown if it duplicates the card title."""
    lines = md_text.split("\n")
    result = []
    stripped = False
    for line in lines:
        if not stripped:
            m = re.match(r"^(#{1,6})\s+(.+)", line)
            if m:
                heading_text = m.group(2).strip()
                if not title or heading_text == title or title.startswith(heading_text) or heading_text.startswith(title):
                    stripped = True
                    continue
        result.append(line)
    return "\n".join(result).strip()


def estimate_card_height(title: str, content: str, width: int = FA_DEFAULT_WIDTH) -> int:
    """Estimate card height based on title + content text length."""
    chars_per_line = max(1, (width - 36) // 17)  # 36 = padding*2, 17px per CJK char approx

    h = FA_HEADER_PADDING

    if title:
        title_lines = max(1, -(-len(title) // chars_per_line))  # ceil division
        h += title_lines * FA_TITLE_LINE_HEIGHT

    if content:
        lines = content.split("\n")
        body_lines = 0
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped == '<br>':
                body_lines += 1
                continue
            if stripped.startswith("!["):
                img_h_px = 180
                match = re.search(r'api/files/([a-f0-9-]+)', stripped)
                if match and match.group(1) in file_metadata:
                    fm = file_metadata[match.group(1)]
                    if fm["width"] > 0:
                        content_w = width - 36
                        img_h_px = int(fm["height"] * content_w / fm["width"])
                body_lines += max(2, img_h_px // FA_BODY_LINE_HEIGHT)
                continue
            if stripped.startswith("#"):
                body_lines += 2
                continue
            visible_len = len(re.sub(r'<[^>]+>|\[([^\]]*)\]\([^)]*\)|\*\*|~~|`', r'\1', stripped))
            body_lines += max(1, -(-visible_len // chars_per_line))

        h += FA_BODY_PADDING + body_lines * FA_BODY_LINE_HEIGHT
    else:
        h += 40

    return min(max(80, h), 2000)


def cards_overlap(a, b):
    aw, ah = a["width"], a.get("height", 200)
    bw, bh = b["width"], b.get("height", 200)
    return (a["x"] < b["x"] + bw + FA_GAP and
            a["x"] + aw + FA_GAP > b["x"] and
            a["y"] < b["y"] + bh + FA_GAP and
            a["y"] + ah + FA_GAP > b["y"])


def fix_overlaps(cards: list) -> list:
    """Compact magnetic layout: cluster into columns, ensure FA_GAP spacing, stack tightly."""
    if len(cards) <= 1:
        return cards

    cards.sort(key=lambda c: (c["x"], c["y"]))
    col_threshold = FA_DEFAULT_WIDTH * 0.6

    # 1) Cluster cards into columns by x proximity
    columns: list[list] = []
    for card in cards:
        placed_in_col = False
        for col in columns:
            if abs(card["x"] - col[0]["x"]) < col_threshold:
                col.append(card)
                placed_in_col = True
                break
        if not placed_in_col:
            columns.append([card])

    # 2) Reassign column x positions: preserve relative order, ensure FA_GAP between columns
    columns.sort(key=lambda col: col[0]["x"])
    for ci, col in enumerate(columns):
        if ci == 0:
            col_x = col[0]["x"]
        else:
            prev_right = columns[ci-1][0]["x"] + FA_DEFAULT_WIDTH
            desired_x = col[0]["x"]
            col_x = max(desired_x, prev_right + FA_GAP)
        for card in col:
            card["x"] = round(col_x, 2)

    # 3) For each column, keep relative y order and compact tightly
    global_top = min(c["y"] for c in cards)
    for col in columns:
        col.sort(key=lambda c: c["y"])
        cursor_y = global_top
        for card in col:
            card["y"] = round(cursor_y, 2)
            cursor_y += card.get("height", 200) + FA_GAP

    return [c for col in columns for c in col]


def default_output_path() -> str:
    if sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support/float-anchor/data")
    elif sys.platform == "win32":
        base = os.path.join(os.environ.get("APPDATA", ""), "float-anchor", "data")
    else:
        base = os.path.expanduser("~/.config/float-anchor/data")
    return os.path.join(base, "float-anchor.json")


file_metadata = {}

def main():
    global file_metadata
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/migrate-heptabase.py <heptabase-backup-dir> [--output <path>]")
        sys.exit(1)

    backup_input = sys.argv[1]
    output_path = None
    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_path = sys.argv[idx + 1]

    if not output_path:
        output_path = default_output_path()

    backup_root = find_backup_root(backup_input)
    print(f"Backup root: {backup_root}")

    with open(os.path.join(backup_root, "All-Data.json"), "r", encoding="utf-8") as f:
        data = json.load(f)

    md_library = load_card_library_md(os.path.join(backup_root, "Card Library"))
    print(f"Loaded {len(md_library)} card markdown files from Card Library")

    for f_entry in data.get("files", []):
        meta = f_entry.get("metadata") or {}
        file_metadata[f_entry["id"]] = {
            "width": meta.get("width", 0),
            "height": meta.get("height", 0),
            "type": f_entry.get("type", ""),
        }
    print(f"Loaded {len(file_metadata)} file metadata entries")

    card_map = {c["id"]: c for c in data["cardList"]}

    wb_instances = {}
    for ci in data["cardInstances"]:
        wbid = ci["whiteboardId"]
        wb_instances.setdefault(wbid, []).append(ci)

    wb_sections = {}
    for sec in data.get("sections", []):
        wbid = sec["whiteboardId"]
        wb_sections.setdefault(wbid, []).append(sec)

    section_cards = {}
    for rel in data.get("sectionObjectRelations", []):
        sid = rel["sectionId"]
        oid = rel["objectId"]
        section_cards.setdefault(sid, []).append(oid)

    wb_connections = {}
    for conn in data.get("connections", []):
        wbid = conn["whiteboardId"]
        wb_connections.setdefault(wbid, []).append(conn)

    wb_text_elements = {}
    for te in data.get("textElements", []):
        wbid = te["whiteboardId"]
        wb_text_elements.setdefault(wbid, []).append(te)

    active_wbs = [w for w in data["whiteBoardList"] if not w.get("isTrashed")]
    active_wbs.sort(key=lambda w: w.get("createdTime", ""))

    print(f"Active whiteboards: {len(active_wbs)}")

    canvases = []
    total_cards = 0
    total_sections = 0
    total_labels = 0
    total_connections = 0

    for wb in active_wbs:
        canvas_id = str(uuid.uuid4())
        instances = wb_instances.get(wb["id"], [])

        ci_id_to_fa_id = {}
        cards = []

        for ci in instances:
            card_data = card_map.get(ci["cardId"])
            if not card_data or card_data.get("isTrashed"):
                continue

            title = card_data.get("title", "")
            md_content = get_card_markdown(card_data, md_library)
            body = strip_first_heading(md_content, title) if title else md_content

            fa_card_id = str(uuid.uuid4())
            ci_id_to_fa_id[ci["id"]] = fa_card_id

            est_height = estimate_card_height(title, body, FA_DEFAULT_WIDTH)

            fa_card = {
                "id": fa_card_id,
                "title": title,
                "content": body,
                "x": round(ci.get("x", 0) * COORD_SCALE, 2),
                "y": round(ci.get("y", 0), 2),
                "width": FA_DEFAULT_WIDTH,
                "height": est_height,
            }

            cards.append(fa_card)

        cards = fix_overlaps(cards)
        scale = 1.0

        fa_sections = []
        h_sections = wb_sections.get(wb["id"], [])
        h_sec_id_to_fa_id = {}
        for hs in h_sections:
            fa_sec_id = str(uuid.uuid4())
            h_sec_id_to_fa_id[hs["id"]] = fa_sec_id

            member_ci_ids = section_cards.get(hs["id"], [])
            member_fa_ids = [ci_id_to_fa_id[cid] for cid in member_ci_ids if cid in ci_id_to_fa_id]

            color = HEPTABASE_COLOR_MAP.get(hs.get("color", ""), '#9ca3af')

            sec_x = round(hs.get("x", 0) * COORD_SCALE, 2)
            sec_y = round(hs.get("y", 0), 2)
            sec_w = round(hs.get("width", 600) * COORD_SCALE, 0)
            sec_h = round(hs.get("height", 400), 0)

            if member_fa_ids:
                member_cards = [c for c in cards if c["id"] in set(member_fa_ids)]
                if member_cards:
                    min_x = min(c["x"] for c in member_cards) - 24
                    min_y = min(c["y"] for c in member_cards) - 60
                    max_x = max(c["x"] + c["width"] for c in member_cards) + 24
                    max_y = max(c["y"] + c.get("height", 200) for c in member_cards) + 24
                    sec_x = min_x
                    sec_y = min_y
                    sec_w = max(sec_w, max_x - min_x)
                    sec_h = max(sec_h, max_y - min_y)

            fa_sections.append({
                "id": fa_sec_id,
                "name": hs.get("title", "分区"),
                "x": sec_x,
                "y": sec_y,
                "width": sec_w,
                "height": sec_h,
                "color": color,
                "cardIds": member_fa_ids,
            })

        fa_labels = []
        h_text_elements = wb_text_elements.get(wb["id"], [])
        for te in h_text_elements:
            content_raw = te.get("content", "")
            if not content_raw:
                continue
            try:
                doc = json.loads(content_raw)
                label_text = tiptap_to_plain_text(doc).strip()
            except (json.JSONDecodeError, TypeError):
                label_text = content_raw.strip()

            if not label_text:
                continue

            level = 1
            try:
                doc = json.loads(content_raw)
                first_node = doc.get("content", [{}])[0]
                if first_node.get("type") == "heading":
                    h_level = first_node.get("attrs", {}).get("level", 3)
                    level = min(h_level, 4)
            except Exception:
                pass

            fa_labels.append({
                "id": str(uuid.uuid4()),
                "text": label_text,
                "level": level,
                "x": round(te.get("x", 0) * COORD_SCALE, 2),
                "y": round(te.get("y", 0), 2),
                "width": round(te.get("width", 300) * COORD_SCALE, 0),
            })

        fa_connections = []
        h_conns = wb_connections.get(wb["id"], [])
        for hc in h_conns:
            begin_id = hc.get("beginId", "")
            end_id = hc.get("endId", "")
            from_fa = ci_id_to_fa_id.get(begin_id)
            to_fa = ci_id_to_fa_id.get(end_id)
            if from_fa and to_fa and from_fa != to_fa:
                fa_connections.append({
                    "id": str(uuid.uuid4()),
                    "fromCardId": from_fa,
                    "toCardId": to_fa,
                })

        canvas = {
            "id": canvas_id,
            "name": wb["name"],
            "cards": cards,
        }
        if fa_labels:
            canvas["labels"] = fa_labels
        if fa_sections:
            canvas["sections"] = fa_sections
        if fa_connections:
            canvas["connections"] = fa_connections

        canvases.append(canvas)
        total_cards += len(cards)
        total_sections += len(fa_sections)
        total_labels += len(fa_labels)
        total_connections += len(fa_connections)
        print(f"  {wb['name']}: {len(cards)} cards, {len(fa_sections)} sections, {len(fa_labels)} labels, {len(fa_connections)} connections")

    fa_data = {
        "canvases": canvases,
        "activeCanvasId": canvases[0]["id"] if canvases else None,
    }

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(fa_data, f, ensure_ascii=False, indent=2)

    print(f"\nMigration complete!")
    print(f"  Whiteboards: {len(canvases)}")
    print(f"  Total cards: {total_cards}")
    print(f"  Total sections: {total_sections}")
    print(f"  Total labels: {total_labels}")
    print(f"  Total connections: {total_connections}")
    print(f"  Output: {output_path}")


if __name__ == "__main__":
    main()
