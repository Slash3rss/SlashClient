<!-- dzial: launcher | kolejnosc: 20 | ikona: fa-layer-group | opis: Creating profiles, versions and loaders, memory, Java, the mode for slower computers, benchmark, snapshots, cloud and sharing -->
# Profiles

A profile is a separate Minecraft install: game version, mod loader, mods, settings and worlds. Every profile has its own folder, so the mods of one never mix with another. It all lives in the **Profiles** tab.

![Profile settings](launcher-profile.webp)

On the left is the list of profiles (icon, version, loader, play time) and the **Statistics** button. On the right are the chosen profile's tabs:

- **Settings** – everything on this page;
- **Mods and resources** – see [Mods and packs](/wiki/launcher-mody);
- **Worlds and screenshots** and **Configs** – see [Worlds, screenshots, clips and configs](/wiki/launcher-swiaty);
- **Statistics** – see [Statistics and session summary](/wiki/launcher-statystyki).

## New profile

**New profile** opens a short three-step wizard: **Play**, **Performance**, **Name**.

1. Pick a Minecraft version (tick **All versions** to see older ones and snapshots) and a kind of game: **Fabric + SlashClient HUD** (recommended), **Plain game (vanilla)** or **Another mod loader** (Quilt, NeoForge, Forge).
2. Set the memory, performance mods and the **Mode for slower computers**.
3. Give it a name and click **Create profile**.

**Empty profile** skips the wizard and creates a profile with default settings.

![The new profile wizard](launcher-nowy-profil.webp)

## Profile settings

| Setting | What it does |
|---|---|
| **Name** | the name on the list and on the Play screen |
| **Account** | the account this profile always plays with (or the one picked on the Play tab) |
| **Version** | the game version; **Snapshots** and **Old** add more versions to the list |
| **Mod loader** and **Loader version** | none (vanilla), Fabric, Quilt, NeoForge or Forge; by default the newest stable loader |
| **Icon** | one of the blocks or a **Custom image…** |
| **SlashClient mod** | turns on SlashClient HUD in the game (Fabric profiles on supported versions) |
| Copy / paste HUD code | moves a HUD layout between profiles or to a friend |
| **Share game settings with other profiles** | graphics, sound, controls and the server list shared by every profile with this option |
| **Memory (RAM)** | how much memory the game gets; **Use recommended** picks an amount for your mods and computer |
| Window width / height | the game window's size |
| **Game folder** | empty = the profile's own folder |
| **Performance (JVM flags)** | optimised G1 (recommended), ZGC (Java 21+, lots of RAM) or Minecraft's defaults |
| **Extra JVM arguments** | your own Java arguments |
| **Java** | **As in Settings**, Mojang, Eclipse Temurin, GraalVM Community, Azul Zulu or **Own Java path** |

With another Java chosen, **Compare in the benchmark** runs the test scene on both Javas and shows the difference in FPS.

At the bottom are **Open folder**, **Mods folder**, **Duplicate profile**, **Export profile**, **Share by code**, **Delete** and **Save**.

> When deleting a profile you can also move its game folder to the trash. Files go to the system trash, so they can be recovered.

### Mode for slower computers

Ready-made settings for weaker hardware: **Off**, **Light – a slower laptop**, **Very light – an old computer** and **Raspberry Pi**. The launcher suggests a mode for your computer. Each part of a mode can be switched off on its own:

- **Lighter graphics** – view distance, particles, clouds and an FPS limit (your settings come back when you turn it off);
- **Less memory for the game** – more is left for the system;
- **Performance mods** – Sodium, Lithium and others, installed when you save;
- **Saving mode in the game** – no other players' cosmetics, effects or menu animations;
- for Raspberry Pi also **The Raspberry Pi's graphics fix** and a **30 FPS limit**.

The **Raspberry Pi – good to know** link opens tips for the Pi (graphics, FPS, Java for ARM, cooling).

## Benchmark (Performance)

The **Performance** card measures how fast the game runs with this profile. The **SlashClient test scene** is always the same camera flight (forest, village, water, mobs, night, about a minute and a half), so results compare across settings, mods and computers. You can also measure in your own world (the camera turns in place for about 30 seconds).

- Benchmark window: **Windowed**, **Full screen** or **Borderless window**.
- The result is the average FPS, the 1% low and stutters, with **What to improve** tips.
- You can copy the result or share it as a link with your computer's specs.

![The Performance card with the benchmark](launcher-benchmark.webp)

## Profile snapshots

**Profile snapshots** are copies of the mods and config folders with the modpack's settings. **Take a snapshot** makes one by hand; the launcher makes one by itself before every modpack update and keeps the last 5. **Restore** brings a snapshot back.

## Key conflicts

The **Key conflicts** card lists keys that have two actions in the game at once and suggests free keys. **Fix conflicts** sets them in one click.

## Profile on your account (cloud)

The **Profile on your account** card saves the mods, settings, configs and HUD layout to your SlashClient account, so the same profile works on a second computer. Worlds are not uploaded, and only you can see the profile.

- **Sync with account** – the profile is uploaded by itself after every game;
- **Sync now**, **Upload to account**, **Download from account** – by hand;
- when both computers changed something, the launcher asks which version to keep.

Needs a SlashClient sign-in (the [Friends](/wiki/launcher-znajomi) tab).

![Profile on your account](launcher-profil-na-koncie.webp)

## Move to another Minecraft version

Pick a **Target version** and click **Check mods**. The launcher checks on Modrinth which mods have a version for that Minecraft, shows the list and, after **Move profile**, moves it (taking a snapshot first). Mods that aren't ready yet are switched off and stay on the list; **Check again** looks for them later.

![Moving a profile to another version](launcher-przenies-wersje.webp)

## Sharing, export and import

### Share by code

**Share by code** uploads the profile to the SlashClient server for 30 days and gives you a short code. A friend types it into **Import profile** and gets the same profile. Mods from Modrinth and CurseForge are stored as links. You choose what to send (mod configs, profile settings and more), and files that look like passwords or tokens are flagged so you can leave them out. Accounts and sign-ins never go into the package. **My shared profiles** lists your codes.

![Sharing a profile by code](launcher-udostepnij-kodem.webp)

### Export profile

**Export profile** saves a single **.mrpack** file that SlashClient and other launchers can open. Mods from Modrinth and CurseForge are links inside, so the file is small.

### Import profile

**Import profile** takes a .mrpack file, a CurseForge .zip, a code from a friend, or a profile saved **From your SlashClient account**.

![Importing a profile](launcher-importuj-profil.webp)

### Import from another launcher

**Import from another launcher** finds profiles from Prism Launcher, MultiMC, CurseForge, Modrinth App and the official launcher. Files are copied; the originals stay as they are. **Other folder…** lets you point at a folder yourself.

### Recover profiles

If there are profile folders on disk that are missing from the list, a **Recover profiles** button appears. Tick the ones to bring back; the rest stay on disk untouched.
