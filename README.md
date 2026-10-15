# SlashClient

Launcher Minecraft: Java Edition w Electronie i TypeScripcie.

- dowolna wersja vanilla z oficjalnego manifestu Mojang (wydania, snapshoty, stare bety i alfy),
- profile z osobnym folderem gry, ilością RAM, rozdzielczością i argumentami JVM,
- automatyczne pobieranie Javy właściwej dla danej wersji (oficjalne środowiska Mojang),
- logowanie kontem Microsoft (device code) albo tryb offline (sam nick),
- zakładka **Serwery** z lista.slash3rss.dev: status na żywo (ping, gracze, MOTD) i dołączanie jednym kliknięciem,
- mod loadery **Fabric**, **Quilt**, **NeoForge** i **Forge** (Forge od 1.13; Quilt nie wspiera wersji 26.x),
- zakładka **Mody** z Modrinth: mody z zależnościami, paczki zasobów, shadery i modpacki (`.mrpack`),
- język interfejsu: polski albo angielski (Ustawienia → Język, zmiana bez restartu; słownik w `src/shared/i18n.ts`),
- ikony profili: 9 bloków w stylu Minecrafta albo własny obrazek; modpacki z Modrinth dostają swoją ikonę,
- wspólne ustawienia gry między profilami (options.txt, lista serwerów, zapisane paski) — przełącznik w profilu,
- panel postępu instalacji modów i modpacków z komunikatem o ukończeniu i przyciskiem „Graj teraz”,
- aktualizacje modów, paczek zasobów i shaderów (rozpoznawanie po SHA1, także plików dodanych ręcznie; wydania nie są
  „aktualizowane” do bet i alf) oraz aktualizacje modpacków z usuwaniem plików, których nowa wersja już nie ma,
- wybór konkretnej wersji przy instalacji i zmiana wersji zainstalowanego moda lub modpacka.

## Uruchomienie

```bash
npm install
npm start
```

Test bez interfejsu (instaluje i uruchamia grę na koncie offline):

```bash
npm run test:launch -- 1.21.4 MojNick
```

## Testy i wydania

```bash
npm test          # testy jednostkowe i integracyjne (node:test)
npm run dist:mac  # instalator lokalnie (także dist:win, dist:linux) → release/
```

GitHub Actions (`.github/workflows/`):

- **CI**: typecheck, testy i build na Linuksie, macOS i Windowsie przy każdym pushu i PR.
- **Release**: tag `v*` (np. `git tag v0.2.0 && git push --tags`) buduje `.dmg`, `.exe` i AppImage
  i publikuje je w GitHub Releases repozytorium `slash3rss/SlashClient` (pole `build.publish` w `package.json`).
  Zainstalowane launchery pobierają nową wersję same i pokazują pasek „Uruchom ponownie”.

Na macOS automatyczne aktualizacje i otwieranie bez ostrzeżeń Gatekeepera wymagają podpisu
(konto Apple Developer). Wtedy wystarczy dodać sekrety `MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`, `APPLE_ID`,
`APPLE_APP_SPECIFIC_PASSWORD` i `APPLE_TEAM_ID`. Bez nich instalator działa, ale trzeba go otworzyć
przez prawy klik → Otwórz, a aktualizacje na Macu trzeba instalować ręcznie.

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

## Status na Discordzie

Launcher pokazuje na Discordzie „Gra w SlashClient” z wersją gry, loaderem, czasem gry oraz tym, czy jesteś w menu,
w świecie czy na serwerze (aplikacja Discord `812524751053914112`). Można to wyłączyć w Ustawieniach.
Obrazek statusu to zasób `logo` w Rich Presence → Art Assets tej aplikacji.

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

- Wersje sprzed 1.19 na Macach z Apple Silicon działają przez Rosettę (Java x64).
