import { BURST_LIMITS, COUNTED_PER_DAY, EDIT_WINDOW_MS } from './chatLimits.ts';
import { CHALLENGE_SETTING_DEFS } from './challenges.ts';
import { IMAGE_LIMITS } from './chatImages.ts';
import { chatMediaSettingDefs } from './chatMediaLimits.ts';
import { MAX_LOGO_BYTES } from './clanLogos.ts';
import { BLOCKED_TAGS, BLOCKED_WORDS, CLAN_LIMITS } from './clans.ts';
import { COMMUNITY_LIMITS } from './communityStore.ts';
import { COMMUNITY_MEDIA_LIMITS } from './communityMedia.ts';
import { BANNER_DEFS, FEATURE_DEFS } from './features.ts';
import { POPULAR_SETTING_DEFS } from './friendsPopular.ts';
import { GIF_SETTING_DEFS } from './gifs.ts';
import { ALIASES_DEFAULT, ICON_SETTING_DEFAULTS } from './partners.ts';
import { PUSH_SETTING_DEFS } from './push.ts';
import { RANK_SETTING_DEFS } from './ranks.ts';
import { GROUP_LIMITS } from './groups.ts';
import { MEDIA_LIMITS } from './media.ts';
import { MAX_PER_DAY as REFUNDS_PER_DAY, REFUND_WINDOW_DAYS } from './payments/refunds.ts';
import { CLOUD_LIMITS } from './profileCloud.ts';
import { DEFAULT_PRIVACY, VISIBILITIES } from './profiles.ts';
import { SHARE_LIMITS } from './profileShares.ts';
import type { SettingCategory, SettingDef } from './settings.ts';
import { DEFAULT_MIN_FREE } from './storage.ts';
import { STREAM_SETTING_DEFS } from './streams/settings.ts';
import { SUGGESTION_SETTING_DEFS } from './suggestions.ts';
import { LOG_DAYS, MAX_LOG } from './tracker.ts';

/**
 * Every setting the admin panel can change (settings.ts). The defaults are the constants the code
 * used before (imported where they live, so they cannot drift apart); the rate limits were numbers
 * in app.ts and are written here as they were there.
 */

export const CATEGORIES: { id: SettingCategory; label: string; labelEn: string }[] = [
  { id: 'features', label: 'Funkcje', labelEn: 'Features' },
  { id: 'banner', label: 'Komunikat', labelEn: 'Announcement' },
  { id: 'chat', label: 'Czat', labelEn: 'Chat' },
  { id: 'media', label: 'Zdjęcia i klipy', labelEn: 'Pictures and clips' },
  { id: 'chatMedia', label: 'Multimedia w czatach', labelEn: 'Chat media' },
  { id: 'gifs', label: 'GIF-y i naklejki', labelEn: 'GIFs and stickers' },
  { id: 'cloud', label: 'Profile w chmurze', labelEn: 'Cloud profiles' },
  { id: 'clans', label: 'Klany', labelEn: 'Clans' },
  { id: 'groups', label: 'Grupy', labelEn: 'Groups' },
  { id: 'communities', label: 'Społeczności', labelEn: 'Communities' },
  { id: 'sparks', label: 'Osiągnięcia i Iskry', labelEn: 'Achievements and sparks' },
  { id: 'support', label: 'Wsparcie', labelEn: 'Support' },
  { id: 'profiles', label: 'Profile publiczne', labelEn: 'Public profiles' },
  { id: 'security', label: 'Bezpieczeństwo i limity', labelEn: 'Security and limits' },
  { id: 'storage', label: 'Przechowywanie', labelEn: 'Storage' },
  { id: 'moderation', label: 'Moderacja', labelEn: 'Moderation' },
  { id: 'streams', label: 'Streamy', labelEn: 'Streams' },
  { id: 'servers', label: 'Lista serwerów', labelEn: 'Server list' },
  { id: 'suggestions', label: 'Propozycje znajomych', labelEn: 'Friend suggestions' },
  { id: 'friendsPopular', label: 'Popularne wśród znajomych', labelEn: 'Popular among friends' },
  { id: 'push', label: 'Powiadomienia na telefon', labelEn: 'Phone notifications' },
];

