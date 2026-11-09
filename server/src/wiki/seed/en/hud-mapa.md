<!-- dzial: hud | kolejnosc: 60 | ikona: fa-map | opis: The minimap, the full-screen world map, waypoints, the death point and friends on the map -->
# Map, minimap and waypoints

SlashClient has its own minimap, a full-screen world map and waypoints, kept apart for every server and world.

## Minimap

The ground around you from above, your waypoints, players and mobs nearby, and you as an arrow. The coordinates and the direction are under the map.

![A square minimap, north up](hud-minimapa.webp)

**How to switch it on:** Right Shift → Settings → World → **Minimap**. It sits in the top right corner; move it in the editor.

| Setting | What it does |
|---|---|
| Minimap size | 64 to 200 pixels |
| Zoom | 0.5 to 4 pixels per block |
| Shape | square or circle |
| Turn with the player | the map turns and your arrow always points up |
| Coordinates and direction under the map | |
| Waypoints on the map | waypoints as diamonds; those off the map as arrows on its edge |
| Players / Hostile mobs / Other mobs on the maps | who shows (the world map too) |

![The minimap settings](hud-opcje-minimap.webp)

![A round minimap turning with the player](hud-minimapa-okragla.webp)

In the Nether the minimap draws the ground at your level, not the bedrock roof – you see the tunnels you walk in.

The **Minimap** card also has look options, shared with the world map:

| Setting | What it does |
|---|---|
| Caves | **Underground** – below ground the map shows the caves by itself; **Always**; **Off** |
| Shading | **Relief** (slopes lighter and darker, so hills stand out) or **Like the game's map** |
| Darker at night | the map gets darker at night |
| Trail walked | dots where you walked in the last minutes; they fade and go away after the **Trail length** option (5 minutes by default, 1 to 30) |

![The minimap with "Like the game's map" shading](hud-minimapa-klasyczna.webp)

### Cave mode

Underground (or always, if you set it so) the map does not draw the surface above you but the cave floor at your height. Solid rock is dark, so tunnels, caverns and water stand out. Caves have their own layer on the world map – its top then says **Caves**.

![The minimap in a cave](hud-minimapa-jaskinie.webp)

![The world map in cave mode](hud-mapa-jaskinie.webp)

The map is only drawn again when something changed (you moved or turned, or the ground changed), so standing still costs nothing.

## World map

**M** opens the map over the whole screen: all the ground the minimap has seen in this dimension of this world – also where you no longer are.

![The world map with waypoints and friends](hud-mapa-swiata.webp)

- **Drag** – moves the map.
- **Mouse wheel** – zooms in and out around the cursor.
- **Space** or **To me** – back to you.
- **Right click** – a new waypoint there (at the ground's height when it is known), opened at once to name it.
- **Click a waypoint** – opens it: rename, recolour, hide, share with friends or delete.
- **M**, **Esc** or ✕ closes the map.
- **Ctrl + click** – teleports you there, onto the ground. Where the map knows the ground's height, the mod uses `/tp` just above it; where the map hasn't seen the place yet, `/spreadplayers` looks for the ground itself (over the void by an island it finds none). Only where you may use `/tp` or `/spreadplayers` (a singleplayer world with cheats, or a server that gives you those commands); the hint at the bottom of the map then says "Ctrl+click: teleport".

### Grid and biomes

The buttons on the map's top bar switch on:
- **Grid** – chunk borders, and region borders (512 blocks) in thicker lines;
- **Biomes** – biome colours instead of the ground (oceans blue, deserts sandy, snowy ones white…), with the name of the biome under the cursor next to the coordinates.

![The world map with the chunk grid](hud-mapa-siatka.webp)

![The world map's biome view](hud-mapa-biomy.webp)

### Keeping the map

With **Keep the map on disk** (the World map card, on by default) everything the map has seen – ground, biomes and caves – is still there the next time you join the same server or world. Maps live in `.minecraft/slashclient/maps`, apart for every world and dimension. They are written in the background every few minutes, when you leave the world and when the game closes. A file that cannot be read is put aside (`.bad`), never deleted.

The top shows the dimension, how many chunks are known and the scale. On the map are your waypoints, points from friends, the death point, players and mobs nearby, and friends sharing their position.

**Settings** (the **World map** card in World): the M key on or off, **Starting zoom**, **Keep the map on disk**, **Caves**, **Grid**, **Biomes**, **Trail walked**, **Trail length** and who to show. On the partner servers, inside a dungeon M opens the dungeon map instead.

## Waypoints

A waypoint is a saved place with a name and a colour. In the world it shows as a marker with its name and the distance in metres.

![Waypoints in the world: a marker with the name and distance](hud-waypointy-w-swiecie.webp)

**B** opens this world's list of waypoints.

![The waypoint list](hud-lista-waypointow.webp)

- **Add here** – a new point where you stand (an empty name gives "Point 1", "Point 2"…).
- By each point: show/hide, colour, delete, **share with friends** (with a SlashClient account).
- **Received** – points friends shared for other servers or worlds; accept or drop them.
- **Move…** – points saved under another server address or world name move here with one click.

Where points are kept:
- on a server – under its address (letter case and port 25565 make no difference, but `play.server.com` and `server.com` are two different places);
- in singleplayer – under the world's folder, so renaming a world keeps its points;
- on servers with modes (one address, many modes) points can be kept per mode – the **Keep waypoints apart by mode** switch is above the list, and an older point goes to the current mode with **This mode only**.

The **Waypoints** card in World switches the markers in the world on and off.

### Coordinates from the chat

Coordinates written in the chat (like `120 64 -340` or `x: 120 z: -340`) are underlined – a click opens a small window that saves them as a waypoint. More on [Chat](/wiki/hud-czat).

## Death point

When you die, a "Death" waypoint appears there by itself – you see how far your items are. There is one per world (or server) and dimension; the next death moves it. Delete it from the list (B) like any other. On the death screen **Set waypoint** also keeps a lasting point that the next death will not take.

**How to switch it on:** World → **Death waypoint** (on by default).

## Friends on the minimap

SlashClient friends who share their position with you show on the minimap and the world map as their face with their name – or an arrow on the edge when they are far. Only those on the same server and in the same dimension show.

- **Names under the faces**.
- **Share my position with friends** – the same as in the launcher's account settings. Off by default; your position only goes to friends on the same server and the SlashClient server does not keep it.
