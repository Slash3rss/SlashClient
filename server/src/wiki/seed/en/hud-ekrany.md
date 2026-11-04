<!-- dzial: hud | kolejnosc: 110 | ikona: fa-house | opis: SlashClient's main and pause menus, the server list, the loading screen, server resource packs and reconnecting -->
# Menus, server list and screens

SlashClient has its own main menu, pause menu, server list and loading screen in the launcher's look. Switch any of them off in **Right Shift → Settings → Extras** to get the game's own screen back.

## SlashClient main menu

The logo, a greeting ("Hi, …!"), big singleplayer and multiplayer buttons, the less used options as icons (their names show on hover) and your skin, which looks at the cursor. Beside them are your servers with a **Join** button. The menu also opens friends, cosmetics, account switching and the HUD settings.

![The SlashClient main menu](hud-menu-glowne.webp)

- **Switch to the Minecraft menu** – brings back the game's menu (which then has a **SlashClient menu** button to return).
- **Seasonal look** – festive touches, e.g. for Halloween and 11 November.

## SlashClient pause menu

The same look as the main menu: back to the game, friends, the HUD, options (on 26.3 the world options too) and leaving; advancements, statistics, waypoints and the game's pause menu as icons. Leaving works the game's way.

![The SlashClient pause menu](hud-menu-pauzy.webp)

## Server list

One panel with a search box on top and a card for every server: icon, name, the server's message in its colours, players with a small bar, the ping as coloured bars, another game version marked red. Partner servers have their picture and a gold badge, pinned ones a pin. LAN games are below.

![The SlashClient server list](hud-lista-serwerow.webp)

| Key | What it does |
|---|---|
| arrows | choose a server |
| Shift + arrows | move a server in the list |
| Enter | join |
| Delete | delete (after asking) |
| F5 | refresh |
| typing | search by name and address |

Adding, editing and joining go through the game's own screen, so everything behaves as in the usual list.

### Friends next to servers in the list

Next to a server you see the faces of your SlashClient friends playing on it right now. Friends who hide where they play, or are invisible, do not show.

## Loading screen

While joining a server, downloading its resource pack, loading terrain and entering a world, you see SlashClient's background, a card with the server's or world's icon and name, the step with a progress bar, and **Cancel** where the game has one.

- **Tips at the bottom of the screen** – random hints about SlashClient's keys and features.

## Server resource packs

For every server in the list choose in its edit screen what to do with its resource pack. The **Server resource packs** card sets the same for servers not in the list (direct connect, LAN).

| Mode | What it does |
|---|---|
| Ask | the game asks, as always |
| Accept automatically | the pack downloads and loads without asking |
| Decline | the pack is refused; a server that requires it may kick you |
| Ignore | nothing is downloaded, but the server hears the pack loaded – your own textures stay |
| For good | the pack is saved in your resource packs and kept on; later joins download nothing again, and a newer version from the server updates it by itself |

The game's question about a pack also gets a **Set for good** box.

## "Reconnect" button

When a server drops you, the disconnected screen has a **Reconnect** button – straight back to the same server.

## Renew the session automatically

The Microsoft session the game gets at launch expires after about a day – then servers answer "Invalid session". SlashClient asks the launcher for a fresh session for the same account before the old one runs out, and checks it again right before joining a server. If a server still refuses the session, it is renewed at once and the screen tells you to connect again.
