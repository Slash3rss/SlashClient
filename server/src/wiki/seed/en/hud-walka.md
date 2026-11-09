<!-- dzial: hud | kolejnosc: 40 | ikona: fa-shield-halved | opis: CPS, keystrokes, armour, effects, target, combo, hit marker, autoclicker and the other combat modules -->
# Modules: combat

The **Combat** category holds what helps in PvP and against mobs. Switch them on in **Right Shift → Settings → Combat**.

![The Combat category's cards](hud-kategoria-combat.webp)

## CPS and Attack indicator

**CPS** is clicks per second with the left and right mouse buttons. The **Attack indicator** shows whether your next hit will be a full one – it is drawn under the crosshair while you use SlashClient's crosshair (see [Extras](/wiki/hud-dodatki#crosshair)).

![CPS](hud-cps.webp)

## Keystrokes

WASD, the mouse buttons and the space bar on the screen – a pressed key lights up. Handy in recordings and streams.

![Keystrokes with W pressed](hud-klawisze.webp)

- **Pressed key colour**.
- **Mouse buttons**, **CPS under the buttons**, **Space bar** – each part on its own.

## Armour

Your armour and the item in your hand with their durability. The colour hints at how much is left.

![Armour](hud-pancerz.webp)

- **Durability** – a number, percent or a bar.
- **Horizontal** – one row instead of a column.
- **Item in hand** – adds your weapon or tool.

## Effects

Your active potion effects with the time left. It replaces the game's effect icons in the top right corner.

![Effects](hud-efekty.webp)

- **Effect icons** – an icon by each name.

## Item counter

How many of the important things you carry: arrows, ender pearls, totems, golden apples, bottles o' enchanting, fireworks and potions.

![Item counter](hud-licznik-przedmiotow.webp)

- Each group on its own.
- **Item in hand** – also counts what you hold (blocks while building, say).
- **Your own items** – item IDs separated by commas, e.g. `cobblestone, tnt, cobweb`.

## Durability in hand

The durability of the tool or weapon you hold.

![Durability in hand](hud-wytrzymalosc.webp)

- **Format** – "left / max" or percent.
- **Bar** under the number.
- **Blinks below** – from what percent the module blinks (0–50%).

## Ammo

While you hold a bow or a crossbow, how many arrows you have (plain, spectral and tipped). With an elytra on or a crossbow in hand it counts rockets too.

![Ammo](hud-amunicja.webp)

## Target

The name of the mob or player under your crosshair, with a health bar and the distance.

- **Health bar**, **Distance** – each on its own.

![Target: a mob under the crosshair](hud-cel.webp)

## Hit strength, Combo, Reach, Kills and deaths

- **Hit strength** – how strong your last hit was, in percent, and "Crit!" on a critical hit.
- **Combo** – hits in a row.
- **Reach** – from how far you hit.
- **Kills and deaths** – kills, deaths and K/D in this session.

![Hit strength, combo, reach and K/D](hud-cios.webp)

## Hit marker

A mark by the crosshair when you land a hit (works with the game's crosshair too). Switch it on in Combat: **Hit marker**.

![The hit marker after a hit](hud-trafienie.webp)

| Setting | What it does |
|---|---|
| Shape | X, bold X or plus |
| Colour, Size, How long | the look and how long it shows (100–1000 ms) |
| Own colour on a kill, Kill colour | another colour when the hit killed |
| Arrows and tridents too | a mark for hits from afar |
| Sound, Which sound, Volume | a ding, a click or an experience orb |

## Potion running out

Tells you when a potion you **drank** runs out – or a few seconds before. Only effects from a potion you drank count: not a beacon's, a golden apple's or the server's. If you later get the same effect from something else, it no longer counts. On by default (Combat → **Potion running out**).

![The banner at the top: the potion is running out](hud-mikstura-baner.webp)

![The toast in the corner: the potion has run out](hud-mikstura-powiadomienie.webp)

| Setting | What it does |
|---|---|
| Where | a toast in the corner, a banner at the top, above the hotbar or in the chat |
| Warn before the end | 0–30 seconds early (0 – only at the end) |
| Sound | none, pling, bell, amethyst, bottle, experience orb |
| Volume | 0–100% |

## Damage indicators

When a mob or player near you loses health, the amount rises above it for a second – yellow, orange for a hard hit, red for a big one. On by default. The **Size** slider makes the numbers up to 4 times bigger.

## Drop protection

Q does not throw away a valuable item in your hand (a tool, weapon or armour, anything enchanted or rare, a shulker box) at once. The screen says "Press again to drop", and a second press within a moment drops it. On by default.

## Hotbar slot lock

**K** locks the hotbar slot in your hand (in an inventory: the slot under the mouse). Nothing drops from a locked slot and nothing is taken out of it: Q, Ctrl+Q, the offhand swap, the number keys and inventory clicks are stopped. A locked slot has a padlock on the hotbar and in inventories. The creative inventory works as before.

## Tool break warning

When the tool in your hand is about to break, a warning appears with the uses left.

![The tool break warning](hud-ostrzezenie-narzedzie.webp)

- **Warn below** – at what percent of durability (1–30%).

## Autoclicker

Clicks the left and/or right mouse button for you.

> The autoclicker, auto tool and hand refill are fine in singleplayer, but many servers (anything with an anticheat) forbid them and may ban for them. The mod warns you the first time you switch one on. Check the server's rules.

| Setting | What it does |
|---|---|
| Mode | **Hold** – clicks while you hold the mouse button (mining works as usual); **Toggle** – the autoclicker key starts and stops the clicking |
| Left button, Left: clicks per second | 1–20 CPS |
| Right button, Right: clicks per second | 1–20 CPS |
| Left clicks at | anything or mobs only – never players |
| Full hits on mobs | waits for full attack strength |
| Don't left-click with a raised shield | |
| Clicking in chest windows | e.g. for selling on servers |
| Jumping, Jumps per second | in Toggle mode it can jump too |

Set the autoclicker's key in the **Keys** window (none by default).
