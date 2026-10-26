# SlashClient

Launcher Minecraft: Java Edition w Electronie i TypeScripcie, z własnym modem (HUD) i serwerem społecznościowym.
Strona: <https://client.slash3rss.dev>. Poradniki dla graczy: [wiki](https://github.com/Slash3rss/SlashClient/wiki).

**Launcher**

- dowolna wersja vanilla z oficjalnego manifestu Mojang (wydania, snapshoty, stare bety i alfy),
- profile z osobnym folderem gry, ilością RAM, rozdzielczością i argumentami JVM; zalecana pamięć dla modpacków
  (według liczby modów i zaleceń autorów z CurseForge) i domyślny RAM dla nowych profili w Ustawieniach
  („Ustawiaj zalecaną ilość”),
- automatyczne pobieranie Javy właściwej dla danej wersji: od Mojang albo do wyboru Eclipse Temurin, GraalVM Community
  i Azul Zulu (z porównaniem w benchmarku),
- logowanie kontem Microsoft (device code, wbudowana aplikacja zatwierdzona przez Mojang) albo tryb offline (sam nick),
- kilka gier naraz (każdy profil raz) i konto Minecraft przypisane do profilu; gra nie zamyka się razem z launcherem,
- kreator pierwszego uruchomienia (język, konto, import, pierwszy profil),
- zakładka **Serwery** z lista.slash3rss.dev: status na żywo (ping, gracze, MOTD), strona serwera (wykres graczy, opinie),
  głosowanie jednym kliknięciem i dołączanie z wyborem profilu,
- mod loadery **Fabric**, **Quilt**, **NeoForge** i **Forge** (Forge od 1.13; Quilt nie wspiera wersji 26.x),
- zakładka **Odkrywaj** z **Modrinth** i **CurseForge**: mody z zależnościami, paczki zasobów (z podglądem tekstur),
  shadery, datapacki (do wybranego świata) i modpacki (`.mrpack`, `.zip`), szczegóły moda z galerią;
  zablokowane pliki z CurseForge jak w Prism Launcher (linki, obserwowane foldery),
- zainstalowane: wyszukiwarka, zaznaczanie wielu naraz, zależności („komu jest potrzebny”), sprzątanie bibliotek
  po usunięciu moda z „Cofnij”,
- aktualizacje modów, paczek zasobów i shaderów (rozpoznawanie po SHA1, także plików dodanych ręcznie; wydania nie są
  „aktualizowane” do bet i alf) oraz aktualizacje modpacków z usuwaniem plików, których nowa wersja już nie ma,
- wybór konkretnej wersji przy instalacji i zmiana wersji zainstalowanego moda lub modpacka,
- **migawki profilu** (same przed aktualizacją modpacka i przeniesieniem, ręcznie, ostatnie 5), przeniesienie profilu
  na inną wersję Minecrafta (sprawdzenie modów na Modrinth), **edytor configów** (JSON, JSON5, TOML),
  karta konfliktów klawiszy,
- eksport i import profilu `.mrpack` z wyborem zawartości, **udostępnianie profilu kodem** (`ABCD-EFGH`, 30 dni)
  i **profil na koncie** (synchronizacja modów, ustawień i układu HUD między komputerami),
- język interfejsu: polski albo angielski (Ustawienia → Język, zmiana bez restartu; słownik w `src/shared/i18n.ts`),
- ikony profili: 9 bloków w stylu Minecrafta, własny obrazek albo logo modpacka; biblioteka „Twoje ikony”,
- wspólne ustawienia gry między profilami (options.txt, lista serwerów, zapisane paski; klawisze modów się nie gubią),
- panel postępu instalacji modów i modpacków z komunikatem o ukończeniu i przyciskiem „Graj teraz”,
- zmiana skina (Steve/Alex, podgląd 3D) i peleryny dla kont Microsoft, biblioteka i edytor skinów,
- czas gry w każdym profilu, kafelek „Wróć do gry” (ostatni serwer z ikonką albo świat) i podsumowanie sesji
  po zamknięciu gry,
- ekran **Graj** z zakładkami **Nowości z Minecrafta**, **Nowości w launcherze** (wydania SlashClient z notkami,
  „Twoja wersja”, „Aktualizuj”, kropka przy niewidzianym wydaniu) i **Konsola**; po crashu zostaje konsola
  z wyjaśnieniem błędu,
