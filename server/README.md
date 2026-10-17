# SlashClient – serwer znajomych

Znajomi, statusy aktywności i wiadomości prywatne dla launchera. Node 24 (wbudowane SQLite i uruchamianie TypeScriptu) + `ws`.

Konto SlashClient jest osobne od kont Minecraft: służy tylko do funkcji społecznościowych i nie zmienia logowania do gry.

## Uruchomienie lokalnie

```bash
cd server
npm install
ALLOW_DEV_LOGIN=1 npm start
```

W launcherze: Ustawienia → **Serwer znajomych** = `http://localhost:8787` (domyślnie), potem zakładka **Znajomi**.
`ALLOW_DEV_LOGIN=1` pozwala zalogować się samym nickiem, bez hasła. Służy tylko do testów i nigdy nie powinno być włączone publicznie.

## Strona i panel admina

Ten sam serwer pokazuje stronę SlashClient (pliki z `web/`):

- `/`: opis launchera, pobieranie i **Twoje konto**. Gracz loguje się tym samym kontem co w launcherze i wybiera pelerynę.
- `/admin`: **panel admina**, dostępny tylko dla adminów:
  - pulpit (konta, online, gracze w grze, wiadomości, nowe konta z 30 dni, noszone peleryny);
  - konta: wyszukiwanie, blokada (wylogowuje od razu i blokuje ponowne logowanie), wylogowanie wszędzie, rola admina, zmiana peleryny, usunięcie konta z wiadomościami;
  - kosmetyki: włączanie i wyłączanie peleryn oraz peleryny ekskluzywne, przydzielane wybranym graczom;
  - dziennik wszystkich zmian zrobionych w panelu.
  - partnerzy: serwery partnerskie z tłem (PNG lub JPG), które mod SlashClient rysuje za tym serwerem na liście serwerów w grze, z plakietką „Partner”; właściciel (konto partnera) zmienia tło sam na /konto. Obrazki leżą w `data/partners` obok bazy.

### Pobieranie launchera

Przycisk „Pobierz” prowadzi do `/pobierz/windows`, `/pobierz/mac` (Apple Silicon), `/pobierz/mac-intel` albo `/pobierz/linux`.
Serwer szuka instalatora w najnowszym wydaniu na GitHubie i przekierowuje przeglądarkę prosto do pliku. Nic nie trzyma i nic przez siebie nie przesyła.

- `RELEASES_REPO`: repozytorium z wydaniami (domyślnie `Slash3rss/SlashClient`).
- `RELEASES_TOKEN`: potrzebny, gdy repozytorium jest prywatne. Użyj tokena *fine-grained* z dostępem tylko do tego repozytorium i uprawnieniem **Contents: Read-only**.
  GitHub daje wtedy jednorazowy link do pliku ważny kilka minut, a token zostaje na serwerze.

Pierwszego admina ustawia zmienna `ADMIN_HANDLES` (nicki oddzielone przecinkami, np. `ADMIN_HANDLES=Slash3rss`).
Taki admin zawsze nim zostaje; kolejnych można mianować w panelu.

```bash
ALLOW_DEV_LOGIN=1 ADMIN_HANDLES=TwojNick npm start
# strona: http://localhost:8787/   panel: http://localhost:8787/admin
```

Fonty, ikony, logo i obrazki peleryn w `web/vendor` kopiuje `npm run build` w głównym katalogu (z launchera i moda).

## Logowanie: Discord, Microsoft, Google, GitHub

Konto SlashClient można założyć przez dowolny z tych serwisów, a w zakładce Znajomi podłączyć kolejne
(ikony przy „Logowanie”). Każdy włącza się parą zmiennych `<NAZWA>_CLIENT_ID` i `<NAZWA>_CLIENT_SECRET`.
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
| `ALLOW_DEV_LOGIN` | – | `1` = logowanie samym nickiem (tylko testy) |

## API (`/v1`)

Błędy mają postać `{ "error": "<kod>" }`, a launcher tłumaczy kody na tekst. Wszystko poza logowaniem wymaga `Authorization: Bearer <token>`.

