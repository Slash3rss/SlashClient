# SlashClient – wskazówki dla agentów

Launcher Minecrafta (Electron + TypeScript), własny mod Fabric (HUD) na 10 wersji gry i serwer społecznościowy ze stroną
i panelem admina (slashclient.pl; stary adres client.slash3rss.dev przekierowuje strony, a API i aktualizacje obsługuje dalej dla starszych launcherów). Właściciel: Slash3rss. Rozmawiamy po polsku; komunikaty commitów, notki
wydań i teksty w interfejsie też po polsku (każdy tekst interfejsu ma też wersję angielską).

## Struktura

| Katalog | Co tam jest |
|---|---|
| `src/main` | proces główny Electrona: instalacja gier, logowanie, profile (`store.ts`), aktualizacje (`updates.ts`, `macUpdate.ts`, `winUpdate.ts`), most do gry (`bridge.ts`), IPC w `main.ts`, API strony w `preload.ts` (`window.slash`) |
| `src/renderer` | interfejs launchera (`app.ts`, `index.html`, `style.css` i moduły widoków) |
| `src/shared` | kod wspólny; słowniki `i18n.ts` i `i18n<Temat>.ts` (angielskie teksty; polskie są w kodzie) |
| `tests` | testy launchera (`*.test.ts`, esbuild + `node --test`) |
| `hud` | mod SlashClient HUD (Gradle, preprocesor wersji; `versions/*.properties` to wspierane wersje gry) |
| `server/src` | serwer (Node 24, wbudowane SQLite, TypeScript uruchamiany bez kompilacji, `ws`); `app.ts` spina moduły |
| `server/web` | strona, konto gracza i panel admina (czysty JS, bez frameworka) |
| `server/test` | testy serwera |
| `release-notes` | notki wydań `vX.Y.Z.md` (trafiają do wydania na GitHubie i do aktualizatora) |
| `scripts` | generatory zasobów (ikony, kosmetyki), `build-web.mjs`, `test.mjs` |

## Komendy

Launcher (katalog główny):
- `npm run typecheck`, `npm test`, `npm run build`, `npm start`
- po `npm run build` przywróć plik, który build nadpisuje: `git checkout -- server/web/vendor/fa/css/all.min.css`

Serwer (`server/`):
- `npm run typecheck`, `npm test`
- lokalnie: `PORT=8811 DB_FILE=<folder tymczasowy>/social.db ALLOW_DEV_LOGIN=1 ADMIN_HANDLES=Szef node src/index.ts`
  (logowanie samym nickiem, tylko lokalnie)
- po zmianach w podglądzie 3D na stronie przebuduj paczkę: `node scripts/build-web.mjs` (z katalogu głównego);
  przy konflikcie w zbudowanym `preview3d.js` nie scalaj go ręcznie, tylko przebuduj

Mod (`hud/`, potrzebny JDK 25, np. `JAVA_HOME="/c/Program Files/Eclipse Adoptium/jdk-25.0.1.8-hotspot"`):
- kompilacja jednej wersji: `./gradlew compileJava -Pmc=26.3`
- testy w grze, szybko i równolegle: `./gametest.sh 26.3` oraz `./gametest.sh 1.21.4`
- tylko wybrane testy: `./gradlew runClientGameTest -Pmc=26.3 -Ptests=GameSpotify,HudScreenshots`
- wszystkie wersje: `./build-all.sh`
- nie uruchamiaj pełnych testów sekwencyjnie (kwadrans), używaj `gametest.sh` albo `-Ptests`
- `FriendsChat` i `GameChatEdits` bywają niestabilne – przy pojedynczej porażce powtórz je osobno

## Zanim uznasz pracę za skończoną

- typecheck i testy tej części, którą zmieniasz (launcher, serwer, mod); zmiany w modzie – testy w grze na 26.3 i 1.21.4
  oraz kompilacja wszystkich wersji, gdy dotykasz kodu zależnego od wersji
