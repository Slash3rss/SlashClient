# SlashClient – serwer znajomych

Znajomi, statusy aktywności, wiadomości prywatne, kosmetyki i rangi dla launchera i moda, a do tego strona SlashClient,
udostępnione logi, zgłoszenia błędów i kanał aktualizacji launchera. Node 24 (wbudowane SQLite i uruchamianie TypeScriptu) + `ws`.

Konto SlashClient jest osobne od kont Minecraft: służy tylko do funkcji społecznościowych i nie zmienia logowania do gry.

## Uruchomienie lokalnie

```bash
cd server
npm install
ALLOW_DEV_LOGIN=1 npm start
```

Launcher łączy się domyślnie z `https://client.slash3rss.dev`. Z lokalnym serwerem uruchom go z
`SLASHCLIENT_SOCIAL_URL=http://localhost:8787 npm start` (w głównym katalogu), potem zakładka **Znajomi**.
`ALLOW_DEV_LOGIN=1` pozwala zalogować się samym nickiem, bez hasła. Służy tylko do testów i nigdy nie powinno być włączone publicznie.

## Strona i panel admina

Ten sam serwer pokazuje stronę SlashClient (pliki z `web/`). Strony przełączają się bez przeładowania (`web/router.js`),
strona główna ma opis SEO i OpenGraph, a `robots.txt` (z `sitemap.xml`) wyłącza z wyszukiwarek konto, logi, panel i API.
Adresy są po polsku i po angielsku (`/konto` i `/account`, `/zgloszenia` i `/bugs`, `/logi` i `/logs`, `/pobierz` i `/download`).

- `/`: opis launchera, pobieranie i podgląd kosmetyków 3D.
- `/konto`: **Twoje konto**. Gracz loguje się tym samym kontem co w launcherze i wybiera kosmetyki (dla całego konta albo
  każdej postaci), avatar (twarz z wybranego konta Minecraft albo obrazek z Discorda, Google lub GitHuba) i prywatność.
  Partner zmienia tu tło swojego serwera.
- `/zgloszenia`: **zgłoszenia błędów**. Zalogowani gracze piszą zgłoszenia (mogą dołączyć log) i komentarze,
  admini zmieniają status (otwarte, potwierdzone, naprawione, zamknięte, duplikat).
- `/logi/<id>`: log udostępniony z launchera (trzymany 90 dni, bez tokenów i ścieżek).
- `/admin`: **panel admina**, dostępny tylko dla adminów:
  - pulpit (konta, online, gracze w grze, wiadomości, nowe konta z 30 dni, noszone peleryny);
  - konta: wyszukiwanie, blokada (wylogowuje od razu i blokuje ponowne logowanie), wylogowanie wszędzie, rola admina,
    ranga (Support, Partner, Przyjaciel), zmiana peleryny, usunięcie konta z wiadomościami;
  - kosmetyki: włączanie i wyłączanie kosmetyków oraz kosmetyki ekskluzywne, przydzielane wybranym graczom
    (admini mają zawsze dostęp do wszystkich);
  - partnerzy: serwery partnerskie z tłem (PNG lub JPG), które mod SlashClient rysuje za tym serwerem na liście serwerów w grze,
    z plakietką „Partner”; właściciel (konto partnera) zmienia tło sam na /konto. Obrazki leżą w `data/partners` obok bazy;
  - zapytania: ostatnie zapytania do API (ścieżka, status, czas, konto, klient), z filtrem błędów;
  - logi graczy: udostępnione logi z możliwością usunięcia;
  - miejsce na pliki: gdzie leżą zrzuty, klipy i profile w chmurze (dysk serwera, Cloudflare R2, Backblaze B2, inne S3),
    zajętość, limity, test połączenia i przenoszenie plików; instrukcja w [docs/przechowywanie.md](docs/przechowywanie.md);
  - **ustawienia** (`src/settingsDefs.ts`, kategorie w `src/settings.ts`): limity (zapytania na minutę, rozmiary plików,
    liczby członków), przełączniki funkcji (społeczności, klany, grupy, czat, media, udostępnianie, kanał beta
    aktualizacji) i klucze dostawców; sekrety są w bazie szyfrowane `STORAGE_SECRET_KEY`. Nowe limity i przełączniki
    dodaje się tutaj, a nie jako stałe w kodzie;
  - dziennik wszystkich zmian zrobionych w panelu.

Rangi to kolor logo SlashClient przy nicku w grze: admin czerwone, Support błękitne, Partner złote, Przyjaciel zielone;
każda ranga ma też swoją pelerynę.

### Pobieranie i aktualizacje launchera

