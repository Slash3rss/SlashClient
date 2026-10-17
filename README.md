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
- wybór konkretnej wersji przy instalacji i zmiana wersji zainstalowanego moda lub modpacka,
- zmiana skina (Steve/Alex, podgląd 3D) i peleryny dla kont Microsoft,
- czas gry w każdym profilu i kafelek „Wróć do gry” (ostatni serwer albo świat),
- rekomendacja RAM i zestawy flag JVM (G1, ZGC) dobierane do wersji Javy,
- kopiowanie profili i eksport do `.mrpack`,
- logi z wyszukiwarką, filtrem poziomów i udostępnianiem na stronie SlashClient (po zgodzie, z ukrytymi ścieżkami) i zgłaszaniem błędów,
- dołączanie do serwera z wyborem profilu: profile pasujące do wersji serwera są oznaczone, launcher pamięta wybór,
- mody wydajności jednym kliknięciem (Sodium, Lithium, FerriteCore i inne, dobrane do loadera i wersji),
- sprawdzanie modów przed startem: brakujące zależności (z instalacją z Modrinth), zły loader, zła wersja gry, konflikty, duplikaty,
- import instancji z Prism Launcher, MultiMC, CurseForge, Modrinth App i oficjalnego launchera,
- biblioteka skinów (presety ze skinem, modelem rąk i peleryną) i przełączanie kont w zakładce Konta,
- statystyki: czas gry według dni, profile, serwery, pory grania i seria dni,
- edytor skinów (piksele, warstwy, podgląd 3D) i zapis do biblioteki,
- znajomi, statusy aktywności i wiadomości (serwer w `server/`, konto SlashClient przez Discord, Microsoft, Google lub GitHub),
- **mod SlashClient** (mod Fabric w `hud/`, dawniej „SlashClient HUD”, Minecraft 26.3), instalowany przez launcher razem z Fabric API:
  FPS, ping, CPS, współrzędne, prędkość, zegar, serwer, gracze, pamięć, biom, pora dnia, światło, czas sesji, combo, zasięg,
  sprint/skradanie, nasycenie, licznik przedmiotów, cel, pancerz, efekty i klawisze. Do tego przybliżenie (C), fullbright,
  niski ogień, godzina w czacie, własny celownik i zakładki czatu wyłapujące wiadomości po tekście albo regexie.
  W grze Prawy Shift otwiera edycję. Ustawienia można udostępnić kodem (w grze albo w profilu w launcherze).

## Uruchomienie

```bash
npm install
npm start
```

Test bez interfejsu (instaluje i uruchamia grę na koncie offline):

```bash
npm run test:launch -- 1.21.4 MojNick
```

## Mod SlashClient

Jeden kod dla Minecrafta 1.21.11, 26.1.x, 26.2 i 26.3 (wymaga JDK 25):

```bash
cd hud
./build-all.sh                              # wszystkie wersje → build/bundle/slashclient-hud-<wersja>.jar
./gradlew build -Pmc=26.2                   # jedna wersja (versions/26.2.properties)
./gradlew runClientGameTest -Pmc=1.21.11    # gra z testem; zrzuty w build/run/clientGameTest/screenshots
```

Różnice między wersjami: `versions/<mc>.properties` (wersje, Java, zmiany nazw `rename.`/`replace.`) i gałęzie
`//#if MC >= 26.2` … `//#else` / `//$ kod` … `//#endif` w kodzie (preprocesor w `build.gradle`); większość siedzi w `Compat.java`.

`npm run build` dołącza zbudowane pliki do launchera (`dist/hud/`). HUD nie trafia do `mods/` gracza: launcher kopiuje
go do `hud/` w folderze danych i wstrzykuje przy starcie przez `-Dfabric.addMods`. Profile Fabric dostają go wprost, a profile
vanilla są uruchamiane przez ukryty Fabric Loader (jak w Feather), którego folder modów wskazuje pusty katalog.
Gdy profil nie ma własnego Fabric API, launcher pobiera je z Modrinth do `hud/fabric-api/<wersja>/` i wstrzykuje tak samo.
Znajomi i czat w grze idą przez lokalny most launchera (127.0.0.1, klucz na sesję), więc gra nie dostaje tokenu konta.
Test z linii poleceń: `npm run test:launch -- 26.3 MojNick --fabric`.

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

Launcher pokazuje na Discordzie „Gra w SlashClient”: przy otwartym launcherze „W launcherze”, a w grze wersję,
loader, czas gry oraz to, czy jesteś w menu, w świecie czy na serwerze (aplikacja Discord `812524751053914112`).
Status odnawia się co 30 s, więc pojawi się też, gdy Discord zostanie uruchomiony po launcherze. Można go wyłączyć w Ustawieniach.
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
