<!-- dzial: hud | kolejnosc: 80 | ikona: fa-comments | opis: Chat tabs and windows, search, times, stacked repeats, copying, clickable coordinates and Twitch/Kick chat -->
# Chat

SlashClient adds tabs, separate windows, a search box and a few small helpers to the game's chat. Everything is in **Right Shift → Settings → Chat**.

![The Chat category's cards](hud-kategoria-chat.webp)

![The chat with times, tabs, stacked repeats and underlined coordinates](hud-czat.webp)

## Chat tabs

Above the typing line is a row of tabs: **All** and your own. A tab catches lines that contain its text or match its regular expression. Tabs you are not looking at count their new lines.

Two come ready:
- **@** – messages where someone mentions you (`{nick}` is your name; your own lines do not count);
- **PM** – private messages in the formats servers usually use.

The **Chat tabs** card opens their settings:

![The chat tab settings](hud-opcje-chattabs.webp)

- **Name**, **What to catch** (words separated by commas, or a regex), **Except** – lines with this text stay out of the tab. An empty "What to catch" with something in "Except" means everything but that.
- **Reply prefix** – what goes before a message sent from this tab, like `/msg Steve ` or `/g `.
- **Typing line** – a pulled-out tab gets its own line to type in.
- **Mention sound** – a bell, pling, chime, harp, experience orb, amethyst, click or none.
- Change the tabs' order with the arrows.
- **Copy tabs** / **Paste tabs** – a code of your tabs to share (tabs with the same name are replaced).

### Pulled-out windows

Grab a tab with the mouse and pull it out of the row – it becomes a small chat window anywhere on the screen, showing only its lines. In the game its new lines fade like the chat's; with the chat open the window shows its history, scrolls with the wheel, moves by its title and resizes by its corner. A click on the title folds it, and a button docks it back into the chat.

- **Pulled-out tabs only in their windows** – their lines leave "All".

## Chat search

The **Search the chat…** box, while the chat is open, keeps only the lines that match.

![Chat search](hud-czat-szukaj.webp)

## Chat times

The time each line came in, before it, like `[18:05]`.

## Stack repeated lines

The same line several times in a row does not flood the chat – one stays with "×3". On by default.

## Right click copies

A right click on a line copies the whole message.

| Setting | Options |
|---|---|
| Format | text, § codes, & codes, JSON |
| Time first | none, HH:MM, HH:MM:SS |
| Without the sender | just the message |
| Notification | none, short, with the text |

## Clickable coordinates in chat

Coordinates in messages (`123 64 -456`, `x: 123 y: 64 z: -456`, `X 123 Z -456`, `123, 64, -456`) are underlined. A click opens a small **Save as waypoint** window, named "From chat: sender". Times, dates, prices and numbers inside words are not taken for coordinates.

## Mentions (sound and @)

When someone writes your name you hear a sound and the **@** tab gets a badge. Works in pulled-out windows too.

## Longer chat history

Instead of 100 lines the game keeps as many as you set (**Lines in history**, up to 16,000) – and as many of your sent messages under the up arrow. It does not affect how smoothly the game runs.

## Keep the chat after leaving a server

The game normally clears the chat when you leave a server; with this it stays. On by default.

## Twitch and Kick chat

The **Twitch chat** and **Kick chat** modules show a channel's live chat on the game screen.

| Setting | What it does |
|---|---|
| Channel | the channel's name or link |
| Chat ID (when Kick blocks) | Kick only: the chat's number when Kick refuses to look the channel up |
| Number of lines | 3–20 |
| Width | 120–400 px |
| Badges ([MOD], [SUB], [VIP]) | badges by the names |
| Name colours | the colours from Twitch/Kick |
| Messages fade | like the game's chat |

The module connects by itself and retries; its state (like "connecting to …") shows until messages arrive.
