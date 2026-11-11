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
import time
from pathlib import Path
from typing import Optional
from heptabase_layout import connection_route, restore_layout, transform_routes


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

IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "webp", "tif", "tiff"]


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
        if file_id:
            src = f"fa-img://{file_id}"
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


def extract_image_file_ids(card, token: str = None, images_dir: str = None) -> tuple:
    """Extract ordered list of image URLs from a card's TipTap JSON content.
    
    Returns (urls, stats) where stats = {"found": N, "downloaded": N, "cached": N, "failed": N, "skipped": N}
    """
    stats = {"found": 0, "downloaded": 0, "cached": 0, "failed": 0, "skipped": 0}
    raw = card.get("content", "")
    if not raw:
        return [], stats
    try:
        doc = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return [], stats

    urls = []
    def walk(node):
        if not isinstance(node, dict):
            return
        if node.get("type") == "image":
            attrs = node.get("attrs", {})
            fid = attrs.get("fileId", "")
            src = attrs.get("src", "")
            if fid:
                stats["found"] += 1
                if token and images_dir:
                    status, img_path = download_heptabase_image(fid, images_dir, token)
                    if status == "ok":
                        stats["downloaded"] += 1
                        urls.append(f"fa-img://{Path(img_path).name}")
                    elif status == "cached":
                        stats["cached"] += 1
                        urls.append(f"fa-img://{Path(img_path).name}")
                    else:
                        stats["failed"] += 1
                        urls.append("")
                else:
                    stats["skipped"] += 1
                    urls.append("")
            elif src:
                urls.append(src)
        for c in node.get("content", []):
            walk(c)
    walk(doc)
    return urls, stats


def fix_relative_image_paths(md_text: str, image_urls: list) -> str:
    """Replace relative image paths (./xxx-assets/...) with fa-img:// URLs or remove if empty."""
    if not image_urls:
        return md_text

    url_iter = iter(image_urls)
    def replacer(m):
        url = next(url_iter, "")
        if not url:
            return ""
        return f"![{m.group(1)}]({url})"

    return re.sub(
        r'!\[([^\]]*)\]\((\./[^)]+|\.\.\/[^)]+)\)',
        replacer,
        md_text,
    )


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


def default_output_path() -> str:
    if sys.platform == "darwin":
        base = os.path.expanduser("~/Library/Application Support/float-anchor/data")
    elif sys.platform == "win32":
        base = os.path.join(os.environ.get("APPDATA", ""), "float-anchor", "data")
    else:
        base = os.path.expanduser("~/.config/float-anchor/data")
    return os.path.join(base, "float-anchor.json")


file_metadata = {}


def _candidate_image_paths(file_id: str, dest_dir: str) -> list:
    return [os.path.join(dest_dir, f"{file_id}.{ext}") for ext in IMAGE_EXTENSIONS]


def _find_cached_image(file_id: str, dest_dir: str) -> Optional[str]:
    for candidate in _candidate_image_paths(file_id, dest_dir):
        if os.path.exists(candidate) and _is_real_image(candidate):
            return candidate
    return None


def _detect_image_extension(data: bytes) -> Optional[str]:
    if data[:8] == b'\x89PNG\r\n\x1a\n':
        return "png"
    if data[:2] == b'\xff\xd8':
        return "jpg"
    if data[:4] == b'GIF8':
        return "gif"
    if data[:4] == b'RIFF' and data[8:12] == b'WEBP':
        return "webp"
    if data[:4] == b'II\x2a\x00' or data[:4] == b'MM\x00\x2a':
        return "tif"
    return None