Przycisk „Pobierz” prowadzi do `/pobierz/windows`, `/pobierz/mac` (Apple Silicon), `/pobierz/mac-intel` albo `/pobierz/linux`.
Serwer szuka instalatora w najnowszym wydaniu na GitHubie i przekierowuje przeglądarkę prosto do pliku. Nic nie trzyma i nic przez siebie nie przesyła.
Tak samo `/aktualizacje/<plik>` (`/updates/`) jest kanałem aktualizacji launchera: `latest*.yml` podaje sam, a pliki jako krótkie linki.

- `RELEASES_REPO`: repozytorium z wydaniami (domyślnie `Slash3rss/SlashClient`).
- `RELEASES_TOKEN`: potrzebny, gdy repozytorium jest prywatne. Użyj tokena *fine-grained* z dostępem tylko do tego repozytorium i uprawnieniem **Contents: Read-only**.
  GitHub daje wtedy jednorazowy link do pliku ważny kilka minut, a token zostaje na serwerze.

### CurseForge w launcherze

Launcher szuka i instaluje mody, paczki zasobów, shadery i modpacki z CurseForge przez ten serwer (`/v1/curseforge/...`),
bo API CurseForge wymaga klucza, którego nie wolno wbudować w launcher. Serwer przepuszcza tylko odczyt potrzebny launcherowi
(wyszukiwanie, projekt, lista plików, jeden plik, kilka projektów lub plików naraz), tylko Minecraft (gra 432), i trzyma odpowiedzi 10 minut.

- `CURSEFORGE_API_KEY`: klucz z https://console.curseforge.com (zakładka *API Keys*). Wpisz go w `/etc/slashclient/env`
  jako `CURSEFORGE_API_KEY=...` i zrestartuj usługę. Bez klucza (albo z odrzuconym kluczem) serwer odpowiada
  `503 { "error": "curseforge_unavailable" }`, a launcher pokazuje, że CurseForge jest niedostępny; Modrinth działa dalej.
- Pliki, których autor nie pozwala rozpowszechniać poza CurseForge, nie mają linku do pobrania. Launcher pokazuje je
  jako „pobierz ręcznie” z linkiem do strony pliku i niczego nie obchodzi.

Pierwszego admina ustawia zmienna `ADMIN_HANDLES` (nicki oddzielone przecinkami, np. `ADMIN_HANDLES=Slash3rss`).
Taki admin zawsze nim zostaje; kolejnych można mianować w panelu.

```bash
ALLOW_DEV_LOGIN=1 ADMIN_HANDLES=TwojNick npm start
# strona: http://localhost:8787/   panel: http://localhost:8787/admin
```

Fonty, ikony, logo i obrazki kosmetyków w `web/vendor` kopiuje `npm run build` w głównym katalogu (z launchera i moda).

## Logowanie: Minecraft, Discord, Microsoft, Google, GitHub

Konto SlashClient zakłada się samo kontem Minecraft potwierdzonym w Mojangu (launcher robi to po dodaniu konta Microsoft).
Discord, Microsoft, Google i GitHub można do niego podpiąć w zakładce Znajomi albo na stronie i potem nimi logować.
Każdy włącza się parą zmiennych `<NAZWA>_CLIENT_ID` i `<NAZWA>_CLIENT_SECRET`.
Adres przekierowania jest zawsze taki sam: `<PUBLIC_URL>/v1/auth/<nazwa>/callback`, lokalnie np. `http://localhost:8787/v1/auth/google/callback`.

| Serwis | Gdzie utworzyć aplikację | Uwagi |
|--------|--------------------------|-------|
| Discord | <https://discord.com/developers/applications> → OAuth2 | może być aplikacja od statusu (`812524751053914112`); zakres `identify` |
| Microsoft | <https://portal.azure.com> → App registrations | konta osobiste; platforma **Web** z adresem przekierowania; **Certificates & secrets** → nowy sekret. To zwykłe logowanie Microsoft, niezależne od kont Minecraft w launcherze |
| Google | <https://console.cloud.google.com/apis/credentials> → OAuth client ID (Web application) | zakresy `openid profile` |
| GitHub | <https://github.com/settings/developers> → OAuth Apps | bez dodatkowych zakresów (publiczny profil) |

Launcher otwiera przeglądarkę, a po zalogowaniu sam odbiera wynik (odpytuje `/v1/auth/poll`). Nie potrzebuje do tego własnego protokołu ani portu.

## Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---------|-----------|------|
| `PORT` | `8787` | port HTTP i WebSocket |
| `DB_FILE` | `./data/social.db` | plik bazy SQLite |
| `PUBLIC_URL` | `http://localhost:PORT` | adres widoczny z zewnątrz (przekierowania po logowaniu) |
| `ADMIN_HANDLES` | – | nicki adminów (panel `/admin`), oddzielone przecinkami |
| `WEB_DIR` | `./web` | pliki strony |
| `DISCORD_…`, `MICROSOFT_…`, `GOOGLE_…`, `GITHUB_…` (`_CLIENT_ID`, `_CLIENT_SECRET`) | – | włączają dany sposób logowania |
| `RELEASES_REPO`, `RELEASES_TOKEN` | `Slash3rss/SlashClient`, – | wydania do pobierania i aktualizacji (wyżej) |
| `TRUST_PROXY` | – | `1` = prawdziwe IP z nagłówka proxy (za Caddy) |
| `ALLOW_DEV_LOGIN` | – | `1` = logowanie samym nickiem (tylko testy) |
| `STORAGE_SECRET_KEY` | – | 32 bajty base64 (`openssl rand -base64 32`): szyfruje klucze bucketów R2/B2 dodanych w panelu ([docs/przechowywanie.md](docs/przechowywanie.md)) |
| `STORAGE_MIN_FREE_MB` | `2048` | poniżej tylu MB wolnego dysk serwera nie przyjmuje nowych zrzutów, klipów i profili |
| `CURSEFORGE_API_KEY` | – | klucz API CurseForge (wyżej) |
| `MEDIA_DIR`, `SHARES_DIR`, `CLOUD_DIR`, `CHAT_IMAGES_DIR` | obok bazy | foldery zrzutów i klipów, udostępnień, profili w chmurze i obrazków z czatu (gdy pliki są na dysku serwera) |
| `FAILOVER_NODE`, `FAILOVER_S3_*` | – | zapasowy serwer: nazwa tego serwera i magazyn R2 na dzierżawę i kopie (`deploy/failover/README.md`); foldery plików muszą być wtedy w folderze bazy |
| `LEGAL_DRAFT` | włączone | `0` = bez paska „wersja robocza, do sprawdzenia przez prawnika” na regulaminach i polityce prywatności (wybór w panelu dla danego dokumentu ma pierwszeństwo) |

## API (`/v1`)

Błędy mają postać `{ "error": "<kod>" }`, a launcher tłumaczy kody na tekst. Prawie wszystko poza logowaniem wymaga `Authorization: Bearer <token>`.

| Metoda | Ścieżka | |
|--------|---------|--|
| GET | `/health` | `{ providers, dev }`: dostępne sposoby logowania |
| POST | `/auth/dev` | `{ name }` → `{ token, user }` (tylko z `ALLOW_DEV_LOGIN`) |
| POST | `/auth/minecraft/start`, `/auth/minecraft/finish` | logowanie kontem Minecraft (`serverId`, potem `hasJoined` w Mojangu); z sesją podpina konto |
| POST | `/auth/:provider/start` | `{ state, url }`; z nagłówkiem `Authorization` łączy serwis z kontem zamiast logować |
| GET | `/auth/poll?state=` | `{ pending: true }`, `{ token, user }` albo `{ linked: true, user }` |
| POST | `/auth/logout` | |
| GET/POST | `/me` | konto z listą `providers`; POST: `showServer`, kosmetyki (`cape`, `loadout`, `character`, `own`), `avatarSource` |
| DELETE | `/me/providers/:provider`, `/me/minecraft/:uuid` | odłącza serwis albo konto Minecraft (ostatniego nie można) |
| GET | `/friends` | `{ friends, incoming, outgoing }`, przy znajomych status, liczba nieprzeczytanych |
| POST | `/friends/requests` | `{ handle }`. Gdy druga strona też zaprosiła, od razu jesteście znajomymi |
| POST | `/friends/requests/:id/accept` | |
| DELETE | `/friends/requests/:id` | odrzuca albo anuluje |
| DELETE | `/friends/:id` | |
| POST/GET | `/keys`, `/keys/:id` | klucze publiczne X25519 do szyfrowania czatu |
| GET | `/messages/:id?before=&limit=` | historia, najstarsze pierwsze |
| POST | `/messages/:id` | `{ text }` (do 2000 znaków, zaszyfrowane dłuższe) |
| POST | `/messages/:id/read` | |
| POST | `/invites/:id` | zaproszenie do gry (adres serwera i wersja) z przyciskiem Dołącz |
| GET | `/cosmetics` | kosmetyki do wyboru i emotki (`available` dla zalogowanego) |
| POST | `/mc/heartbeat` | `{ uuid }`: ten gracz Minecraft gra teraz przez SlashClient (bez logowania, mod wysyła co 4 min) |
| POST | `/mc/lookup` | `{ uuids }` (do 250) → kto gra przez SlashClient, kosmetyki i rangi (logo na TAB-ie i nad głową) |
| POST | `/mc/link`, `/mc/emote` | którą postacią gra konto (w czasie gry); emotka nad głową |
| GET | `/skin/:uuid`, `/head/:uuid` | skin i twarz gracza Minecraft (podgląd 3D i domyślny avatar) |
| GET | `/partners`, `/partners/:id/background` | serwery partnerskie i ich tła; zarządzanie w `/admin/partners` i `/me/partners` |
| POST/GET | `/logs`, `/logs/:id` | udostępnienie logu (do 4 MB) → `{ id, url }` |
| GET/POST/PATCH/DELETE | `/bugs`, `/bugs/:id`, `/bugs/:id/comments` | zgłoszenia błędów i komentarze; status zmienia admin |
| | `/admin/…` | panel admina: `stats`, `users`, `cosmetics`, `partners`, `requests`, `logs`, `log` |

