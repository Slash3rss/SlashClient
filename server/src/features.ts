import { createHash } from 'node:crypto';
import type { SettingDef, Settings } from './settings.ts';

/**
 * Parts of SlashClient an admin can switch off for a while from the panel (Ustawienia → Funkcje),
 * and the announcement banner shown on the website and in the launcher.
 *
 * A switched-off feature's endpoints answer 503 { error: 'feature_disabled', feature } (pages: a
 * short HTML page saying so); clients read GET /v1/features to grey out or hide the feature, and are
 * told over the WebSocket ({ type: 'features' }) when it changes. What players already have stays
 * theirs: switching off screenshots' links or cloud profiles stops new uploads, while their links,
 * lists and deleting keep working; payments already made (webhooks, refunds) are never refused.
 */

export const FEATURES = [
  { id: 'shop', label: 'Sklep (Iskry)', labelEn: 'Shop (sparks)', description: 'Kupowanie kosmetyków za Iskry. Saldo i osiągnięcia działają dalej.' },
  { id: 'support', label: 'Wsparcie projektu i płatności', labelEn: 'Supporting the project (payments)', description: 'Nowe płatności (Stripe, PayPal). Webhooki, zwroty i zarządzanie subskrypcją działają zawsze.' },
  { id: 'communities', label: 'Społeczności', labelEn: 'Communities', description: 'Wszystko w społecznościach: lista, czat, zarządzanie (panel admina działa).' },
  { id: 'clans', label: 'Klany', labelEn: 'Clans', description: 'Zarządzanie klanami i czat klanu. Tagi i logo przy nickach w grze zostają.' },
  { id: 'groups', label: 'Czaty grupowe', labelEn: 'Group chats', description: 'Tworzenie grup i pisanie w nich (czat klanu zależy od przełącznika „Klany”).' },
  { id: 'media', label: 'Linki do zrzutów i klipów', labelEn: 'Screenshot and clip links', description: 'Nowe linki. Istniejące linki działają, gracze mogą je usuwać.' },
  { id: 'cloud', label: 'Profile w chmurze', labelEn: 'Cloud profiles', description: 'Zapisywanie profili na koncie. Pobieranie i usuwanie zapisanych działa.' },
  { id: 'profiles', label: 'Publiczne profile graczy', labelEn: 'Public player profiles', description: 'Strony /u/<nick> i ich obrazki; ustawienia prywatności można dalej zmieniać.' },
  { id: 'sprays', label: 'Spraye', labelEn: 'Sprays', description: 'Wysyłanie sprayów w grze do innych graczy.' },
  { id: 'chatImages', label: 'Zdjęcia w czacie', labelEn: 'Pictures in the chat', description: 'Wysyłanie nowych zdjęć w wiadomościach. Wysłane można dalej oglądać.' },
  { id: 'streams', label: 'Streamy (Twitch i Kick)', labelEn: 'Streams (Twitch and Kick)', description: 'Łączenie kanałów, znaczek LIVE u znajomych, powiadomienia i transmisja na profilu. Połączone kanały zostają.' },
  { id: 'registration', label: 'Rejestracja nowych kont', labelEn: 'New accounts', description: 'Zakładanie kont przez nowych graczy. Istniejące konta logują się normalnie.' },
  { id: 'betaUpdates', label: 'Kanał beta aktualizacji', labelEn: 'Beta update channel', description: 'Launchery z wybranym kanałem beta dostają bety (wydania z tagiem v…-beta.N). Wyłączony: wszyscy dostają tylko zwykłe wydania, a wybór kanału znika z ustawień launchera.' },
  { id: 'seasonal', label: 'Wygląd sezonowy', labelEn: 'Seasonal look', description: 'Halloweenowy wygląd launchera od 25 października do 2 listopada (gracze mogą go też wyłączyć sami w Ustawieniach).' },
] as const;
export type FeatureId = (typeof FEATURES)[number]['id'];
export const FEATURE_IDS: FeatureId[] = FEATURES.map((f) => f.id);

export const featureKey = (id: FeatureId) => `feature.${id}`;

export const FEATURE_DEFS: SettingDef[] = FEATURES.map((f) => ({
  key: featureKey(f.id), category: 'features', label: f.label, labelEn: f.labelEn, description: f.description, type: 'bool', default: true, risky: true,
}));