- zmiany widoczne dla gracza: zrzuty ekranu (testy w grze robią je same, launcher i stronę sprawdź na żywo)
- nowe teksty interfejsu: polski i angielski (test i18n pilnuje kompletności)

## Zasady

- **Bez pushowania, wydań i wdrożeń bez wyraźnej zgody właściciela.** Commit lokalny jest w porządku.
- **Konfigurowalne w panelu admina:** limity, przełączniki funkcji, klucze dostawców, teksty – jako ustawienia
  w `server/src/settingsDefs.ts` (kategoria w `settings.ts`), a nie stałe w kodzie.
- **Żadnych prawdziwych sekretów w repo ani w kodzie.** Klucze (Spotify, Twitch, lista serwerów itd.) wpisuje
  właściciel w panelu admina; sekrety w bazie są szyfrowane `STORAGE_SECRET_KEY`.
- **Nie loguj się kontami testowymi na produkcji.**
- **Launcher testuj w izolacji:** `SLASHCLIENT_HOME` i `--user-data-dir` wskazujące na folder tymczasowy – nigdy na
  prawdziwe dane gracza (`%APPDATA%\SlashClient`, `~/Library/Application Support/SlashClient`).
- **Dane graczy są święte:** nic, co może skasować profile, światy czy mody, bez kopii i ścieżki odzyskania
  (zob. `launcher.json.bak` i odzyskiwanie profili w `store.ts`).
- **Zgodność wstecz:** starsze launchery i mody muszą działać z nowym serwerem, a nowy launcher ze starszym serwerem
  (funkcja się chowa, gdy serwer jej nie ma).
- Duże przedsięwzięcia najpierw opisz i zapytaj, zanim zaczniesz.

## Styl kodu

- Pisz jak otaczający kod: te same nazwy, idiomy i gęstość komentarzy.
- Komentarze to zwykłe zdania po angielsku wyjaśniające *dlaczego* i *co widzi gracz*, bez żargonu.
- Commity: jedno zdanie po polsku zaczynające się od części („Launcher: …”, „Serwer: …”, „HUD: …”, „Strona: …”)
  opisujące, co zmienia się dla gracza.

## Wydanie launchera (tylko na polecenie)

1. `npm version X.Y.Z --no-git-tag-version`
2. `release-notes/vX.Y.Z.md`; gdy wydanie ma coś fajnego, na samej górze znaczniki plakietki „Nowość” na stronie:
   ```
   <!-- nowosc: Nowość: krótki opis | #kotwica -->
   <!-- news: New: short description | #anchor -->
   ```
   (link jest opcjonalny, domyślnie notki wydania w historii zmian: `/zmiany#X.Y.Z`, po angielsku `/changelog#X.Y.Z`)

   Notki mogą mieć część angielską: po polskiej linia z samym `<!-- en -->`, a pod nią to samo po angielsku.
   Historia zmian (strona `/zmiany` i `/changelog`, launcher: „Co nowego”, „Nowości w launcherze”, „Historia zmian”)
   pokazuje graczom z angielskim tę część, a gdy jej nie ma – polską. Pierwszy nagłówek `## SlashClient X.Y.Z`
   i komentarze `<!-- … -->` się nie wyświetlają. Markdown: nagłówki, listy, **pogrubienie**, *kursywa*, `kod`
   i linki tylko `https://` (HTML jest pokazywany jako tekst; `server/src/releaseNotes.ts`).
   ```
   ## SlashClient X.Y.Z
   - polskie notki…
   <!-- en -->
   ## SlashClient X.Y.Z
   - English notes…
   ```
3. commit „Wydanie X.Y.Z”, tag `vX.Y.Z`, push `main` i tagu – resztę robi `.github/workflows/release.yml`
4. sprawdź, że kanały aktualizacji (`https://slashclient.pl/aktualizacje/latest*.yml`) pokazują nową wersję

## Wydanie beta (tylko na polecenie)

