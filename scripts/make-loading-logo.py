# Encodes the `loading` frames of scripts/make-discord-emoji.cjs into the animated logo of the loading screens:
# - build/icons/logo-slash.webp: the launcher's start screen (256x256, looping, copied by build.mjs)
# - hud/.../icon-slash.png: the HUD's loading screen, every frame of 128x128 in a grid of COLS columns,
#   left to right and top to bottom (SlashLoading picks the frame by the clock)
# Usage: python scripts/make-loading-logo.py <frames dir>   (normally run by the .cjs script)
import sys, pathlib
from PIL import Image

repo = pathlib.Path(__file__).resolve().parent.parent
frames_dir = pathlib.Path(sys.argv[1])
FPS, COLS = 25, 10

frames = [Image.open(f).convert("RGBA") for f in sorted(frames_dir.glob("*.png"))]

web = [f.resize((256, 256), Image.LANCZOS) for f in frames]
webp = repo / "build" / "icons" / "logo-slash.webp"
web[0].save(webp, save_all=True, append_images=web[1:], duration=1000 // FPS, loop=0, lossless=False, quality=90, method=6)

tile = 128
rows = -(-len(frames) // COLS)
sheet = Image.new("RGBA", (COLS * tile, rows * tile), (0, 0, 0, 0))
for i, f in enumerate(frames):
    sheet.paste(f.resize((tile, tile), Image.LANCZOS), (i % COLS * tile, i // COLS * tile))
png = repo / "hud" / "src" / "main" / "resources" / "assets" / "slashclient-hud" / "icon-slash.png"
sheet.save(png, optimize=True)

print(f"loading: {len(frames)} klatek, {webp.name} {webp.stat().st_size // 1024} KB, {png.name} {sheet.size[0]}x{sheet.size[1]} {png.stat().st_size // 1024} KB")
