<!-- dzial: launcher | kolejnosc: 30 | ikona: fa-puzzle-piece | opis: Finding and installing mods, resource packs, shaders, modpacks and datapacks from Modrinth and CurseForge -->
# Mods and packs

The launcher downloads mods, resource packs, shaders, modpacks and datapacks from **Modrinth** and **CurseForge** and installs them into the profile you choose. The same browser is in two places:

- **Profiles → a profile → Mods and resources** – installs into that profile;
- the **Mods** tab in the menu – you pick the target profile at the top.

![Mods and resources in a profile](launcher-mody.webp)

## Searching

- Kind: **Mods**, **Resource packs**, **Shaders**, **Modpacks**, **Datapacks**.
- Source: **Modrinth** or **CurseForge**.
- **Browse** shows the most popular ones that fit the profile's version and loader; the search box finds them by name.
- When friends allow it, a **Popular among friends** strip sits above the list ("used by 3 friends").

Each result has buttons:

| Button | What it does |
|---|---|
| **Install** | downloads the newest fitting version together with its required dependencies |
| Details ("i" icon) | description, screenshot gallery, link to the project page |
| **Choose a version** | every version; "only versions that fit this profile" hides the rest |
| Texture preview (eye, resource packs only) | shows the pack's textures next to the game's before you install |

![Project details](launcher-szczegoly-projektu.webp)

> Shaders need the Iris mod. The launcher reminds you on the Shaders tab.

## The Mods tab

The **Mods** tab is the same browser without opening a profile. The profile tile at the top shows where downloads go; click it to choose another profile.

![The Mods tab with shaders](launcher-odkrywaj.webp)

## Installed

The **Installed** tab lists everything in the profile, with its own search box.

- **Check for updates** and **Update all** bring mods up to date.
- Select several items to get a bar with **Enable**, **Disable**, **Update** and **Delete**.
- A mod's details show what it **Requires** and what it is **Needed by**. Disabling a mod others depend on gives a warning with **Disable along with dependants**. Libraries nothing needs any more are offered for removal.
- The mod check finds missing dependencies and mods that clash; **Install missing** fetches what's missing.

## Performance mods

**Performance mods** opens a list of proven mods that speed up the game (such as Sodium and Lithium) for the profile's version. Tick the ones you want and click **Install selected**.

## Modpacks

A modpack installs as a new profile. **Import modpack** loads one from a file. The settings of a modpack profile show a box with its name and version and the buttons **Check for update** and **Change version…**. Before every update the launcher takes a profile snapshot, so going back is easy.

## Blocked CurseForge files

Some CurseForge authors don't let launchers download their files. The launcher then shows a **blocked mods** window with links to those files:

- **Open missing** opens their pages in the browser;
- you can drag downloaded files onto the window;
- the **Watched folders** tab lists folders (Downloads by default) where the launcher looks for downloaded files and copies them into the profile when you click **OK**.

## Datapacks

Datapacks install into a specific world, so the launcher asks which one. A world's datapacks are listed under **Worlds and screenshots** (see [Worlds, screenshots, clips and configs](/wiki/launcher-swiaty)).