- „Co nowego w SlashClient X” po aktualizacji, **Historia zmian** w Ustawieniach (też na stronie: `/zmiany`,
  `/changelog`) i **Wróć do poprzedniej wersji** (kilka ostatnich wydań od 0.9.36, z kopią ustawień i wstrzymaniem
  automatycznych aktualizacji do nowszego wydania),
- historia konsoli: logi ostatnich 10 sesji każdego profilu (sesje z crashem oznaczone),
- rekomendacja RAM i zestawy flag JVM (G1, ZGC) dobierane do wersji Javy,
- logi z wyszukiwarką, filtrem poziomów i udostępnianiem na stronie SlashClient (po zgodzie, z ukrytymi ścieżkami,
  link `/logi/<id>`) oraz przyciskiem **Zgłoś błąd**, który otwiera zgłoszenie na stronie,
- mody wydajności jednym kliknięciem (Sodium, Lithium, FerriteCore i inne, dobrane do loadera i wersji),
- benchmark FPS (karta **Wydajność** w profilu): scena testowa SlashClient (7 scen, wynik każdej osobno) albo własny
  świat, w oknie lub na pełnym ekranie, z poradami i instalacją brakujących modów wydajności,
- sprawdzanie modów przed startem: brakujące zależności („Zainstaluj brakujące i uruchom”, Modrinth albo CurseForge),
  zły loader, zła wersja gry, konflikty, duplikaty,
- import instancji z Prism Launcher, MultiMC, CurseForge, Modrinth App, Dawn, Feather Client i oficjalnego launchera;
  odzyskiwanie profili z wyborem folderów („Odzyskaj profile”),
- światy: kopie zapasowe, eksport i import `.zip`; zrzuty i klipy (przycinanie, „Udostępnij linkiem”),
- kosmetyki SlashClient z podglądem 3D, osobny zestaw dla każdej postaci,
- statystyki: czas gry według dni, profile, serwery, pory grania, seria dni i ostatnie sesje,
- **Osiągnięcia** z Iskrami: osiągnięcia, codzienne i tygodniowe wyzwania, sklep z kosmetykami, historia Iskier,
- **Wiki** w launcherze: minecraft.wiki i wiki SkyUp.pl,
- znajomi, statusy aktywności, szyfrowane wiadomości (z obrazkami), czaty grupowe, klany, społeczności, drużyny
  i zaproszenia do gry (serwer w `server/`); historia czatu na nowym urządzeniu (z innego urządzenia albo z hasłem czatu);
  „Popularne wśród znajomych” w Modach i Serwerach; konto SlashClient zakłada się samo z kontem Minecraft,
  a Discord, Microsoft, Google i GitHub można do niego podpiąć; kanał Twitch lub Kick (znaczek LIVE),
- **światy LAN dla znajomych**: świat otwarty w LAN widać u znajomych, którzy dołączają przez przekaźnik serwera
  (`/v1/lan`), bez otwierania portów (`src/main/lan.ts`),
- avatar konta: twarz ze skina wybranego konta Minecraft (domyślnie pierwszego) albo obrazek z Discorda, Google lub GitHuba
  (wybór na stronie konta),
- ustawienia: limit prędkości pobierania, dedykowana karta graficzna (Windows, Linux), sprzątanie miejsca,
  rozmiar okna przy uruchomieniu, „Ogranicz animacje”, powiadomienia systemowe (z dźwiękiem albo bez),
- automatyczne aktualizacje launchera na Windowsie, Linuksie i macOS (szczegóły niżej),
- status na Discordzie (na SkyUp.pl z sektorem).

**Mod SlashClient** (mod Fabric w `hud/`, dawniej „SlashClient HUD”), instalowany przez launcher razem z Fabric API.
Minecraft 1.20.1, 1.21.1, 1.21.4, 1.21.5, 1.21.6–1.21.8, 1.21.9–1.21.10, 1.21.11, 26.1.x, 26.2 i 26.3:

- moduły: FPS, ping, CPS, współrzędne (też Netheru), prędkość, zegar, serwer, gracze, pamięć, CPU, GPU, TPS, sieć, biom,
  pora dnia, światło, czas sesji, combo, zasięg, sprint/skradanie, nasycenie, licznik przedmiotów, cel, pancerz, efekty,
  klawisze, informacje o bloku (narzędzie i czas kopania, wzrost roślin, liczniki bloków), „Teraz gra” (muzyka
  z komputera), czat Twitch i Kick, minimapa;
