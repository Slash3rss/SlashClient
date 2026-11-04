<!-- dzial: launcher | kolejnosc: 130 | ikona: fa-gear | opis: Launcher settings: language, memory, Java, window, notifications, updates and the beta channel, downloads, disk cleanup and support -->
# Settings and updates

The **Settings** tab gathers the settings of the whole launcher. The cards sit side by side on a wide window and one under another on a narrow one.

![Launcher settings](launcher-ustawienia.webp)

## General settings

| Setting | What it does |
|---|---|
| **Language** | Polski or English; switches straight away |
| Memory for new profiles | how much memory new profiles start with (each can have its own) |
| Use the recommended amount | new profiles and modpacks get what we recommend for their mods and your computer (or what the modpack's authors recommend) |
| Java for profiles | Mojang (default), Eclipse Temurin, GraalVM Community or Azul Zulu; a profile can choose another, and when the chosen one isn't available for the game version, the game runs on Mojang's Java |
| Launcher window at start | a size from 1000 × 640 to 1920 × 1080, remember the last size and place, maximised or full screen |
| **Hide the launcher while playing** | the launcher goes away while you play and comes back when the game closes |
| **Show a session summary after the game closes** | the [Session summary](/wiki/launcher-statystyki) window |
| **Fewer animations (for slower computers)** | no transitions, a still background and still 3D figures |
| **Seasonal look (Halloween, 11 November)** | a Halloween look at the end of October and white and red for Poland's Independence Day |
| **Show on Discord what you are playing** | your Discord status: on which server, singleplayer or in the menu |
| **System notifications while the launcher is in the background** | messages, invites, achievements and finished downloads as system notifications |
| **Sound for system notifications** | a sound with those notifications |

**Run the setup wizard again** opens the first-run wizard: language, Minecraft account, import from other launchers, first profile, comfort and friends. Every step can be skipped.

![The first-run wizard](launcher-kreator.webp)

Below the settings is the data folder – where the launcher keeps profiles, game versions and settings.

## Updates

The launcher updates itself: it downloads a new version in the background, and a bar at the top of the window shows the progress and a restart button. If you're playing, the update installs when the game closes.

- **Check for updates** – checks right now; the launcher's version is shown next to it.
- **Update channel**: **Stable** or **Beta**. Beta gives you earlier versions with new features before the release – they may have bugs. Going back to stable waits for the next regular release. The channel choice appears when the SlashClient server offers betas.
- **Changelog** – notes for every release.
- **Go back to a previous version** – a list of recent releases; after going back, automatic updates wait for a release newer than the one you left (the **Automatic updates** switch lets you turn them on sooner).
- **Show "What's new" after updates** – a window with the news on the first start of a new version.

![The changelog](launcher-historia-zmian.webp)

## Downloads and graphics

- **Download speed limit** – **No limit** or 0.5 to 50 MB/s, for mods, modpacks, game files and Java.
- **Start the game on the dedicated graphics card** – for laptops with two graphics cards (Windows sets the "High performance" graphics preference for the launcher's Java, Linux uses PRIME).

## Disk cleanup

The **Disk cleanup** card shows how much space the launcher's data takes and what can be removed safely.

1. Choose how old logs and backups must be (**Logs and backups older than** 7, 30, 90 or 180 days).
2. Click **Check** – you'll see the space used by each kind and a list to remove: unused Java, game versions and libraries, old logs and backups, the cache and the folders of deleted profiles.
3. Tick what to remove and click **Move to trash**. Everything goes to the system trash, so it can be recovered.

![Disk cleanup](launcher-sprzatanie.webp)

> Cleanup isn't available while the game is running.

## Support the project

SlashClient is free. The **Support the project** card lets you support it voluntarily on the website – supporters get the Supporter rank, cosmetics and more cloud storage, with no in-game advantage.

- **Support the project** – opens the support page in your browser;
- **Payment history** – your payments with their status, a receipt and a refund request button;
- **Payments and refunds on the website** – details on the SlashClient website.

![The Support the project card](launcher-wsparcie.webp)

## Announcements and switched-off features

A SlashClient admin can show an announcement at the top of the launcher (with a **More** button) or switch some features off for a while (the shop, communities, the cloud and others). A switched-off feature then says it's switched off by the administrator for now.
