<!-- dzial: hud | kolejnosc: 140 | ikona: fa-gauge-high | opis: The FPS benchmark, the test scene, the mode for slower computers and the modules that watch performance -->
# Performance and benchmark

## Benchmark

A repeatable FPS test. After a short warm-up the camera turns slowly once around at eye level, then half around looking at the sky, then stands still – while every frame's time is written down.

**How to run it:** in a world click the **Benchmark** card (Right Shift → Settings → Extras); in the menu the same card shows the last result. The launcher has a benchmark button next to each world too.

The result shows:
- the average FPS in big numbers and the change since the run before,
- **1% low** and **0.1% low** (how smooth the worst moments were), the median and the number of stutters,
- the CPU and GPU load,
- a graph of every frame's time,
- the settings it ran with: render distance, VSync, frame limit and mods.

Results are saved in `config/slashclient-benchmarks.json` and the launcher sees them too.

### SlashClient test scene

As in other games' benchmarks: a world of its own with a fixed seed, fixed time and weather, no mobs walking about, and a camera flying the same path every time. Each part of the scene is measured on its own: **Forest**, **Panorama**, **Village**, **Water**, **Creatures**, **Particles**, **Night**. The first run finds the places and loads the terrain – later runs start at once. Scene results are only compared with other scene runs.

## Modules that watch performance

- **FPS** and the **FPS graph** (with the 1% low) – see [Modules: info](/wiki/hud-informacje#fps).
- **Memory**, **Processor (CPU)**, **Graphics card (GPU)** – the load live.
- **Ping**, **Ping graph**, **Server TPS**, **Network usage** – is it the game or the server that lags.

## Mode for slower computers

With the launcher's **mode for slower computers** saving on, the mod:
- does not show other players' cosmetics,
- turns off the seasonal effects,
- stops the moving menu background,
- on the first start switches on only the game's own HUD parts – you switch SlashClient's modules on yourself.

## What costs more

- **Clips** and the **Instant replay** keep the last seconds of the screen in memory – the higher the resolution and frame rate, the more memory (see [Screenshots, clips and replay](/wiki/hud-nagrania)).
- The **minimap** is only drawn again when something changed, so standing still costs almost nothing.
- The **light level overlay** looks at blocks a few times a second within its radius – a smaller radius is less work.