const MB = 1024 * 1024;
type Def = Omit<SettingDef, 'category'>;
const group = (category: SettingCategory, defs: Def[]): SettingDef[] => defs.map((d) => ({ ...d, category }));
/** A per-minute rate limit (a token bucket per account or address). */
const rate = (key: string, label: string, labelEn: string, value: number, description: string, max = 10_000): Def =>
  ({ key, label, labelEn, description, type: 'int', default: value, min: 1, max, unit: '/min' });
const bytes = (key: string, label: string, labelEn: string, value: number, description: string, min: number, max: number, bytesUnit: 'MB' | 'KB' = 'MB'): Def =>
  ({ key, label, labelEn, description, type: 'bytes', default: value, min, max, bytesUnit });

export const SETTING_DEFS: SettingDef[] = [
  ...FEATURE_DEFS,
  ...RANK_SETTING_DEFS,
  ...BANNER_DEFS,

  ...group('chat', [
    { key: 'chat.burstMessages', label: 'Wiadomości pod rząd', labelEn: 'Messages in a row', description: 'Najwięcej wiadomości (i zdjęć) w jednej rozmowie w oknie poniżej; kolejna dostaje „zwolnij”.', type: 'int', default: BURST_LIMITS.messages, min: 1, max: 100 },
    { key: 'chat.burstSeconds', label: 'Okno wiadomości pod rząd', labelEn: 'Burst window', description: 'Długość okna, w którym liczą się wiadomości pod rząd.', type: 'duration', default: BURST_LIMITS.seconds, min: 1, max: 600, unit: 's' },
    { key: 'chat.burstStrikes', label: 'Ostrzeżenia do blokady', labelEn: 'Strikes before a hold', description: 'Ile razy w minucie można trafić na limit, zanim gracz dostanie krótką blokadę we wszystkich rozmowach.', type: 'int', default: BURST_LIMITS.strikes, min: 1, max: 50 },
    { key: 'chat.holdSeconds', label: 'Długość blokady', labelEn: 'Hold length', description: 'Jak długo gracz nie może pisać po przekroczeniu ostrzeżeń.', type: 'duration', default: BURST_LIMITS.muteSeconds, min: 0, max: 3600, unit: 's' },
    { key: 'chat.editWindowMinutes', label: 'Czas na edycję wiadomości', labelEn: 'Edit window', description: 'Jak długo po wysłaniu autor może zmienić tekst (0: bez edycji). Klienci dostają tę wartość z historią.', type: 'duration', default: EDIT_WINDOW_MS / 60_000, min: 0, max: 1440, unit: 'min' },
    { key: 'chat.inviteMinutes', label: 'Ważność zaproszeń do gry', labelEn: 'Game invites last', description: 'Jak długo po wysłaniu zaproszenie „Dołącz” działa; potem launcher i gra pokazują „Zaproszenie wygasło”. Zaproszenia drużyny wygasają razem z drużyną. 0: nie wygasają.', type: 'duration', default: 30, min: 0, max: 10080, unit: 'min' },
    rate('chat.messagesPerMinute', 'Wiadomości na minutę', 'Messages per minute', 40, 'Na konto, we wszystkich rozmowach razem (prywatne, grupy, społeczności).'),
    rate('chat.editsPerMinute', 'Edycje i usunięcia na minutę', 'Edits and deletions per minute', 30, 'Na konto.'),
    rate('chat.friendRequestsPerMinute', 'Zaproszenia do znajomych na minutę', 'Friend requests per minute', 15, 'Na konto.'),
  ]),

  ...group('media', [
    bytes('media.imageBytes', 'Największy zrzut ekranu', 'Largest screenshot', MEDIA_LIMITS.imageBytes, 'Linki do zrzutów (PNG, JPEG).', 64 * 1024, 200 * MB),
    bytes('media.clipBytes', 'Największy klip', 'Largest clip', MEDIA_LIMITS.clipBytes, 'Klipy MJPEG (ok. 2 MB na sekundę).', 1 * MB, 2048 * MB),
    { key: 'media.days', label: 'Ważność linku', labelEn: 'Link lifetime', description: 'Ile dni działa nowy link (już wysłane mają swoją datę).', type: 'duration', default: MEDIA_LIMITS.days, min: 1, max: 3650, unit: 'dni' },
    { key: 'media.maxActive', label: 'Linków na gracza', labelEn: 'Links per player', description: 'Najwięcej aktywnych linków jednego gracza (wspierający mają więcej: mnożnik poziomu).', type: 'int', default: MEDIA_LIMITS.maxActive, min: 1, max: 100_000 },
    bytes('media.quotaBytes', 'Miejsce na gracza', 'Space per player', MEDIA_LIMITS.quotaBytes, 'Wszystkie zrzuty i klipy jednego gracza razem (wspierający: razy mnożnik).', 1 * MB, 1024 * 1024 * MB),
    rate('media.uploadsPerMinute', 'Wysyłanie zrzutów i klipów na minutę', 'Uploads per minute', 6, 'Na konto.'),
    rate('media.viewsPerMinute', 'Otwarcia linków na minutę', 'Link views per minute', 60, 'Na adres IP.'),
    bytes('chatImages.maxBytes', 'Największe zdjęcie w czacie', 'Largest chat picture', IMAGE_LIMITS.maxBytes, 'Zaszyfrowane zdjęcie w wiadomości.', 64 * 1024, 50 * MB),
    { key: 'chatImages.perDay', label: 'Zdjęć w czacie dziennie', labelEn: 'Chat pictures a day', description: 'Na konto.', type: 'int', default: IMAGE_LIMITS.perDay, min: 1, max: 10_000 },
    bytes('chatImages.bytesPerDay', 'Rozmiar zdjęć w czacie dziennie', 'Chat pictures\' size a day', IMAGE_LIMITS.bytesPerDay, 'Na konto.', 1 * MB, 100 * 1024 * MB),
    { key: 'chatImages.days', label: 'Przechowywanie zdjęć z czatu', labelEn: 'Chat pictures kept', description: 'Rozmowy prywatne: po tylu dniach zdjęcie znika z serwera (wiadomość zostaje). Grupy, klany i społeczności mają swoje w „Multimedia w czatach”.', type: 'duration', default: IMAGE_LIMITS.days, min: 1, max: 3650, unit: 'dni', risky: true },
    rate('chatImages.uploadsPerMinute', 'Wysyłanie zdjęć w czacie na minutę', 'Chat picture uploads per minute', 10, 'Na konto.'),
    rate('chatImages.downloadsPerMinute', 'Pobrania zdjęć z czatu na minutę', 'Chat picture downloads per minute', 120, 'Na konto.'),
  ]),

  ...group('cloud', [
    bytes('cloud.maxBytes', 'Największy profil w chmurze', 'Largest cloud profile', CLOUD_LIMITS.maxBytes, 'Jedna paczka profilu.', 1 * MB, 2048 * MB),
    { key: 'cloud.maxProfiles', label: 'Profili w chmurze na gracza', labelEn: 'Cloud profiles per player', description: 'Wspierający: razy mnożnik poziomu.', type: 'int', default: CLOUD_LIMITS.maxProfiles, min: 1, max: 10_000 },
    bytes('cloud.quotaBytes', 'Miejsce w chmurze na gracza', 'Cloud space per player', CLOUD_LIMITS.quotaBytes, 'Wszystkie profile jednego gracza razem (wspierający: razy mnożnik).', 1 * MB, 1024 * 1024 * MB),
    rate('cloud.uploadsPerMinute', 'Zapisy profili na minutę', 'Cloud saves per minute', 10, 'Na konto.'),
    rate('cloud.downloadsPerMinute', 'Pobrania profili na minutę', 'Cloud downloads per minute', 30, 'Na konto.'),
    bytes('shares.maxBytes', 'Największy profil udostępniony kodem', 'Largest shared profile', SHARE_LIMITS.maxBytes, 'Profile udostępniane kodem (8 znaków).', 1 * MB, 2048 * MB),
    { key: 'shares.days', label: 'Ważność kodu profilu', labelEn: 'Share code lifetime', description: 'Ile dni działa nowy kod.', type: 'duration', default: SHARE_LIMITS.days, min: 1, max: 3650, unit: 'dni' },
    { key: 'shares.maxActive', label: 'Kodów na gracza', labelEn: 'Codes per player', description: 'Najwięcej aktywnych kodów jednego gracza.', type: 'int', default: SHARE_LIMITS.maxActive, min: 1, max: 10_000 },
    bytes('shares.quotaBytes', 'Miejsce na kody na gracza', 'Share space per player', SHARE_LIMITS.quotaBytes, 'Wszystkie udostępnione profile jednego gracza razem.', 1 * MB, 1024 * 1024 * MB),
    rate('shares.uploadsPerMinute', 'Udostępnienia profili na minutę', 'Shares per minute', 6, 'Na konto.'),
    rate('shares.downloadsPerMinute', 'Pobrania profili z kodu na minutę', 'Share downloads per minute', 30, 'Na adres IP.'),
  ]),

  ...group('clans', [
    { key: 'clans.maxMembers', label: 'Członków klanu', labelEn: 'Clan members', description: 'Najwięcej osób w klanie (czat klanu jest szyfrowany dla każdego, więc najwyżej 50).', type: 'int', default: CLAN_LIMITS.members, min: 2, max: CLAN_LIMITS.members },
    { key: 'clans.maxInvites', label: 'Oczekujących zaproszeń', labelEn: 'Pending invites', description: 'Ile zaproszeń klan może mieć wysłanych naraz.', type: 'int', default: CLAN_LIMITS.invites, min: 1, max: 1000 },
    { key: 'clans.nameMax', label: 'Najdłuższa nazwa klanu', labelEn: 'Longest clan name', description: 'Znaki (najmniej 3). Istniejące nazwy zostają.', type: 'int', default: CLAN_LIMITS.nameMax, min: 3, max: 64 },
    bytes('clans.logoBytes', 'Największe logo (klany i społeczności)', 'Largest logo (clans and communities)', MAX_LOGO_BYTES, 'PNG 64×64.', 1024, 256 * 1024, 'KB'),
    rate('clans.logosPerMinute', 'Wysyłanie logo na minutę', 'Logo uploads per minute', 6, 'Na konto (klany).'),
  ]),

  ...group('groups', [
    { key: 'groups.size', label: 'Osób w grupie', labelEn: 'Group members', description: 'Razem z twórcą. Launcher zakłada najwyżej 16 (wiadomości są szyfrowane dla każdego), więc można tylko zmniejszyć.', type: 'int', default: GROUP_LIMITS.size, min: 2, max: GROUP_LIMITS.size },
    { key: 'groups.maxGroups', label: 'Grup na gracza', labelEn: 'Groups per player', description: 'W ilu grupach (bez czatu klanu) gracz może być.', type: 'int', default: GROUP_LIMITS.maxGroups, min: 1, max: 1000 },
    rate('groups.changesPerMinute', 'Zmiany w grupach i klanach na minutę', 'Group and clan changes per minute', 20, 'Tworzenie, dodawanie, usuwanie osób, zmiany nazw (grupy i klany razem).'),
  ]),

  ...group('communities', [
    { key: 'communities.members', label: 'Członków społeczności', labelEn: 'Community members', description: 'Razem z właścicielem.', type: 'int', default: COMMUNITY_LIMITS.members, min: 2, max: 1_000_000 },
    { key: 'communities.perPlayer', label: 'Społeczności na gracza', labelEn: 'Communities per player', description: 'W ilu społecznościach gracz może być.', type: 'int', default: COMMUNITY_LIMITS.perPlayer, min: 1, max: 1000 },
    { key: 'communities.owned', label: 'Własnych społeczności', labelEn: 'Owned communities', description: 'Ile społeczności gracz może założyć.', type: 'int', default: COMMUNITY_LIMITS.owned, min: 0, max: 1000 },
    { key: 'communities.invites', label: 'Oczekujących zaproszeń', labelEn: 'Pending invites', description: 'Na społeczność.', type: 'int', default: COMMUNITY_LIMITS.invites, min: 1, max: 100_000 },
    { key: 'communities.requests', label: 'Oczekujących próśb o dołączenie', labelEn: 'Pending join requests', description: 'Na społeczność.', type: 'int', default: COMMUNITY_LIMITS.requests, min: 1, max: 100_000 },
    { key: 'communities.nameMin', label: 'Najkrótsza nazwa', labelEn: 'Shortest name', description: 'Znaki.', type: 'int', default: COMMUNITY_LIMITS.nameMin, min: 1, max: 40 },
    { key: 'communities.nameMax', label: 'Najdłuższa nazwa', labelEn: 'Longest name', description: 'Znaki. Istniejące nazwy zostają.', type: 'int', default: COMMUNITY_LIMITS.nameMax, min: 3, max: 100 },
    { key: 'communities.description', label: 'Najdłuższy opis', labelEn: 'Longest description', description: 'Znaki.', type: 'int', default: COMMUNITY_LIMITS.description, min: 0, max: 5000 },
    { key: 'communities.message', label: 'Najdłuższa wiadomość', labelEn: 'Longest message', description: 'Znaki, w czacie społeczności (nieszyfrowanym).', type: 'int', default: COMMUNITY_LIMITS.message, min: 1, max: 10_000 },
    { key: 'communities.muteMinutes', label: 'Najdłuższe wyciszenie', labelEn: 'Longest mute', description: 'Moderatorzy społeczności nie wyciszą na dłużej.', type: 'duration', default: COMMUNITY_LIMITS.muteMinutes, min: 1, max: 525_600, unit: 'min' },
    { key: 'communities.mentions', label: 'Wzmianek w wiadomości', labelEn: 'Mentions per message', description: 'Ile @nicków z jednej wiadomości dostaje powiadomienie.', type: 'int', default: COMMUNITY_LIMITS.mentions, min: 0, max: 100 },
    { key: 'communities.reactions', label: 'Różnych reakcji pod wiadomością', labelEn: 'Different reactions per message', description: 'Ile różnych emoji może być pod jedną wiadomością (każdy członek może dodać każde z nich).', type: 'int', default: COMMUNITY_LIMITS.reactions, min: 1, max: 60 },
    { key: 'communities.pins', label: 'Przypiętych wiadomości w kanale', labelEn: 'Pinned messages per channel', description: 'Moderatorzy nie przypną więcej, dopóki któraś nie zostanie odpięta.', type: 'int', default: COMMUNITY_LIMITS.pins, min: 1, max: 1000 },
    { key: 'communities.channels', label: 'Kanałów w społeczności', labelEn: 'Channels per community', description: 'Razem z dwoma wbudowanymi (Ogólny, Ogłoszenia).', type: 'int', default: COMMUNITY_LIMITS.channels, min: 2, max: 200 },
    { key: 'communities.roles', label: 'Własnych ról w społeczności', labelEn: 'Custom roles per community', description: 'Poza wbudowanymi (założyciel, administrator, moderator, członek).', type: 'int', default: COMMUNITY_LIMITS.roles, min: 0, max: 100 },
    rate('communities.createPerMinute', 'Zakładanie społeczności na minutę', 'Communities created per minute', 3, 'Na konto.'),
    rate('communities.joinPerMinute', 'Dołączanie na minutę', 'Joins per minute', 20, 'Na konto.'),
    rate('communities.changesPerMinute', 'Zmiany w społecznościach na minutę', 'Community changes per minute', 60, 'Na konto (role, zaproszenia, ustawienia).'),
    rate('communities.logosPerMinute', 'Wysyłanie logo społeczności na minutę', 'Community logo uploads per minute', 6, 'Na konto.'),
    rate('communities.reportsPerMinute', 'Zgłoszenia wiadomości na minutę', 'Message reports per minute', 10, 'Na konto.'),
    rate('communities.reactionsPerMinute', 'Reakcje na minutę', 'Reactions per minute', 60, 'Na konto: dodanie lub zdjęcie reakcji pod wiadomością społeczności.'),
    rate('communities.linkLookupsPerMinute', 'Sprawdzanie linków zaproszeń na minutę', 'Invite link lookups per minute', 20, 'Na konto w launcherze i na adres na stronie zaproszenia (kodów nie da się zgadywać).'),

  ]),

  // pictures in communities' chats (communityMedia.ts): not encrypted, kept on the server as JPEG
  ...group('chatMedia', [
    bytes('communities.imageBytes', 'Największe zdjęcie w społeczności', 'Largest community picture', COMMUNITY_MEDIA_LIMITS.imageBytes, 'JPEG bez metadanych (launcher zmniejsza zrzuty do 1920 px).', 64 * 1024, 50 * MB),
    { key: 'communities.imagesPerDay', label: 'Zdjęć w społecznościach dziennie', labelEn: 'Community pictures a day', description: 'Na konto, we wszystkich społecznościach razem.', type: 'int', default: COMMUNITY_MEDIA_LIMITS.imagesPerDay, min: 0, max: 10_000 },
    { key: 'communities.imageDays', label: 'Przechowywanie zdjęć ze społeczności', labelEn: 'Community pictures kept', description: 'Po tylu dniach zdjęcie znika z serwera (wiadomość zostaje z napisem, że wygasło).', type: 'duration', default: COMMUNITY_MEDIA_LIMITS.imageDays, min: 1, max: 3650, unit: 'dni', risky: true },
  ]),

  // limits of pictures in group, clan and community chats: each chat's store, keeping time, size and pictures per member a day (chatMediaLimits.ts)
  ...group('chatMedia', chatMediaSettingDefs()),
  // GIFs and stickers from GIPHY or Tenor (gifs.ts)
  ...GIF_SETTING_DEFS,

  ...group('sparks', [
    { key: 'sparks.messagesPerDay', label: 'Wiadomości liczone dziennie', labelEn: 'Messages counted a day', description: 'Do osiągnięć za wiadomości liczy się najwyżej tyle wiadomości dziennie (UTC).', type: 'int', default: COUNTED_PER_DAY, min: 0, max: 10_000 },
  ]),
  ...CHALLENGE_SETTING_DEFS,

  ...group('support', [
    { key: 'support.refundWindowDays', label: 'Okno na zwrot', labelEn: 'Refund window', description: 'Ile dni po płatności gracz sam może poprosić o zwrot. Regulamin obiecuje 14 dni (prawo konsumenta), więc nie mniej.', type: 'duration', default: REFUND_WINDOW_DAYS, min: 14, max: 365, unit: 'dni', risky: true },
    { key: 'support.refundsPerDay', label: 'Próśb o zwrot dziennie', labelEn: 'Refund requests a day', description: 'Na konto.', type: 'int', default: REFUNDS_PER_DAY, min: 1, max: 100 },
    rate('support.checkoutsPerMinute', 'Rozpoczęte płatności na minutę', 'Checkouts per minute', 6, 'Na konto i na adres IP.'),
    rate('support.refundsPerMinute', 'Prośby o zwrot na minutę', 'Refund requests per minute', 4, 'Na konto.'),
  ]),

  ...group('profiles', [
    rate('profiles.viewsPerMinute', 'Wyświetlenia profili na minutę', 'Profile views per minute', 120, 'Strony /u/<nick>, ich obrazki i publiczne strony społeczności, na adres IP.'),
    { key: 'profiles.defaultVisibility', label: 'Domyślna widoczność profilu', labelEn: 'Default profile visibility', description: 'Dla graczy, którzy nie wybrali sami (public: wszyscy, friends: znajomi, private: nikt). Zmienia też istniejące profile bez własnego wyboru.', type: 'enum', options: [...VISIBILITIES], default: DEFAULT_PRIVACY.visibility, risky: true },
    { key: 'profiles.defaultIndexable', label: 'Domyślnie w wyszukiwarkach', labelEn: 'Indexed by default', description: 'Czy profil bez własnego wyboru może trafić do Google (sitemap). Zmienia też istniejące profile bez własnego wyboru.', type: 'bool', default: DEFAULT_PRIVACY.indexable, risky: true },
  ]),

  ...group('security', [
    rate('security.loginsPerMinute', 'Logowania na minutę', 'Sign-ins per minute', 10, 'Na adres IP.', 1000),
    { key: 'security.sessionIdleDays', label: 'Wylogowanie po bezczynności', labelEn: 'Sign-out after idle', description: 'Sesja nieużywana tyle dni wygasa.', type: 'duration', default: 90, min: 1, max: 3650, unit: 'dni', risky: true },
    rate('security.gamePerMinute', 'Zapytania gry na minutę', 'Game requests per minute', 30, 'Logo SlashClient w grze (heartbeat, lookup, link), na adres IP.'),
    rate('security.emotesPerMinute', 'Emotki na minutę', 'Emotes per minute', 20, 'Na konto.'),
    { key: 'security.sprayGapSeconds', label: 'Odstęp między sprayami', labelEn: 'Gap between sprays', description: 'Najkrótszy odstęp między sprayami jednego konta.', type: 'duration', default: 3, min: 0, max: 3600, unit: 's' },
    rate('security.spraysPerMinute', 'Spraye na minutę', 'Sprays per minute', 20, 'Na konto.'),
    rate('security.reportsPerMinute', 'Zgłoszenia błędów i logi na minutę', 'Bug reports and logs per minute', 6, 'Na adres IP.'),
    rate('security.waypointsPerMinute', 'Udostępnione punkty na minutę', 'Waypoints shared per minute', 20, 'Na konto.'),
    rate('security.partiesPerMinute', 'Drużyny na minutę', 'Parties per minute', 6, 'Na konto.'),
    rate('security.positionsPerMinute', 'Pozycje dla znajomych na minutę', 'Positions for friends per minute', 40, 'Na konto (gra wysyła co 2 s, gdy gracz udostępnia pozycję; co najmniej 1,5 s odstępu).'),
    rate('security.curseforgePerMinute', 'Zapytania CurseForge na minutę', 'CurseForge requests per minute', 240, 'Na adres IP (wyszukiwanie i instalowanie modpacków przez klucz serwera).', 100_000),
  ]),

  ...group('storage', [
    { key: 'storage.minFreeMb', label: 'Wolne miejsce na dysku serwera', labelEn: 'Free space kept on the server\'s disk', description: 'Poniżej tego dysk serwera nie przyjmuje nowych plików (idą do innych magazynów).', type: 'int', default: DEFAULT_MIN_FREE / MB, min: 0, max: 10_000_000, unit: 'MB', env: 'STORAGE_MIN_FREE_MB' },
    { key: 'logs.days', label: 'Przechowywanie logów (/logi)', labelEn: 'Logs kept (/logi)', description: 'Ile dni działa link do logu udostępnionego z launchera.', type: 'duration', default: LOG_DAYS, min: 1, max: 3650, unit: 'dni' },
    bytes('logs.maxBytes', 'Największy log', 'Largest log', MAX_LOG, 'Log wysyłany z launchera.', 64 * 1024, 64 * MB),
  ]),

  ...group('moderation', [
    { key: 'moderation.blockedWords', label: 'Zakazane słowa', labelEn: 'Blocked words', description: 'Nie mogą wystąpić w tagu ani nazwie klanu i społeczności, ani w opisie społeczności (także z cyframi zamiast liter, bez polskich znaków). Jedno na linię, małymi literami.', type: 'list', default: [...BLOCKED_WORDS], lower: true, maxItems: 1000, maxLength: 40 },
    { key: 'moderation.blockedTags', label: 'Zakazane całe tagi', labelEn: 'Blocked whole tags', description: 'Krótkie, które są w porządku w środku słowa, ale nie jako cały tag. Jedno na linię.', type: 'list', default: [...BLOCKED_TAGS], lower: true, maxItems: 1000, maxLength: 6 },
  ]),

  ...STREAM_SETTING_DEFS,

  // friend suggestions from players met recently (suggestions.ts)
  ...SUGGESTION_SETTING_DEFS,
  // mods, packs, shaders and servers the friends use (friendsPopular.ts)
  ...POPULAR_SETTING_DEFS,
  // notifications on the phone app (push.ts)
  ...PUSH_SETTING_DEFS,

  // voting from the launcher's "Serwery" (serverVotes.ts): the list's API trusts this server's key
  ...group('servers', [
    { key: 'serverList.apiUrl', label: 'Adres API listy serwerów', labelEn: 'Server list API address', description: 'Skąd launcher bierze listę serwerów (api.slash3rss.dev); tam serwer wysyła głosy graczy.', type: 'url', default: 'https://api.slash3rss.dev', maxLength: 200 },
    { key: 'serverList.voteKey', label: 'Klucz głosowania z launchera', labelEn: 'Launcher voting key', description: 'Ten sam co SLASHCLIENT_VOTE_KEY na serwerze listy. Z nim gracze z połączonym kontem Minecraft głosują jednym kliknięciem w launcherze (bez captchy; limity jak na stronie: raz na 24 h na nick i na adres IP). Pusty: launcher otwiera stronę serwera na liście.', type: 'secret', default: '', maxLength: 200 },
    rate('security.serverVotesPerMinute', 'Głosy na serwery na minutę', 'Server votes per minute', 10, 'Na konto (głosowanie z launchera).'),
    rate('security.serverVoteChecksPerMinute', 'Sprawdzanie głosów na minutę', 'Vote checks per minute', 60, 'Na konto albo adres IP („Zagłosowano dziś” na liście serwerów w launcherze).'),
    // partner servers' animated icons (partnerIcons.ts): turned into one PNG strip on upload
    bytes('partners.iconBytes', 'Największa animowana ikona', 'Largest animated icon', ICON_SETTING_DEFAULTS.bytes, 'Plik GIF lub APNG wgrywany przez partnera albo admina jako ikona serwera.', 64 * 1024, 20 * MB),
    { key: 'partners.iconFrames', label: 'Klatki animowanej ikony', labelEn: 'Animated icon frames', description: 'Najwięcej klatek animowanej ikony serwera partnerskiego (dłuższe animacje są odrzucane).', type: 'int', default: ICON_SETTING_DEFAULTS.frames, min: 1, max: 128 },
    { key: 'partners.iconSide', label: 'Rozmiar animowanej ikony', labelEn: 'Animated icon size', description: 'Bok kwadratu, do którego serwer zmniejsza większe ikony (mniejszych nie powiększa). Gra rysuje ikonę 32×32.', type: 'int', default: ICON_SETTING_DEFAULTS.side, min: 16, max: 256, unit: 'px' },
    { key: 'partners.aliases', label: 'Alternatywne adresy partnera', labelEn: 'Partner alternative addresses', description: 'Najwięcej innych adresów (domen, IP) jednego serwera partnerskiego, pod którymi gra też pokazuje go jako partnera.', type: 'int', default: ALIASES_DEFAULT, min: 1, max: 100 },
  ]),
];
