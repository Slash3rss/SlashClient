"""
Contact sheets of the cosmetics for the SlashClient wiki (server/src/wiki/seed/img/kosmetyki-*.webp):
grids of the items' own pictures (server/web/vendor), with their names, on the site's dark background.

Run from the repository root (needs Python 3 with Pillow):

    python scripts/wiki/cosmetic-sheets.py

The items, their names and how they are got are read from server/src/cosmetics.ts, so the sheets follow
the catalogue after every release. Set WIKI_SHOTS_OUT to save somewhere else than the seed folder.

It also cuts three pictures out of the HUD's game tests' screenshots (the in-game cosmetics menu, buying
in it, an achievement's toast), when they are there: run the shop tests first, e.g.
`./gradlew runClientGameTest -Pmc=1.21.4 -Ptests=GameShop` in hud/ (HUD_SHOTS points elsewhere). The test
player's name is painted over.
"""
import os
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
VENDOR = os.path.join(ROOT, 'server', 'web', 'vendor')
OUT = os.environ.get('WIKI_SHOTS_OUT') or os.path.join(ROOT, 'server', 'src', 'wiki', 'seed', 'img')
FONT = os.path.join(ROOT, 'hud', 'src', 'main', 'resources', 'assets', 'slashclient-hud', 'font', 'outfit-medium.ttf')

BG = (11, 14, 26)
TILE = (22, 27, 45)
EDGE = (44, 52, 82)
TEXT = (226, 232, 245)
MUTED = (140, 150, 178)
GOLD = (250, 204, 21)


def items():
    """Every item of cosmetics.ts as a dict: id, slot, name, frames, price, achievement, rank, supporter."""
    src = open(os.path.join(ROOT, 'server', 'src', 'cosmetics.ts'), encoding='utf-8').read()
    out = []
    for line in re.findall(r"\{ id: '[^']+', slot: '[a-z]+'[^\n]*\}", src):
        get = lambda key: (re.search(key + r": '([^']*)'", line) or [None, None])[1]
        num = lambda key: int((re.search(key + r": (\d+)", line) or [None, 0])[1])
        out.append({'id': get('id'), 'slot': get('slot'), 'name': get('name'), 'frames': num('frames'), 'price': num('price'),
                    'achievement': get('achievement'), 'rank': get('rank'), 'supporter': num('supporter')})
    return out


def font(size):
    return ImageFont.truetype(FONT, size)


def cape_front(item, frame=None):
    """The cape's outer side (10×16 pixels of the 64×32 layout), as big as its picture allows."""
    name = f"{item['id']}_{frame}.png" if frame is not None else f"{item['id']}.png"
    path = os.path.join(VENDOR, 'capes', name)
    if not os.path.exists(path):
        path = os.path.join(VENDOR, 'capes', f"{item['id']}_0.png")
    im = Image.open(path).convert('RGBA')
    k = im.width // 64
    return im.crop((k, k, 11 * k, 17 * k))


def shield_face(item):
    im = Image.open(os.path.join(VENDOR, 'held', f"{item['id']}.png")).convert('RGBA')
    k = im.width // 64
    return im.crop((k, k, 13 * k, 23 * k))


def picture(item):
    slot = item['slot']
    if slot == 'cape':
        return cape_front(item)
    folder = {'hat': 'clothing/icon', 'top': 'clothing/icon', 'shoes': 'clothing/icon', 'hands': 'clothing/icon', 'face': 'clothing/icon',
              'ears': 'clothing/icon', 'suit': 'suits/icon', 'back': 'gear/icon', 'tail': 'gear/icon', 'spray': 'spray', 'prop': 'props/icon',
              'weapon': 'held'}.get(slot)
    if slot == 'shield':
        return shield_face(item)
    if slot == 'ring':
        path = os.path.join(VENDOR, 'rings', f"{item['id']}.png")
        if not os.path.exists(path):
            path = os.path.join(VENDOR, 'rings', f"{item['id']}_0.png")
        im = Image.open(path).convert('RGBA')
        return im.crop((0, 0, im.height, im.height))
    if not folder:
        return None
    path = os.path.join(VENDOR, folder, f"{item['id']}.png")
    return Image.open(path).convert('RGBA') if os.path.exists(path) else None


