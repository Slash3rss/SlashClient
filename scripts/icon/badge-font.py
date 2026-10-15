"""The in-game badge as a vector glyph: a one-character TrueType font with the SlashClient "S"
(the slashS variant of scripts/icon/icon.html) at U+E000. Minecraft draws TTF glyphs at screen
resolution, so the logo stays sharp and smooth at every GUI scale, unlike a small bitmap.

Usage: python scripts/icon/badge-font.py hud/src/main/resources/assets/slashclient-hud/font/badge.ttf
"""
import sys

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.ttGlyphPen import TTGlyphPen
from shapely import affinity
from shapely.geometry import Polygon, box
from shapely.geometry.polygon import orient
from shapely.ops import unary_union

# the same geometry as slashS() in icon.html (1024 canvas, y down)
S = ['.XXXX.', 'XX..XX', 'XX....', '.XXXX.', '....XX', 'XX..XX', '.XXXX.']
SIZE, CX, CY, GAP, SHIFT = 62, 512, 512, 30, 18
X0, Y0 = 512 - 3 * SIZE, 512 - 3.5 * SIZE

letter = unary_union([box(X0 + x * SIZE, Y0 + y * SIZE, X0 + (x + 1) * SIZE, Y0 + (y + 1) * SIZE)
                      for y, row in enumerate(S) for x, ch in enumerate(row) if ch == 'X'])


def half(sign):
    """One side of the "/" cut through the centre, `GAP / 2` away from it."""
    far = 2000
    o = sign * GAP / 2 / 2 ** 0.5
    return Polygon([(CX - far + o, CY + far + o), (CX + far + o, CY - far + o),
                    (CX + far + sign * far, CY - far + sign * far), (CX - far + sign * far, CY + far + sign * far)])


# upper-left half slides down-left along the cut, the other half up-right
logo = unary_union([
    affinity.translate(letter.intersection(half(-1)), -SHIFT / 2, SHIFT / 2),
    affinity.translate(letter.intersection(half(1)), SHIFT / 2, -SHIFT / 2),
])

# to font units: y up, the letter standing on the baseline, as tall as a capital (700 of 1000)
UPM, CAP, SIDE = 1000, 700, 60
minx, miny, maxx, maxy = logo.bounds
k = CAP / (maxy - miny)
logo = affinity.affine_transform(logo, [k, 0, 0, -k, -minx * k + SIDE, maxy * k])
width = (maxx - minx) * k

pen = TTGlyphPen(None)
for poly in getattr(logo, 'geoms', [logo]):
    # TrueType: outer contours clockwise, holes counter-clockwise
    poly = orient(poly, sign=-1.0)
    for ring in [poly.exterior, *poly.interiors]:
        pts = [(round(x), round(y)) for x, y in ring.coords[:-1]]
        pen.moveTo(pts[0])
        for p in pts[1:]:
            pen.lineTo(p)
        pen.closePath()

empty = TTGlyphPen(None).glyph()
fb = FontBuilder(UPM, isTTF=True)
fb.setupGlyphOrder(['.notdef', 'badge'])
fb.setupCharacterMap({0xE000: 'badge'})
fb.setupGlyf({'.notdef': empty, 'badge': pen.glyph()})
advance = round(width + 2 * SIDE)
fb.setupHorizontalMetrics({'.notdef': (500, 0), 'badge': (advance, SIDE)})
fb.setupHorizontalHeader(ascent=800, descent=-200)
fb.setupNameTable({'familyName': 'SlashClient Badge', 'styleName': 'Regular'})
fb.setupOS2(sTypoAscender=800, sTypoDescender=-200, usWinAscent=800, usWinDescent=200)
fb.setupPost()
fb.save(sys.argv[1])
print('saved', sys.argv[1], 'advance', advance)
