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
