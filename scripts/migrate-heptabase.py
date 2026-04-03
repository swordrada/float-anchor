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
            if mt == "bold":
                result = f"**{result}**"
            elif mt == "italic":
                result = f"*{result}*"
            elif mt == "code":
                result = f"`{result}`"
            elif mt == "strike":
                result = f"~~{result}~~"
            elif mt == "link":
                href = mark.get("attrs", {}).get("href", "")
                result = f"[{result}]({href})"
        return result

    if ntype == "doc":
        parts = [tiptap_to_markdown(c, depth) for c in content]
        return "\n\n".join(p for p in parts if p.strip())

    if ntype == "paragraph":
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
        src = attrs.get("src", "")
        alt = attrs.get("alt", "")
        return f"![{alt}]({src})"

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


def sanitize_title_to_filename(title: str) -> str:
    return title.replace("/", "!")


def load_card_library_md(card_lib_dir: str) -> dict:
    """Load all .md files from Card Library, keyed by filename (without .md)."""
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
    """Get markdown content for a card, preferring Card Library .md, falling back to JSON conversion."""
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


def strip_first_heading(md_text: str) -> str:
    """Remove the first H1 line (# Title) from markdown since FloatAnchor stores title separately."""
    lines = md_text.split("\n")
    result = []
    skipped_h1 = False
    for line in lines:
        if not skipped_h1 and re.match(r"^#\s+", line):
            skipped_h1 = True
            continue
        result.append(line)
    text = "\n".join(result).strip()
    return text


def default_output_path() -> str:
    if sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support/float-anchor/data")
    elif sys.platform == "win32":
        base = os.path.join(os.environ.get("APPDATA", ""), "float-anchor", "data")
    else:
        base = os.path.expanduser("~/.config/float-anchor/data")
    return os.path.join(base, "float-anchor.json")


def main():
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

    card_map = {c["id"]: c for c in data["cardList"]}

    wb_instances = {}
    for ci in data["cardInstances"]:
        wbid = ci["whiteboardId"]
        wb_instances.setdefault(wbid, []).append(ci)

    active_wbs = [w for w in data["whiteBoardList"] if not w.get("isTrashed")]
    active_wbs.sort(key=lambda w: w.get("createdTime", ""))

    print(f"Active whiteboards: {len(active_wbs)}")

    canvases = []
    total_cards = 0
    fallback_count = 0

    for wb in active_wbs:
        canvas_id = str(uuid.uuid4())
        instances = wb_instances.get(wb["id"], [])

        cards = []
        for ci in instances:
            card_data = card_map.get(ci["cardId"])
            if not card_data or card_data.get("isTrashed"):
                continue

            title = card_data.get("title", "无标题")
            md_content = get_card_markdown(card_data, md_library)
            body = strip_first_heading(md_content)

            card_width = ci.get("width", 288)
            card_height = ci.get("height")

            if card_width and card_width < 200:
                card_width = 288
            if card_height and card_height < 100:
                card_height = None

            fa_card = {
                "id": str(uuid.uuid4()),
                "title": title,
                "content": body,
                "x": round(ci.get("x", 0), 2),
                "y": round(ci.get("y", 0), 2),
                "width": round(card_width, 0) if card_width else 288,
            }
            if card_height:
                fa_card["height"] = round(card_height, 0)

            cards.append(fa_card)

        canvas = {
            "id": canvas_id,
            "name": wb["name"],
            "cards": cards,
        }
        canvases.append(canvas)
        total_cards += len(cards)
        print(f"  {wb['name']}: {len(cards)} cards")

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
    print(f"  Output: {output_path}")


if __name__ == "__main__":
    main()
