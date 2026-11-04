<!-- dzial: hud | kolejnosc: 100 | ikona: fa-box-open | opis: Sorting, search, slot lock, shulker preview, enchantment colours, mouse tweaks and one-click crafting -->
# Inventory and crafting

Helpers for the inventory, chests and crafting. They are all in **Right Shift → Settings → Extras** (the slot lock is in Combat). They work with the game's ordinary clicks, the ones a player's hand makes, so the server sees nothing unusual.

![The inventory with the search box, enchantment colours and a locked slot](hud-ekwipunek-zaklecia.webp)

## Chest and inventory sorting

**R** over an open chest, barrel, shulker box or ender chest sorts it, and in your inventory it sorts the backpack. The small button in the window's corner does the same. The order: tools and armour, blocks, food, the rest; then name and count. Half-full stacks of the same item are put together first.

| Setting | What it does |
|---|---|
| Gap between clicks | 0–250 ms, for servers that kick for fast clicking |
| Sort the hotbar too | the hotbar stays by default |
| Sort button in the window | the small corner button |
| "Put all" and "take all" arrows in chests | move everything with one click |
| Put from the hotbar too | "put all" takes from the hotbar as well |
| Off on servers | a list of addresses; `hypixel.net` by default, whose rules forbid sorting |

Closing the window stops sorting. The creative inventory is not sorted.

## Search in inventories

Inventories and chests get a **Search…** box. Matching slots are framed and the rest dimmed. It searches names, enchantments, lore, item IDs and, for a shulker box, what is inside. The box only takes keys once clicked; Enter leaves it, Esc closes the window.

## Hotbar slot lock

**K** locks the slot in your hand, or in an inventory the hotbar slot under the mouse. Nothing drops from a locked slot and nothing is taken out: Q, Ctrl+Q, the offhand swap, number keys, Shift-click and picking up are stopped. A locked slot has a padlock.

## Shulker box preview

A shulker box's tooltip shows its 27 slots as a grid of items with their counts, on a panel in the box's colour.

![A shulker box's contents in its tooltip](hud-ekwipunek-shulker.webp)

## Enchantment level colours

Enchantment levels in a tooltip get colours: grey below half the highest level, teal from half, gold at the highest, pink above it (from a server). Curses stay red.

## Mouse tweaks

- **Shift + drag** with the left button over slots moves each one, as a Shift-click would.
- The **mouse wheel** over a slot moves one item: down sends one to the other side (the chest, or between the hotbar and the backpack), up brings one of the same back.

## Shift-craft only what fits

Shift-clicking a crafting result crafts only as much as fits in your inventory, with room left for what stays on the grid. Closing the table then gives the leftovers back instead of dropping them. When there is no room, a message says so.

## One-click crafting

Clicking a recipe in the recipe book crafts it at once and puts the result in your inventory; with **Shift** a whole stack. In a stonecutter picking a variant cuts one, with Shift the whole input. Off by default.

- **Alt** (and **Ctrl** if set) held while clicking only lays out the ingredients, as usual.
- The **drop key** held while clicking throws the result on the ground.
- Keys (none by default): **Repeat the last recipe** (crafts over and over while held) and **Turn off for a moment**.

## Drop protection

Q does not throw a valuable item away at once – see [Combat](/wiki/hud-walka#drop-protection).