WebSocket `/v1/ws`: pierwsza wiadomość to `{ type: "auth", token, presence }`. Potem klient wysyła
`presence`, `typing` i `lan`, a serwer `ready`, `presence`, `message`, `read`, `typing`, `friends` (lista się zmieniła)
i `lan-connect`.
Status `invisible` znajomi widzą jako offline. Adres serwera widzą tylko wtedy, gdy gracz na to pozwala.

WebSocket `/v1/lan`: przekaźnik światów otwartych w LAN dla znajomych.
Launcher hosta zgłasza przez `/v1/ws` (`{ type: "lan", open }`), że świat jest otwarty. Dołączający łączy się z
`{ type: "join", token, host }`, host dostaje `lan-connect` i odpowiada `{ type: "accept", token, id }`; potem serwer
przekazuje bajty połączenia Minecrafta w obie strony. Tylko między znajomymi i tylko do otwartego świata, bez otwierania portów.

## Testy

```bash
npm test          # node --test test/*.test.ts
npm run typecheck
```

## Serwer publiczny (VPS)

Strona, API i panel działają pod **https://client.slash3rss.dev** (VPS z Ubuntu 24.04, Node 24, Caddy z automatycznym HTTPS).

- **Wdrożenie:** `./server/deploy/deploy.sh` wysyła `server/` przez SSH (rsync), instaluje zależności i restartuje usługę.
  VPS nie ma dostępu do GitHuba. Host i klucz SSH można zmienić zmiennymi `SLASHCLIENT_HOST` i `SLASHCLIENT_KEY`.
  Szybsza droga dla samego kodu (bez nowych zależności) i obowiązkowa kopia bazy przed nią są w `AGENTS.md`
  („Wdrożenie serwera”).
- **Ustawienia:** `/etc/slashclient/env` na serwerze (token wydań, klucze logowania, klucz CurseForge, admini). Po zmianie: `systemctl restart slashclient`.
- **Baza:** `/var/lib/slashclient/social.db`.
- **Logi:** `journalctl -u slashclient -f` (serwer) i `/var/log/caddy/slashclient.log` (ruch).
- **Pliki usługi:** `server/deploy/slashclient.service` i `server/deploy/Caddyfile`; `deploy.sh` instaluje je przy każdym wdrożeniu.

## Bezpieczeństwo

- **Konto SlashClient** zakłada się tylko kontem Minecraft potwierdzonym w Mojangu (`/v1/auth/minecraft/*`: launcher robi „join” z losowym `serverId`, serwer pyta `hasJoined`). Token Minecrafta nie trafia na serwer. Discord, Microsoft, Google i GitHub logują tylko do kont, do których zostały wcześniej podpięte.
- **Sesje**: losowy token 32 bajty, w bazie tylko jego skrót; wylogowanie zamyka też połączenia WebSocket tej sesji.
- **Czat szyfrowany od nadawcy do odbiorcy**: każdy launcher ma klucz X25519, na serwerze są tylko klucze publiczne (`/v1/keys`, widoczne dla znajomych) i szyfrogram (`e2e1:…`). Serwer nie może przeczytać wiadomości. Nie chroni to przed serwerem, który podmieniłby klucze publiczne (brak porównywania odcisków kluczy). Zaproszenia do gry (adres serwera) są jawne.
- **Kosmetyki, emotki i rangi** dotyczą tylko kont Minecraft potwierdzonych w Mojangu. Samo logo „gra z SlashClient” (heartbeat) nie wymaga konta, więc da się je pokazać przy dowolnym nicku; nie daje ono żadnych uprawnień.
- **Logi** launcher czyści z tokenów i ścieżek przed wysłaniem, i tylko po zgodzie gracza.
- **Limity**: logowania, prośby o znajomość, wiadomości, emotki i ruch WebSocket mają limity na minutę; za Caddy liczone po prawdziwym IP (`TRUST_PROXY=1`).
- **Admin**: pierwszy admin z `ADMIN_HANDLES` (po nicku). Po pierwszym logowaniu warto nadać rolę admina w bazie i usunąć `ADMIN_HANDLES`, żeby uprawnienia nie zależały od nicku.
