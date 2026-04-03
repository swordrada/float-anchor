#!/usr/bin/env python3
"""Generate FA logo icon at 1024x1024 — full-bleed rounded rect, large text."""

from PIL import Image, ImageDraw, ImageFont
import os

SIZE = 1024
RADIUS = 220
BG = (255, 255, 255, 255)
FG = (45, 45, 45, 255)
ACCENT = (74, 144, 217, 210)

out_dir = os.path.join(os.path.dirname(__file__), '..', 'build')
os.makedirs(out_dir, exist_ok=True)

img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

draw.rounded_rectangle(
    [0, 0, SIZE - 1, SIZE - 1],
    radius=RADIUS,
    fill=BG,
)

font_size = 520
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
anchor_y = SIZE - 185
draw.line(
    [(anchor_cx - 55, anchor_y), (anchor_cx, anchor_y + 45), (anchor_cx + 55, anchor_y)],
    fill=ACCENT, width=9, joint='curve'
)
draw.ellipse(
    [anchor_cx - 12, anchor_y + 42, anchor_cx + 12, anchor_y + 66],
    fill=ACCENT,
)

out_path = os.path.join(out_dir, 'icon.png')
img.save(out_path, 'PNG')
print(f'Saved {out_path} ({SIZE}x{SIZE})')
