# Draws the SlashClient capes (cosmetics shown to other launcher players) into
# hud/src/main/resources/assets/slashclient-hud/textures/cape/<id>.png.
# Cape textures use Minecraft's cape layout at 4x (256x128): the outer face at (1,1)-(11,17),
# the inner one at (12,1)-(22,17), the edges around them and the elytra wings at (22,0)-(46,22).
# Run with: python scripts/make-capes.py [minecraft.jar] (the jar gives the vanilla elytra's shape)
import math
import os
import random
from PIL import Image, ImageDraw

K = 4
OUT = os.path.join(os.path.dirname(__file__), '..', 'hud', 'src', 'main', 'resources', 'assets', 'slashclient-hud', 'textures', 'cape')
W, H = 10 * K, 16 * K


def hexrgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def mix(a, b, t):
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def gradient(top, bottom):
    img = Image.new('RGBA', (W, H))
    a, b = hexrgb(top), hexrgb(bottom)
    for y in range(H):
        ImageDraw.Draw(img).line([(0, y), (W, y)], fill=mix(a, b, y / (H - 1)) + (255,))
    return img


def border(img, color, width=2):
    d = ImageDraw.Draw(img)
    d.rectangle([0, 0, W - 1, H - 1], outline=hexrgb(color) + (255,), width=width)
    return img


def logo(img, color, shade):
    """The SlashClient logo (the badge next to names): a pixel "S" cut by a "/" whose halves slide
    apart along the cut, in the proportions of scripts/icon/badge-font.py (gap 30 and shift 18 of a
    62-wide cell). Drawn 8x larger and scaled down, so the cut is a clean line, not steps."""
    rows = ['.XXXX.', 'XX..XX', 'XX....', '.XXXX.', '....XX', 'XX..XX', '.XXXX.']
    up = 8
    cell = round(4.4 * up)
    w, h = 6 * cell, 7 * cell
    big_w, big_h = W * up, H * up
    # exactly in the middle of the cape
    x0, y0 = (big_w - w) // 2, (big_h - h) // 2
    cx, cy = x0 + w / 2, y0 + h / 2
    gap, shift = cell * 30 / 62, cell * 18 / 62
    letter = Image.new('L', (big_w, big_h), 0)
    d = ImageDraw.Draw(letter)
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == 'X':
                d.rectangle([x0 + x * cell, y0 + y * cell, x0 + (x + 1) * cell - 1, y0 + (y + 1) * cell - 1], fill=255)
    # the two halves of the "/" through the middle, each moved away from the cut along it
    far = big_w + big_h
    o = gap / 2 / 2 ** 0.5
    upper = Image.new('L', (big_w, big_h), 0)
    ImageDraw.Draw(upper).polygon([(cx - far - o, cy + far - o), (cx + far - o, cy - far - o), (-far, -far)], fill=255)
    lower = Image.new('L', (big_w, big_h), 0)
    ImageDraw.Draw(lower).polygon([(cx - far + o, cy + far + o), (cx + far + o, cy - far + o), (big_w + far, big_h + far)], fill=255)
    from PIL import ImageChops
    s_ = round(shift / 2 ** 0.5)
    a = ImageChops.offset(ImageChops.multiply(letter, upper), -s_, s_)
    b = ImageChops.offset(ImageChops.multiply(letter, lower), s_, -s_)
    mark = ImageChops.lighter(a, b).resize((W, H), Image.LANCZOS)
    img.paste(Image.new('RGBA', (W, H), hexrgb(shade) + (255,)), (1, 1), mark)
    img.paste(Image.new('RGBA', (W, H), hexrgb(color) + (255,)), (0, 0), mark)
    return img


def slash(img, color, glow):
    # the SlashClient stroke: a thick diagonal with a lighter edge
    d = ImageDraw.Draw(img)
    d.polygon([(W * 0.62, H * 0.18), (W * 0.82, H * 0.18), (W * 0.38, H * 0.82), (W * 0.18, H * 0.82)], fill=hexrgb(color) + (255,))
    d.line([(W * 0.82, H * 0.18), (W * 0.38, H * 0.82)], fill=hexrgb(glow) + (255,), width=2)
    return img


