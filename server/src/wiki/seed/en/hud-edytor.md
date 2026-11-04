<!-- dzial: hud | kolejnosc: 20 | ikona: fa-sliders | opis: The layout editor, the settings window, the HUD look, ready layouts, share codes and layouts for servers -->
# HUD menu and editor

Everything in the mod is set up in one place: the HUD editor. It has two parts – the **layout editor**, where you move modules around the screen, and the **settings window** with a card for every module and extra.

## Layout editor

**Right Shift** in a world opens the editor. Every module that is on has a frame; modules with nothing to show right now (Ping in singleplayer, say) show sample content so you can still place them.

![The layout editor with modules and the game's HUD parts](hud-edytor-ukladu.webp)

- **Drag** a module to move it. It snaps to the screen edges, the centre and other modules' lines; dropped next to another module it lines up with it, leaving a small gap.
- The **arrow keys** (or WASD) move the module you last grabbed by one pixel, ten with **Shift**.
- **Right-click** a module for its settings. The gear next to it does the same, and the **×** in its corner hides it (it comes back from its card in the settings).
- Where modules lie on top of each other, a second click on the same spot or **Alt+click** takes the one underneath.
- The game's own HUD parts (chat, scoreboard, boss bar, player list, titles, notifications, action bar) have frames too and move the same way – see [Game HUD](/wiki/hud-interfejs-gry).
- **Ctrl+Z** undoes, **Ctrl+Y** (or Ctrl+Shift+Z) redoes; Cmd on a Mac. The same buttons are at the top of the settings window.

The **Settings** button in the middle of the screen opens the settings window.

## Settings window

![The settings window: categories on the left, module cards and the search box](hud-ustawienia.webp)

- Categories on the left: **All**, **Info**, **Combat**, **World**, **Game HUD**, **Extras**, **SkyUp**, **Chat**, **Share**. The SkyUp.pl cards are only in their own category, not under "All". **Edit layout** at the bottom takes you back to moving modules.
- The **search box** finds names in English and Polish, with or without Polish letters ("clock", "zegar" and "zrodlo" all work).
- **Clicking a card** switches the module on or off. The gear on a card opens its settings. Cards that only open something (Keys, XP calculator) open it with a click.
- The **star** in a card's corner makes it a favourite – favourites always come first.

### Every module's settings

A module's own options come first, then the look and visibility settings every module has:

![The Coordinates module's settings](hud-opcje-coords.webp)

| Setting | What it does |
|---|---|
| Size | the module's scale, 0.5× to 2× |
| Background, Background opacity | the box behind the module and how see-through it is |
| Outline | a frame around the module |
| Own corner rounding | corners other than the HUD-wide ones |
| Own text colour, Shadow | text colour and shadow for this module only |
| Show | always, only in singleplayer, only on servers, or only on one server (type part of its address, e.g. `skyup.pl`) |
| Hide while the chat is open | the module goes away while you type |
| Hide in the inventory and other windows | the module goes away in the inventory, chests and so on |

Modules that are a picture (the minimap) have no background options, and modules that colour their own text (armour) have no text colour.

## HUD look

The **HUD look** card in Extras changes every module at once.

![The HUD look settings](hud-opcje-appearance.webp)

- **SlashClient windows' accent** – the colour of buttons and highlights in the mod's windows; one of the presets or your own as `#RRGGBB`.
- **Text colour**, **Shadow** – the defaults for modules.
- **Background behind modules**, **Background colour**, **Outline colour**.
- **Modules' corner rounding** – from square to very round.

## Share: codes, ready layouts and layouts for servers

The **Share** category holds everything about the layout as a whole.

![The Share page: codes, ready layouts and layouts for servers](hud-kategoria-share.webp)

### Settings code

- **Copy code** puts a code with your modules, their places, the extras and the chat tabs on the clipboard. Paste it to a friend in a chat or on Discord.
- **Paste code** loads the settings from a code on your clipboard.
- **Defaults** brings back the factory settings.

### Ready layouts

One click switches on a set of modules. Only the modules change, and your own layout comes back with **Back to my layout** or Ctrl+Z.

| Layout | What it switches on |
|---|---|
| Minimal | FPS, coordinates, effects |
| PvP | CPS, keystrokes, target, armour |
| Survival & building | minimap, compass, biome |
| Partner servers | dungeon map, loot, tasks |
| Streamer | keystrokes, music, time, chat |

Save your own by typing a name and clicking **Save current** – up to 12 of them. The × on a saved layout's card deletes it (click twice).

### Layouts for servers

While on a server you can save a layout just for it. It comes on by itself when you join that server, and your usual layout returns in singleplayer and on other servers. A server's layout is only the HUD's look: module places and settings, the game's HUD parts, the colours and the chat's size. The extras and the chat tabs stay the same everywhere.
