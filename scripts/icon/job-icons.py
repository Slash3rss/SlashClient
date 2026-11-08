"""Round pictures of SkyUp's jobs for Discord's small image (server/web/img/discord/praca_<job>.png).

Discord cuts the small image to a circle, so the item from SkyUp's 16x16 slot icon goes on a round slot of
the same blue, small enough that the circle cuts none of it.

Usage: python scripts/icon/job-icons.py <folder with the 16x16 slot icons, named praca_<job>.png>
"""
import sys
from pathlib import Path

from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[2]
out_dir = root / 'server/web/img/discord'
SIZE, SCALE = 512, 4  # drawn 4x larger, then scaled down for smooth edges
FILL, RING, LIGHT = (73, 124, 191), (17, 27, 43), (93, 158, 243)


def round_icon(slot: Image.Image) -> Image.Image:
    slot = slot.convert('RGBA')
    # the slot's inside (12x12) without its blue: the item alone
    item = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
    for y in range(12):
        for x in range(12):
            p = slot.getpixel((x + 2, y + 2))
            if p[3] and p[:3] != FILL:
                item.putpixel((x, y), p)
    big = SIZE * SCALE
    base = Image.new('RGBA', (big, big), (0, 0, 0, 0))
    d = ImageDraw.Draw(base)
    ring = 14 * SCALE
    d.ellipse([0, 0, big - 1, big - 1], fill=(*RING, 255))
    d.ellipse([ring, ring, big - 1 - ring, big - 1 - ring], fill=(*LIGHT, 255))
    d.ellipse([ring + 6 * SCALE, ring + 6 * SCALE, big - 1 - ring, big - 1 - ring], fill=(*FILL, 255))
    base = base.resize((SIZE, SIZE), Image.LANCZOS)
    # the item fits in the square inside the circle: 12 pixels of 30
    pixels = item.resize((360, 360), Image.NEAREST)
    base.alpha_composite(pixels, (76, 76))
    return base


for f in sorted(Path(sys.argv[1]).glob('praca_*.png')):
    round_icon(Image.open(f)).save(out_dir / f.name, optimize=True)
    print(f.name)
