"""Launcher icons with a tag: a violet "DEV" for a launcher run from the code (npm start, a test launcher) and an
orange "BETA" for a beta version, so either is told from the player's usual launcher on the taskbar and in its header.

Writes, for each: build/icon-<tag>.png (the window's icon), build/icons/<tag>-256x256.png (the page's logo) and
build/icons/<tag>-tag-256x256.png (the tag alone, drawn over the season logos, season.ts).

Usage: python scripts/icon/tag-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[2]
TAGS = {'dev': ('DEV', (139, 92, 246)), 'beta': ('BETA', (249, 115, 22))}
FONTS = ['C:/Windows/Fonts/arialbd.ttf', '/System/Library/Fonts/Supplemental/Arial Bold.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf']


def tag(size: int, text: str, colour: tuple[int, int, int]) -> Image.Image:
    """The tag in the bottom right corner of a transparent square."""
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(out)
    font_file = next((f for f in FONTS if Path(f).exists()), None)
    font = ImageFont.truetype(font_file, int(size * 0.2)) if font_file else ImageFont.load_default()
    l, t, r, b = draw.textbbox((0, 0), text, font=font)
    pad_x, pad_y = size * 0.06, size * 0.035
    w, h = r - l + 2 * pad_x, b - t + 2 * pad_y
    x0, y0 = size - w - size * 0.02, size - h - size * 0.03
    ring = size * 0.015
    # a dark ring keeps the tag readable on the logo and on light taskbars
    draw.rounded_rectangle([x0 - ring, y0 - ring, x0 + w + ring, y0 + h + ring], radius=h / 2 + ring, fill=(10, 13, 20, 255))
    draw.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=h / 2, fill=(*colour, 255))
    draw.text((x0 + pad_x - l, y0 + pad_y - t), text, font=font, fill=(255, 255, 255, 255))
    return out


icon = Image.open(root / 'build/icon.png').convert('RGBA')
for name, (text, colour) in TAGS.items():
    label = tag(icon.size[0], text, colour)
    tagged = Image.alpha_composite(icon, label)
    tagged.save(root / f'build/icon-{name}.png')
    tagged.resize((256, 256), Image.LANCZOS).save(root / f'build/icons/{name}-256x256.png')
    label.resize((256, 256), Image.LANCZOS).save(root / f'build/icons/{name}-tag-256x256.png')
print('ok')
