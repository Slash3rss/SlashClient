"""
The pictures of the wiki's HUD pages (server/src/wiki/seed/img/hud-*.webp), made from the game test
GameWikiShots.

How to make them again (after a release, or when a module changes):

    cd hud
    JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.1.8-hotspot" \
        ./gradlew runClientGameTest -Pmc=26.3 -Ptests=GameWikiShots
    cd ..
    python scripts/wiki/hud-shots.py

The test leaves its screenshots ("NNNN_wiki-<name>.png", 1920x1080 at GUI scale 3) and the file
wiki-boxes.txt in hud/build/run/clientGameTest/screenshots. Each line of the file is
"<name> full" (the whole screen, scaled to 1280 px wide) or "<name> x y w h" (a part of the
screen in window pixels: a small module, cut out with a margin of the world around it).
The script writes hud-<name>.webp, each under about 120 kB, and lists the sizes.
Another folder of screenshots: python scripts/wiki/hud-shots.py <folder>.
Needs Pillow (pip install pillow).
"""

import glob
import io
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SHOTS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "hud", "build", "run", "clientGameTest", "screenshots")
OUT = os.path.join(ROOT, "server", "src", "wiki", "seed", "img")

MAX_WIDTH = 1280
MAX_BYTES = 120 * 1024
# room around a small module, and the smallest picture (so a lone "60 FPS" is not a tiny strip)
MARGIN = 48
MIN_W, MIN_H = 420, 180


def newest(name):
    """The last screenshot taken under this name (the test numbers them: 0012_wiki-fps.png)."""
    found = sorted(glob.glob(os.path.join(SHOTS, "*_wiki-" + name + ".png")))
    return found[-1] if found else None


def cut(img, x, y, w, h):
    """The box with a margin, grown to the smallest size around its middle, kept on the screen."""
    x0, y0, x1, y1 = x - MARGIN, y - MARGIN, x + w + MARGIN, y + h + MARGIN
    if x1 - x0 < MIN_W:
        grow = (MIN_W - (x1 - x0)) / 2
        x0, x1 = x0 - grow, x1 + grow
    if y1 - y0 < MIN_H:
        grow = (MIN_H - (y1 - y0)) / 2
        y0, y1 = y0 - grow, y1 + grow
    W, H = img.size
    if x0 < 0:
        x1, x0 = x1 - x0, 0
    if y0 < 0:
        y1, y0 = y1 - y0, 0
    if x1 > W:
        x0, x1 = max(0, x0 - (x1 - W)), W
    if y1 > H:
        y0, y1 = max(0, y0 - (y1 - H)), H
    return img.crop((int(x0), int(y0), int(x1), int(y1)))


def save(img, path):
    """WebP at quality 82, lower (and then smaller) until it fits under MAX_BYTES."""
    if img.width > MAX_WIDTH:
        img = img.resize((MAX_WIDTH, round(img.height * MAX_WIDTH / img.width)), Image.LANCZOS)
    quality = 82
    while True:
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=quality, method=6)
        if buf.tell() <= MAX_BYTES or quality <= 50:
            break
        quality -= 8
    while buf.tell() > MAX_BYTES and img.width > 640:
        img = img.resize((round(img.width * 0.85), round(img.height * 0.85)), Image.LANCZOS)
        buf = io.BytesIO()
        img.save(buf, "WEBP", quality=quality, method=6)
    with open(path, "wb") as f:
        f.write(buf.getvalue())
    return buf.tell(), img.size, quality


def main():
    boxes = os.path.join(SHOTS, "wiki-boxes.txt")
    if not os.path.exists(boxes):
        sys.exit("No " + boxes + ": run the game test GameWikiShots first (see the top of this script).")
    os.makedirs(OUT, exist_ok=True)
    total, count, missing = 0, 0, []
    for line in open(boxes, encoding="utf-8"):
        parts = line.split()
        if not parts:
            continue
        name = parts[0]
        src = newest(name)
        if not src:
            missing.append(name)
            continue
        img = Image.open(src).convert("RGB")
        if parts[1] != "full":
            img = cut(img, *map(int, parts[1:5]))
        size, dims, quality = save(img, os.path.join(OUT, "hud-" + name + ".webp"))
        total += size
        count += 1
        print(f"hud-{name}.webp  {dims[0]}x{dims[1]}  q{quality}  {size / 1024:.0f} kB")
    print(f"{count} pictures, {total / 1024 / 1024:.2f} MB")
    if missing:
        print("No screenshot for: " + ", ".join(missing))


if __name__ == "__main__":
    main()
