# SlashClient

Launcher Minecraft: Java Edition w Electronie i TypeScripcie.

- dowolna wersja vanilla z oficjalnego manifestu Mojang (wydania, snapshoty, stare bety i alfy),
- profile z osobnym folderem gry, ilością RAM, rozdzielczością i argumentami JVM,
- automatyczne pobieranie Javy właściwej dla danej wersji (oficjalne środowiska Mojang),
- logowanie kontem Microsoft (device code) albo tryb offline (sam nick),
- zakładka **Serwery** z lista.slash3rss.dev: status na żywo (ping, gracze, MOTD) i dołączanie jednym kliknięciem,
- mod loadery **Fabric** i **Quilt** (Quilt nie wspiera wersji 26.x),
- zakładka **Mody** z Modrinth: mody z zależnościami, paczki zasobów, shadery i modpacki (`.mrpack`).

## Uruchomienie

```bash
npm install
npm start
```

Test bez interfejsu (instaluje i uruchamia grę na koncie offline):

```bash
npm run test:launch -- 1.21.4 MojNick
```

## Dane

Wszystko trafia do jednego folderu (można go zmienić zmienną `SLASHCLIENT_HOME`):

| System  | Folder                                         |
|---------|------------------------------------------------|
| macOS   | `~/Library/Application Support/SlashClient`    |
| Windows | `%APPDATA%\SlashClient`                        |
| Linux   | `~/.slashclient`                               |

`versions/`, `libraries/`, `assets/` i `runtimes/` (Java) są wspólne dla wszystkich profili.
Każdy profil ma własny folder gry w `instances/<id>/` (światy, mody, ustawienia), chyba że wskażesz inny.
Konfiguracja i konta są w `config/launcher.json`. Tokeny Microsoft są szyfrowane pękiem kluczy systemu.

## Logowanie kontem Microsoft

Launcher potrzebuje własnej aplikacji w Azure:

1. Wejdź na <https://portal.azure.com> → **App registrations** → **New registration**.
2. Typ kont: **Personal Microsoft accounts only**. Adres przekierowania możesz pominąć.
3. W **Authentication** włącz **Allow public client flows** (wymagane dla logowania kodem).
4. Skopiuj **Application (client) ID** i wklej go w launcherze w **Ustawieniach**
   (albo ustaw zmienną `SLASHCLIENT_MS_CLIENT_ID`).
5. Nowe aplikacje muszą zostać zatwierdzone przez Mojang, zanim dostaną dostęp do API Minecrafta.
   Wniosek: <https://aka.ms/mce-reviewappid>. Do czasu akceptacji logowanie kończy się błędem
   na etapie `login_with_xbox` (HTTP 403).

## Struktura

| Plik | Rola |
|------|------|
| `src/main/versions.ts` | manifest wersji, pliki JSON wersji, `inheritsFrom` |
| `src/main/install.ts`  | klient, biblioteki, natywne pliki, assety |
| `src/main/java.ts`     | automatyczna instalacja Javy |
| `src/main/auth.ts`     | Microsoft → Xbox Live → XSTS → Minecraft oraz konta offline |
| `src/main/launch.ts`   | budowanie argumentów i uruchamianie gry |
| `src/main/main.ts`     | proces główny Electrona i IPC |
| `src/renderer/`        | interfejs |

## Ograniczenia

- Brak Forge i NeoForge.
- Wersje sprzed 1.19 na Macach z Apple Silicon działają przez Rosettę (Java x64).
