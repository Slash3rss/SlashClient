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
    raise ValueError(cape)


CAPES = ['slash', 'ocean', 'ember', 'forest', 'galaxy', 'rose', 'gold', 'mono', 'sakura', 'night', 'rainbow', 'ice', 'toxic', 'checker',
         'lava', 'desert', 'cyber', 'honey', 'mint']


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

RANK_CAPES = {'staff_admin': ('#450a0a', '#dc2626', '#fca5a5'), 'staff_support': ('#082f49', '#0284c7', '#7dd3fc'), 'staff_partner': ('#422006', '#ca8a04', '#fde68a')}


def rank_cape(cape):
    top, bottom, light = RANK_CAPES[cape]
    img = border(gradient(top, bottom), light)
    return logo(img, '#ffffff', top)


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
    raise ValueError(kind)


WINGS = ['angel', 'demon', 'butterfly', 'dragon', 'phoenix', 'crystal', 'batwing', 'frost', 'prism', 'shadow', 'fairy', 'bone', 'gilded']
ELYTRAS = ['feather', 'neon', 'void', 'sunset', 'nebula', 'venom', 'tide', 'magma', 'circuit', 'autumn']
ANIMATED = ['aurora', 'inferno', 'waves', 'pulse', 'matrix', 'storm', 'vortex', 'starfall']

os.makedirs(OUT, exist_ok=True)
count = 0
for cape in CAPES:
    texture(cape).save(os.path.join(OUT, f'{cape}.png'))
    count += 1
for cape in RANK_CAPES:
    texture(cape, rank_cape(cape), lambda: rank_wing(cape)).save(os.path.join(OUT, f'{cape}.png'))
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
