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

## Logowanie przez Discord

1. <https://discord.com/developers/applications> → aplikacja (może być ta od statusu, `812524751053914112`) → **OAuth2**.
2. **Redirects**: dodaj `<PUBLIC_URL>/v1/auth/discord/callback`, lokalnie `http://localhost:8787/v1/auth/discord/callback`.
3. Skopiuj **Client ID** i **Client Secret**:

```bash
DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=... npm start
```

Launcher otwiera przeglądarkę, a po zalogowaniu sam odbiera wynik (odpytuje `/v1/auth/discord/poll`). Nie potrzebuje do tego własnego protokołu ani portu.

## Zmienne środowiskowe

| Zmienna | Domyślnie | Opis |
|---------|-----------|------|
| `PORT` | `8787` | port HTTP i WebSocket |
| `DB_FILE` | `./data/social.db` | plik bazy SQLite |
| `PUBLIC_URL` | `http://localhost:PORT` | adres widoczny z zewnątrz (przekierowanie Discorda) |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | – | włączają logowanie przez Discord |
| `ALLOW_DEV_LOGIN` | – | `1` = logowanie samym nickiem (tylko testy) |

## API (`/v1`)

Błędy mają postać `{ "error": "<kod>" }`, a launcher tłumaczy kody na tekst. Wszystko poza logowaniem wymaga `Authorization: Bearer <token>`.

| Metoda | Ścieżka | |
|--------|---------|--|
| GET | `/health` | dostępne sposoby logowania |
| POST | `/auth/dev` | `{ name }` → `{ token, user }` (tylko z `ALLOW_DEV_LOGIN`) |
| POST | `/auth/discord/start` | `{ state, url }` |
| GET | `/auth/discord/poll?state=` | `{ pending: true }` albo `{ token, user }` |
| POST | `/auth/logout` | |
| GET/POST | `/me` | konto; POST `{ showServer }` |
| GET | `/friends` | `{ friends, incoming, outgoing }`, przy znajomych status, liczba nieprzeczytanych |
| POST | `/friends/requests` | `{ handle }`. Gdy druga strona też zaprosiła, od razu jesteście znajomymi |
| POST | `/friends/requests/:id/accept` | |
| DELETE | `/friends/requests/:id` | odrzuca albo anuluje |
| DELETE | `/friends/:id` | |
| GET | `/messages/:id?before=&limit=` | historia, najstarsze pierwsze |
| POST | `/messages/:id` | `{ text }` (do 2000 znaków) |
| POST | `/messages/:id/read` | |

WebSocket `/v1/ws`: pierwsza wiadomość to `{ type: "auth", token, presence }`. Potem klient wysyła
`presence` i `typing`, a serwer `ready`, `presence`, `message`, `read`, `typing` i `friends` (lista się zmieniła).
Status `invisible` znajomi widzą jako offline. Adres serwera widzą tylko wtedy, gdy gracz na to pozwala.

## Testy

```bash
npm test
```