Jak zwykłe wydanie, ale wersja i tag z `-beta.N`: `npm version X.Y.Z-beta.N --no-git-tag-version`,
`release-notes/vX.Y.Z-beta.N.md` (bez znaczników „Nowość”), commit „Wydanie X.Y.Z-beta.N”, tag `vX.Y.Z-beta.N`.
Workflow robi z tego „pre-release” na GitHubie z samymi plikami aktualizacji (bez `Setup.exe` i `.dmg`).
Bety dostają tylko launchery z kanałem „Beta” w ustawieniach (`/aktualizacje/beta`, przełącznik „Kanał beta
aktualizacji” w panelu admina); strona, `/pobierz` i stabilny kanał ich nie widzą. Sprawdź
`https://slashclient.pl/aktualizacje/beta/latest.yml`. Potem ogłoszenie bety na Discordzie: bot (token w `.env`
projektu `SlashClient-discord`) wrzuca na `📣・beta-ogłoszenia` ładną wiadomość w Components v2 (kontener, tekst,
separatory, przyciski jak w panelach bota) zbudowaną z notek bety: w katalogu `SlashClient-discord`
`node scripts/announceBeta.js X.Y.Z-beta.N` (z id kanału na końcu wysyła podgląd gdzie indziej). Jak włączyć bety,
opisuje kanał `ℹ️・beta-informacje` (`scripts/betaInfo.js` wysyła tę wiadomość od nowa).

## Wdrożenie serwera (tylko na polecenie)

Serwer stoi w kontenerze CT 821 (192.168.100.22) na hoście Proxmox 54.36.173.32. HTTPS robi Nginx Proxy Manager
z CT 800 (certyfikaty, proxy hosty `slashclient.pl` i `client.slash3rss.dev`), a przed nim Cloudflare. Caddy
w kontenerze działa tylko po HTTP (`server/deploy/Caddyfile`: przekierowania i prawdziwe IP gracza). SSH tylko przez
konto przeskokowe, które przepuszcza wyłącznie do SSH kontenera. W `~/.ssh/config`:
```
Host slashclient-jump
  HostName 54.36.173.32
  User slashclient-jump
  IdentityFile ~/.ssh/slashclient_vps
Host slashclient
  HostName 192.168.100.22
  User root
  ProxyJump slashclient-jump
  IdentityFile ~/.ssh/slashclient_vps
```
Najpierw kopia bazy i aplikacji (nocną kopię robi też `slashclient-backup.timer` do `/var/backups/slashclient`):
```
ssh slashclient 'T=$(date +%Y%m%d-%H%M%S); mkdir -p /root/backups
sqlite3 /var/lib/slashclient/social.db ".backup /root/backups/social-$T.db"
tar czf /root/backups/app-$T.tgz -C /opt/slashclient app
find /root/backups -type f -mtime +30 -delete'   # polityka prywatności obiecuje najwyżej 30 dni
```
Potem kod (tylko `src`, `web` i `package.json`):
```
git archive HEAD:server src web package.json | ssh slashclient   'cd /opt/slashclient/app && tar xf - && chown -R root:root src web && systemctl restart slashclient'
```
Sprawdź `https://slashclient.pl/v1/health`. W tym samym kontenerze działa API listy serwerów `api.slash3rss.dev`
(osobny projekt: `/opt/api-slash3rss`, usługa `api-slash3rss`, wpis Caddy w `/etc/caddy/sites`, baza MariaDB
w CT 807) – nie ruszaj go przy wdrożeniu. Stary VPS 93.95.119.130 ma obie usługi zatrzymane i wyłączone
(zapas na wypadek cofnięcia przenosin).

Zapasowy serwer (awaryjność): `server/deploy/failover/README.md` – dzierżawa lidera i kopie bazy/plików w R2
(`server/src/failover.ts`), strażnik i przejęcie na zapasowym. Po włączeniu `FAILOVER_*` wdrażaj na oba serwery
ten sam kod; zapasowy z wyłączonym `slashclient` sam nie wystartuje (dzierżawa).
