<!-- dzial: hud | kolejnosc: 30 | ikona: fa-circle-info | opis: FPS, ping, coordinates, clock, computer load, server, friends online, music and the other info modules -->
# Modules: info

The **Info** modules show the state of the game, your computer and the server. Switch them on in **Right Shift → Settings → Info** by clicking a card. Every module can be moved in the editor; the settings all modules share (size, background, when it shows) are on [HUD menu and editor](/wiki/hud-edytor).

![The Info category's cards](hud-kategoria-hud.webp)

## FPS

Frames per second.

![The FPS module](hud-fps.webp)

- **Colour by FPS** – green when smooth, then yellow, then red.
- **Green at** / **Red at** – where the colours change (60 and 20 FPS by default).

## FPS graph

The last moments' frames as a graph, with the current FPS and the "1% low" – how smooth the worst moments were.

![The FPS graph](hud-wykres-fps.webp)

- **Graph length (frames)** – 30 to 240 frames.
- **Lowest and highest FPS** – a "min … · max …" line under the graph.

## Ping and ping graph

**Ping** is the delay to the server in milliseconds, measured by SlashClient itself (not read from the player list, where many servers show 0). The **Ping graph** draws it over time with its average. Both only work on servers – singleplayer has no network.

- **Green at** / **Red at** – colour thresholds (60 and 250 ms by default).

## Server, Players online, Server TPS

- **Server** – the address of the server you are on.
- **Players online** – how many players are on the player list.
- **Server TPS** – how fast the server runs (20 is full speed) and how many packets come in and go out each second. Thresholds can be set (green from 19, red from 12 by default).

![Server, players online, ping and TPS](hud-serwer.webp)

These modules only show on servers.

## Network usage

How much data the game downloads (↓) and uploads (↑) each second. Servers only.

![Network usage and the ping graph](hud-siec.webp)

## Coordinates

Your X, Y, Z position and the way you are facing.

![Coordinates](hud-wspolrzedne.webp)

- **Decimal places** – 0 to 2.
- **Height (Y)** – show or hide Y.
- **Show the direction** and **Direction on the same line**.

## Speed

Speed in blocks per second, with 0 to 3 **Decimal places**.

![Speed](hud-predkosc.webp)

## Clock and Session time

The **Clock** shows your computer's time and **Session time** how long you have been playing.

![The clock with the date and the session time](hud-zegar.webp)

- Clock: **Seconds**, **12-hour format**, **Date**.
- Session time: **Counted from the game's start** – it does not reset when you change servers.

## Memory, Processor (CPU), Graphics card (GPU)

The game's RAM in use (percent and megabytes) and the load of the processor and the graphics card. Each has its own **Green at** / **Red at** thresholds.

![Memory, CPU and GPU](hud-komputer.webp)

## Friends online

Your SlashClient friends who are in the game now, and where they play. Works in a game started from the launcher, with your account signed in on the Friends tab.

![Friends online](hud-znajomi-online.webp)

- **Most friends** – how many to show (1–15).

## Inventory

Your backpack's 27 slots on the screen – see what you carry without opening the inventory.

![The Inventory module](hud-ekwipunek-modul.webp)

- **Hotbar** – adds the hotbar too.

## Sprint and sneak

A label while you sprint or sneak, with "(toggled)" when toggle sprint or toggle sneak is on. The World category has a similar **Sprint/sneak** module.

![Sprint and sneak](hud-sprint.webp)

## Now playing

The track playing on this computer: Spotify, a browser (YouTube, SoundCloud…) or another player – nothing to link. Music on your phone or a speaker does not show. Works in a game started from the SlashClient launcher.

![Now playing as a card with the cover](hud-teraz-gra.webp)

| Setting | What it does |
|---|---|
| Layout | a card or one line |
| Album cover, Cover size | the album picture and its size |
| Title, Artists, Album | which lines to show |
| Progress bar, Time (elapsed / total) | how far into the track |
| Accent | Spotify green or the module's colour |
| Show a paused track, Pause mark | what to do while paused |
| Hide when nothing plays | the module goes away without music |
| Largest width, Scroll long texts | long titles scroll instead of being cut |
| Where it plays from | a small source icon |
| Spotify only | ignores browsers and other players |

## Twitch chat and Kick chat

Your channel's Twitch or Kick chat on the game screen – handy for streamers on a single monitor. Their settings are in the **Chat** category, described on [Chat](/wiki/hud-czat#twitch-and-kick-chat).
