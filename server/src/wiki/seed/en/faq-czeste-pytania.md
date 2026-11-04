<!-- dzial: faq | kolejnosc: 10 | ikona: fa-circle-question | opis: Fixes for common problems: the game will not start, Java, memory, antivirus, mods, files and reporting bugs -->
# FAQ

## The game will not start

When the game crashes or closes with an error, the launcher reads the log and tells you what went wrong – with a hint on how to fix it. The most common messages:

| Message | What to do |
|---|---|
| **The game ran out of memory** | Give it more memory in the profile's settings (see below), or use fewer mods and a lower render distance. |
| **The mod loader does not support this Java version** | Update the mod loader and the mods to versions for this game version. |
| **The mods are not compatible** | A mod is missing or versions clash – click **Install missing** or check your mods (see below). |
| **The same mod is installed twice** | Remove the older copy of the mod from the profile. |
| **Corrupted file** | Remove and reinstall the mods you added last; if that does not help, start the game again and the launcher checks the files. |
| **Incomplete game installation** | Start the game again – the launcher downloads the missing files. |
| **Graphics driver problem** | Update your graphics drivers. On a laptop with two graphics cards, set the dedicated card for Java. |
| **The game crashed in native code** | Update your drivers; with shaders or graphics mods (Sodium, Iris), try without them. |
| **The system closed the game** | Close other programs or lower the profile's RAM. |

Still stuck? [Share your log](/wiki/strona-logi) and [report the bug](/wiki/strona-zgloszenia) – the **Report a bug** button in the crash window does both at once.

## Java

You do not need to install Java – the launcher downloads the one the game version needs (see [Supported versions](/wiki/start-wersje)). If you set your own Java or your own path in the profile's settings and the game will not start, go back to the default (**Mojang (default)**).

## How much memory to give the game

Follow the launcher's hint under the **Memory (RAM)** slider in the profile's settings. Too little memory ends in a crash, too much in longer stutters and no memory left for the system. Details: [System requirements](/wiki/start-wymagania).

## An antivirus blocks the launcher or game files

- On the first start on Windows you may see "Windows protected your PC" – click **More info** → **Run anyway**.
- A message saying the launcher has no access to a file usually means another program holds it (often an antivirus). Close the game and such programs and try again.
- If your antivirus deletes game files, add the SlashClient data folder (see below) to its exceptions.
- On macOS, on the first start right-click the app → **Open**. See [Installation](/wiki/start-instalacja).

## Mods clash

The launcher checks the profile's mods before starting the game. If it sees a problem (a missing mod, a mod for another game version or another loader, the same mod twice, mods that do not work together), it asks whether to start anyway.

The details and fixes are in **Profiles** → **Mods and resources** → **Installed**: the launcher looks for missing mods on Modrinth and CurseForge by itself, and you can switch off or update the ones that do not fit. The launcher adds the SlashClient HUD mod by itself – do not put it in the mods folder.

## Where are my files

Everything the launcher downloads is in the SlashClient data folder:

| System | Folder |
|---|---|
| Windows | `%APPDATA%\SlashClient` |
| macOS | `~/Library/Application Support/SlashClient` |
| Linux | `~/.slashclient` |

Each profile (mods, worlds, screenshots, settings) has its own folder in `instances`. The easiest way to open it is the **Open folder** button in the profile's settings.

> Back up your worlds before deleting anything by hand.

## I do not see friends or cosmetics in the game

- Sign in in the launcher on the **Friends** tab ([SlashClient account](/wiki/start-konto)).
- Start the game from the launcher, on a version with [SlashClient HUD](/wiki/start-wersje).
- Other players' cosmetics may be switched off in the HUD menu → **Extras** → **Other players' cosmetics** – see [Who sees cosmetics](/wiki/kosmetyki-widocznosc).

## Can I get banned for using SlashClient?

The HUD only shows what the game already knows and gives no cheat-like advantage. Servers have their own rules, though: if a server forbids freelook, for example, turn it off in the HUD menu.

## How to report a bug

On the [bug reports page](/wiki/strona-zgloszenia): sign in, click **New report**, describe what happened and attach a [link to your log](/wiki/strona-logi).

## Where to get help

1. This wiki – start with [Welcome to SlashClient](/wiki/start-witaj).
2. [Bug reports on the website](https://slashclient.pl/bugs) – check whether someone had the same problem, or report a new one.
3. Ask your SlashClient friends in [chat](/wiki/spolecznosc-czat) or in a [community](/wiki/spolecznosc-spolecznosci).

## Documents

- [Terms of Service](https://slashclient.pl/terms)
- [Privacy Policy](https://slashclient.pl/privacy)
