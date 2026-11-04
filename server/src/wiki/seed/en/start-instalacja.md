<!-- dzial: start | kolejnosc: 20 | ikona: fa-download | opis: How to download and install SlashClient on Windows, macOS and Linux, and how updates work -->
# Download and install

Get SlashClient from the home page, [slashclient.pl](https://slashclient.pl/en). The page detects your system and shows a **Download for …** button. Below it, the **Other systems:** line has the builds for the other systems.

![The download section of the home page](strona-pobierz.webp)

## Which build is mine

| System | File | Direct link |
|---|---|---|
| Windows 10 and 11 (64-bit) | installer `SlashClient-Setup-….exe` | [/download/windows](https://slashclient.pl/download/windows) |
| macOS on Apple Silicon (M1 and newer) | `….dmg` (arm64) | [/download/mac](https://slashclient.pl/download/mac) |
| macOS on an Intel processor | `….dmg` | [/download/mac-intel](https://slashclient.pl/download/mac-intel) |
| Linux (x64) | `….AppImage` | [/download/linux](https://slashclient.pl/download/linux) |
| Linux on ARM (e.g. Raspberry Pi 5) | `…-arm64.AppImage` | [/download/linux-arm](https://slashclient.pl/download/linux-arm) |

The links always lead to the latest release. On a phone the download button is switched off and says SlashClient runs on a computer – but there is a [phone app for chatting with friends](/wiki/strona-aplikacja).

## Windows

1. Download the installer and run it.
2. If Windows shows "Windows protected your PC", click **More info** and then **Run anyway**.
3. Pick an install folder (the default is fine) and click **Install**. The installer adds a desktop shortcut and a Start menu entry.

## macOS

1. Download the `.dmg` for your processor and open it.
2. Drag **SlashClient** into the **Applications** folder.
3. On the first start macOS may say it cannot check the app (SlashClient is not signed by Apple yet). Right-click the app, choose **Open** and confirm. You only need to do this once.

> Keep SlashClient in **Applications**. Started from anywhere else (straight from the `.dmg` or from Downloads), it cannot update itself, and the launcher offers to move it.

## Linux

1. Download the `.AppImage` file.
2. Make it executable (in the file's properties, or `chmod +x SlashClient-*.AppImage`) and run it.
3. The launcher offers to install itself: it moves to `~/Applications`, adds itself to the application menu with an icon, and keeps updating itself from there. The wizard can also add a desktop shortcut.

## Updates

The launcher checks for new versions by itself. On Windows and Linux the new version downloads in the background and installs on the next start. On a Mac it works the same way, as long as SlashClient is in Applications. See what changed in the [changelog](/wiki/strona-zmiany).

## Next

After the first start the [wizard](/wiki/start-pierwsze-uruchomienie) opens and gets everything ready to play in about a minute.