- edytor HUD (Prawy Shift) z przyciąganiem modułów, cofaniem (Ctrl+Z / Ctrl+Y) i zaokrąglonymi rogami; w nim przesuwa się
  też części gry: scoreboard, pasek bossa, listę graczy (Tab), pasek akcji, tytuły i czat (na 1.20.1 bez paska akcji);
  układy HUD dla serwerów; ustawienia można udostępnić kodem (w grze albo w profilu w launcherze);
- przybliżenie (C, z trybem przełączania i płynną kamerą), fullbright, freelook (Lewy Alt), punkty nawigacyjne (B,
  per serwer, punkt śmierci, klikalne koordynaty w czacie, wysyłanie znajomym), mapa świata (M) z graczami, mobami
  i znajomymi, nakładka poziomu światła (F9), odległość kamery w F5 (V + kółko), niski ogień, bez deszczu,
  własny celownik, znacznik trafienia, obrys bloku, niska tarcza, ukrywanie własnej zbroi, stackowanie serc,
  mouse tweaks, ping graczy nad głową;
- zakładki czatu wyłapujące wiadomości po tekście albo regexie (też jako osobne okna z własnym polem do pisania
  i prefiksem odpowiedzi, kod zakładek), kopiowanie wiadomości, ochrona przed wyrzuceniem (Q), wskaźniki obrażeń,
  licznik TNT, ukrywanie nicku, przycisk **Połącz ponownie**, lepszy ekran śmierci;
- podgląd shulkerów, wyszukiwarka w ekwipunku i skrzyniach (z przypinaniem), sortowanie (R) i strzałki
  „przenieś wszystko”, blokada slotów paska (K), Shift w craftingu tylko tyle, ile się zmieści, moduł „Ekwipunek”
  i podpis na zrzutach F2;
- własne menu główne i pauzy, nowa lista serwerów (partnerzy, znajomi przy serwerach, przeciąganie), własny ekran
  ładowania, paczki zasobów serwerów (tryb dla każdego serwera, „Ustaw na stałe”), automatyczne odnawianie sesji;
- klawisze SlashClient ustawiane w oknie moda i na stronach modułów, klipy (F8), natychmiastowa powtórka (F6),
  emotki jako ruchy postaci (N, 9 emotek z „six seven”), spraye, menu kosmetyków, benchmark, kalkulator XP,
  znajomi i czat (O);
- autoclicker, auto tool (bloki, broń, nożyce, wiadra i inne) i uzupełnianie ręki (domyślnie wyłączone, z ostrzeżeniem
  przed pierwszym włączeniem); trzymanie przycisków działa też przy otwartym ekwipunku i menu pauzy;
- zakładka **SkyUp** (SkyUp.pl): **mapa dungeonu** (pokoje z mapki z terakoty nad dungeonem, moby z ramką w kolorze
  klasy, czas do respawnu w pokojach ze spawnerem, liczniki łupów, pokój startowy ze strzałką, postęp poziomu; **M**
  na pełnym ekranie) i podświetlenie lootu; na 26.3 także zadania z wyspy (tracker), licznik ryb, licznik dropu SkyCase,
  garderoba, kalkulator XP SkyUp i paczka SkyUp w resourcepackach;
- okno gry nazywa się „SlashClient &lt;wersja&gt; · &lt;wersja Minecrafta&gt;”, F3 pokazuje wersję SlashClienta, a serwery
  widzą klienta jako `slashclient <wersja>/<wersja gry>`.

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

Jeden kod dla wszystkich wersji z `hud/versions/` (budowanie wymaga JDK 25; 1.20.1 kompiluje się do Javy 17,
1.21.x do 21, 26.x do 25):

```bash
cd hud
./build-all.sh                              # wszystkie wersje → build/bundle/slashclient-hud-<wersja>.jar
./gradlew build -Pmc=26.2                   # jedna wersja (versions/26.2.properties)
./gradlew runClientGameTest -Pmc=1.21.11    # gra z testem; zrzuty w build/<mc>/run/clientGameTest/screenshots
```

Różnice między wersjami: `versions/<mc>.properties` (wersja gry, Java, zakres wersji `range`, nazwy plików `targets`,
zmiany nazw `rename.`/`replace.`) i gałęzie `//#if MC >= 26.2` … `//#else` / `//$ kod` … `//#endif` w kodzie
(preprocesor w `build.gradle`); większość siedzi w `Compat.java`.