export const BANNER_DEFS: SettingDef[] = [
  { key: 'banner.enabled', category: 'banner', label: 'Pokazuj komunikat', labelEn: 'Show the banner', description: 'Pasek z komunikatem na stronie i w launcherze (np. przerwa techniczna).', type: 'bool', default: false },
  { key: 'banner.text', category: 'banner', label: 'Treść (polski)', labelEn: 'Text (Polish)', description: 'Jedno lub dwa zdania.', type: 'string', default: '', maxLength: 300 },
  { key: 'banner.textEn', category: 'banner', label: 'Treść (angielski)', labelEn: 'Text (English)', description: 'Pusta: angielskojęzyczni gracze widzą polską.', type: 'string', default: '', maxLength: 300 },
  { key: 'banner.level', category: 'banner', label: 'Rodzaj', labelEn: 'Level', description: 'info: niebieski, warning: pomarańczowy.', type: 'enum', options: ['info', 'warning'], default: 'info' },
  { key: 'banner.link', category: 'banner', label: 'Link (opcjonalny)', labelEn: 'Link (optional)', description: 'https://… albo ścieżka na stronie, np. /wsparcie.', type: 'url', default: '', maxLength: 300 },
  { key: 'banner.start', category: 'banner', label: 'Od', labelEn: 'From', description: 'Puste: od razu.', type: 'datetime', default: 0, min: 0 },
  { key: 'banner.end', category: 'banner', label: 'Do', labelEn: 'Until', description: 'Puste: aż do wyłączenia.', type: 'datetime', default: 0, min: 0 },
];

export interface Banner { id: string; text: string; textEn: string; level: 'info' | 'warning'; link: string; start: number; end: number }

/** The banner as clients show it, or null when it is off, empty or outside its time. `id` changes with its text (a dismissed one comes back when edited). */
export function bannerOf(settings: Settings, now = Date.now()): Banner | null {
  if (!settings.bool('banner.enabled')) return null;
  const text = settings.str('banner.text');
  const textEn = settings.str('banner.textEn');
  if (!text && !textEn) return null;
  const start = settings.num('banner.start');
  const end = settings.num('banner.end');
  if ((start && now < start) || (end && now >= end)) return null;
  const level = settings.str('banner.level') === 'warning' ? 'warning' : 'info';
  const link = settings.str('banner.link');
  const id = createHash('sha256').update(JSON.stringify([text, textEn, level, link, start])).digest('hex').slice(0, 12);
  return { id, text: text || textEn, textEn: textEn || text, level, link, start, end };
}

export const featuresOf = (settings: Settings): Record<FeatureId, boolean> =>
  Object.fromEntries(FEATURE_IDS.map((id) => [id, settings.bool(featureKey(id))])) as Record<FeatureId, boolean>;

/**
 * The switches a request needs (none for most). `groupClan`: the clan of a group chat ('' for a
 * plain group, undefined when there is no such group), so a clan's chat follows "Klany".
 */
export function featuresFor(method: string, path: string, groupClan: (id: string) => string | undefined): FeatureId[] {
  // the admin panel is never switched off; logos stay (they show next to names in game)
  if (path.startsWith('/v1/admin/') || /\/logo\.png$/.test(path)) return [];
  const out: FeatureId[] = [];
  if (method === 'POST' && /^\/v1\/shop\/\w+\/buy$/.test(path)) out.push('shop');
  if (method === 'POST' && path === '/v1/support/checkout') out.push('support');
  if (/^\/v1\/(public\/)?communities(\/|$)/.test(path)) out.push('communities');
  if (/^\/v1\/clans(\/|$)/.test(path)) out.push('clans');
  if (method === 'POST' && path === '/v1/groups') out.push('groups');
  const group = /^\/v1\/groups\/([\w-]{1,64})(\/|$)/.exec(path);
  if (group) {
    const clan = groupClan(group[1]);
    if (clan) out.push('clans');
    else if (clan === '') out.push('groups');
  }
  if (method === 'POST' && path === '/v1/media') out.push('media');
  if (method === 'PUT' && /^\/v1\/cloud-profiles\/[\w-]+$/.test(path)) out.push('cloud');
  if (method === 'GET' && (/^\/(u|gracz|profil|player)\/[^/]+\/?$/.test(path) || /^\/v1\/profiles\/[^/]+(\/(head|skin))?$/.test(path) || path === '/sitemap-profiles.xml')) out.push('profiles');
  if (method === 'POST' && path === '/v1/mc/spray') out.push('sprays');
  // linking a Twitch or Kick channel (the platforms' webhooks and the admin panel are never switched off)
  if (/^\/v1\/me\/streams(\/|$)/.test(path) || /^\/v1\/streams\/(twitch|kick)\/callback$/.test(path)) out.push('streams');
  // a picture to a friend or to a group
  if (method === 'POST' && (/^\/v1\/images\/[\w-]+$/.test(path) || /^\/v1\/groups\/[\w-]+\/images$/.test(path))) out.push('chatImages');
  // and to a community's channel (server 0.9.30+)
  if (method === 'POST' && /^\/v1\/communities\/[\w-]+\/channels\/[\w-]+\/images$/.test(path)) out.push('chatImages');
  return out;
}
