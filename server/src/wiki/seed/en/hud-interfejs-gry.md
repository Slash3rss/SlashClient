<!-- dzial: hud | kolejnosc: 70 | ikona: fa-table-columns | opis: Scoreboard, boss bar, player list, titles, chat, stacked hearts and the food preview -->
# Game HUD

The **Game HUD** category changes the parts of the screen the game draws itself: the scoreboard, the boss bar, the player list, the action bar, titles, notifications and the chat. Move each of them in the editor (Right Shift) like any module, scale it or hide it.

![Scoreboard, boss bar, a waypoint and stacked hearts in game](hud-interfejs-gry.webp)

![The Game HUD category's cards](hud-kategoria-game.webp)

## Scoreboard

The server's scoreboard on the side of the screen.

- **Size** – 0.5× to 1.5×.
- **Red numbers** – the scores on the right; off leaves just the names.

## Boss bar

The boss's health bar (or the server's messages) at the top. **Size** 0.5× to 1.5×.

## Player list (Tab)

| Setting | What it does |
|---|---|
| Size | 0.5×–1.5× |
| Ping in milliseconds | a number instead of bars |
| Hide the server's header / footer | hides the server's texts above and below the list |
| Most players on the list | 10–80 |
| Background behind players, List background | how see-through the backgrounds are |

## Action bar

The text above the hotbar. **Size** and **SlashClient messages' colour** – the colour the mod's own messages there use (like "Fullbright on"). On Minecraft 1.20.1–1.20.4 the action bar has no box in the editor.

## Titles

The big title and subtitle in the middle of the screen. **Size** 0.5× to 1.5×.

## Notifications (toasts)

The game's pop-ups (advancements, recipes) and SlashClient's. Move them to another corner in the editor. Which SlashClient notifications show is set on the **SlashClient notifications** card – see [Friends, emotes and notifications](/wiki/hud-spolecznosc).

## Chat

The game's chat has its own frame in the editor – put it anywhere. **Background opacity** and **Size** are the same settings as in the game's "Chat Settings", but the size can go above 1×. SlashClient's chat features are on [Chat](/wiki/hud-czat).

## Your name on F5

Shows your own name above your head in third person.

## Stacked hearts

However much health you have, always one row. The first 10 hearts are the usual red ones; every further 10 fill the row again in the next colour, and a small "×2", "×3" beside it says which row it is. Absorption hearts show as a golden "+4" on the left. On by default.

![Stacked hearts (×3, +4 absorption) and the food preview on the hunger bar](hud-serca-i-jedzenie.webp)

## Food: hunger, saturation and healing

While you hold food, the drumsticks it would add blink on the hunger bar, a golden outline shows the saturation, and blinking hearts show how much health you would get back. On by default.

| Setting | What it does |
|---|---|
| Food values in the item's tooltip | hunger and saturation in the tooltip |
| Saturation on the hunger bar always | not only with food in hand |
| Exhaustion bar on the drumsticks | singleplayer only (servers do not send it) |
| Hearts healed after eating | blinking hearts |
| Hunger, saturation and exhaustion on F3 | extra lines on the debug screen |
