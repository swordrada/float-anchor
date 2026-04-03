#!/usr/bin/env python3
"""Generate FA logo icon at 1024x1024 — pure white background, large text."""

from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 1024
BG = (255, 255, 255, 255)
FG = (45, 45, 45, 255)
ACCENT = (74, 144, 217, 255)

out_dir = os.path.join(os.path.dirname(__file__), '..', 'build')
os.makedirs(out_dir, exist_ok=True)

img = Image.new('RGBA', (SIZE, SIZE), BG)
draw = ImageDraw.Draw(img)

font_size = 560
try:
    font = ImageFont.truetype('/System/Library/Fonts/SFCompact.ttf', font_size)
except Exception:
    try:
        font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', font_size)
    except Exception:
        try:
            font = ImageFont.truetype('/System/Library/Fonts/HelveticaNeue.ttc', font_size)
        except Exception:
            font = ImageFont.load_default()

text = "FA"
bbox = draw.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
tx = (SIZE - tw) / 2 - bbox[0]
ty = (SIZE - th) / 2 - bbox[1] - 20

draw.text((tx, ty), text, fill=FG, font=font)

anchor_cx = SIZE // 2
anchor_y = SIZE - 175
draw.line(
    [(anchor_cx - 60, anchor_y), (anchor_cx, anchor_y + 48), (anchor_cx + 60, anchor_y)],
    fill=ACCENT, width=10, joint='curve'
)
draw.ellipse(
    [anchor_cx - 13, anchor_y + 44, anchor_cx + 13, anchor_y + 70],
    fill=ACCENT,
)

out_path = os.path.join(out_dir, 'icon.png')
img.save(out_path, 'PNG')
print(f'Saved {out_path} ({SIZE}x{SIZE})')
