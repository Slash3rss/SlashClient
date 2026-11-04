<!-- dzial: strona | kolejnosc: 60 | ikona: fa-file-lines | opis: Sharing your game log by link so someone can help you find the problem -->
# Sharing logs

When the game does not work, the log says why. The launcher uploads it in one click and gives you a link, **slashclient.pl/logs/…**, to paste in a chat or a [bug report](/wiki/strona-zgloszenia).

![A shared game log (Polish interface)](strona-logi.webp)

## How to share a log

- **From the console**: in the launcher, on the **Play** tab, open the **Console** tab and click **Share**. The launcher asks "Share the log publicly?" and copies the link once you confirm.
- **After a crash**: when the game crashes, the launcher shows what went wrong. The **Report a bug** button shares the log and opens a new bug report with a link to it.

You do not need an account.

## What the launcher hides

Before the log goes up, the launcher replaces:

- the path to your home folder (with your computer's user name) with `~`,
- your Minecraft sign-in token with `[ukryte]`,
- other tokens with `[ukryty token]`.

Still, a log may hold your name and server names – anyone with the link can read it.

## What the page shows

- the number of lines, the size, when it was sent, when it disappears and how many errors there are;
- a search box and the **Only errors and warnings** switch; errors are red, warnings yellow;
- line numbers – a click gives you a link to that line;
- the **Copy link**, **Download** and **Report a bug** buttons (the last opens a report with this log).

## Limits

The defaults (the admins can change them):

| What | How much |
|---|---|
| How long a log is kept | 90 days |
| Largest log (signed in) | 4 MB |
| Largest log (no account) | 1 MB |
