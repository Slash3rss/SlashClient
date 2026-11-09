<!-- dzial: hud | kolejnosc: 90 | ikona: fa-wand-magic-sparkles | opis: Zoom, crosshair, fullbright, block outline, dark windows, freelook, the F5 camera and other extras -->
# Extras: look and camera

The **Extras** category of the settings window (Right Shift → Settings → Extras) holds the features that are not modules on the screen. This page covers those about the look, the camera and controls. The inventory helpers are on [Inventory and crafting](/wiki/hud-ekwipunek), menus and screens on [Menus, server list and screens](/wiki/hud-ekrany).

![The Extras category's cards](hud-kategoria-extras.webp)

## Zoom

Hold **C** to zoom in like a spyglass. The mouse wheel changes how far while zoomed.

![Without zoom](hud-bez-przyblizenia.webp)

![With zoom (C)](hud-przyblizenie.webp)

| Setting | What it does |
|---|---|
| Zoom strength | 2× to 12× (4× by default) |
| Smooth zoom | the view zooms in smoothly |
| Toggle | press once to zoom in, again to zoom out |
| Smooth camera while zoomed | the camera glides while zoomed in |
| Remember the wheel's zoom | the strength set with the wheel stays for next time |

![The zoom settings](hud-opcje-zoom.webp)

## Crosshair

Your own crosshair instead of the game's. Switch it on with the **Crosshair** card; its page has a preview and a grid to draw on.

![The crosshair page: a drawing grid and ready shapes](hud-opcje-crosshair.webp)

- **Look** – plus, plus with a dot, T, dot, X, X with a dot, circle, circle with a dot, square, corners, arrow, or **Custom**.
- Click and drag on the grid on the left to draw or erase pixels – the result is saved as "Custom". **Clear** empties the grid.
- **Crosshair colour**, **Black outline**, **Size** and **Gap from the centre** (the last two shape the ready ones).

![Crosshair: circle with a dot](hud-celownik-circledot.webp)

![Crosshair: corners](hud-celownik-corners.webp)

![Crosshair: X with a dot](hud-celownik-xdot.webp)

With SlashClient's crosshair the **Attack indicator** module is drawn under it.

## Fullbright

Everything bright as day, in caves and at night too. The **Fullbright** card switches it on, and the "Fullbright on/off" key (unbound by default) toggles it in the game.

## Low fire

The flames on your screen while you burn sit lower and cover less.

## Block outline

The outline of the block you look at in your own **colour**, **opacity** (10–100%) and **thickness** (0.5×–5×).

## Low shield and Held items

- **Low shield** – the shield in first person sits lower (**How much lower** 5–50) and covers less.
- **Held items** – every held item smaller (**Size** 50–100%) and moved (**Sideways**, **Up / down**, **Forward / back**). Swinging, eating and blocking work as in the game.

## Hide own armour

Your armour disappears from your own character (in F5 and the inventory), piece by piece: helmet, chestplate, leggings, boots. The elytra has its own switch – hidden, your cape shows. Other players still see your armour.

## Dark game windows

The game's windows (inventory, chests, crafting, furnaces, trading, the creative inventory) and its buttons in dark grey instead of light. The mod recolours the textures of your own packs; the colours (flames, arrows, bubbles) stay. **Shade**: dark or very dark. Switching it reloads the game's resources for a moment.

![Dark game windows: a crafting table](hud-ciemne-okna.webp)

## Windows in their blocks' look

The block's part of a window looks like the block: the crafting table's wooden top, a chest's wood, a furnace's stone, an anvil's shape. The inventory under it is dark. Works at once, without reloading resources.

## Freelook

Hold **Left Alt** to turn the camera around your character, who keeps facing the same way. Off by default, as some servers forbid it – switch it on with the **Freelook (left Alt)** card.

## F5 camera distance

In third person hold **V** and scroll to move the camera further or closer (the wheel leaves the hotbar alone then).

- **Starting distance (blocks)**.
- **Only with the key held** – off: the wheel alone changes the distance in F5.
- **Back to it after leaving F5**.

## Look lock

The mouse stops turning your character – handy at farms with a held button. Set its key in the Keys window (none by default). **After coming back from another window (Alt+Tab)**: lock while holding buttons, always lock, or don't lock (key only). While the camera is locked a hint says how to unlock it.

## Mouse over VNC

For playing over a remote desktop (VNC, Raspberry Pi Connect): the camera turns after the cursor's position, and at the window's edge it keeps turning that way – faster the closer to the edge. **Turning at the window's edge**: slow, normal, fast. Minecraft 26.3 only.

## Toggle sprint and sneak

The **Toggle sprint** card is the same setting as in the game's controls: press once instead of holding. Its settings also have **Toggle sneak**.

## Holding buttons

Two keys (unbound by default) toggle holding the left or the right mouse button – for mining a cobblestone generator or eating, say.

- **Also with the inventory and the pause menu open**.
- **Right button places fast** – like a held keyboard key.

## Nick hider

Your name in the chat and above your head becomes "You", "Player", "Hidden" or "*****" – useful in recordings. Only you see the change.

## SlashClient sounds

The **SlashClient sounds** card has a **Volume of all sounds** slider that turns down all of the mod's sounds at once: chat mentions, the hit marker, a potion running out, the tool break warning and SkyUp reminders. Each of these modules also has its own **Volume** slider in its settings.

In 1.21.6 and newer, Minecraft's **Interface** sound slider affects these sounds too. Older versions don't have it, so there the mod's volume is set only with these sliders.

### Your own sounds

On the **SlashClient sounds** card, click **Open the sounds folder** and put **.ogg**, **.mp3** or **.wav** files there (up to 1 MB; at most 30 seconds play). Once you open the settings again, the files are in every list of sounds with a ♪, right after the first sound: chat mentions, the hit marker, a potion running out, the tool warning, notifications and SkyUp reminders. The volume sliders work on them. If a file is gone from the folder, the usual bell rings instead. Only you hear your own sounds.

Even simpler: under every sound choice there's a **Your own file** row with a **Pick a file…** button (for a chat tab – next to its sound). The mod copies the file you pick into the folder and sets it in that one place only, so every sound can have a different file.