| Metoda | Ścieżka | |
|--------|---------|--|
| GET | `/health` | `{ providers, dev }`: dostępne sposoby logowania |
| POST | `/auth/dev` | `{ name }` → `{ token, user }` (tylko z `ALLOW_DEV_LOGIN`) |
| POST | `/auth/:provider/start` | `{ state, url }`; z nagłówkiem `Authorization` łączy serwis z kontem zamiast logować |
| GET | `/auth/poll?state=` | `{ pending: true }`, `{ token, user }` albo `{ linked: true, user }` |
| POST | `/auth/logout` | |
| GET/POST | `/me` | konto z listą `providers`; POST `{ showServer }` |
| DELETE | `/me/providers/:provider` | odłącza serwis (ostatniego nie można) |
| GET | `/friends` | `{ friends, incoming, outgoing }`, przy znajomych status, liczba nieprzeczytanych |
| POST | `/friends/requests` | `{ handle }`. Gdy druga strona też zaprosiła, od razu jesteście znajomymi |
| POST | `/friends/requests/:id/accept` | |
| DELETE | `/friends/requests/:id` | odrzuca albo anuluje |
| DELETE | `/friends/:id` | |
| GET | `/messages/:id?before=&limit=` | historia, najstarsze pierwsze |
| POST | `/messages/:id` | `{ text }` (do 2000 znaków) |
| POST | `/messages/:id/read` | |
| POST | `/mc/heartbeat` | `{ uuid }`: ten gracz Minecraft gra teraz przez SlashClient (bez logowania, mod wysyła co 4 min) |
| POST | `/mc/lookup` | `{ uuids }` (do 250) → `{ active }`: którzy z nich grają przez SlashClient (logo na TAB-ie i nad głową) |

WebSocket `/v1/ws`: pierwsza wiadomość to `{ type: "auth", token, presence }`. Potem klient wysyła
`presence` i `typing`, a serwer `ready`, `presence`, `message`, `read`, `typing` i `friends` (lista się zmieniła).
Status `invisible` znajomi widzą jako offline. Adres serwera widzą tylko wtedy, gdy gracz na to pozwala.

## Testy

```bash
npm test
```

## Serwer publiczny (VPS)

Strona, API i panel działają pod **https://client.slash3rss.dev** (VPS z Ubuntu 24.04, Node 24, Caddy z automatycznym HTTPS).

- **Wdrożenie:** `./server/deploy/deploy.sh` wysyła `server/` przez SSH (rsync), instaluje zależności i restartuje usługę. VPS nie ma dostępu do GitHuba.
- **Ustawienia:** `/etc/slashclient/env` na serwerze (token wydań, klucze logowania, admini). Po zmianie: `systemctl restart slashclient`.
- **Baza:** `/var/lib/slashclient/social.db`.
- **Logi:** `journalctl -u slashclient -f` (serwer) i `/var/log/caddy/slashclient.log` (ruch).
- **Pliki usługi:** `server/deploy/slashclient.service` i `server/deploy/Caddyfile`; `deploy.sh` instaluje je przy każdym wdrożeniu.

## Bezpieczeństwo

- **Konto SlashClient** zakłada się tylko kontem Minecraft potwierdzonym w Mojangu (`/v1/auth/minecraft/*`: launcher robi „join” z losowym `serverId`, serwer pyta `hasJoined`). Token Minecrafta nie trafia na serwer. Discord, Microsoft, Google i GitHub logują tylko do kont, do których zostały wcześniej podpięte.
- **Sesje**: losowy token 32 bajty, w bazie tylko jego skrót; wylogowanie zamyka też połączenia WebSocket tej sesji.
- **Czat szyfrowany od nadawcy do odbiorcy**: każdy launcher ma klucz X25519, na serwerze są tylko klucze publiczne (`/v1/keys`, widoczne dla znajomych) i szyfrogram (`e2e1:…`). Serwer nie może przeczytać wiadomości. Nie chroni to przed serwerem, który podmieniłby klucze publiczne (brak porównywania odcisków kluczy). Zaproszenia do gry (adres serwera) są jawne.
- **Peleryny, emotki i rangi** dotyczą tylko kont Minecraft potwierdzonych w Mojangu. Samo logo „gra z SlashClient” (heartbeat) nie wymaga konta, więc da się je pokazać przy dowolnym nicku; nie daje ono żadnych uprawnień.
- **Limity**: logowania, prośby o znajomość, wiadomości, emotki i ruch WebSocket mają limity na minutę; za Caddy liczone po prawdziwym IP (`TRUST_PROXY=1`).
- **Admin**: pierwszy admin z `ADMIN_HANDLES` (po nicku). Po pierwszym logowaniu warto nadać rolę admina w bazie i usunąć `ADMIN_HANDLES`, żeby uprawnienia nie zależały od nicku.