def design(cape):
    rnd = random.Random(cape)
    if cape.startswith('skyup_'):
        return opaque(skyup(cape))
    if cape == 'slash':
        img = border(gradient('#0b1220', '#1d4ed8'), '#60a5fa')
        return logo(img, '#f3f4f6', '#1e3a8a')
    if cape == 'ocean':
        img = gradient('#0e7490', '#082f49')
        d = ImageDraw.Draw(img)
        for row in range(5):
            y0 = H * (0.2 + row * 0.16)
            pts = [(x, y0 + math.sin(x / W * math.pi * 2 + row) * 3) for x in range(0, W + 1, 2)]
            d.line(pts, fill=(165, 243, 252, 200), width=2)
        return border(img, '#22d3ee')
    if cape == 'ember':
        img = gradient('#1c0a05', '#c2410c')
        d = ImageDraw.Draw(img)
        for i in range(9):
            cx = rnd.uniform(2, W - 2)
            h = rnd.uniform(H * 0.2, H * 0.5)
            d.polygon([(cx - 4, H), (cx + 4, H), (cx + rnd.uniform(-2, 2), H - h)], fill=(251, 146, 60, 230))
            d.polygon([(cx - 2, H), (cx + 2, H), (cx, H - h * 0.6)], fill=(254, 215, 170, 240))
        return border(img, '#f97316')
    if cape == 'forest':
        img = gradient('#14532d', '#052e16')
        d = ImageDraw.Draw(img)
        for i in range(6):
            cx = 4 + i * (W - 8) / 5 + rnd.uniform(-2, 2)
            base = H - rnd.uniform(0, 6)
            top = base - rnd.uniform(H * 0.35, H * 0.55)
            d.polygon([(cx, top), (cx - 7, base), (cx + 7, base)], fill=(22, 101, 52, 255))
            d.polygon([(cx, top + 4), (cx - 4, top + (base - top) * 0.55), (cx + 4, top + (base - top) * 0.55)], fill=(74, 222, 128, 255))
        return border(img, '#4ade80')
    if cape == 'galaxy':
        img = gradient('#1e1b4b', '#020617')
        d = ImageDraw.Draw(img)
        for _ in range(55):
            x, y = rnd.randrange(W), rnd.randrange(H)
            c = rnd.choice([(255, 255, 255), (196, 181, 253), (147, 197, 253)])
            d.point((x, y), fill=c + (255,))
        for _ in range(4):
            x, y = rnd.randrange(3, W - 3), rnd.randrange(3, H - 3)
            d.line([(x - 2, y), (x + 2, y)], fill=(255, 255, 255, 255))
            d.line([(x, y - 2), (x, y + 2)], fill=(255, 255, 255, 255))
        return border(img, '#a78bfa')
    if cape == 'rose':
        img = gradient('#fbcfe8', '#be185d')
        d = ImageDraw.Draw(img)
        cx, cy, r = W / 2, H * 0.45, 7
        d.ellipse([cx - r * 1.7, cy - r, cx, cy + r * 0.6], fill=(255, 255, 255, 255))
        d.ellipse([cx, cy - r, cx + r * 1.7, cy + r * 0.6], fill=(255, 255, 255, 255))
        d.polygon([(cx - r * 1.65, cy), (cx + r * 1.65, cy), (cx, cy + r * 2.2)], fill=(255, 255, 255, 255))
        return border(img, '#fdf2f8')
    if cape == 'gold':
        img = gradient('#fde68a', '#b45309')
        d = ImageDraw.Draw(img)
        for y in range(-H, H * 2, 10):
            d.line([(0, y), (W, y + W)], fill=(255, 251, 235, 110), width=1)
            d.line([(W, y), (0, y + W)], fill=(120, 53, 15, 90), width=1)
        return border(img, '#fef3c7')
    if cape == 'mono':
        img = border(gradient('#f9fafb', '#d1d5db'), '#111827', 3)
        return logo(img, '#111827', '#9ca3af')
    if cape == 'sakura':
        img = gradient('#fdf2f8', '#f9a8d4')
        d = ImageDraw.Draw(img)
        # a branch across, with blossoms of five petals
        d.line([(0, H * 0.3), (W * 0.5, H * 0.38), (W, H * 0.25)], fill=(87, 50, 38, 255), width=2)
        d.line([(W * 0.45, H * 0.37), (W * 0.7, H * 0.55)], fill=(87, 50, 38, 255), width=1)
        for _ in range(9):
            cx, cy = rnd.uniform(3, W - 3), rnd.uniform(H * 0.15, H * 0.9)
            for k in range(5):
                a = k / 5 * math.pi * 2
                px, py = cx + math.cos(a) * 2.2, cy + math.sin(a) * 2.2
                d.ellipse([px - 1.6, py - 1.6, px + 1.6, py + 1.6], fill=(236, 72, 153, 255) if k % 2 else (244, 114, 182, 255))
            d.point((cx, cy), fill=(254, 240, 138, 255))
        return border(img, '#ec4899')
    if cape == 'night':
        img = gradient('#0f172a', '#1e3a8a')
        d = ImageDraw.Draw(img)
        for _ in range(35):
            d.point((rnd.randrange(W), rnd.randrange(int(H * 0.75))), fill=(255, 255, 255, rnd.choice([150, 220, 255])))
        # the moon, cut by a second circle into a crescent
        cx, cy, r = W * 0.62, H * 0.28, 7
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(254, 249, 195, 255))
        d.ellipse([cx - r + 4, cy - r - 2, cx + r + 4, cy + r - 2], fill=(23, 37, 84, 255))
        # hills at the bottom
        d.polygon([(0, H), (0, H * 0.82), (W * 0.35, H * 0.74), (W * 0.7, H * 0.84), (W, H * 0.78), (W, H)], fill=(2, 6, 23, 255))
        return border(img, '#93c5fd')
    if cape == 'rainbow':
        img = Image.new('RGBA', (W, H))
        d = ImageDraw.Draw(img)
        colors = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#3b82f6', '#8b5cf6']
        band = H / len(colors)
        for i, c in enumerate(colors):
            d.rectangle([0, round(i * band), W, round((i + 1) * band)], fill=hexrgb(c) + (255,))
        return border(img, '#ffffff')
    if cape == 'ice':
        img = gradient('#e0f2fe', '#0ea5e9')
        d = ImageDraw.Draw(img)
        # a snowflake: three crossed lines with small branches
        cx, cy, r = W / 2, H * 0.45, 12
        for k in range(3):
            a = k / 3 * math.pi
            dx, dy = math.cos(a) * r, math.sin(a) * r
            d.line([(cx - dx, cy - dy), (cx + dx, cy + dy)], fill=(255, 255, 255, 255), width=2)
            for s in (-1, 1):
                bx, by = cx + dx * 0.6 * s, cy + dy * 0.6 * s
                for t in (-1, 1):
                    b = a + t * 0.7
                    d.line([(bx, by), (bx + math.cos(b) * 4 * s, by + math.sin(b) * 4 * s)], fill=(255, 255, 255, 255), width=1)
        return border(img, '#f0f9ff')
    if cape == 'toxic':
        img = gradient('#1a2e05', '#3f6212')
        d = ImageDraw.Draw(img)
        # the drips from the top and bubbles below
        for i in range(7):
            x = 3 + i * (W - 6) / 6
            h = rnd.uniform(H * 0.15, H * 0.45)
            d.rectangle([x - 2, 0, x + 2, h], fill=(163, 230, 53, 255))
            d.ellipse([x - 3, h - 3, x + 3, h + 3], fill=(163, 230, 53, 255))
        for _ in range(8):
            x, y, r = rnd.uniform(3, W - 3), rnd.uniform(H * 0.55, H - 4), rnd.uniform(1, 2.5)
            d.ellipse([x - r, y - r, x + r, y + r], outline=(190, 242, 100, 255))
        return border(img, '#a3e635')
    if cape == 'checker':
        img = Image.new('RGBA', (W, H))
        d = ImageDraw.Draw(img)
        s = 8
        for y in range(0, H, s):
            for x in range(0, W, s):
                d.rectangle([x, y, x + s - 1, y + s - 1], fill=(17, 24, 39, 255) if (x // s + y // s) % 2 else (243, 244, 246, 255))
        return border(img, '#3b82f6')
    if cape == 'lava':
        img = gradient('#1c1917', '#292524')
        d = ImageDraw.Draw(img)
        # cracks of glowing lava through dark stone, wider and brighter at the bottom
        for i in range(6):
            x, y = rnd.uniform(0, W), 0
            while y < H:
                nx, ny = x + rnd.uniform(-5, 5), y + rnd.uniform(4, 9)
                w = 1 + round(2 * y / H)
                d.line([(x, y), (nx, ny)], fill=(249, 115, 22, 255), width=w + 1)
                d.line([(x, y), (nx, ny)], fill=(253, 224, 71, 255), width=max(1, w - 1))
                x, y = nx, ny
        d.rectangle([0, H * 0.85, W, H], fill=(234, 88, 12, 255))
        return border(img, '#ea580c')
    if cape == 'desert':
        img = gradient('#fde68a', '#f59e0b')
        d = ImageDraw.Draw(img)
        # the sun, dunes in front of it and a cactus
        d.ellipse([W * 0.55, H * 0.12, W * 0.55 + 12, H * 0.12 + 12], fill=(255, 251, 235, 255))
        d.polygon([(0, H), (0, H * 0.62), (W * 0.45, H * 0.52), (W, H * 0.66), (W, H)], fill=(217, 119, 6, 255))
        d.polygon([(0, H), (0, H * 0.8), (W * 0.6, H * 0.72), (W, H * 0.82), (W, H)], fill=(180, 83, 9, 255))
        cx = W * 0.3
        d.rectangle([cx - 2, H * 0.4, cx + 2, H * 0.62], fill=(21, 128, 61, 255))
        d.rectangle([cx - 7, H * 0.46, cx - 2, H * 0.49], fill=(21, 128, 61, 255))
        d.rectangle([cx - 7, H * 0.4, cx - 4, H * 0.49], fill=(21, 128, 61, 255))
        d.rectangle([cx + 2, H * 0.5, cx + 6, H * 0.53], fill=(21, 128, 61, 255))
        d.rectangle([cx + 4, H * 0.44, cx + 7, H * 0.53], fill=(21, 128, 61, 255))
        return border(img, '#92400e')
    if cape == 'cyber':
        img = gradient('#0f0322', '#1e0538')
        d = ImageDraw.Draw(img)
        # a neon grid running to the horizon, and a sun in stripes above it
        hy = H * 0.55
        cx, r = W / 2, 11
        d.ellipse([cx - r, hy - r * 1.6, cx + r, hy + r * 0.4], fill=(244, 114, 182, 255))
        for k in range(4):
            y = hy - r * 0.2 - k * 4
            d.rectangle([0, y, W, y + 1], fill=(30, 5, 56, 255))
        d.rectangle([0, hy, W, H], fill=(15, 3, 34, 255))
        for k in range(6):
            y = hy + (H - hy) * (k / 5) ** 1.8
            d.line([(0, y), (W, y)], fill=(34, 211, 238, 255))
        for k in range(-4, 5):
            d.line([(cx + k * 3, hy), (cx + k * 14, H)], fill=(34, 211, 238, 255))
        return border(img, '#e879f9')
    if cape == 'honey':
        img = gradient('#fcd34d', '#d97706')
        d = ImageDraw.Draw(img)
        # honeycomb cells, with honey dripping from the top
        r = 4
        for row in range(-1, int(H / (r * 1.5)) + 2):
            for col in range(-1, int(W / (r * 1.73)) + 2):
                cx = col * r * 1.73 + (r * 0.87 if row % 2 else 0)
                cy = row * r * 1.5
                pts = [(cx + math.cos(math.pi / 3 * k + math.pi / 6) * r, cy + math.sin(math.pi / 3 * k + math.pi / 6) * r) for k in range(6)]
                d.polygon(pts, outline=(146, 64, 14, 255))
        for i in range(5):
            x = 4 + i * (W - 8) / 4
            h = rnd.uniform(H * 0.1, H * 0.3)
            d.rectangle([x - 1.5, 0, x + 1.5, h], fill=(180, 83, 9, 255))
            d.ellipse([x - 2.5, h - 2.5, x + 2.5, h + 2.5], fill=(180, 83, 9, 255))
        return border(img, '#92400e')
    if cape == 'mint':
        img = gradient('#ecfdf5', '#6ee7b7')
        d = ImageDraw.Draw(img)
        # soft diagonal stripes and a few leaves
        for y in range(-W, H + W, 8):
            d.line([(0, y), (W, y - W)], fill=(209, 250, 229, 200), width=3)
        for _ in range(5):
            cx, cy = rnd.uniform(6, W - 6), rnd.uniform(8, H - 8)
            d.ellipse([cx - 4, cy - 2, cx + 4, cy + 2], fill=(16, 185, 129, 255))
            d.line([(cx - 4, cy), (cx + 4, cy)], fill=(6, 95, 70, 255))
        return border(img, '#059669')
    if cape == 'veteran':
        # earned with 100 hours played (the "Weteran" achievement): gold rank chevrons under a star
        img = gradient('#1f2937', '#030712')
        d = ImageDraw.Draw(img)
        gold, shade = hexrgb('#fbbf24') + (255,), hexrgb('#92400e') + (255,)
        cx = W / 2
        star = [(cx + math.cos(math.pi / 2 + i * math.pi / 5) * (7 if i % 2 == 0 else 3), H * 0.2 - math.sin(math.pi / 2 + i * math.pi / 5) * (7 if i % 2 == 0 else 3)) for i in range(10)]
        d.polygon(star, fill=gold, outline=shade)
        for i in range(3):
            y = H * 0.42 + i * 9
            d.polygon([(4, y), (cx, y + 8), (W - 4, y), (W - 4, y + 5), (cx, y + 13), (4, y + 5)], fill=gold)
            d.line([(4, y + 5), (cx, y + 13), (W - 4, y + 5)], fill=shade, width=1)
        return border(img, '#fbbf24')
    if cape == 'streak30':
        # earned with a 30-day play streak ("Seria 30 dni"): a flame with 30 in it
        img = gradient('#450a0a', '#0c0a09')
        d = ImageDraw.Draw(img)
        cx = W / 2
        outer = [(cx, H * 0.08), (cx + 9, H * 0.3), (cx + 15, H * 0.52), (cx + 13, H * 0.7), (cx, H * 0.84), (cx - 13, H * 0.7), (cx - 15, H * 0.52), (cx - 9, H * 0.3)]
        inner = [(cx, H * 0.3), (cx + 6, H * 0.46), (cx + 9, H * 0.6), (cx + 7, H * 0.72), (cx, H * 0.79), (cx - 7, H * 0.72), (cx - 9, H * 0.6), (cx - 6, H * 0.46)]
        d.polygon(outer, fill=(249, 115, 22, 255))
        d.polygon(inner, fill=(253, 224, 71, 255))
        # "30" in a 3x5 pixel font, 2 px per dot
        digits = {'3': ['###', '..#', '.##', '..#', '###'], '0': ['###', '#.#', '#.#', '#.#', '###']}
        x0, y0 = cx - 7, H * 0.55
        for n, ch in enumerate('30'):
            for r, row in enumerate(digits[ch]):
                for c, dot in enumerate(row):
                    if dot == '#':
                        x, y = x0 + n * 8 + c * 2, y0 + r * 2
                        d.rectangle([x, y, x + 1, y + 1], fill=(124, 45, 18, 255))
        return border(img, '#f97316')
    # ---- bought in the shop with Iskry (sparks, earned with achievements) ----
    if cape == 'emberstar':
        # "Iskra": the currency's own cape, golden sparks rising from a glowing ember
        img = gradient('#1c1917', '#431407')
        d = ImageDraw.Draw(img)
        for _ in range(26):
            x, y = rnd.uniform(2, W - 2), rnd.uniform(2, H * 0.8)
            r = rnd.uniform(0.6, 1.6)
            d.ellipse([x - r, y - r, x + r, y + r], fill=rnd.choice([(253, 224, 71, 255), (251, 146, 60, 255), (254, 243, 199, 255)]))
        cx, cy = W / 2, H * 0.62
        spark = [(cx + math.cos(math.pi / 2 + i * math.pi / 4) * (10 if i % 2 == 0 else 3), cy - math.sin(math.pi / 2 + i * math.pi / 4) * (13 if i % 2 == 0 else 3)) for i in range(8)]
        d.polygon(spark, fill=(253, 224, 71, 255), outline=(234, 88, 12, 255))
        d.ellipse([cx - 2, cy - 2, cx + 2, cy + 2], fill=(255, 251, 235, 255))
        return border(img, '#f59e0b')
    if cape == 'obsidian':
        img = gradient('#1e1b2e', '#0a0612')
        d = ImageDraw.Draw(img)
        # sharp facets of volcanic glass with violet glints
        for _ in range(9):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            d.polygon([(x, y - 7), (x + 5, y), (x, y + 7), (x - 5, y)], fill=rnd.choice([(46, 16, 101, 255), (30, 27, 75, 255), (59, 7, 100, 255)]))
            d.line([(x, y - 7), (x + 5, y)], fill=(192, 132, 252, 255))
        return border(img, '#7e22ce')
    if cape == 'coral':
        img = gradient('#22d3ee', '#0e7490')
        d = ImageDraw.Draw(img)
        # branching corals from the sea floor and a few bubbles
        for i in range(4):
            x = 5 + i * (W - 10) / 3
            col = [(251, 113, 133, 255), (253, 186, 116, 255), (244, 114, 182, 255), (250, 204, 21, 255)][i]
            d.line([(x, H), (x, H * 0.6)], fill=col, width=3)
            d.line([(x, H * 0.75), (x - 5, H * 0.55)], fill=col, width=2)
            d.line([(x, H * 0.7), (x + 5, H * 0.5)], fill=col, width=2)
        for _ in range(7):
            x, y, r = rnd.uniform(3, W - 3), rnd.uniform(4, H * 0.5), rnd.uniform(1, 2)
            d.ellipse([x - r, y - r, x + r, y + r], outline=(236, 254, 255, 255))
        d.rectangle([0, H * 0.94, W, H], fill=(253, 230, 138, 255))
        return border(img, '#fb7185')
    if cape == 'thunder':
        img = gradient('#312e81', '#0f172a')
        d = ImageDraw.Draw(img)
        # a big lightning bolt down the middle
        pts = [(W * 0.62, 3), (W * 0.3, H * 0.52), (W * 0.52, H * 0.52), (W * 0.36, H - 3), (W * 0.74, H * 0.42), (W * 0.52, H * 0.42), (W * 0.7, 3)]
        d.polygon(pts, fill=(250, 204, 21, 255), outline=(254, 249, 195, 255))
        for _ in range(12):
            d.point((rnd.randrange(W), rnd.randrange(H)), fill=(165, 180, 252, 255))
        return border(img, '#facc15')
    if cape == 'regal':
        # "Purpura": royal purple with a golden crown and trim
        img = gradient('#581c87', '#2e1065')
        d = ImageDraw.Draw(img)
        gold = (251, 191, 36, 255)
        cx, cy = W / 2, H * 0.4
        d.polygon([(cx - 11, cy + 6), (cx - 11, cy - 6), (cx - 5, cy), (cx, cy - 9), (cx + 5, cy), (cx + 11, cy - 6), (cx + 11, cy + 6)], fill=gold)
        for x in (cx - 11, cx, cx + 11):
            top = cy - 11 if x == cx else cy - 8
            d.ellipse([x - 1.5, top, x + 1.5, top + 3], fill=(254, 243, 199, 255))
        for y in range(int(H * 0.62), H, 6):
            d.line([(4, y), (W - 4, y)], fill=(192, 132, 252, 120))
        d.rectangle([0, H - 5, W, H], fill=gold)
        return border(img, '#fbbf24')
    if cape == 'cosmos':
        img = gradient('#0c0a2a', '#020617')
        d = ImageDraw.Draw(img)
        for _ in range(45):
            d.point((rnd.randrange(W), rnd.randrange(H)), fill=(255, 255, 255, rnd.choice([140, 220, 255])))
        # a ringed planet and a small moon
        cx, cy, r = W * 0.5, H * 0.42, 9
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(56, 189, 248, 255))
        d.ellipse([cx - r + 3, cy - r + 2, cx + r - 6, cy - 1], fill=(125, 211, 252, 255))
        d.arc([cx - r - 7, cy - 3, cx + r + 7, cy + 4], 0, 180, fill=(251, 191, 36, 255), width=2)
        d.ellipse([W * 0.2 - 2, H * 0.75 - 2, W * 0.2 + 2, H * 0.75 + 2], fill=(226, 232, 240, 255))
        return border(img, '#38bdf8')
    # ---- for supporters of the project (payments/support.ts tiers) ----
    if cape == 'supporter_heart':
        # "Serce SlashClient": a big pixel heart with a shine, on deep rose with soft sparkles
        img = gradient('#4c0519', '#1f0710')
        d = ImageDraw.Draw(img)
        for _ in range(16):
            d.point((rnd.randrange(W), rnd.randrange(H)), fill=(251, 113, 133, rnd.choice([90, 160])))
        heart = ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....']
        cell = 3
        x0, y0 = (W - 9 * cell) // 2, int(H * 0.3)
        for y, row in enumerate(heart):
            for x, ch in enumerate(row):
                if ch == 'X':
                    shade = (244, 114, 182, 255) if y < 4 else (219, 39, 119, 255)
                    d.rectangle([x0 + x * cell, y0 + y * cell, x0 + (x + 1) * cell - 1, y0 + (y + 1) * cell - 1], fill=shade)
        # the shine on the upper left lobe
        d.rectangle([x0 + cell, y0 + cell, x0 + 2 * cell - 1, y0 + 2 * cell - 1], fill=(253, 242, 248, 255))
        return border(img, '#f472b6')
    if cape == 'supporter_patron':
        # "Mecenas": the logo in gold on black under a small crown, with a gold hem
        img = logo(gradient('#1c1917', '#0c0a09'), '#fbbf24', '#78350f')
        d = ImageDraw.Draw(img)
        gold, light = (251, 191, 36, 255), (254, 243, 199, 255)
        cx, top = W / 2, H * 0.08
        d.polygon([(cx - 8, top + 7), (cx - 8, top), (cx - 4, top + 4), (cx, top - 1), (cx + 4, top + 4), (cx + 8, top), (cx + 8, top + 7)], fill=gold)
        d.line([(cx - 8, top + 7), (cx + 8, top + 7)], fill=light, width=1)
        d.rectangle([0, H - 6, W, H], fill=gold)
        d.line([(0, H - 7), (W, H - 7)], fill=light, width=1)
        for x in range(3, W, 6):
            d.point((x, H - 3), fill=(120, 53, 15, 255))
        return border(img, '#fbbf24')
    raise ValueError(cape)


CAPES = ['slash', 'ocean', 'ember', 'forest', 'galaxy', 'rose', 'gold', 'mono', 'sakura', 'night', 'rainbow', 'ice', 'toxic', 'checker',
         'lava', 'desert', 'cyber', 'honey', 'mint', 'veteran', 'streak30',
         # sold in the shop for Iskry
         'emberstar', 'obsidian', 'coral', 'thunder', 'regal', 'cosmos',
         # for supporters
         'supporter_heart', 'supporter_patron',
         # in the look of the partner server SkyUp.pl
         'skyup_niebo', 'skyup_wyspa', 'skyup_zachod', 'skyup_noc', 'skyup_up',
         'skyup_waterblock', 'skyup_waterblock_glebia', 'skyup_caveblock', 'skyup_caveblock_lawa']


# ---------- SkyUp.pl: the partner server's look (sky, clouds, floating islands), drawn our own way ----------

def cloud(d, x, y, w, color=(255, 255, 255, 255)):
    """A blocky Minecraft cloud: a long slab with a bump on top."""
    d.rectangle([x, y, x + w, y + 3], fill=color)
    d.rectangle([x + w * 0.25, y - 2, x + w * 0.7, y], fill=color)


def island(d, cx, top, width, depth, grass='#4ade80', dirt='#9a5b2e', dark='#6b3a1c', snow=False, fall=None):
    """A floating island: a grass layer, a dirt body narrowing in steps, a few darker blocks and an
    optional waterfall running off its edge."""
    g, di, dk = hexrgb(grass), hexrgb(dirt), hexrgb(dark)
    left, right = cx - width / 2, cx + width / 2
    d.rectangle([left, top, right, top + 2], fill=g + (255,))
    rows = int(depth)
    for i in range(rows):
        inset = (i + 1) * width / (2.4 * rows)
        y = top + 3 + i
        d.line([(left + inset, y), (right - inset, y)], fill=(di if i % 3 else dk) + (255,))
    for k in range(3):
        bx = left + width * (0.2 + k * 0.25)
        d.rectangle([bx, top + 4 + k, bx + 1, top + 5 + k], fill=dk + (255,))
    if snow:
        # two little peaks with snow on them
        for px, ph in ((cx - width * 0.18, 7), (cx + width * 0.12, 9)):
            d.polygon([(px - 4, top), (px + 4, top), (px, top - ph)], fill=(120, 113, 108, 255))
            d.polygon([(px - 1.5, top - ph + 3), (px + 1.5, top - ph + 3), (px, top - ph)], fill=(255, 255, 255, 255))
    if fall is not None:
        x = right - 2
        d.rectangle([x, top + 1, x + 1, top + fall], fill=(125, 211, 252, 230))
        d.point((x - 1, top + fall), fill=(224, 242, 254, 255))


def glow(img, draw):
    """Draws translucent light on a layer of its own and blends it in: the cape's pixels stay opaque
    (a translucent pixel would let the game see through the cape)."""
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    draw(ImageDraw.Draw(layer))
    return Image.alpha_composite(img, layer)


def opaque(img):
    """Every pixel of the art fully opaque (small translucent dots become their plain colour)."""
    img.putalpha(255)
    return img


def skyup(cape):
    rnd = random.Random(cape)
    if cape == 'skyup_niebo':
        # "SkyUp – Niebo": a bright sky, blocky clouds and an island with a waterfall
        img = gradient('#7dd3fc', '#0284c7')
        d = ImageDraw.Draw(img)
        for y in (8, 18, 30):
            cloud(d, rnd.uniform(-4, W - 14), y, rnd.uniform(10, 16))
        island(d, W / 2, H * 0.66, W * 0.78, 9, fall=14)
        return border(img, '#e0f2fe')
    if cape == 'skyup_wyspa':
        # "SkyUp – Wyspa": the island close up, snowy peaks on top and roots hanging below
        img = gradient('#bae6fd', '#38bdf8')
        d = ImageDraw.Draw(img)
        cloud(d, 3, 8, 12)
        island(d, W / 2, H * 0.36, W - 4, 18, snow=True, fall=22)
        for _ in range(5):
            x = rnd.uniform(W * 0.3, W * 0.7)
            d.line([(x, H * 0.36 + 14), (x + rnd.uniform(-2, 2), H * 0.36 + 20 + rnd.uniform(0, 6))], fill=(120, 72, 36, 255))
        return border(img, '#4ade80')
    if cape == 'skyup_zachod':
        # "SkyUp – Zachód": a sunset with the sun behind a dark island
        img = gradient('#fb923c', '#7c3aed')
        d = ImageDraw.Draw(img)
        d.ellipse([W / 2 - 9, H * 0.42 - 9, W / 2 + 9, H * 0.42 + 9], fill=(254, 240, 138, 255))
        for y in (6, 14):
            cloud(d, rnd.uniform(-2, W - 14), y, rnd.uniform(10, 14), (253, 186, 116, 255))
        island(d, W / 2, H * 0.55, W * 0.8, 10, grass='#1e1b4b', dirt='#312e81', dark='#1e1b4b')
        return border(img, '#fdba74')
    if cape == 'skyup_noc':
        # "SkyUp – Noc": a night sky with stars and the moon, lanterns glowing on the island
        img = gradient('#1e3a8a', '#020617')
        d = ImageDraw.Draw(img)
        for _ in range(26):
            d.point((rnd.randrange(W), rnd.randrange(int(H * 0.6))), fill=(226, 232, 240, rnd.choice((150, 220, 255))))
        d.ellipse([W - 15, 5, W - 6, 14], fill=(254, 249, 195, 255))
        d.ellipse([W - 13, 4, W - 5, 12], fill=(30, 58, 138, 255))
        island(d, W / 2, H * 0.68, W * 0.8, 9, grass='#166534', dirt='#57351c', dark='#3b2412', fall=12)
        for x in (W * 0.32, W * 0.62):
            d.rectangle([x, H * 0.68 - 3, x + 1, H * 0.68 - 1], fill=(250, 204, 21, 255))
            d.point((x, H * 0.68 - 4), fill=(254, 240, 138, 255))
        return border(img, '#93c5fd')
    if cape == 'skyup_up':
        # "SkyUp – UP": the word UP in dirt blocks with grass on top, on the sky (our own lettering)
        img = gradient('#93c5fd', '#2563eb')
        d = ImageDraw.Draw(img)
        cloud(d, 2, 6, 12)
        cloud(d, W - 16, 14, 13)
        px = 4  # one block of the letters
        letters = {'U': ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'], 'P': ['XXX', 'X.X', 'XXX', 'X..', 'X..']}
        x0, y0 = W / 2 - (7 * px) / 2, H * 0.38
        for li, ch in enumerate('UP'):
            for r, row in enumerate(letters[ch]):
                for c, cell in enumerate(row):
                    if cell != 'X':
                        continue
                    x, y = x0 + (li * 4 + c) * px, y0 + r * px
                    top = r == 0 or letters[ch][r - 1][c] != 'X'
                    d.rectangle([x, y, x + px - 1, y + px - 1], fill=hexrgb('#9a5b2e') + (255,))
                    if top:
                        d.rectangle([x, y, x + px - 1, y], fill=hexrgb('#4ade80') + (255,))
                    d.point((x + px - 1, y + px - 1), fill=hexrgb('#6b3a1c') + (255,))
        island(d, W / 2, H * 0.8, W * 0.6, 6)
        return border(img, '#e0f2fe')
    if cape == 'skyup_waterblock':
        # "SkyUp – Waterblock": under water, a single block on the sea floor, kelp, fish and bubbles
        img = gradient('#22d3ee', '#0c4a6e')
        d = ImageDraw.Draw(img)
        img = glow(img, lambda g: [g.line([(0, 6 + i * 3), (W, 7 + i * 3)], fill=(207, 250, 254, 70 - i * 15)) for i in range(4)])
        d = ImageDraw.Draw(img)
        floor = H * 0.84
        d.rectangle([0, floor, W, H], fill=(194, 178, 128, 255))
        d.rectangle([W / 2 - 6, floor - 12, W / 2 + 5, floor - 1], fill=(120, 113, 108, 255), outline=(68, 64, 60, 255))
        d.rectangle([W / 2 - 6, floor - 12, W / 2 + 5, floor - 10], fill=(74, 222, 128, 255))
        for x in (5, 9, W - 8):
            h = rnd.uniform(14, 24)
            pts = [(x + math.sin(k / 3) * 1.5, floor - k) for k in range(int(h))]
            d.line(pts, fill=(22, 163, 74, 255), width=2)
        for fx, fy, col in ((8, H * 0.35, (251, 146, 60, 255)), (W - 14, H * 0.55, (250, 204, 21, 255))):
            d.rectangle([fx, fy, fx + 4, fy + 2], fill=col)
            d.polygon([(fx - 2, fy - 1), (fx, fy + 1), (fx - 2, fy + 3)], fill=col)
            d.point((fx + 3, fy), fill=(15, 23, 42, 255))
        for _ in range(9):
            x, y = rnd.uniform(4, W - 4), rnd.uniform(4, floor - 14)
            d.ellipse([x, y, x + 2, y + 2], outline=(224, 242, 254, 220))
        return border(img, '#67e8f9')
    if cape == 'skyup_waterblock_glebia':
        # "SkyUp – Waterblock: Głębia": the deep sea at night, prismarine and glowing sea lanterns
        img = gradient('#0e7490', '#020617')
        d = ImageDraw.Draw(img)
        for _ in range(6):
            x, y = rnd.uniform(3, W - 9), rnd.uniform(H * 0.45, H - 9)
            d.rectangle([x, y, x + 6, y + 6], fill=(45, 140, 128, 255), outline=(20, 83, 75, 255))
        for x, y in ((W * 0.25, H * 0.3), (W * 0.65, H * 0.52)):
            d.rectangle([x - 3, y - 3, x + 3, y + 3], fill=(236, 254, 255, 255))
            d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=(165, 243, 252, 255))
            img = glow(img, lambda g, x=x, y=y: g.ellipse([x - 8, y - 8, x + 8, y + 8], outline=(103, 232, 249, 90)))
            d = ImageDraw.Draw(img)
        for _ in range(7):
            x, y = rnd.uniform(4, W - 4), rnd.uniform(4, H * 0.6)
            d.point((x, y), fill=(165, 243, 252, 200))
        return border(img, '#2dd4bf')
    if cape == 'skyup_caveblock':
        # "SkyUp – Caveblock": a stone wall full of ores, a torch lighting it
        img = gradient('#57534e', '#1c1917')
        d = ImageDraw.Draw(img)
        for y in range(0, H, 6):
            off = 3 if (y // 6) % 2 else 0
            for x in range(-off, W, 8):
                d.rectangle([x, y, x + 7, y + 5], outline=(41, 37, 36, 255))
        ores = [(250, 204, 21), (34, 211, 238), (74, 222, 128), (239, 68, 68), (148, 163, 184)]
        for _ in range(9):
            x, y, col = rnd.uniform(3, W - 6), rnd.uniform(4, H - 6), rnd.choice(ores)
            for dx, dy in ((0, 0), (2, 1), (1, 3)):
                d.rectangle([x + dx, y + dy, x + dx + 1, y + dy + 1], fill=col + (255,))
        tx, ty = W * 0.72, H * 0.22
        d.rectangle([tx, ty, tx + 1, ty + 8], fill=(146, 64, 14, 255))
        d.rectangle([tx - 1, ty - 3, tx + 2, ty], fill=(251, 191, 36, 255))
        img = glow(img, lambda g: g.ellipse([tx - 10, ty - 12, tx + 11, ty + 9], fill=(251, 191, 36, 40)))
        return border(img, '#a8a29e')
    if cape == 'skyup_caveblock_lawa':
        # "SkyUp – Caveblock: Lawa": a dark cave with a lava lake glowing up at the stone
        img = gradient('#0c0a09', '#292524')
        d = ImageDraw.Draw(img)
        for y in range(0, int(H * 0.7), 6):
            off = 3 if (y // 6) % 2 else 0
            for x in range(-off, W, 8):
                d.rectangle([x, y, x + 7, y + 5], outline=(28, 25, 23, 255))
        img = glow(img, lambda g: [g.line([(0, H * 0.7 - k), (W, H * 0.7 - k)], fill=(234, 88, 12, max(0, 110 - k * 11))) for k in range(10)])
        d = ImageDraw.Draw(img)
        d.rectangle([0, H * 0.72, W, H], fill=(234, 88, 12, 255))
        for _ in range(14):
            x, y = rnd.uniform(0, W), rnd.uniform(H * 0.72, H)
            d.rectangle([x, y, x + 2, y + 1], fill=rnd.choice(((253, 186, 116, 255), (250, 204, 21, 255), (194, 65, 12, 255))))
        for x in (W * 0.2, W * 0.55, W * 0.82):
            d.polygon([(x - 3, 0), (x + 3, 0), (x, 6 + rnd.uniform(0, 5))], fill=(68, 64, 60, 255))
        return border(img, '#f97316')
    raise ValueError(cape)


def vanilla_wing():
    """The vanilla elytra's shape (alpha of its 24x22 part), from a Minecraft jar in the Gradle cache."""
    import glob
    import io
    import sys
    import zipfile
    jars = sys.argv[1:] or sorted(glob.glob(os.path.expanduser('~/.gradle/caches/fabric-loom/minecraftMaven/net/minecraft/minecraft-merged-deobf/*/*.jar')))
    for jar in jars:
        try:
            with zipfile.ZipFile(jar) as z:
                png = z.read('assets/minecraft/textures/entity/equipment/wings/elytra.png')
            return Image.open(io.BytesIO(png)).convert('RGBA').crop((22, 0, 46, 22)).getchannel('A')
        except (KeyError, OSError, zipfile.BadZipFile):
            continue
    print('no Minecraft jar with elytra.png found: capes get no elytra part (pass a jar path)')
    return None


WING = vanilla_wing()


def wing_art(cape):
    """What the elytra wings show. Minecraft draws one wing mirrored, so a letter would read
    backwards on it: the logo capes put the logo's "/" cut on the wings instead, a stripe that turns
    into a chevron across the open wings. Other capes show their own picture."""
    if cape == 'slash':
        img = gradient('#0b1220', '#1d4ed8')
        stripe(img, '#f3f4f6', '#93c5fd')
        return border(img, '#60a5fa')
    if cape == 'mono':
        img = gradient('#f9fafb', '#d1d5db')
        stripe(img, '#111827', '#6b7280')
        return border(img, '#111827', 3)
    return design(cape)


def stripe(img, color, edge):
    d = ImageDraw.Draw(img)
    d.polygon([(0, H * 0.30), (W, H * 0.06), (W, H * 0.30), (0, H * 0.54)], fill=hexrgb(color) + (255,))
    d.line([(0, H * 0.54), (W, H * 0.30)], fill=hexrgb(edge) + (255,), width=2)
    return img


def sized(w, h, draw):
    """Draws a picture at another size: the designs use W and H, so they are set for the call.
    The wing is drawn at its own size this way instead of a cape-sized picture being scaled
    (scaling 40x64 to 48x80 smeared the pixels)."""
    global W, H
    saved = W, H
    W, H = w, h
    try:
        return draw()
    finally:
        W, H = saved


def texture(cape, art=None, wing=None, cape_part=True):
    """A texture in Minecraft's cape layout: the cape (unless `cape_part` is off) and the elytra wing.
    `wing` draws the wing's picture (it is called at the wing's size)."""
    art = art if art is not None else design(cape)
    if wing is None:
        wing = (lambda: wing_art(cape)) if cape in CAPES else (lambda: design(cape))
    wing = sized(12 * K, 20 * K, wing)
    tex = Image.new('RGBA', (64 * K, 32 * K), (0, 0, 0, 0))
    edge = art.resize((1, 1)).getpixel((0, 0))
    dark = tuple(round(c * 0.55) for c in edge[:3]) + (255,)
    if cape_part:
        # outer face, and a calmer inner face (the side against the back)
        tex.paste(art, (1 * K, 1 * K))
        inner = Image.blend(art, Image.new('RGBA', art.size, dark), 0.6)
        tex.paste(inner, (12 * K, 1 * K))
        d = ImageDraw.Draw(tex)
        d.rectangle([0, 1 * K, 1 * K - 1, 17 * K - 1], fill=dark)
        d.rectangle([11 * K, 1 * K, 12 * K - 1, 17 * K - 1], fill=dark)
        d.rectangle([1 * K, 0, 21 * K - 1, 1 * K - 1], fill=dark)
    # elytra wings: the art fills the part of the texture the vanilla elytra draws, and is cut to the
    # vanilla wing's shape (its transparency), so it looks as thin as Minecraft's own elytra. The shape
    # comes from the game's elytra.png at generation time; Mojang's picture itself is not copied.
    if WING is not None:
        region = Image.new('RGBA', (24 * K, 22 * K), dark)
        region.paste(wing, (12 * K, 2 * K))
        alpha = WING.resize((24 * K, 22 * K), Image.NEAREST)
        region.putalpha(Image.composite(region.getchannel('A'), Image.new('L', region.size, 0), alpha))
        tex.paste(region, (22 * K, 0))
    return tex


# ---------- animated capes: FRAMES pictures, the mod shows them one after another ----------

FRAMES = 8


def animated(cape, f):
    t = f / FRAMES
    rnd = random.Random(cape)
    if cape == 'skyup_chmury':
        # "SkyUp – Chmury": clouds drifting past a floating island that slowly bobs
        img = gradient('#7dd3fc', '#0369a1')
        d = ImageDraw.Draw(img)
        for i, (y, w) in enumerate(((7, 14), (19, 11), (33, 15), (46, 10))):
            x = (rnd.uniform(0, W) + t * (W + 20) * (1 if i % 2 else 0.6)) % (W + 20) - 18
            cloud(d, x, y, w)
        island(d, W / 2, H * 0.6 + math.sin(t * math.pi * 2) * 1.5, W * 0.72, 9, fall=12)
        return opaque(border(img, '#e0f2fe'))
    if cape == 'aurora':
        img = gradient('#020617', '#0f172a')
        d = ImageDraw.Draw(img)
        for band, (col, base) in enumerate([((52, 211, 153), 0.30), ((45, 212, 191), 0.45), ((167, 139, 250), 0.60)]):
            pts_top, pts_bot = [], []
            for x in range(0, W + 1, 2):
                y = H * base + math.sin(x / W * math.pi * 2 + t * math.pi * 2 + band) * 5
                pts_top.append((x, y - 4))
                pts_bot.append((x, y + 4))
            d.polygon(pts_top + pts_bot[::-1], fill=col + (150,))
        for _ in range(18):
            d.point((rnd.randrange(W), rnd.randrange(H)), fill=(255, 255, 255, 200))
        return border(img, '#34d399')
    if cape == 'inferno':
        img = gradient('#1c0a05', '#7c2d12')
        d = ImageDraw.Draw(img)
        for i in range(10):
            cx = 2 + i * (W - 4) / 9
            h = H * (0.45 + 0.25 * (0.5 + 0.5 * math.sin(t * math.pi * 2 + i * 1.7)))
            d.polygon([(cx - 4, H), (cx + 4, H), (cx + math.sin(t * math.pi * 2 + i) * 2, H - h)], fill=(249, 115, 22, 230))
            d.polygon([(cx - 2, H), (cx + 2, H), (cx, H - h * 0.55)], fill=(253, 224, 71, 240))
        return border(img, '#f97316')
    if cape == 'waves':
        img = gradient('#0c4a6e', '#082f49')
        d = ImageDraw.Draw(img)
        for row in range(7):
            y0 = H * (0.1 + row * 0.13)
            pts = [(x, y0 + math.sin(x / W * math.pi * 2 + row + t * math.pi * 2) * 3) for x in range(0, W + 1, 2)]
            d.line(pts, fill=(125, 211, 252, 210), width=2)
        return border(img, '#38bdf8')
    if cape == 'pulse':
        glow = 0.5 + 0.5 * math.sin(t * math.pi * 2)
        img = border(gradient('#0b1220', mix_hex('#1d4ed8', '#60a5fa', glow)), mix_hex('#3b82f6', '#bfdbfe', glow))
        return logo(img, '#f3f4f6', '#1e3a8a')
    if cape == 'matrix':
        img = gradient('#000000', '#03140a')
        d = ImageDraw.Draw(img)
        # columns of falling green glyphs, each column at its own speed, bright at its head
        for c in range(8):
            x = 1 + c * 5
            speed = 1 + (c * 7) % 3
            head = (rnd.uniform(0, H) + t * H * speed) % (H + 20)
            for k in range(9):
                y = head - k * 4
                if 0 <= y < H:
                    g = 255 - k * 26
                    col = (220, 255, 220) if k == 0 else (34, g, 90)
                    d.rectangle([x, y, x + 2, y + 2], fill=col + (255,))
        return border(img, '#22c55e')
    if cape == 'storm':
        flash = 1.0 if f in (2, 3) else 0.0
        img = gradient(mix_hex('#1e293b', '#94a3b8', flash * 0.6), mix_hex('#0f172a', '#334155', flash * 0.4))
        d = ImageDraw.Draw(img)
        # clouds at the top
        for i in range(6):
            cx = i * W / 5
            d.ellipse([cx - 9, -6, cx + 9, 10], fill=(71, 85, 105, 255))
        # rain moving down
        for i in range(24):
            x = (i * 7) % W
            y = ((i * 13) + t * H * 2) % H
            d.line([(x, y), (x - 1, y + 4)], fill=(148, 163, 184, 200), width=1)
        if flash:
            pts = [(W * 0.55, 6), (W * 0.42, H * 0.38), (W * 0.58, H * 0.4), (W * 0.4, H * 0.85)]
            d.line(pts, fill=(254, 249, 195, 255), width=2)
        return border(img, '#cbd5e1')
    if cape == 'vortex':
        img = gradient('#1e1b4b', '#0c0a1f')
        d = ImageDraw.Draw(img)
        # three arms of a spiral turning around the middle, a full turn per loop
        cx, cy = W / 2, H * 0.45
        for arm, col in enumerate([(167, 139, 250), (129, 140, 248), (232, 121, 249)]):
            pts = []
            for k in range(40):
                r = k * 0.6
                a = k * 0.28 + arm * math.pi * 2 / 3 + t * math.pi * 2
                pts.append((cx + math.cos(a) * r, cy + math.sin(a) * r * 1.3))
            d.line(pts, fill=col + (255,), width=2)
        d.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=(250, 245, 255, 255))
        for _ in range(16):
            d.point((rnd.randrange(W), rnd.randrange(H)), fill=(255, 255, 255, 180))
        return border(img, '#a78bfa')
    if cape == 'starfall':
        img = gradient('#020617', '#172554')
        d = ImageDraw.Draw(img)
        for _ in range(28):
            d.point((rnd.randrange(W), rnd.randrange(H)), fill=(255, 255, 255, rnd.choice([120, 200])))
        # shooting stars crossing down to the left, each in its own place of the loop
        for i in range(4):
            phase = (t + i / 4) % 1
            sx, sy = W * (0.4 + 0.6 * ((i * 0.37) % 1)) + 10, -8 + i * 6
            x, y = sx - phase * (W + 20), sy + phase * (H * 0.9)
            d.line([(x, y), (x + 8, y - 6)], fill=(147, 197, 253, 200), width=1)
            d.line([(x, y), (x + 4, y - 3)], fill=(255, 255, 255, 255), width=2)
        return border(img, '#93c5fd')
    raise ValueError(cape)


def mix_hex(a, b, t):
    return '#%02x%02x%02x' % mix(hexrgb(a), hexrgb(b), t)


# ---------- capes for the ranks: the logo in the rank's colour ----------

RANK_CAPES = {'staff_admin': ('#450a0a', '#dc2626', '#fca5a5'), 'staff_support': ('#082f49', '#0284c7', '#7dd3fc'), 'staff_partner': ('#422006', '#ca8a04', '#fde68a'),
             'staff_friend': ('#052e16', '#16a34a', '#bbf7d0'), 'staff_friend_pink': ('#500724', '#db2777', '#fbcfe8')}


def rank_cape(cape):
    top, bottom, light = RANK_CAPES[cape]
    img = border(gradient(top, bottom), light)
    return logo(img, '#ffffff', top)


RANK_FRAMES = 16


def rank_cape_frame(cape, f):
    """The rank cape with a band of light sweeping across it (the first frames), then a rest:
    frame 0 is the plain cape, the launcher's and the website's picture of it."""
    img = rank_cape(cape)
    _, _, light = RANK_CAPES[cape]
    t = f / RANK_FRAMES
    sweep = t / 0.6
    if f == 0 or sweep >= 1:
        return img
    band = Image.new('RGBA', img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    # a slanted bright band, from above the top left corner to below the bottom right
    # from just left of the cape until its lower end has left on the right
    x = -8 + sweep * (W + H * 0.6 + 16)
    for k, alpha in ((7, 60), (4, 110), (2, 170)):
        d.polygon([(x - k, 0), (x + k, 0), (x + k - H * 0.6, H), (x - k - H * 0.6, H)], fill=hexrgb(light) + (alpha,))
    band = Image.composite(band, Image.new('RGBA', img.size, (0, 0, 0, 0)), img.getchannel('A'))
    return Image.alpha_composite(img, band)


def rank_wing(cape):
    top, bottom, light = RANK_CAPES[cape]
    img = gradient(top, bottom)
    stripe(img, '#ffffff', light)
    return border(img, light)


# ---------- wings and elytras: pictures for the wing, cut to the elytra's shape ----------

def feathers(top, bottom, line, rows=9):
    img = gradient(top, bottom)
    d = ImageDraw.Draw(img)
    for r in range(rows):
        y = H * (0.08 + r * 0.9 / rows)
        for x in range(0, W, 8):
            d.arc([x - 2, y - 6, x + 8, y + 6], 0, 180, fill=hexrgb(line) + (255,), width=2)
    return img


def feathers_over(img, line):
    """Rows of feather edges over a picture."""
    d = ImageDraw.Draw(img)
    for r in range(9):
        y = H * (0.08 + r * 0.1)
        for x in range(0, W, 8):
            d.arc([x - 2, y - 6, x + 8, y + 6], 0, 180, fill=hexrgb(line) + (255,), width=1)
    return img


def wing_design(kind):
    rnd = random.Random(kind)
    if kind == 'angel':
        return border(feathers('#ffffff', '#cbd5e1', '#94a3b8'), '#f1f5f9')
    if kind == 'demon':
        img = gradient('#450a0a', '#0c0a09')
        d = ImageDraw.Draw(img)
        for i in range(5):
            d.line([(0, H * 0.05), (W * (0.2 + i * 0.2), H)], fill=(127, 29, 29, 255), width=2)
        return border(img, '#7f1d1d')
    if kind == 'butterfly':
        img = gradient('#7c3aed', '#06b6d4')
        d = ImageDraw.Draw(img)
        for cx, cy, r in [(W * 0.5, H * 0.3, 8), (W * 0.45, H * 0.68, 6)]:
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(250, 204, 21, 255))
            d.ellipse([cx - r / 2, cy - r / 2, cx + r / 2, cy + r / 2], fill=(17, 24, 39, 255))
        return border(img, '#1e1b4b', 3)
    if kind == 'dragon':
        img = gradient('#166534', '#052e16')
        d = ImageDraw.Draw(img)
        for y in range(0, H, 6):
            for x in range(-(y // 6 % 2) * 4, W, 8):
                d.arc([x, y, x + 8, y + 8], 0, 180, fill=(74, 222, 128, 255), width=1)
        return border(img, '#14532d', 3)
    if kind == 'phoenix':
        return border(feathers('#fde047', '#dc2626', '#f97316'), '#fef08a')
    if kind == 'crystal':
        img = gradient('#cffafe', '#0891b2')
        d = ImageDraw.Draw(img)
        for _ in range(9):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            d.line([(x, y), (x + rnd.uniform(-10, 10), y + rnd.uniform(6, 16))], fill=(255, 255, 255, 220), width=1)
        return border(img, '#ecfeff')
    if kind == 'batwing':
        img = gradient('#292524', '#0c0a09')
        d = ImageDraw.Draw(img)
        # the membrane's bones fanning out from the top
        for i in range(5):
            d.line([(W * 0.1, 0), (W * (0.1 + i * 0.22), H)], fill=(87, 83, 78, 255), width=2)
        return border(img, '#44403c')
    if kind == 'frost':
        img = gradient('#f0f9ff', '#7dd3fc')
        d = ImageDraw.Draw(img)
        for _ in range(14):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            d.line([(x - 3, y), (x + 3, y)], fill=(255, 255, 255, 255))
            d.line([(x, y - 3), (x, y + 3)], fill=(255, 255, 255, 255))
        return border(feathers_over(img, '#bae6fd'), '#e0f2fe')
    if kind == 'prism':
        img = Image.new('RGBA', (W, H))
        d = ImageDraw.Draw(img)
        colors = ['#f43f5e', '#f59e0b', '#84cc16', '#06b6d4', '#6366f1', '#d946ef']
        for i, c in enumerate(colors):
            d.polygon([(0, H * i / 6 - 6), (W, H * i / 6 + 4), (W, H * (i + 1) / 6 + 4), (0, H * (i + 1) / 6 - 6)], fill=hexrgb(c) + (255,))
        return border(img, '#ffffff')
    if kind == 'shadow':
        img = gradient('#18181b', '#000000')
        d = ImageDraw.Draw(img)
        for _ in range(16):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            d.ellipse([x - 2, y - 1, x + 2, y + 1], fill=(139, 92, 246, 160))
        return border(feathers_over(img, '#3f3f46'), '#27272a')
    if kind == 'nebula':
        img = gradient('#312e81', '#020617')
        d = ImageDraw.Draw(img)
        for _ in range(5):
            x, y, r = rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(5, 10)
            d.ellipse([x - r, y - r, x + r, y + r], fill=rnd.choice([(236, 72, 153, 90), (59, 130, 246, 90), (168, 85, 247, 90)]))
        for _ in range(30):
            d.point((rnd.randrange(W), rnd.randrange(H)), fill=(255, 255, 255, 255))
        return border(img, '#a855f7')
    if kind == 'venom':
        img = gradient('#14532d', '#022c22')
        d = ImageDraw.Draw(img)
        for i in range(6):
            d.line([(W * i / 5, 0), (W * i / 5 + 6, H)], fill=(132, 204, 22, 255), width=2)
        return border(img, '#65a30d')
    if kind == 'tide':
        img = gradient('#0891b2', '#164e63')
        d = ImageDraw.Draw(img)
        for row in range(6):
            y0 = H * (0.1 + row * 0.15)
            d.line([(x, y0 + math.sin(x / W * math.pi * 3 + row) * 3) for x in range(0, W + 1, 2)], fill=(207, 250, 254, 220), width=2)
        return border(img, '#67e8f9')
    if kind == 'fairy':
        img = gradient('#fdf4ff', '#a5f3fc')
        d = ImageDraw.Draw(img)
        # thin veins like a dragonfly's, and sparkles of pink and gold
        for i in range(5):
            d.line([(0, H * 0.05), (W, H * (0.1 + i * 0.22))], fill=(216, 180, 254, 255), width=1)
        for _ in range(14):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            d.point((x, y), fill=rnd.choice([(244, 114, 182, 255), (250, 204, 21, 255), (255, 255, 255, 255)]))
        return border(img, '#f0abfc')
    if kind == 'bone':
        img = gradient('#e7e5e4', '#a8a29e')
        d = ImageDraw.Draw(img)
        # ribs of bone across, with dark gaps
        for r in range(7):
            y = H * (0.08 + r * 0.13)
            d.rectangle([0, y, W, y + 3], fill=(250, 250, 249, 255))
            d.line([(0, y + 5), (W, y + 5)], fill=(68, 64, 60, 255), width=2)
        d.rectangle([0, 0, 4, H], fill=(245, 245, 244, 255))
        return border(img, '#57534e')
    if kind == 'gilded':
        img = feathers('#fef08a', '#ca8a04', '#a16207')
        d = ImageDraw.Draw(img)
        for _ in range(10):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            d.line([(x - 2, y), (x + 2, y)], fill=(255, 255, 255, 255))
            d.line([(x, y - 2), (x, y + 2)], fill=(255, 255, 255, 255))
        return border(img, '#fde047')
    if kind == 'magma':
        img = gradient('#450a0a', '#1c1917')
        d = ImageDraw.Draw(img)
        # magma block cells: dark crust with glowing seams
        for _ in range(9):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            d.rectangle([x - 5, y - 4, x + 5, y + 4], outline=(249, 115, 22, 255), width=1)
            d.point((x, y), fill=(253, 224, 71, 255))
        return border(img, '#dc2626')
    if kind == 'circuit':
        img = gradient('#052e16', '#022c22')
        d = ImageDraw.Draw(img)
        # traces running at right angles, ending in pads
        for _ in range(9):
            x, y = round(rnd.uniform(2, W - 2)), round(rnd.uniform(2, H - 2))
            for _ in range(3):
                if rnd.random() < 0.5:
                    nx, ny = x + rnd.choice([-1, 1]) * rnd.randint(4, 10), y
                else:
                    nx, ny = x, y + rnd.choice([-1, 1]) * rnd.randint(4, 12)
                d.line([(x, y), (nx, ny)], fill=(74, 222, 128, 255), width=1)
                x, y = nx, ny
            d.rectangle([x - 1, y - 1, x + 1, y + 1], fill=(253, 224, 71, 255))
        return border(img, '#22c55e')
    if kind == 'autumn':
        img = gradient('#fed7aa', '#c2410c')
        d = ImageDraw.Draw(img)
        # falling leaves of red, orange and yellow
        for _ in range(12):
            x, y = rnd.uniform(3, W - 3), rnd.uniform(3, H - 3)
            col = rnd.choice([(220, 38, 38, 255), (234, 88, 12, 255), (234, 179, 8, 255), (146, 64, 14, 255)])
            d.polygon([(x, y - 4), (x + 3, y), (x, y + 4), (x - 3, y)], fill=col)
            d.line([(x, y + 4), (x, y + 6)], fill=(120, 53, 15, 255))
        return border(img, '#9a3412')
    if kind == 'feather':
        return border(feathers('#fef3c7', '#92400e', '#78350f'), '#fde68a')
    if kind == 'neon':
        img = gradient('#020617', '#0f172a')
        d = ImageDraw.Draw(img)
        for i in range(6):
            col = (34, 211, 238) if i % 2 else (232, 121, 249)
            d.line([(0, H * (0.1 + i * 0.16)), (W, H * (0.0 + i * 0.16))], fill=col + (255,), width=2)
        return border(img, '#22d3ee')
    if kind == 'void':
        img = gradient('#1e1b4b', '#000000')
        d = ImageDraw.Draw(img)
        for _ in range(40):
            d.point((rnd.randrange(W), rnd.randrange(H)), fill=(196, 181, 253, 255))
        return border(img, '#6d28d9')
    if kind == 'sunset':
        img = gradient('#f97316', '#7c3aed')
        d = ImageDraw.Draw(img)
        for i in range(4):
            d.line([(0, H * (0.25 + i * 0.18)), (W, H * (0.25 + i * 0.18))], fill=(254, 215, 170, 160), width=1)
        return border(img, '#fdba74')
    # ---- bought in the shop with Iskry ----
    if kind == 'emberwings':
        img = feathers('#fde68a', '#9a3412', '#ea580c')
        d = ImageDraw.Draw(img)
        for _ in range(16):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            d.point((x, y), fill=rnd.choice([(255, 251, 235, 255), (253, 224, 71, 255)]))
        return border(img, '#f59e0b')
    if kind == 'sapphire':
        img = gradient('#1d4ed8', '#172554')
        d = ImageDraw.Draw(img)
        for _ in range(8):
            x, y = rnd.uniform(0, W), rnd.uniform(0, H)
            d.polygon([(x, y - 5), (x + 4, y), (x, y + 5), (x - 4, y)], fill=(96, 165, 250, 255), outline=(219, 234, 254, 255))
        return border(feathers_over(img, '#3b82f6'), '#93c5fd')
    if kind == 'obsidianwings':
        img = gradient('#1e1b2e', '#000000')
        d = ImageDraw.Draw(img)
        for i in range(5):
            d.line([(W * 0.1, 0), (W * (0.1 + i * 0.22), H)], fill=(126, 34, 206, 255), width=1)
        return border(feathers_over(img, '#3b0764'), '#a855f7')
    if kind == 'aurum':
        img = gradient('#fef9c3', '#a16207')
        d = ImageDraw.Draw(img)
        for i in range(6):
            d.line([(0, H * (0.05 + i * 0.17)), (W, H * (0.15 + i * 0.17))], fill=(255, 255, 255, 170), width=1)
        return border(img, '#facc15')
    if kind == 'glacier':
        img = gradient('#ecfeff', '#67e8f9')
        d = ImageDraw.Draw(img)
        for _ in range(7):
            x = rnd.uniform(0, W)
            d.polygon([(x - 4, 0), (x + 4, 0), (x, rnd.uniform(H * 0.2, H * 0.5))], fill=(255, 255, 255, 230))
        return border(img, '#0891b2')
    if kind == 'acid':
        img = gradient('#365314', '#1a2e05')
        d = ImageDraw.Draw(img)
        for _ in range(10):
            x, y, r = rnd.uniform(0, W), rnd.uniform(0, H), rnd.uniform(1.5, 3.5)
            d.ellipse([x - r, y - r, x + r, y + r], fill=(190, 242, 100, 255))
        return border(img, '#a3e635')
    if kind == 'supporter_wings':
        # "Skrzydła mecenasa": violet feathers edged in light lilac, for supporters
        return border(feathers_over(gradient('#a78bfa', '#4c1d95'), '#ede9fe'), '#c4b5fd')
    raise ValueError(kind)


WINGS = ['angel', 'demon', 'butterfly', 'dragon', 'phoenix', 'crystal', 'batwing', 'frost', 'prism', 'shadow', 'fairy', 'bone', 'gilded',
         'emberwings', 'sapphire', 'obsidianwings']
ELYTRAS = ['feather', 'neon', 'void', 'sunset', 'nebula', 'venom', 'tide', 'magma', 'circuit', 'autumn', 'aurum', 'glacier', 'acid', 'supporter_wings']
ANIMATED = ['aurora', 'inferno', 'waves', 'pulse', 'matrix', 'storm', 'vortex', 'starfall', 'skyup_chmury']

os.makedirs(OUT, exist_ok=True)
count = 0
for cape in CAPES:
    texture(cape).save(os.path.join(OUT, f'{cape}.png'))
    count += 1
for cape in RANK_CAPES:
    for f in range(RANK_FRAMES):
        tex = texture(cape, rank_cape_frame(cape, f), lambda: rank_wing(cape))
        tex.save(os.path.join(OUT, f'{cape}_{f}.png'))
        if f == 0:
            tex.save(os.path.join(OUT, f'{cape}.png'))
    count += 1
for cape in ANIMATED:
    for f in range(FRAMES):
        art = animated(cape, f)
        tex = texture(cape, art, lambda: animated(cape, f))
        tex.save(os.path.join(OUT, f'{cape}_{f}.png'))
        # the first frame without a number: the launcher's and the website's picture of it
        if f == 0:
            tex.save(os.path.join(OUT, f'{cape}.png'))
    count += 1
# wings and elytras: only the elytra part of the layout (the mod draws them with the elytra model)
for folder, kinds in (('wings', WINGS), ('elytra', ELYTRAS)):
    out = os.path.join(OUT, '..', folder)
    os.makedirs(out, exist_ok=True)
    for kind in kinds:
        texture(kind, sized(12 * K, 20 * K, lambda: wing_design(kind)), lambda: wing_design(kind), cape_part=False).save(os.path.join(out, f'{kind}.png'))
        count += 1
print(count, 'cosmetics ->', os.path.normpath(os.path.join(OUT, '..')))
