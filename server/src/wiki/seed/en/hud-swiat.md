<!-- dzial: hud | kolejnosc: 50 | ikona: fa-earth-europe | opis: Compass, biome, time of day, light, block info, elytra, the light overlay, auto tool and other helpers in the world -->
# Modules: world

The **World** category is about what goes on around you. Switch things on in **Right Shift → Settings → World**. The map, minimap and waypoints have a page of their own: [Map, minimap and waypoints](/wiki/hud-mapa).

![The World category's cards](hud-kategoria-world.webp)

## Compass

A compass strip with the directions, as in modern games.

![Compass](hud-kompas.webp)

- **Degrees** – the number in the middle.
- **Arrow to a target** – a mark on the compass pointing to the nearest waypoint, your death point or the waypoint with a given name (**Waypoint name**, e.g. "Home").

## Biome, Day and time, Light level, Sky and weather

![Biome, day and time, light level, and sky and weather](hud-swiat.webp)

- **Biome** – the biome's name. Options: **Colour by biome**, **Technical name** (e.g. `minecraft:plains`).
- **Day and time** – the game day and the world's time. Options: **Day number**, **Night warning** (orange a minute before dusk, red at night).
- **Light level** – the light where you stand. Options: **Red from level** (monsters spawn at 0), **Sky and block light apart**.
- **Sky and weather** – time to dusk or dawn and the weather. **Time to the next weather change** works in singleplayer.

## Saturation

Hunger and the hidden saturation as numbers.

![Saturation](hud-nasycenie.webp)

More about food (the preview on the hunger bar) on [Game HUD](/wiki/hud-interfejs-gry#food-hunger-saturation-and-healing).

## Nether coordinates

Where you would be in the other dimension: in the Overworld it shows the Nether coordinates (divided by 8), in the Nether the Overworld ones. Handy when building portals.

![Nether coordinates](hud-wspolrzedne-netheru.webp)

## Elytra flight

While flying: speed in m/s, height Y, the flight angle and the elytra's durability.

![Elytra flight](hud-elytra.webp)

- **Rocket count** – how many rockets you carry.
- **Worn elytra warning**.

## Block info

The block you look at, with lots of detail.

![Block info: wheat](hud-informacje-o-bloku.webp)

Every line on its own:

| Setting | What it shows |
|---|---|
| Tool and mining time | which tool and how long |
| Best tool | the best one and the weakest that still drops the block |
| Breaking progress bar | how far you are with mining |
| Plant growth | growth in percent or "Grown" |
| Contents and counters | honey, level, charges, notes, candles, eggs… |
| Bees in the hive | singleplayer only |
| Items on a shelf, Item frames' contents | what lies on a shelf or in a frame |
| Redstone signal | signal strength |
| Block coordinates, Light | position, block and sky light |
| Hardness and blast resistance | |
| Block ID, Block state | e.g. facing, half |

## Sprint/sneak

"Sprinting" or "Sneaking" while you do it. A similar **Sprint and sneak** module is in Info.

## TNT timer

Lit TNT shows the seconds left above it – green, then yellow, then red. Only you see the label. On by default.

![TNT timer above lit TNT](hud-tnt.webp)

## Your own time of day

Sets the time of day just for you – morning, noon, sunset or night. The server and other players do not see it.

## No rain or snow

Turns off rain and snow on your screen. The server's weather does not change.

## Light level overlay

**F9** marks the blocks where monsters can spawn: red – any time, yellow – only at night. The rules are the game's own.

![The light level overlay on grass](hud-nakladka-swiatla.webp)

- **Radius (blocks)** – 4 to 32.
- **Show where crops grow** – farmland is green where plants get enough light and blue where it is too dark.

## Better death screen

The death screen shows a card with where you died (coordinates and dimension – a click copies them) and how long you lived since the last respawn. **Set waypoint** keeps the place as a lasting waypoint. The game's buttons work as always.

![The better death screen](hud-ekran-smierci.webp)

## Auto tool

Takes the best tool for the block you mine and the strongest weapon when you hit a mob.

| Setting | What it does |
|---|---|
| Tool for mining blocks | picks the tool |
| Leaves, Cobweb, Bamboo, Pumpkin and melon | what to use for blocks several tools can mine |
| Strongest weapon on hitting a mob, Preferred weapon | strongest, sword or axe |
| Shears for sheep, Bucket and bowl, Water bucket for fish, Brush for armadillos, Food for animals | right-clicking an animal takes what it needs |
| Mooshroom | bowl, bucket or either |

## Hand refill

When a stack in your hand runs out, the next one of the same kind comes from your backpack. **Also takes from other hotbar slots** when the backpack has none.

> Auto tool and hand refill may be forbidden on some servers. The mod warns you the first time you switch one on.
