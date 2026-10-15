"""The in-game badge: the SlashClient "S" (slashS in scripts/icon/icon.html), white on a
transparent background, drawn pixel by pixel for the game's 8-pixel font.

Each pixel of the 6x7 S becomes 2x2 texture pixels; the "/" cut through the middle is one
pixel wide and the upper-left half slides one pixel down-left along it, as in the icon.
At GUI scale 2 one texture pixel is one screen pixel, so the edges stay sharp.

Usage: python scripts/icon/white-badge.py hud/src/main/resources/assets/slashclient-hud/textures/font/badge.png
"""
import sys
from PIL import Image

S = ['.XXXX.', 'XX..XX', 'XX....', '.XXXX.', '....XX', 'XX..XX', '.XXXX.']
SIZE = 16
CELL = 2
X0, Y0 = (SIZE - 6 * CELL) // 2, (SIZE - 7 * CELL) // 2
# the cut: texels on this anti-diagonal (x + y) stay empty
CUT = 15

filled = set()
for row, line in enumerate(S):
    for col, ch in enumerate(line):
        if ch == 'X':
            for dy in range(CELL):
                for dx in range(CELL):
                    filled.add((X0 + col * CELL + dx, Y0 + row * CELL + dy))

out = set()
for x, y in filled:
    if x + y == CUT:
        continue
    if x + y < CUT:
        # upper-left half: one pixel down-left along the cut
        x, y = x - 1, y + 1
        if x + y >= CUT:
            continue
    out.add((x, y))

# crumbs the cut leaves at the corners read as noise at this size: drop pieces under 4 pixels
seen = set()
for start in list(out):
    if start in seen:
        continue
    piece, todo = [], [start]
    while todo:
        p = todo.pop()
        if p in seen or p not in out:
            continue
        seen.add(p)
        piece.append(p)
        x, y = p
        todo += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    if len(piece) < 4:
        out -= set(piece)

img = Image.new('RGBA', (SIZE, SIZE), (255, 255, 255, 0))
for x, y in out:
    if 0 <= x < SIZE and 0 <= y < SIZE:
        img.putpixel((x, y), (255, 255, 255, 255))
img.save(sys.argv[1])
print('saved', sys.argv[1])