`npm run build` dołącza zbudowane pliki do launchera (`dist/hud/`). HUD nie trafia do `mods/` gracza: launcher kopiuje
go do `hud/` w folderze danych i wstrzykuje przy starcie przez `-Dfabric.addMods`. Profile Fabric dostają go wprost, a profile
vanilla są uruchamiane przez ukryty Fabric Loader (jak w Feather), którego folder modów wskazuje pusty katalog.
Gdy profil nie ma własnego Fabric API, launcher pobiera je z Modrinth do `hud/fabric-api/<wersja>/` i wstrzykuje tak samo.
Znajomi i czat w grze idą przez lokalny most launchera (127.0.0.1, klucz na sesję), więc gra nie dostaje tokenu konta.
Test z linii poleceń: `npm run test:launch -- 26.3 MojNick --fabric`.

## Testy i wydania

```bash
npm test                      # testy launchera (node scripts/test.mjs: esbuild + node:test, pliki tests/*.test.ts)
npm run typecheck
cd server && npm test         # testy serwera
npm run dist:mac              # instalator lokalnie (także dist:win, dist:linux) → release/
```

GitHub Actions (`.github/workflows/`):

- **CI** (`ci.yml`): mod dla wszystkich wersji, typecheck, testy i build launchera oraz typecheck i testy serwera
  na Linuksie, macOS i Windowsie przy każdym pushu do `main` i PR.
- **Release** (`release.yml`): tag `v*` (np. `git tag v0.9.10 && git push --tags`) tworzy wydanie z opisem
  z `release-notes/<tag>.md`, buduje `.dmg` i `.zip` (macOS), `.exe` i AppImage i publikuje je w GitHub Releases
  repozytorium `Slash3rss/SlashClient` (pole `build.publish` w `package.json`).

Zainstalowane launchery szukają aktualizacji na serwerze SlashClient (`/aktualizacje`, które podaje najnowsze wydanie z GitHuba).
Linux pobiera nową wersję w tle i instaluje ją przy ponownym uruchomieniu. Windows (instalacja dla jednego użytkownika,
domyślna) pobiera w tle nowe pliki, sprawdza sumę SHA-512 i przy ponownym uruchomieniu podmienia folder aplikacji bez
instalatora (`src/main/winUpdate.ts`); przy instalacji w folderze bez prawa zapisu aktualizuje instalator. macOS
(aplikacja bez podpisu Apple) pobiera `.zip` dla swojego procesora, sprawdza sumę SHA-512 i po kliknięciu „Uruchom
ponownie” sam podmienia `SlashClient.app` (`src/main/macUpdate.ts`). Gdy aplikacja działa z obrazu dysku albo z folderu
bez prawa zapisu, launcher proponuje „Przenieś do Aplikacji” albo zostaje przycisk „Pobierz”. Włączona gra nie zamyka
się razem z launcherem, a „Zainstaluj aktualizację” czeka, aż ją zamkniesz.

Bez podpisu pierwszy instalator na Macu trzeba otworzyć przez prawy klik → Otwórz. Podpis włączają sekrety
`MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` i `APPLE_TEAM_ID` (bez nich
`release.yml` buduje bez podpisu).

Serwer i stronę wdraża `./server/deploy/deploy.sh` (opis w [server/README.md](server/README.md)).

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

Launcher ma wbudowaną aplikację Azure zatwierdzoną przez Mojang, więc w Ustawieniach nic nie trzeba wpisywać.
Własną aplikację (konta osobiste, włączone **Allow public client flows**) można podać zmienną `SLASHCLIENT_MS_CLIENT_ID`.
Nowa aplikacja musi zostać zatwierdzona przez Mojang (<https://aka.ms/mce-reviewappid>); do tego czasu logowanie kończy się
błędem na etapie `login_with_xbox` (HTTP 403).

Launcher łączy się z serwerem <https://client.slash3rss.dev>; inny (np. lokalny) wskazuje zmienna `SLASHCLIENT_SOCIAL_URL`.

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
| `src/main/hud.ts`      | wstrzykiwanie moda SlashClient i Fabric API |
| `src/main/social.ts`, `bridge.ts` | połączenie z serwerem znajomych i lokalny most dla gry |
| `src/main/updates.ts`, `macUpdate.ts`, `winUpdate.ts` | aktualizacje launchera |
| `src/main/lan.ts`      | światy LAN dla znajomych |
| `src/main/main.ts`     | proces główny Electrona i IPC |
| `src/renderer/`        | interfejs |
| `hud/`                 | mod SlashClient (Fabric, Java) |
| `server/`              | serwer znajomych, API i strona |
| `release-notes/`       | opisy wydań (`v<wersja>.md`) |

## Ograniczenia

- Wersje sprzed 1.19 na Macach z Apple Silicon działają przez Rosettę (Java x64).
