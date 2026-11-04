<!-- dzial: launcher | kolejnosc: 10 | ikona: fa-play | opis: The launcher's start screen: profile and account picker, back to the game, news, console and crash help -->
# Play

The **Play** tab is the launcher's first screen. This is where you pick a profile and account, start the game, read the news and watch the console.

![The Play tab with Minecraft news](launcher-graj.webp)

## Starting the game

The bar at the bottom has three parts:

- **Profile** – which profile (game version, mods, settings) to start;
- **Account** – which Minecraft account to play with; a profile can also have its own fixed account (see [Profiles](/wiki/launcher-profile));
- **PLAY** – downloads whatever is missing (game, loader, Java, mods) and starts Minecraft.

Above the bar you see the chosen profile's name, icon, version, memory and total play time. Download and install progress shows up as task cards in the top-right corner; once installed, there's a **Play now** button.

> If the game is already running, the launcher won't start it a second time. Joining a server from the [Servers](/wiki/launcher-serwery) tab connects the running game instead.

## Back to the game

The **Back to the game** card shows the server or world you played last, with its icon and when ("Last played 3 hours ago"). Its **Play** button starts the profile and joins that server or opens that world right away.

## Minecraft news

**Minecraft news** shows Mojang's articles about releases and snapshots (English only). The **All / Releases / Snapshots** filter narrows the list, and clicking a card opens the full article.

## Launcher news

**Launcher news** lists SlashClient releases. A dot next to the tab name means a release you haven't seen yet.

- Your release is marked **Your version**; a newer one is marked **New** and has an **Update** button.
- **Show changes** expands the release notes, **Show older** loads older releases.
- **Changelog** opens the full history of every version.

![Launcher news](launcher-nowosci-launchera.webp)

## Console

The **Console** tab shows the game log live (a green dot next to the tab means the game is running). The launcher keeps the logs of each profile's last 10 sessions, so you can look at an earlier session after the game has closed.

| Control | What it does |
|---|---|
| Session list | pick a game session (date and time) |
| **Search the log…** | filters lines by text |
| **All / Warnings / Errors** | shows only those levels |
| Copy | copies the log to the clipboard |
| **Share** | uploads the log to the SlashClient server and copies a link (kept for 90 days; paths with your user name and tokens are hidden) |

![The console with a saved game log](launcher-konsola.webp)

## Crash help

When the game closes with an error, the Play screen shows a crash card with the cause and **What to do**. The launcher recognises, among others:

- not enough memory;
- a loader too old for the Java version;
- mods that don't work together, or missing dependencies;
- the same mod installed twice;
- a mod that doesn't work with this game version;
- a damaged .jar file or an incomplete install;
- a graphics driver (OpenGL) problem;
- the system closing the game.

The card's buttons are **Install missing** (when dependencies are missing – it looks for them on Modrinth and CurseForge), **Show crash report**, **Copy log** and **Report a bug**. A short session summary sits under the card.

## Session summary

After you close the game, the launcher shows a **Session summary**: how long you played, where, and the highlights of the session. More in [Statistics and session summary](/wiki/launcher-statystyki).