def fit(im, box_w, box_h):
    """Scaled up by whole steps (crisp pixels) to fit the box, or down smoothly when bigger."""
    k = min(box_w / im.width, box_h / im.height)
    if k >= 1:
        k = int(k)
        return im.resize((im.width * k, im.height * k), Image.NEAREST)
    return im.resize((max(1, int(im.width * k)), max(1, int(im.height * k))), Image.LANCZOS)


def star(d, cx, cy, r, colour):
    """The Sparks' sign: a four-pointed star."""
    q = r * 0.32
    d.polygon([(cx, cy - r), (cx + q, cy - q), (cx + r, cy), (cx + q, cy + q), (cx, cy + r), (cx - q, cy + q), (cx - r, cy), (cx - q, cy - q)], fill=colour)


def badge(item):
    """What the tile's corner says about getting it: the price in Sparks, a trophy, a rank, a heart."""
    if item['price']:
        return str(item['price']), GOLD
    return None, None


def sheet(name, chosen, cols, tile_w, tile_h, pic_h, title=None, labels=True):
    if not chosen:
        print(f'{name}: nothing')
        return
    pad, gap, label_h = 24, 14, 30 if labels else 0
    rows = (len(chosen) + cols - 1) // cols
    head = 52 if title else 0
    w = pad * 2 + cols * tile_w + (cols - 1) * gap
    h = pad * 2 + head + rows * (tile_h + label_h) + (rows - 1) * gap
    img = Image.new('RGB', (w, h), BG)
    d = ImageDraw.Draw(img)
    if title:
        d.text((pad, pad - 4), title, font=font(28), fill=TEXT)
    f_label, f_badge = font(15), font(15)
    for i, it in enumerate(chosen):
        x = pad + (i % cols) * (tile_w + gap)
        y = pad + head + (i // cols) * (tile_h + label_h + gap)
        d.rounded_rectangle((x, y, x + tile_w, y + tile_h + label_h), radius=12, fill=TILE, outline=EDGE, width=2)
        pic = it['pic'] if 'pic' in it else picture(it)
        if pic is not None:
            pic = fit(pic, tile_w - 24, pic_h)
            img.paste(pic, (x + (tile_w - pic.width) // 2, y + (tile_h - pic.height) // 2 + 4), pic)
        if labels:
            label = it['name']
            while d.textlength(label, font=f_label) > tile_w - 12 and len(label) > 3:
                label = label[:-2].rstrip() + '…' if not label.endswith('…') else label[:-2].rstrip() + '…'
            d.text((x + tile_w / 2, y + tile_h + label_h / 2 - 2), label, font=f_label, fill=TEXT, anchor='mm')
        text, colour = badge(it)
        if text:
            # the price with the Sparks' four-pointed star (the font has no ✦)
            tw = d.textlength(text, font=f_badge)
            left = x + tile_w - tw - 34
            d.rounded_rectangle((left, y + 8, x + tile_w - 8, y + 30), radius=8, fill=(58, 46, 10))
            star(d, left + 12, y + 19, 7, colour)
            d.text((left + 22, y + 10), text, font=f_badge, fill=colour)
    save(img, name)


def save(img, name):
    if img.width > 1280:
        img = img.resize((1280, round(img.height * 1280 / img.width)), Image.LANCZOS)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f'{name}.webp')
    img.save(path, 'WEBP', quality=82)
    print(f'{name}.webp {os.path.getsize(path) // 1024} kB')


def animated_strip(name, capes):
    """Each animated cape's frames side by side, one cape per row."""
    pad, gap = 24, 10
    fw, fh = 80, 128
    frames = 8
    f = font(20)
    label_w = 210
    w = pad * 2 + label_w + frames * fw + (frames - 1) * gap
    h = pad * 2 + len(capes) * fh + (len(capes) - 1) * 18
    img = Image.new('RGB', (w, h), BG)
    d = ImageDraw.Draw(img)
    for r, it in enumerate(capes):
        y = pad + r * (fh + 18)
        d.text((pad, y + fh / 2), it['name'], font=f, fill=TEXT, anchor='lm')
        for i in range(frames):
            pic = fit(cape_front(it, i * max(1, it['frames'] // frames)), fw, fh)
            x = pad + label_w + i * (fw + gap)
            img.paste(pic, (x + (fw - pic.width) // 2, y + (fh - pic.height) // 2), pic)
    save(img, name)


def main():
    all_items = items()
    by = lambda slot: [i for i in all_items if i['slot'] == slot]
    capes = [c for c in by('cape') if not c['id'].startswith('skyup')]
    free = [c for c in capes if not (c['price'] or c['achievement'] or c['rank'] or c['supporter'])]
    earned = [c for c in capes if c['achievement']]
    shop = [c for c in capes if c['price']]
    special = [c for c in capes if c['rank'] or c['supporter']]
    sheet('kosmetyki-peleryny-darmowe', free, 8, 130, 170, 150)
    sheet('kosmetyki-peleryny-osiagniecia', earned, 8, 140, 170, 150)
    sheet('kosmetyki-peleryny-sklep', shop, 8, 140, 170, 150)
    sheet('kosmetyki-peleryny-rangi', special, 7, 130, 170, 150)
    animated = [c for c in capes if c['frames'] >= 8 and c['id'] in ('aurora', 'matrix', 'storm', 'staff_admin')]
    animated_strip('kosmetyki-peleryny-animowane', animated)
    clothing = [i for s in ('hat', 'top', 'face', 'ears', 'hands', 'shoes') for i in by(s)]
    sheet('kosmetyki-ubrania-ikony', clothing, 8, 140, 112, 92)
    sheet('kosmetyki-stroje-ikony', by('suit'), 8, 130, 130, 112)
    sheet('kosmetyki-plecy-ogony-ikony', by('back') + by('tail'), 8, 140, 130, 112)
    sheet('kosmetyki-kregi-ikony', by('ring'), 6, 170, 170, 150)
    sheet('kosmetyki-spraye-ikony', by('spray'), 5, 150, 150, 128)
    sheet('kosmetyki-bronie-ikony', by('shield') + [w for w in by('weapon') if os.path.exists(os.path.join(VENDOR, 'held', w['id'] + '.png'))], 7, 156, 140, 120)


def from_game_tests():
    """Crops of the HUD tests' screenshots (854×480, Polish): the menu, the purchase, the toast."""
    folder = os.environ.get('HUD_SHOTS') or os.path.join(ROOT, 'hud', 'build', 'run', 'clientGameTest', 'screenshots')
    if not os.path.isdir(folder):
        print('no game test screenshots: skipped the in-game pictures')
        return
    def find(suffix):
        names = sorted(n for n in os.listdir(folder) if n.endswith(suffix))
        return Image.open(os.path.join(folder, names[-1])).convert('RGB') if names else None
    menu = find('_shop-cape.png')
    if menu:
        # the line with the test player's name ("Zestaw postaci …") under the title, painted with the panel's colour
        ImageDraw.Draw(menu).rectangle((380, 74, 640, 97), fill=menu.getpixel((372, 86)))
        save(menu.resize((menu.width * 3 // 2, menu.height * 3 // 2), Image.LANCZOS), 'kosmetyki-gra-menu')
    buy = find('_shop-buy.png')
    if buy:
        save(buy.crop((392, 148, 798, 332)).resize((812, 368), Image.LANCZOS), 'kosmetyki-gra-kup')
    toast = find('_shop-toast-achievement-cape.png')
    if toast:
        save(toast.crop((530, 0, 854, 88)).resize((648, 176), Image.LANCZOS), 'spolecznosc-osiagniecie-powiadomienie')


if __name__ == '__main__':
    main()
    from_game_tests()