def download_heptabase_image(file_id: str, dest_dir: str, token: str) -> tuple:
    """Download an image from Heptabase via presigned S3 URL.
    Returns (status, path_or_error):
      ("cached", path)  - already exists locally
      ("ok", path)      - newly downloaded
      ("fail", reason)  - download failed
    """
    import urllib.request
    cached_path = _find_cached_image(file_id, dest_dir)
    if cached_path:
        return ("cached", cached_path)
    try:
        body = json.dumps({"token": token, "fileId": file_id, "type": "image/png", "permissionCheckMode": "public"}).encode()
        req = urllib.request.Request("https://api.heptabase.com/v1/file", data=body,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            resp_data = resp.read().decode()
            resp_json = json.loads(resp_data)
            signed_url = resp_json.get("signedUrl")
            if not signed_url:
                reason = f"API returned no signedUrl: {resp_data[:200]}"
                print(f"    [FAIL] image {file_id}: {reason}")
                return ("fail", reason)
        req2 = urllib.request.Request(signed_url)
        with urllib.request.urlopen(req2, timeout=30) as resp2:
            data = resp2.read()
        ext = _detect_image_extension(data)
        if not ext:
            reason = f"non-image data ({len(data)} bytes), possible HTML error page"
            print(f"    [FAIL] image {file_id}: {reason}")
            return ("fail", reason)
        dest_path = os.path.join(dest_dir, f"{file_id}.{ext}")
        with open(dest_path, "wb") as f:
            f.write(data)
        return ("ok", dest_path)
    except urllib.error.HTTPError as e:
        reason = f"HTTP {e.code} {e.reason}"
        print(f"    [FAIL] image {file_id}: {reason}")
        return ("fail", reason)
    except urllib.error.URLError as e:
        reason = f"network error: {e.reason}"
        print(f"    [FAIL] image {file_id}: {reason}")
        return ("fail", reason)
    except Exception as e:
        reason = str(e)
        print(f"    [FAIL] image {file_id}: {reason}")
        return ("fail", reason)


def _is_image_data(data: bytes) -> bool:
    """Check if binary data starts with a known image magic number."""
    return _detect_image_extension(data) is not None


def _is_real_image(filepath: str) -> bool:
    """Check if a file on disk is a real image (not an HTML error page)."""
    try:
        with open(filepath, 'rb') as f:
            return _is_image_data(f.read(16))
    except Exception:
        return False


def main():
    global file_metadata
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/migrate-heptabase.py <heptabase-backup-dir> [--output <path>] [--token <token>] [--force]")
        print()
        print("Options:")
        print("  --output <path>    Specify output file path (default: FloatAnchor local storage)")
        print("  --token <token>    Heptabase Bearer token for downloading images.")
        print("                     Get it from browser DevTools: Network tab → any request → Authorization header.")
        print("                     Token expires in ~1 hour. Images are saved locally for offline use.")
        print("  --force            Replace existing canvases with the same name (for re-importing with token).")
        sys.exit(1)

    backup_input = sys.argv[1]
    output_path = None
    hepta_token = None
    force_replace = "--force" in sys.argv

    if "--output" in sys.argv:
        idx = sys.argv.index("--output")
        if idx + 1 < len(sys.argv):
            output_path = sys.argv[idx + 1]

    if "--token" in sys.argv:
        idx = sys.argv.index("--token")
        if idx + 1 < len(sys.argv):
            hepta_token = sys.argv[idx + 1]

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

    images_dir = None
    if hepta_token:
        images_dir = os.path.join(os.path.dirname(output_path), "images")
        os.makedirs(images_dir, exist_ok=True)
        print(f"Token provided — images will be downloaded to {images_dir}")
    else:
        print("No --token provided — images will be skipped. Use --token to download images.")

    print(f"Active whiteboards: {len(active_wbs)}")

    canvases = []
    total_cards = 0
    total_sections = 0
    total_labels = 0
    total_connections = 0
    total_img = {"found": 0, "downloaded": 0, "cached": 0, "failed": 0, "skipped": 0}

    for wb in active_wbs:
        canvas_id = str(uuid.uuid4())
        instances = wb_instances.get(wb["id"], [])

        ci_id_to_fa_id = {}
        cards = []
        wb_img = {"found": 0, "downloaded": 0, "cached": 0, "failed": 0, "skipped": 0}

        for ci in instances:
            card_data = card_map.get(ci["cardId"])
            if not card_data or card_data.get("isTrashed"):
                continue

            title = card_data.get("title", "")
            md_content = get_card_markdown(card_data, md_library)
            image_urls, img_stats = extract_image_file_ids(card_data, hepta_token, images_dir)
            for k in wb_img:
                wb_img[k] += img_stats[k]
            md_content = fix_relative_image_paths(md_content, image_urls)
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
                "sourceId": f"hepta:{ci['cardId']}",
                "sourceInstanceId": f"hepta:{ci['id']}",
            }

            cards.append(fa_card)

        # Keep original column offsets and the empty corridors used by connections.
        instance_by_fa = {ci_id_to_fa_id[ci["id"]]: ci for ci in instances if ci["id"] in ci_id_to_fa_id}

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
                "sourceId": f"hepta:{hs['id']}",
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
                "sourceId": f"hepta:{te['id']}",
            })

        endpoint_ids = {**ci_id_to_fa_id, **h_sec_id_to_fa_id,
                        **{label['sourceId'][6:]: label['id'] for label in fa_labels}}
        fa_connections = []
        h_conns = wb_connections.get(wb["id"], [])
        for hc in h_conns:
            begin_id = hc.get("beginId", "")
            end_id = hc.get("endId", "")
            from_fa = endpoint_ids.get(begin_id)
            to_fa = endpoint_ids.get(end_id)
            if from_fa and to_fa and from_fa != to_fa:
                fa_connections.append({
                    "id": str(uuid.uuid4()),
                    "fromCardId": from_fa,
                    "toCardId": to_fa,
                    "sourceId": f"hepta:{hc.get('id', '')}",
                    **connection_route(hc),
                    "anchorMode": "heptabase",
                })
            else:
                print(f"  Warning: skipped connection {hc.get('id', '')}: endpoint is not an imported card, title, or section")

        text_by_id = {te['id']: te for te in h_text_elements}
        section_by_id = {sec['id']: sec for sec in h_sections}
        scale_x, scale_y = restore_layout(
            [(card, instance_by_fa[card['id']]) for card in cards],
            [(label, text_by_id[label['sourceId'][6:]]) for label in fa_labels],
            [(section, section_by_id[section['sourceId'][6:]]) for section in fa_sections],
        )

        transform_routes(fa_connections, scale_x, scale_y)

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
        for k in total_img:
            total_img[k] += wb_img[k]

        img_parts = []
        if wb_img["found"]:
            ok = wb_img["downloaded"] + wb_img["cached"]
            img_parts.append(f"{ok}/{wb_img['found']} images")
            if wb_img["failed"]:
                img_parts.append(f"{wb_img['failed']} failed")
        line = f"  {wb['name']}: {len(cards)} cards, {len(fa_sections)} sections, {len(fa_labels)} labels, {len(fa_connections)} connections"
        if img_parts:
            line += f", {', '.join(img_parts)}"
        print(line)

    def _merge_list(existing_items, new_items):
        """Merge imported items into existing list by sourceId.
        Returns (updated_count, added_count, id_remap).
        id_remap maps new_item_id -> existing_item_id for items that were updated.
        """
        source_map = {}
        legacy_sources = {}
        for i, item in enumerate(existing_items):
            sid = item.get("sourceInstanceId") or item.get("sourceId")
            if sid:
                source_map[sid] = i
            if item.get('sourceId') and not item.get('sourceInstanceId'):
                legacy_sources.setdefault(item['sourceId'], []).append(i)

        updated = 0
        added = 0
        id_remap = {}
        for new_item in new_items:
            sid = new_item.get("sourceInstanceId") or new_item.get("sourceId")
            legacy = legacy_sources.get(new_item.get('sourceId'), [])
            index = source_map.get(sid)
            if index is None and len(legacy) == 1:
                index = legacy[0]
                legacy_sources.pop(new_item['sourceId'], None)
                source_map.pop(new_item['sourceId'], None)
            if index is not None:
                old_id = existing_items[index]["id"]
                id_remap[new_item["id"]] = old_id
                new_item["id"] = old_id
                existing_items[index] = new_item
                updated += 1
            else:
                existing_items.append(new_item)
                added += 1
        return updated, added, id_remap

    def _merge_canvas(existing_canvas, new_canvas):
        """Merge new_canvas data into existing_canvas, preserving user-created items."""
        u_cards, a_cards, card_remap = _merge_list(
            existing_canvas.get("cards", []), new_canvas.get("cards", [])
        )
        u_labels, a_labels, label_remap = _merge_list(
            existing_canvas.setdefault("labels", []),
            new_canvas.get("labels", [])
        )
        for sec in new_canvas.get("sections", []):
            if "cardIds" in sec:
                sec["cardIds"] = [card_remap.get(cid, cid) for cid in sec["cardIds"]]
        u_sections, a_sections, section_remap = _merge_list(
            existing_canvas.setdefault("sections", []),
            new_canvas.get("sections", [])
        )
        endpoint_remap = {**card_remap, **label_remap, **section_remap}
        old_conn_src = {c["sourceId"]: c for c in existing_canvas.get("connections", []) if c.get("sourceId")}
        new_conns = new_canvas.get("connections", [])
        added_conns = 0
        for nc in new_conns:
            nc["fromCardId"] = endpoint_remap.get(nc["fromCardId"], nc["fromCardId"])
            nc["toCardId"] = endpoint_remap.get(nc["toCardId"], nc["toCardId"])
            sid = nc.get("sourceId")
            if sid and sid in old_conn_src:
                old_id = old_conn_src[sid]["id"]
                for key in ["controlPoints", "laneOffset"]: old_conn_src[sid].pop(key, None)
                old_conn_src[sid].update(nc, id=old_id)
                continue
            existing_canvas.setdefault("connections", []).append(nc)
            added_conns += 1
        print(f"    Cards: {u_cards} updated, {a_cards} added | Labels: {u_labels} updated, {a_labels} added | Sections: {u_sections} updated, {a_sections} added | Connections: {added_conns} added")

    existing_data = None
    if os.path.exists(output_path):
        try:
            with open(output_path, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
            if isinstance(existing_data, dict) and "canvases" in existing_data:
                existing_canvases = existing_data["canvases"]
                print(f"\nFound existing data with {len(existing_canvases)} canvas(es) — merging...")
                backup_path = output_path + ".bak"
                with open(backup_path, "w", encoding="utf-8") as bf:
                    json.dump(existing_data, bf, ensure_ascii=False, indent=2)
                print(f"  Backup saved to {backup_path}")
            else:
                existing_data = None
        except (json.JSONDecodeError, IOError):
            existing_data = None

    if existing_data and isinstance(existing_data.get("canvases"), list):
        existing_by_name = {c["name"]: c for c in existing_data["canvases"]}
        new_count = 0
        skip_count = 0
        merge_count = 0
        for canvas in canvases:
            existing_canvas = existing_by_name.get(canvas["name"])
            if existing_canvas:
                if force_replace:
                    _merge_canvas(existing_canvas, canvas)
                    merge_count += 1
                    print(f"  Merged canvas: {canvas['name']}")
                else:
                    skip_count += 1
                    print(f"  Skipping duplicate canvas: {canvas['name']}")
            else:
                existing_data["canvases"].append(canvas)
                new_count += 1
        fa_data = existing_data
        parts = []
        if new_count: parts.append(f"added {new_count} new")
        if merge_count: parts.append(f"merged {merge_count}")
        if skip_count: parts.append(f"skipped {skip_count} duplicate(s)")
        print(f"  {', '.join(parts)}")
    else:
        fa_data = {
            "canvases": canvases,
            "activeCanvasId": canvases[0]["id"] if canvases else None,
        }

    def _count_canvas_items(canvas, name):
        value = canvas.get(name)
        return len(value) if isinstance(value, list) else 0

    def _is_empty_default_canvas(canvas):
        return (
            canvas.get("name") == "默认画布"
            and _count_canvas_items(canvas, "cards") == 0
            and _count_canvas_items(canvas, "sections") == 0
            and _count_canvas_items(canvas, "labels") == 0
            and _count_canvas_items(canvas, "connections") == 0
        )

    if canvases and isinstance(fa_data.get("canvases"), list):
        before_count = len(fa_data["canvases"])
        fa_data["canvases"] = [c for c in fa_data["canvases"] if not _is_empty_default_canvas(c)]
        removed_count = before_count - len(fa_data["canvases"])
        if removed_count:
            print(f"  Removed {removed_count} empty default canvas(es)")

        canvas_ids = {c.get("id") for c in fa_data["canvases"]}
        active_id = fa_data.get("activeCanvasId")
        if fa_data["canvases"] and active_id not in canvas_ids:
            fa_data["activeCanvasId"] = fa_data["canvases"][0]["id"]

    fa_data["_syncTimestamp"] = int(time.time() * 1000)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(fa_data, f, ensure_ascii=False, indent=2)

    print(f"\nMigration complete!")
    print(f"  Whiteboards: {len(canvases)}")
    print(f"  Total cards: {total_cards}")
    print(f"  Total sections: {total_sections}")
    print(f"  Total labels: {total_labels}")
    print(f"  Total connections: {total_connections}")
    if total_img["found"]:
        ok = total_img["downloaded"] + total_img["cached"]
        print(f"  Total images: {ok}/{total_img['found']} (downloaded: {total_img['downloaded']}, cached: {total_img['cached']}, failed: {total_img['failed']})")
        if total_img["failed"]:
            print(f"  ⚠ {total_img['failed']} image(s) failed to download — see [FAIL] messages above for details")
    elif hepta_token:
        print(f"  Total images: 0 (no images found in cards)")
    else:
        print(f"  Total images: skipped (no --token provided)")
    print(f"  Output: {output_path}")


if __name__ == "__main__":
    main()
