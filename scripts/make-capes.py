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
    raise ValueError(cape)


CAPES = ['slash', 'ocean', 'ember', 'forest', 'galaxy', 'rose', 'gold', 'mono']


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


def texture(cape, art=None, wing=None, cape_part=True):
    """A texture in Minecraft's cape layout: the cape (unless `cape_part` is off) and the elytra wing."""
    art = art if art is not None else design(cape)
    wing = wing if wing is not None else (wing_art(cape) if cape in CAPES else art)
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
        region.paste(wing.resize((12 * K, 20 * K), Image.LANCZOS), (12 * K, 2 * K))
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


WINGS = ['angel', 'demon', 'butterfly', 'dragon', 'phoenix', 'crystal']
ELYTRAS = ['feather', 'neon', 'void', 'sunset']
ANIMATED = ['aurora', 'inferno', 'waves', 'pulse']

os.makedirs(OUT, exist_ok=True)
count = 0
for cape in CAPES:
    texture(cape).save(os.path.join(OUT, f'{cape}.png'))
    count += 1
for cape in RANK_CAPES:
    texture(cape, rank_cape(cape), rank_wing(cape)).save(os.path.join(OUT, f'{cape}.png'))
    count += 1
for cape in ANIMATED:
    for f in range(FRAMES):
        art = animated(cape, f)
        tex = texture(cape, art, art)
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
        texture(kind, wing_design(kind), cape_part=False).save(os.path.join(out, f'{kind}.png'))
        count += 1
print(count, 'cosmetics ->', os.path.normpath(os.path.join(OUT, '..')))
