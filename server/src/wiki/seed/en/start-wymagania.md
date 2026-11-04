<!-- dzial: start | kolejnosc: 50 | ikona: fa-microchip | opis: What computer SlashClient needs: systems, memory, Java and disk space -->
# System requirements

SlashClient runs wherever Minecraft itself runs, and the launcher picks settings that suit your computer.

## Systems

| System | Requirements |
|---|---|
| **Windows** | Windows 10 or 11, 64-bit |
| **macOS** | macOS 12 (Monterey) or newer; separate builds for Apple Silicon and Intel |
| **Linux** | 64-bit (x64) or ARM64, e.g. a Raspberry Pi 5; an AppImage file |

## Memory (RAM)

The launcher suggests how much memory to give the game: it leaves at least 4 GB for the system and never goes below 2 GB.

| Profile | What the launcher recommends for the game |
|---|---|
| Plain game (vanilla) | up to 4 GB |
| Fabric with a few mods | up to 6 GB |
| More than 60 mods | up to 8 GB |
| More than 150 mods | up to 10 GB |

So on a computer with 8 GB of RAM the game gets about 4 GB, and with 16 GB it gets what it needs. Change it in the profile's settings (**Memory (RAM)**), or for new profiles in **Settings** (**Memory for new profiles**).

> More memory is not always faster. Too much RAM can make stutters longer. Stick with the launcher's suggestion.

## Java

You do not need to install Java. The launcher downloads the version the chosen game version needs (Java 17 for 1.20.1, 21 for 1.21.x, 25 for 26.x). In the profile's settings you can pick another Java or your own path, and compare which one runs faster in the benchmark.

## Graphics card

Any card whose drivers support the OpenGL Minecraft needs will do. If the game crashes because of the drivers, the launcher says so after the game closes ("Graphics driver problem") – update your graphics drivers then.

## A slower computer

- Pick a **Mode for slower computers** in the [wizard](/wiki/start-pierwsze-uruchomienie) or in the profile's settings.
- Install performance mods (Sodium, Lithium…) – the wizard does it in one click.
- Turn on **Fewer animations** in the launcher's settings.
- Measure the difference with the [benchmark](/wiki/strona-benchmark).

## Disk space

The launcher with one game version usually takes about 1–2 GB, more with mods, resource packs and worlds. Game and profile files live in the SlashClient data folder – see [Where are my files](/wiki/faq-czeste-pytania).
