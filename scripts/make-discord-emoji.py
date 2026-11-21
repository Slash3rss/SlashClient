# Encodes frames rendered by scripts/make-discord-emoji.cjs into Discord emoji:
# <root>/out/slashclient_<variant>.gif and .webp (128x128, looping) plus a contact sheet per variant.
# Usage: python scripts/make-discord-emoji.py <root>   (normally run by the .cjs script)
import sys, pathlib
from PIL import Image, ImageChops

root = pathlib.Path(sys.argv[1])
out = root / "out"
out.mkdir(parents=True, exist_ok=True)
FPS, SIZE, LIMIT = 25, 128, 256 * 1024


def gif(frames, dst):
    # One shared palette for all frames, so unchanged areas stay identical between frames and the
    # GIF only stores the part that moved. No dithering: noise would change every frame.
    w, h = frames[0].size
    mosaic = Image.new("RGB", (w * len(frames), h))
    for i, f in enumerate(frames):
        mosaic.paste(f.convert("RGB"), (i * w, 0))
    pal = mosaic.quantize(colors=255, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal.putpalette(pal.getpalette()[:255 * 3] + [0, 0, 0])  # index 255 = transparent corners
    images = []
    for f in frames:
        q = f.convert("RGB").quantize(palette=pal, dither=Image.Dither.NONE)
        alpha = f.getchannel("A").point(lambda a: 255 if a >= 128 else 0)
        q.paste(255, mask=ImageChops.invert(alpha))
        q.info["transparency"] = 255
        images.append(q)
    images[0].save(dst, save_all=True, append_images=images[1:], duration=1000 // FPS, loop=0,
                   transparency=255, disposal=1, optimize=False)


for vdir in sorted(p for p in (root / "frames").iterdir() if p.is_dir()):
    name = vdir.name
    frames = [Image.open(f).convert("RGBA").resize((SIZE, SIZE), Image.LANCZOS) for f in sorted(vdir.glob("*.png"))]
    # WebP keeps the soft alpha on the rounded corners.
    webp = out / f"slashclient_{name}.webp"
    frames[0].save(webp, save_all=True, append_images=frames[1:], duration=1000 // FPS, loop=0,
                   lossless=False, quality=90, method=6)
    g = out / f"slashclient_{name}.gif"
    gif(frames, g)
    # Contact sheet: every 4th frame on Discord's dark background.
    pick = frames[::4]
    sheet = Image.new("RGBA", (len(pick) * 136, 136), (49, 51, 56, 255))
    for i, im in enumerate(pick):
        sheet.alpha_composite(im, (i * 136 + 4, 4))
    sheet.save(out / f"sheet_{name}.png")
    sizes = [(p.suffix[1:], p.stat().st_size) for p in (g, webp)]
    warn = " – ZA DUŻY dla Discorda!" if any(s > LIMIT for _, s in sizes) else ""
    print(f"{name}: {len(frames)} klatek, " + ", ".join(f"{k} {s // 1024} KB" for k, s in sizes) + warn)
