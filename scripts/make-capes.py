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
        return slash(img, '#f3f4f6', '#93c5fd')
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
        return slash(img, '#111827', '#4b5563')
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


def texture(cape):
    art = design(cape)
    tex = Image.new('RGBA', (64 * K, 32 * K), (0, 0, 0, 0))
    edge = art.resize((1, 1)).getpixel((0, 0))
    dark = tuple(round(c * 0.55) for c in edge[:3]) + (255,)
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
        region.paste(art.resize((12 * K, 20 * K), Image.LANCZOS), (12 * K, 2 * K))
        alpha = WING.resize((24 * K, 22 * K), Image.NEAREST)
        region.putalpha(Image.composite(region.getchannel('A'), Image.new('L', region.size, 0), alpha))
        tex.paste(region, (22 * K, 0))
    return tex


os.makedirs(OUT, exist_ok=True)
for cape in CAPES:
    texture(cape).save(os.path.join(OUT, f'{cape}.png'))
print(len(CAPES), 'capes ->', os.path.normpath(OUT))
