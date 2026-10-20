> This is an English translation for convenience. The Polish version ([/polityka-prywatnosci](/polityka-prywatnosci)) is the binding one.

## 1. Controller and contact {#controller}

The controller of your personal data is {{admin.name}}, {{admin.address}}, {{admin.nip}} ("we"). For data protection matters write to {{admin.email}}. [UZUPEŁNIJ: data protection officer, if appointed; otherwise delete this sentence]

This policy covers the SlashClient launcher, the mod (HUD), the website [client.slash3rss.dev](https://client.slash3rss.dev/) and the online services server (account, friends, chat, clans, achievements, Cosmetics, file sharing, support). Terms have the same meaning as in the [Terms of Service](/terms).

## 2. In short {#summary}

- The launcher works without a SlashClient Account; the account is only needed for online features.
- We have no ads, no analytics and no tracking cookies. The website only stores your sign-in token in the browser.
- Messages and pictures in chats with friends, in groups and clans are end-to-end encrypted — we cannot read them. Exception: community chat (large groups of up to 1000 people) is not end-to-end encrypted.
- We never learn your passwords or card details. Microsoft account tokens stay on your computer, encrypted.
- Shared files are deleted automatically (screenshots, clips, profile codes and chat pictures after 30 days, logs after 90 days).

## 3. Where the data comes from {#sources}

- **From you** — when you use online features (e.g. write a message, create a clan, share a file, report a bug, support the project).
- **From sign-in providers** — Discord, Microsoft, Google and GitHub give us the account identifier, username, display name and profile picture address (scopes: Discord "identify", Microsoft and Google "openid profile", GitHub no extra permissions). **We do not collect e-mail addresses.**
- **From Mojang/Microsoft** — when you sign in with a Minecraft account, Mojang's servers confirm you play as that account (Minecraft UUID and name). Your Minecraft token is never sent to our server.
- **From payment operators** — Stripe and PayPal confirm a payment, refund or chargeback (identifiers, amount, status).
- **From using the Services** — e.g. play time for achievements, addresses of the Minecraft servers you play on, technical request data.

## 4. What data, why and on what basis {#data-and-purposes}

Legal bases (Art. 6(1) GDPR): **(b)** performance of a contract — providing the Services you ask for; **(f)** our legitimate interest — security, preventing abuse, handling bugs, establishing and defending claims; **(a)** consent — optional features you turn on yourself; **(c)** legal obligation — accounting and tax for payments.

| Category | Data | Purpose and basis |
|---|---|---|
| SlashClient Account | account id, handle, display name, avatar (face from the Minecraft skin or the sign-in provider's picture), identifiers at sign-in providers, linked Minecraft accounts (UUID, name), creation and last activity dates, role, rank, badge, block | running the account and sign-in — (b) |
| Sessions | a hash (SHA-256) of the session token — the token itself is not stored, creation and last use dates | keeping you signed in, security — (b), (f) |
| Friends and status | friends list, requests, mutes; status (online, away, busy, invisible), activity (launcher, menu, singleplayer, server, game version) and server address — the address only if you enable "Show friends which server I play on"; status and activity are kept in server memory only | friends — (b) |
| Messages (private, group, clan) | content end-to-end encrypted (we only store ciphertext); metadata: sender, recipient or group, time sent, read, edited and deleted; game invites (server address, version) and shared waypoints (coordinates, dimension, world/server) — not end-to-end encrypted; daily number of messages sent | chat — (b); anti-spam limits — (f) |
| Chat pictures | encrypted file, sender, recipient, size, time | chat — (b) |
| Communities | name, tag, description, logo, visibility; members and their roles, join requests, invites, bans and mutes; **community chat messages in plain form** (not end-to-end encrypted), their edits and deletions; message reports (with a copy of the text) and the moderation log | communities — (b); moderation and safety — (f) |
| Encryption keys | the public key of each launcher (up to the 10 latest devices) and its random identifier | end-to-end encryption — (b) |
| Achievements and statistics | play time per day (UTC), addresses of servers you play on with the date of the first visit, unlocked achievements, counters (e.g. messages sent, shares) | achievements, Sparks, profile statistics — (b) |
| Sparks and shop | balance, history of changes (amount, reason, time, administrator for manual adjustments), purchases | Sparks — (b); adjustments on abuse — (f) |
| Cosmetics | owned and worn Cosmetics (also per Minecraft character), grants | Cosmetics — (b) |
| Clans and groups | clan tag, name and logo, owner, members and roles, invitations; chat groups and their members | clans and group chat — (b) |
| Public profile | privacy settings (who sees the profile, which sections, consent to search engine indexing), hiding by an administrator and its reason | profile — (b); indexing — (a), off by default; moderation — (f) |
| Game (mod) | Minecraft UUIDs of SlashClient players on a server (to show the logo and Cosmetics to other players) and the UUID–account link while playing; emotes and sprays (UUID, server, dimension, coordinates) — passed live to nearby players, not stored | in-game Cosmetics and emotes — (b) |
| Parties | leader, invitees, answers — in memory only, up to 3 hours | (b) |
| Screenshots and clips shared by link | file, title, dimensions, size, view count, owner, dates | sharing — (b) |
| Profile codes and cloud profiles | profile pack (.mrpack: mod list, settings, config files), name, game version, loader, device (cloud), dates | sharing and sync — (b) |
| Logs (/logs) | the game or launcher log you send (the launcher removes your home folder and tokens; a log may contain your name, server addresses, mod list, system details), account (if signed in), size, date | troubleshooting — (b), (f) |
| Bug reports | title, description, log link, version, system, comments, author (public) | handling reports — (f) |
| Support and payments | account, tier, type (one-time/monthly), amount, currency, status, payment and refund dates, the operator's payment, customer and subscription identifiers (Stripe, PayPal), confirmation of being an adult or having parental consent (time), perks granted; payment confirmation details (method type, e.g. card or BLIK, the operator's receipt link, refunded amount, end of the paid period); presence on the supporters wall, profile badge. We do not receive card or payment account details. | support — (b); accounting and tax — (c); complaints, refunds, chargebacks — (f); supporters wall — (a), off by default |
| Refund requests | payment, account, reason (free text up to 500 characters, if you give one), whether a parent or guardian is asking, status, the answer and id of the deciding administrator, the operator's refund id, dates. Visible only to the requester and administrators. | handling refunds — (b); accounting — (c); defending claims — (f) |
| Technical data | see section 5 | security and operation of the Services — (f) |
| Admin log | administrators' actions (who, what, to whom, when, details) | accountability of moderation — (f) |

## 5. Technical data, logs and limits {#technical}

- **API request log** — for the admin panel the server keeps the last 5000 requests in memory: time, method, path (without parameters or body), response code, duration, account id, **IP address with the last part hidden** (e.g. 203.0.113.x), client type and version, error code. It is cleared whenever the server restarts.
- **Web server logs** — the reverse proxy (Caddy) logs access to the website and API (full IP address, time, URL, browser). Files rotate at 10 MB and the last 5 are kept. [UZUPEŁNIJ: actual retention period; possible reduction of logging]
- **System logs** — server error messages. [UZUPEŁNIJ: retention of system logs on the server]
- **Rate limits** — counters per IP address or account (e.g. sign-ins, log sharing) kept in memory only, for a few minutes.
- **Backups** — [UZUPEŁNIJ: whether and how often database backups are made, where they are kept and for how long]

Basis: our legitimate interest in keeping the Services secure and running (Art. 6(1)(f) GDPR).

## 6. End-to-end encryption — how it works {#encryption}

Each launcher creates its own key pair. The private key never leaves your computer (it is stored encrypted by your operating system); only the public key goes to the server. A message is encrypted on your computer with a key that only the recipients' launchers (and your other launchers) can open. The server stores and passes on only the encrypted envelope, so **we cannot read message content or see pictures**.

Limitations worth knowing:

- we see metadata: who writes to whom and when, when a message was read, edited or deleted;
- **community chat is not end-to-end encrypted**: encrypting for each of up to 1000 members isn't practical, and moderators must be able to act on reports. The text is encrypted only in transit (HTTPS) and stored on the server; community members, its moderators and SlashClient administrators can see it. The launcher and the game say so above the message box;
- game invites and shared waypoints (server address, coordinates) are not end-to-end encrypted;
- if a friend uses a very old launcher without encryption keys, a text message to them is sent without end-to-end encryption (pictures cannot be sent then) [UZUPEŁNIJ: consider disabling this];
- after signing in on a new computer, older messages may be unreadable because they were encrypted for other devices.

Connections to the server are encrypted (HTTPS/TLS).

## 7. Data on your computer (launcher and mod) {#device}

- Microsoft/Minecraft accounts: the refresh token is stored **only locally**, encrypted by your operating system. It is never sent to our server. The same applies to the SlashClient Account token and the chat private key.
- Settings, profiles, play time statistics, screenshots and clips are stored locally and only reach us if you share or sync them.
- The launcher contains no telemetry or analytics. It connects to: our server (account, updates — files are downloaded from GitHub), Mojang/Microsoft servers (sign-in, game files, news), Fabric, Quilt, Forge and NeoForge (loaders), Modrinth and CurseForge (mods; CurseForge through our server), minecraft.wiki (Wiki tab), mc-heads.net and s.optifine.net (skin and cape preview — your name is sent), the server list lista.slash3rss.dev / api.slash3rss.dev. These parties see your IP address and follow their own privacy policies.
- Discord Rich Presence (optional, "Show on Discord what I'm playing") passes game information to the Discord app on your computer.
- Mod: the optional stream chat module connects anonymously to the Twitch or Kick chat of a channel you choose.

## 8. Website, cookies and localStorage {#cookies}

- The website **uses no analytics or advertising cookies** and no third-party tracking scripts.
- After you sign in, the session token is stored in the browser (localStorage, key `slashclient.token`) — it is needed to keep you signed in; signing out removes it.
- The website may be served through Cloudflare's network, which may set technical security cookies (e.g. bot protection). [UZUPEŁNIJ: confirm whether the domain is behind the Cloudflare proxy and which cookies appear]
- When you sign in we redirect you to the chosen sign-in provider; its page follows its own rules and cookies. Providers' avatars (Discord, Google, GitHub) load from their servers.
- The payment page redirects to Stripe or PayPal, which use their own cookies.

## 9. Who receives data {#recipients}

We do not sell data. Data may be received by:

- **the server (VPS) provider** — [UZUPEŁNIJ: hosting provider's name, country, data processing agreement];
- **Cloudflare, Inc.** — content delivery and protection of the website [UZUPEŁNIJ: confirm]; optionally **Cloudflare R2** or **Backblaze B2** — storage of shared files and cloud profiles, if enabled in the panel [UZUPEŁNIJ: which are used and in which location/jurisdiction, e.g. EU];
- **Stripe** and **PayPal** — payment processing; we pass the SlashClient Account id, tier and amount, while you give payment details directly to the operator, which is a separate controller for them;
- **sign-in providers** (Discord, Microsoft, Google, GitHub) and **Mojang/Microsoft** — for sign-in and Minecraft account verification; they are separate controllers;
- **GitHub** — installers and launcher updates are downloaded from its servers (it sees your IP address);
- **other players** — to the extent you share data yourself (profile, status, messages, clans, links);
- **public authorities** — where the law requires it.

## 10. Transfers outside the EEA {#transfers}

Some recipients (e.g. Cloudflare, Stripe, PayPal, Backblaze, Discord, Google, GitHub, Microsoft) are based or have servers in the USA or other countries outside the European Economic Area. Transfers rely on [UZUPEŁNIJ: for each recipient — a European Commission adequacy decision (EU-US Data Privacy Framework) or standard contractual clauses]. You can get a copy of the safeguards by writing to us.

## 11. How long we keep data {#retention}

| Data | Period |
|---|---|
| Account, friends, Cosmetics, Sparks, achievements, statistics, clans, profile settings | until the account is deleted |
| Private and group messages (ciphertext and metadata) | until the author deletes the message (a "deleted" marker without content remains) or the account is deleted [UZUPEŁNIJ: consider automatic deletion of old messages] |
| Chat pictures | 30 days (not attached to a message — 1 hour) |
| Screenshots and clips shared by link | 30 days or earlier deletion by you |
| Profile codes | 30 days or earlier deletion by you |
| Cloud profiles | until you or the account deletion removes them |
| Logs (/logs) | 90 days |
| Bug reports and comments | until removed by an administrator [UZUPEŁNIJ: target period] |
| Sessions | until sign-out; a session unused for 90 days expires |
| Device public keys | the 10 most recently used devices, until the account is deleted |
| Status, activity, parties, emotes, sprays, rate limits | server memory only — minutes to a few hours |
| API request log (masked IP) | in memory, last 5000 requests, until the server restarts |
| Web server logs (full IP) | rotation 5 × 10 MB [UZUPEŁNIJ: period] |
| Payments | [UZUPEŁNIJ: e.g. 5 years from the end of the year of payment (Polish Accounting Act, Tax Ordinance)] |
| Refund requests | as payment records [UZUPEŁNIJ: consider deleting the reason text a few months after the request is closed] |
| Acknowledgements of document changes | until the account is deleted |
| Admin log | [UZUPEŁNIJ: period] |
| Backups | [UZUPEŁNIJ: period] |

After the period, data is deleted automatically (shared files by an hourly cleanup). Data needed to defend against claims may be kept until the claims are time-barred.

## 12. Your rights {#rights}

You have the right to:

- **access** your data and get a copy (Art. 15 GDPR),
- **rectification** (Art. 16),
- **erasure** ("right to be forgotten", Art. 17),
- **restriction of processing** (Art. 18),
- **data portability** (Art. 20),
- **object** to processing based on legitimate interest (Art. 21),
- **withdraw consent** at any time, without affecting the lawfulness of earlier processing,
- **lodge a complaint with the President of the Personal Data Protection Office** (Prezes UODO, ul. Stawki 2, 00-193 Warszawa, Poland, [uodo.gov.pl](https://uodo.gov.pl/)) or the supervisory authority of your country.

## 13. How to exercise your rights {#how}

Much of it you can do yourself:

- profile privacy settings and indexing consent — in the launcher (Friends → Profile privacy);
- hiding the server you play on — the switch on [/account](/account) and in the launcher; the "invisible" status in the launcher;
- unlinking a sign-in provider or a Minecraft account, signing out — [/account](/account) and the launcher;
- deleting your own message, a shared screenshot or clip, a profile code, a cloud profile — in the launcher;
- supporters wall and badge — in the support settings on the account page.

For everything else — in particular **account deletion and a copy of your data** — write to {{admin.email}}. [UZUPEŁNIJ: once implemented, add the "Download my data" and "Delete account" buttons on /account] To make sure nobody impersonates you, we may ask you to confirm the account is yours (e.g. a SlashClient chat message to an administrator or signing in on the website). We reply within one month; for complex requests this may be extended by two further months, in which case we will tell you.

## 14. Do you have to provide data {#voluntary}

Providing data is voluntary, but online features cannot be used without it (the account is created at sign-in). You can use the launcher and the game without a SlashClient Account. We do not make decisions about you based solely on automated processing that produce legal effects; only anti-spam limits and abuse protection work automatically (e.g. temporarily limiting the number of messages).

## 15. Children {#children}

The Services are intended for people aged 16 or over. Younger people may use them with the consent of a parent or guardian (Terms, section 6). We do not collect e-mail addresses or other contact details. A parent or guardian may request access to or deletion of the child's data by writing to {{admin.email}}. By default the public profile does not show servers or last activity and is not indexed by search engines. Financial support requires confirmation of being an adult or of parental consent.

## 16. Security {#security}

- encrypted connections (HTTPS with HSTS), a Content Security Policy on the website;
- end-to-end encryption of chat messages and pictures;
- session tokens stored on the server only as hashes; tokens in the launcher encrypted by the operating system;
- access keys to file storage and payment operators encrypted (AES-256-GCM), private storage buckets;
- the server runs with restricted system privileges; only designated people have admin access, and their actions are logged;
- rate limits against abuse; IP addresses in the admin panel are masked.

## 17. Changes to this policy {#changes}

We update this policy when the Services or the law change. The date of the last change is shown at the top of the page. We announce important changes on the website and in the launcher; signed-in users see a notice.
