import type http from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { item, type Slot } from './cosmetics.ts';
import { inTransaction, type Wallet } from './economy.ts';
import { MessageCounter } from './chatLimits.ts';

/**
 * SlashClient achievements ("Osiągnięcia"): play time and streaks, friends and messages, servers,
 * group chats and clans, things shared, cosmetics worn and bought, and a few hidden ones. Each pays
 * sparks once, when it unlocks (economy.ts); some also give a cosmetic that can only be earned (a
 * cape), stored as a grant like the ones the admin gives, so wearing it goes through the usual
 * checks (cosmetics.ts: items with `achievement` need the grant).
 *
 * Everything counted is what this server sees or checks itself, never a number a client sends (the
 * sparks would make cheating worth it): play time from its own ticks, friends from its tables,
 * messages as they are sent (chatLimits.ts: real conversations only, 30 a day at most), shared
 * screenshots, profiles, waypoints, parties and sprays from requests it accepted.
 *
 * Play time: every minute (`tick`) each account whose launcher is connected (WebSocket answering
 * pings), whose game reported in the last minutes (/v1/mc/link, which the launcher sends every 4
 * minutes while the game runs) and which is in a world (singleplayer or on a server, not the menu)
 * gets the time since the previous tick, at most two ticks' worth, and once per account however many
 * launchers it has open. A day counts (for the streak, days played, weekends) with at least 10
 * minutes; at most 12 hours a day count at all. The same time also goes to the server the player
 * was on for the whole tick (play_server_days, per server key and day, kept since 0.9.24), for the
 * achievements of one server (`server_*` groups: hours there, days with 10 minutes there); a
 * server named in them counts with its subdomains.
 *
 * Days are UTC days (00:00 UTC, 1–2 a.m. in Poland): the same for every player and every server
 * restart, with no time zone a client could pick to stretch a day.
 *
 * Counts that can shrink (screenshots and profiles expire, parties live in memory) are kept as
 * counters that only grow; where the data was there before the counters (screenshots, profiles,
 * the cloud), the counter starts from it, so players who did it before get the achievement too.
 */

/** What an achievement's number measures. */
export type Group = 'streak' | 'hours' | 'friends' | 'messages' | 'servers'
  | 'days' | 'longday' | 'weekends' | 'anniversary' | 'night' | 'newyear' | 'halloween' | 'friday13'
  | 'groups_joined' | 'groups_created' | 'group_size' | 'clan_joined' | 'clan_founded' | 'clan_size'
  | 'community_joined' | 'community_founded' | 'community_size'
  | 'waypoints' | 'parties_created' | 'parties_joined' | 'media' | 'shares' | 'cloud'
  | 'sprays' | 'worn' | 'bought' | 'spent'
  /** On one server (`server`: its address and its subdomains): hours, days with 10+ minutes, been there at all. */
  | 'server_hours' | 'server_days' | 'server_visit'
  /** Given by an admin by hand (achievements made in the admin panel), never counted. */
  | 'manual';

/** Where the pages put it. */
export type Category = 'play' | 'streak' | 'social' | 'community' | 'explore' | 'skyup' | 'sharing' | 'style' | 'secret';
/** In the pages' order ('skyup': the partner server SkyUp.pl; launchers before 0.9.24 show it as "Other"). */
export const CATEGORIES: Category[] = ['play', 'streak', 'social', 'community', 'explore', 'skyup', 'sharing', 'style', 'secret'];

export interface Achievement {
  id: string;
  group: Group;
  category: Category;
  /** What the group's number must reach: days, hours, friends, messages, servers… */
  goal: number;
  /** Sparks paid once, when it unlocks (by how hard it is). */
  sparks: number;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  /** Shown as "???" until it unlocks. */
  hidden?: boolean;
  /** The cosmetic it unlocks (cosmetics.ts item with `achievement` set to this id, or any item the admin picked). */
  reward?: string;
  /** Its icon (Font Awesome, one of ICONS); without it the group's (DEFAULT_ICONS). */
  icon?: string;
  /** False: switched off in the admin panel, nobody gets it any more (who has it keeps it). */
  enabled?: boolean;
  /** Made in the admin panel (achievementsAdmin.ts), not in this file. */
  custom?: boolean;
  /** The server a `server_*` group counts on (a server key, see `serverRule`): that address and its subdomains. */
  server?: string;
}

type Def = Omit<Achievement, 'category'>;
/** Said with the achievements of time on one server: that time was not recorded before them. */
const SINCE = ' Liczy się czas od wprowadzenia tych osiągnięć.';
const SINCE_EN = ' Time counts from when these achievements were added.';
const of = (category: Category, list: Def[]): Achievement[] => list.map((a) => ({ ...a, category }));

export const ACHIEVEMENTS: Achievement[] = [
  ...of('play', [
    { id: 'hours_1', group: 'hours', goal: 1, sparks: 10, name: 'Pierwsza godzina', nameEn: 'First hour', description: 'Zagraj godzinę ze SlashClient.', descriptionEn: 'Play one hour with SlashClient.' },
    { id: 'hours_10', group: 'hours', goal: 10, sparks: 40, name: 'Rozgrzewka', nameEn: 'Warming up', description: 'Zagraj 10 godzin ze SlashClient.', descriptionEn: 'Play 10 hours with SlashClient.' },
    { id: 'hours_50', group: 'hours', goal: 50, sparks: 100, name: 'Stały bywalec', nameEn: 'Regular', description: 'Zagraj 50 godzin ze SlashClient.', descriptionEn: 'Play 50 hours with SlashClient.' },
    { id: 'hours_100', group: 'hours', goal: 100, sparks: 200, name: 'Weteran', nameEn: 'Veteran', description: 'Zagraj 100 godzin ze SlashClient.', descriptionEn: 'Play 100 hours with SlashClient.', reward: 'veteran' },
    { id: 'hours_250', group: 'hours', goal: 250, sparks: 300, name: 'Zaprawiony w boju', nameEn: 'Battle-hardened', description: 'Zagraj 250 godzin ze SlashClient.', descriptionEn: 'Play 250 hours with SlashClient.' },
    { id: 'hours_500', group: 'hours', goal: 500, sparks: 500, name: 'Legenda', nameEn: 'Legend', description: 'Zagraj 500 godzin ze SlashClient.', descriptionEn: 'Play 500 hours with SlashClient.' },
    { id: 'hours_1000', group: 'hours', goal: 1000, sparks: 1000, name: 'Tysiąc godzin', nameEn: 'A thousand hours', description: 'Zagraj 1000 godzin ze SlashClient.', descriptionEn: 'Play 1000 hours with SlashClient.' },
    { id: 'days_30', group: 'days', goal: 30, sparks: 100, name: 'Miesiąc gry', nameEn: 'A month of play', description: 'Graj co najmniej 10 minut w 30 różnych dniach (nie muszą być pod rząd).', descriptionEn: 'Play at least 10 minutes on 30 different days (not necessarily in a row).' },
    { id: 'days_100', group: 'days', goal: 100, sparks: 250, name: 'Sto dni', nameEn: 'A hundred days', description: 'Graj co najmniej 10 minut w 100 różnych dniach.', descriptionEn: 'Play at least 10 minutes on 100 different days.' },
    { id: 'days_365', group: 'days', goal: 365, sparks: 600, name: 'Rok w grze', nameEn: 'A year in the game', description: 'Graj co najmniej 10 minut w 365 różnych dniach.', descriptionEn: 'Play at least 10 minutes on 365 different days.' },
    { id: 'longday_4', group: 'longday', goal: 4, sparks: 40, name: 'Długi dzień', nameEn: 'A long day', description: 'Zagraj 4 godziny w ciągu jednego dnia.', descriptionEn: 'Play 4 hours in one day.' },
    { id: 'weekend_1', group: 'weekends', goal: 1, sparks: 15, name: 'Weekendowy gracz', nameEn: 'Weekend player', description: 'Zagraj co najmniej 10 minut w sobotę lub niedzielę.', descriptionEn: 'Play at least 10 minutes on a Saturday or Sunday.' },
    { id: 'weekends_10', group: 'weekends', goal: 10, sparks: 120, name: 'Weekendowy wojownik', nameEn: 'Weekend warrior', description: 'Graj w 10 różnych weekendów.', descriptionEn: 'Play on 10 different weekends.' },
    { id: 'anniversary_1', group: 'anniversary', goal: 1, sparks: 300, name: 'Rocznica', nameEn: 'Anniversary', description: 'Zagraj, gdy Twoje konto SlashClient ma co najmniej rok.', descriptionEn: 'Play when your SlashClient account is at least a year old.' },
    { id: 'anniversary_2', group: 'anniversary', goal: 2, sparks: 500, name: 'Druga rocznica', nameEn: 'Second anniversary', description: 'Zagraj, gdy Twoje konto SlashClient ma co najmniej dwa lata.', descriptionEn: 'Play when your SlashClient account is at least two years old.' },
  ]),
  ...of('streak', [
    { id: 'streak_3', group: 'streak', goal: 3, sparks: 25, name: 'Trzy dni z rzędu', nameEn: 'Three in a row', description: 'Graj co najmniej 10 minut dziennie przez 3 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 3 days in a row.' },
    { id: 'streak_7', group: 'streak', goal: 7, sparks: 50, name: 'Tydzień z rzędu', nameEn: 'A week in a row', description: 'Graj co najmniej 10 minut dziennie przez 7 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 7 days in a row.' },
    { id: 'streak_14', group: 'streak', goal: 14, sparks: 100, name: 'Dwa tygodnie z rzędu', nameEn: 'Two weeks in a row', description: 'Graj co najmniej 10 minut dziennie przez 14 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 14 days in a row.' },
    { id: 'streak_30', group: 'streak', goal: 30, sparks: 200, name: 'Seria 30 dni', nameEn: '30-day streak', description: 'Graj co najmniej 10 minut dziennie przez 30 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 30 days in a row.', reward: 'streak30' },
    { id: 'streak_60', group: 'streak', goal: 60, sparks: 300, name: 'Seria 60 dni', nameEn: '60-day streak', description: 'Graj co najmniej 10 minut dziennie przez 60 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 60 days in a row.' },
    { id: 'streak_100', group: 'streak', goal: 100, sparks: 500, name: 'Seria 100 dni', nameEn: '100-day streak', description: 'Graj co najmniej 10 minut dziennie przez 100 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 100 days in a row.' },
    { id: 'streak_365', group: 'streak', goal: 365, sparks: 1000, name: 'Cały rok z rzędu', nameEn: 'A whole year in a row', description: 'Graj co najmniej 10 minut dziennie przez 365 dni z rzędu.', descriptionEn: 'Play at least 10 minutes a day for 365 days in a row.' },
  ]),
  ...of('social', [
    { id: 'friend_1', group: 'friends', goal: 1, sparks: 10, name: 'Pierwszy znajomy', nameEn: 'First friend', description: 'Dodaj pierwszego znajomego.', descriptionEn: 'Add your first friend.' },
    { id: 'friends_5', group: 'friends', goal: 5, sparks: 25, name: 'Piątka', nameEn: 'High five', description: 'Miej 5 znajomych.', descriptionEn: 'Have 5 friends.' },
    { id: 'friends_10', group: 'friends', goal: 10, sparks: 50, name: 'Paczka znajomych', nameEn: 'The squad', description: 'Miej 10 znajomych.', descriptionEn: 'Have 10 friends.' },
    { id: 'friends_25', group: 'friends', goal: 25, sparks: 100, name: 'Dusza towarzystwa', nameEn: 'Life of the party', description: 'Miej 25 znajomych.', descriptionEn: 'Have 25 friends.' },
    { id: 'friends_50', group: 'friends', goal: 50, sparks: 200, name: 'Wszyscy mnie znają', nameEn: 'Everyone knows me', description: 'Miej 50 znajomych.', descriptionEn: 'Have 50 friends.' },
    { id: 'message_1', group: 'messages', goal: 1, sparks: 5, name: 'Pierwsza wiadomość', nameEn: 'First message', description: 'Napisz do znajomego.', descriptionEn: 'Send a message to a friend.' },
    { id: 'messages_10', group: 'messages', goal: 10, sparks: 10, name: 'Pogaduszki', nameEn: 'Small talk', description: 'Wyślij 10 wiadomości (do znajomych lub w grupach).', descriptionEn: 'Send 10 messages (to friends or in groups).' },
    { id: 'messages_100', group: 'messages', goal: 100, sparks: 40, name: 'Gaduła', nameEn: 'Chatterbox', description: 'Wyślij 100 wiadomości (liczy się do 30 dziennie).', descriptionEn: 'Send 100 messages (up to 30 a day count).' },
    { id: 'messages_1000', group: 'messages', goal: 1000, sparks: 120, name: 'Nie da się mnie zatrzymać', nameEn: 'Unstoppable', description: 'Wyślij 1000 wiadomości (liczy się do 30 dziennie).', descriptionEn: 'Send 1000 messages (up to 30 a day count).' },
    { id: 'waypoint_1', group: 'waypoints', goal: 1, sparks: 10, name: 'Tu jestem!', nameEn: 'Over here!', description: 'Wyślij znajomemu punkt nawigacyjny.', descriptionEn: 'Send a waypoint to a friend.' },
    { id: 'waypoints_25', group: 'waypoints', goal: 25, sparks: 40, name: 'Kartograf', nameEn: 'Cartographer', description: 'Wyślij znajomym 25 punktów nawigacyjnych.', descriptionEn: 'Send 25 waypoints to friends.' },
    { id: 'party_create', group: 'parties_created', goal: 1, sparks: 15, name: 'Zbiórka!', nameEn: 'Assemble!', description: 'Zaproś znajomych do drużyny.', descriptionEn: 'Invite friends to a party.' },
    { id: 'party_join', group: 'parties_joined', goal: 1, sparks: 15, name: 'Dołączam', nameEn: 'Count me in', description: 'Przyjmij zaproszenie do drużyny.', descriptionEn: 'Accept a party invite.' },
  ]),
  ...of('community', [
    { id: 'group_join', group: 'groups_joined', goal: 1, sparks: 10, name: 'W grupie raźniej', nameEn: 'Better together', description: 'Bądź w czacie grupowym kogoś innego.', descriptionEn: 'Be in someone else\'s group chat.' },
    { id: 'group_create', group: 'groups_created', goal: 1, sparks: 15, name: 'Założyciel czatu', nameEn: 'Chat founder', description: 'Załóż czat grupowy.', descriptionEn: 'Start a group chat.' },
    { id: 'group_big', group: 'group_size', goal: 5, sparks: 40, name: 'Ekipa', nameEn: 'The crew', description: 'Bądź w czacie grupowym z co najmniej 5 osobami.', descriptionEn: 'Be in a group chat with at least 5 people.' },
    { id: 'clan_join', group: 'clan_joined', goal: 1, sparks: 20, name: 'Członek klanu', nameEn: 'Clan member', description: 'Bądź w klanie — własnym albo cudzym.', descriptionEn: 'Be in a clan — your own or someone else\'s.' },
    { id: 'clan_found', group: 'clan_founded', goal: 1, sparks: 30, name: 'Wódz', nameEn: 'Chieftain', description: 'Załóż klan albo przejmij go od założyciela.', descriptionEn: 'Found a clan or take one over from its founder.' },
    { id: 'clan_10', group: 'clan_size', goal: 10, sparks: 150, name: 'Potęga klanu', nameEn: 'Clan power', description: 'Bądź w klanie, który ma co najmniej 10 członków.', descriptionEn: 'Be in a clan with at least 10 members.' },
    // communities (communities.ts): looked at when one joins, founds, and when a community reaches a size
    { id: 'community_join', group: 'community_joined', goal: 1, sparks: 10, name: 'Część społeczności', nameEn: 'Part of the community', description: 'Dołącz do społeczności.', descriptionEn: 'Join a community.' },
    { id: 'community_found', group: 'community_founded', goal: 1, sparks: 25, name: 'Założyciel społeczności', nameEn: 'Community founder', description: 'Załóż społeczność.', descriptionEn: 'Found a community.' },
    { id: 'community_50', group: 'community_size', goal: 50, sparks: 75, name: 'Rosnąca społeczność', nameEn: 'Growing community', description: 'Bądź w społeczności, która ma co najmniej 50 członków.', descriptionEn: 'Be in a community with at least 50 members.' },
    { id: 'community_250', group: 'community_size', goal: 250, sparks: 150, name: 'Wielka społeczność', nameEn: 'Big community', description: 'Bądź w społeczności, która ma co najmniej 250 członków.', descriptionEn: 'Be in a community with at least 250 members.' },
  ]),
  ...of('explore', [
    { id: 'servers_5', group: 'servers', goal: 5, sparks: 30, name: 'Podróżnik', nameEn: 'Traveller', description: 'Zagraj na 5 różnych serwerach.', descriptionEn: 'Play on 5 different servers.' },
    { id: 'servers_10', group: 'servers', goal: 10, sparks: 50, name: 'Turysta', nameEn: 'Tourist', description: 'Zagraj na 10 różnych serwerach.', descriptionEn: 'Play on 10 different servers.' },
    { id: 'servers_20', group: 'servers', goal: 20, sparks: 80, name: 'Obieżyświat', nameEn: 'Globetrotter', description: 'Zagraj na 20 różnych serwerach.', descriptionEn: 'Play on 20 different servers.' },
    { id: 'servers_50', group: 'servers', goal: 50, sparks: 200, name: 'Odkrywca', nameEn: 'Explorer', description: 'Zagraj na 50 różnych serwerach.', descriptionEn: 'Play on 50 different servers.' },
  ]),
  // the partner server SkyUp.pl (and its subdomains); time there is recorded from the version that brought these (0.9.24) on,
  // the visit also from before (play_servers); the rewards are its capes (cosmetics.ts, earned only here)
  ...of('skyup', [
    { id: 'skyup_visit', group: 'server_visit', server: 'skyup.pl', goal: 1, sparks: 10, icon: 'fa-plane-arrival', name: 'Witaj na SkyUp', nameEn: 'Welcome to SkyUp', description: 'Zagraj na serwerze SkyUp.pl.', descriptionEn: 'Play on the SkyUp.pl server.' },
    { id: 'skyup_1h', group: 'server_hours', server: 'skyup.pl', goal: 1, sparks: 20, icon: 'fa-seedling', reward: 'skyup_niebo', name: 'Pierwsza wyspa', nameEn: 'First island', description: `Spędź godzinę na SkyUp.pl.${SINCE}`, descriptionEn: `Spend an hour on SkyUp.pl.${SINCE_EN}` },
    { id: 'skyup_days_7', group: 'server_days', server: 'skyup.pl', goal: 7, sparks: 50, icon: 'fa-cloud', reward: 'skyup_wyspa', name: 'Tydzień w chmurach', nameEn: 'A week in the clouds', description: `Graj na SkyUp.pl co najmniej 10 minut w 7 różnych dniach.${SINCE}`, descriptionEn: `Play on SkyUp.pl for at least 10 minutes on 7 different days.${SINCE_EN}` },
    { id: 'skyup_10h', group: 'server_hours', server: 'skyup.pl', goal: 10, sparks: 60, icon: 'fa-cloud-sun', reward: 'skyup_chmury', name: 'Nad chmurami', nameEn: 'Above the clouds', description: `Spędź 10 godzin na SkyUp.pl.${SINCE}`, descriptionEn: `Spend 10 hours on SkyUp.pl.${SINCE_EN}` },
    { id: 'skyup_25h', group: 'server_hours', server: 'skyup.pl', goal: 25, sparks: 100, icon: 'fa-sun', reward: 'skyup_zachod', name: 'Zachód nad wyspą', nameEn: 'Sunset over the island', description: `Spędź 25 godzin na SkyUp.pl.${SINCE}`, descriptionEn: `Spend 25 hours on SkyUp.pl.${SINCE_EN}` },
    { id: 'skyup_50h', group: 'server_hours', server: 'skyup.pl', goal: 50, sparks: 150, icon: 'fa-cloud-moon', reward: 'skyup_noc', name: 'Nocna zmiana', nameEn: 'Night shift', description: `Spędź 50 godzin na SkyUp.pl.${SINCE}`, descriptionEn: `Spend 50 hours on SkyUp.pl.${SINCE_EN}` },
    { id: 'skyup_days_30', group: 'server_days', server: 'skyup.pl', goal: 30, sparks: 150, icon: 'fa-water', reward: 'skyup_waterblock', name: 'Waterblock', nameEn: 'Waterblock', description: `Graj na SkyUp.pl co najmniej 10 minut w 30 różnych dniach.${SINCE}`, descriptionEn: `Play on SkyUp.pl for at least 10 minutes on 30 different days.${SINCE_EN}` },
    { id: 'skyup_100h', group: 'server_hours', server: 'skyup.pl', goal: 100, sparks: 250, icon: 'fa-arrow-up', reward: 'skyup_up', name: 'UP!', nameEn: 'UP!', description: `Spędź 100 godzin na SkyUp.pl.${SINCE}`, descriptionEn: `Spend 100 hours on SkyUp.pl.${SINCE_EN}` },
    { id: 'skyup_250h', group: 'server_hours', server: 'skyup.pl', goal: 250, sparks: 400, icon: 'fa-anchor', reward: 'skyup_waterblock_glebia', name: 'Głębia', nameEn: 'The deep', description: `Spędź 250 godzin na SkyUp.pl.${SINCE}`, descriptionEn: `Spend 250 hours on SkyUp.pl.${SINCE_EN}` },
    { id: 'skyup_days_100', group: 'server_days', server: 'skyup.pl', goal: 100, sparks: 400, icon: 'fa-dungeon', reward: 'skyup_caveblock', name: 'Caveblock', nameEn: 'Caveblock', description: `Graj na SkyUp.pl co najmniej 10 minut w 100 różnych dniach.${SINCE}`, descriptionEn: `Play on SkyUp.pl for at least 10 minutes on 100 different days.${SINCE_EN}` },
    { id: 'skyup_500h', group: 'server_hours', server: 'skyup.pl', goal: 500, sparks: 800, icon: 'fa-house-chimney', reward: 'skyup_caveblock_domek', name: 'Domek w jaskini', nameEn: 'A house in the cave', description: `Spędź 500 godzin na SkyUp.pl.${SINCE}`, descriptionEn: `Spend 500 hours on SkyUp.pl.${SINCE_EN}` },
  ]),
  ...of('sharing', [
    { id: 'media_1', group: 'media', goal: 1, sparks: 10, name: 'Fotograf', nameEn: 'Photographer', description: 'Udostępnij zrzut ekranu lub klip linkiem.', descriptionEn: 'Share a screenshot or a clip by link.' },
    { id: 'media_10', group: 'media', goal: 10, sparks: 50, name: 'Galeria', nameEn: 'Gallery', description: 'Udostępnij linkiem 10 zrzutów ekranu lub klipów.', descriptionEn: 'Share 10 screenshots or clips by link.' },
    { id: 'share_1', group: 'shares', goal: 1, sparks: 15, name: 'Podziel się', nameEn: 'Sharing is caring', description: 'Udostępnij profil kodem.', descriptionEn: 'Share a profile by code.' },
    { id: 'cloud_1', group: 'cloud', goal: 1, sparks: 15, name: 'W chmurach', nameEn: 'Head in the clouds', description: 'Zapisz profil na koncie SlashClient (w chmurze).', descriptionEn: 'Save a profile on your SlashClient account (in the cloud).' },
  ]),
  ...of('style', [
    { id: 'spray_1', group: 'sprays', goal: 1, sparks: 10, name: 'Artysta uliczny', nameEn: 'Street artist', description: 'Namaluj spray w grze.', descriptionEn: 'Paint a spray in the game.' },
    { id: 'sprays_100', group: 'sprays', goal: 100, sparks: 50, name: 'Graficiarz', nameEn: 'Graffiti master', description: 'Namaluj 100 sprayów (liczy się najwyżej jeden na 30 sekund).', descriptionEn: 'Paint 100 sprays (at most one every 30 seconds counts).' },
    { id: 'wear_5', group: 'worn', goal: 5, sparks: 20, name: 'Elegant', nameEn: 'Dapper', description: 'Noś kosmetyki SlashClient w 5 miejscach naraz.', descriptionEn: 'Wear SlashClient cosmetics in 5 slots at once.' },
    { id: 'wear_10', group: 'worn', goal: 10, sparks: 60, name: 'Ikona stylu', nameEn: 'Style icon', description: 'Noś kosmetyki SlashClient w 10 miejscach naraz.', descriptionEn: 'Wear SlashClient cosmetics in 10 slots at once.' },
    { id: 'shop_1', group: 'bought', goal: 1, sparks: 20, name: 'Pierwszy zakup', nameEn: 'First purchase', description: 'Kup coś w sklepie za Iskry.', descriptionEn: 'Buy something in the shop with Sparks.' },
    { id: 'shop_5', group: 'bought', goal: 5, sparks: 75, name: 'Kolekcjoner', nameEn: 'Collector', description: 'Kup 5 rzeczy w sklepie.', descriptionEn: 'Buy 5 things in the shop.' },
  ]),
  ...of('secret', [
    { id: 'night_owl', group: 'night', goal: 1, sparks: 50, hidden: true, name: 'Nocny marek', nameEn: 'Night owl', description: 'Graj między północą a 4:00 UTC.', descriptionEn: 'Play between midnight and 4:00 UTC.' },
    { id: 'full_day', group: 'longday', goal: 12, sparks: 150, hidden: true, name: 'Maraton', nameEn: 'Marathon', description: 'Zagraj 12 godzin w ciągu jednego dnia.', descriptionEn: 'Play 12 hours in one day.' },
    { id: 'new_year', group: 'newyear', goal: 1, sparks: 100, hidden: true, name: 'Szczęśliwego Nowego Roku', nameEn: 'Happy New Year', description: 'Zagraj 1 stycznia.', descriptionEn: 'Play on the 1st of January.' },
    { id: 'halloween', group: 'halloween', goal: 1, sparks: 100, hidden: true, name: 'Cukierek albo psikus', nameEn: 'Trick or treat', description: 'Zagraj 31 października.', descriptionEn: 'Play on the 31st of October.' },
    { id: 'friday13', group: 'friday13', goal: 1, sparks: 100, hidden: true, name: 'Piątek trzynastego', nameEn: 'Friday the 13th', description: 'Zagraj w piątek trzynastego.', descriptionEn: 'Play on a Friday the 13th.' },
    { id: 'big_spender', group: 'spent', goal: 1000, sparks: 100, hidden: true, name: 'Rozrzutny', nameEn: 'Big spender', description: 'Wydaj w sklepie 1000 Iskier.', descriptionEn: 'Spend 1000 Sparks in the shop.' },
  ]),
];

/** All the sparks the achievements of this file together pay (the admin may change them: `AchievementRegistry`). */
export const TOTAL_SPARKS = ACHIEVEMENTS.reduce((s, a) => s + a.sparks, 0);

/** Each group's icon (Font Awesome, solid), when the achievement has none of its own. */
export const DEFAULT_ICONS: Record<Group, string> = {
  streak: 'fa-fire', hours: 'fa-clock', friends: 'fa-user-group', messages: 'fa-comment', servers: 'fa-server',
  days: 'fa-calendar-check', longday: 'fa-hourglass-half', weekends: 'fa-umbrella-beach', anniversary: 'fa-cake-candles',
  night: 'fa-moon', newyear: 'fa-champagne-glasses', halloween: 'fa-ghost', friday13: 'fa-cat',
  groups_joined: 'fa-people-group', groups_created: 'fa-comments', group_size: 'fa-users', clan_joined: 'fa-shield-halved', clan_founded: 'fa-chess-rook', clan_size: 'fa-flag',
  community_joined: 'fa-people-group', community_founded: 'fa-crown', community_size: 'fa-users',
  waypoints: 'fa-location-dot', parties_created: 'fa-bullhorn', parties_joined: 'fa-handshake', media: 'fa-camera', shares: 'fa-share-nodes', cloud: 'fa-cloud',
  sprays: 'fa-spray-can', worn: 'fa-shirt', bought: 'fa-bag-shopping', spent: 'fa-gem', manual: 'fa-award',
  server_hours: 'fa-cloud-sun', server_days: 'fa-calendar-days', server_visit: 'fa-plane-arrival',
};

/**
 * The icons an achievement may have: the groups' and some more, all in the Font Awesome the
 * launcher and the website ship (a test checks), so every client can draw what the admin picks.
 */
export const ICONS: string[] = [...new Set([...Object.values(DEFAULT_ICONS),
  'fa-trophy', 'fa-medal', 'fa-crown', 'fa-star', 'fa-heart', 'fa-bolt', 'fa-rocket', 'fa-dragon', 'fa-gift', 'fa-flag-checkered',
  'fa-hammer', 'fa-skull', 'fa-shield', 'fa-wand-magic-sparkles', 'fa-music', 'fa-paintbrush', 'fa-book', 'fa-compass', 'fa-mountain',
  'fa-tree', 'fa-fish', 'fa-dice', 'fa-puzzle-piece', 'fa-code', 'fa-bug', 'fa-certificate', 'fa-snowflake', 'fa-sun', 'fa-leaf',
  'fa-cube', 'fa-gamepad', 'fa-hand-sparkles', 'fa-mask', 'fa-crosshairs', 'fa-dungeon', 'fa-hat-wizard', 'fa-feather', 'fa-palette',
  'fa-infinity', 'fa-seedling', 'fa-anchor', 'fa-bomb', 'fa-binoculars', 'fa-map', 'fa-key', 'fa-lightbulb', 'fa-ribbon', 'fa-coins',
  'fa-paw', 'fa-dove', 'fa-meteor', 'fa-wand-sparkles', 'fa-guitar', 'fa-headphones', 'fa-video', 'fa-image', 'fa-scroll', 'fa-mug-hot',
  'fa-cloud-moon', 'fa-water', 'fa-arrow-up', 'fa-house-chimney'])];

/**
 * What an achievement made in the admin panel may count: only numbers this server sees itself (see
 * the top of this file), with the most a goal may ask (what the counting allows: messages and
 * waypoints stop at their caps, a day at 12 hours, a yes/no at 1).
 */
export const METRICS: Record<Exclude<Group, 'manual'>, { name: string; nameEn: string; max: number; server?: true }> = {
  hours: { name: 'Godziny gry', nameEn: 'Hours played', max: 100_000 },
  days: { name: 'Dni gry (po co najmniej 10 min)', nameEn: 'Days played (10+ min)', max: 3650 },
  streak: { name: 'Najdłuższa seria dni gry', nameEn: 'Longest daily streak', max: 3650 },
  longday: { name: 'Godziny gry w jednym dniu', nameEn: 'Hours played in one day', max: 12 },
  weekends: { name: 'Weekendy z grą', nameEn: 'Weekends played', max: 520 },
  anniversary: { name: 'Lata konta (zagrane w rocznicę lub później)', nameEn: 'Account years (played on or after)', max: 20 },
  night: { name: 'Gra w nocy (0:00–4:00 UTC)', nameEn: 'Played at night (0–4 UTC)', max: 1 },
  newyear: { name: 'Gra 1 stycznia', nameEn: 'Played on 1 January', max: 1 },
  halloween: { name: 'Gra 31 października', nameEn: 'Played on 31 October', max: 1 },
  friday13: { name: 'Gra w piątek 13.', nameEn: 'Played on a Friday the 13th', max: 1 },
  servers: { name: 'Różne serwery', nameEn: 'Different servers', max: 1000 },
  // `server: true`: the achievement names the server (its address; subdomains count too)
  server_hours: { name: 'Czas na serwerze (godziny)', nameEn: 'Time on a server (hours)', max: 100_000, server: true },
  server_days: { name: 'Dni gry na serwerze (po co najmniej 10 min)', nameEn: 'Days played on a server (10+ min)', max: 3650, server: true },
  server_visit: { name: 'Zagraj na serwerze', nameEn: 'Play on a server', max: 1, server: true },
  friends: { name: 'Znajomi', nameEn: 'Friends', max: 1000 },
  messages: { name: 'Wysłane wiadomości (do 30 dziennie)', nameEn: 'Messages sent (up to 30 a day)', max: 1000 },
  waypoints: { name: 'Punkty wysłane znajomym', nameEn: 'Waypoints sent to friends', max: 100 },
  parties_created: { name: 'Założone drużyny', nameEn: 'Parties started', max: 10_000 },
  parties_joined: { name: 'Przyjęte zaproszenia do drużyn', nameEn: 'Party invites accepted', max: 10_000 },
  groups_joined: { name: 'Czaty grupowe innych', nameEn: 'Other people\'s group chats', max: 100 },
  groups_created: { name: 'Założone czaty grupowe', nameEn: 'Group chats started', max: 100 },
  group_size: { name: 'Osoby w czacie grupowym', nameEn: 'People in a group chat', max: 100 },
  clan_joined: { name: 'W klanie (własnym lub cudzym)', nameEn: 'In a clan (own or someone else\'s)', max: 1 },
  clan_founded: { name: 'Założyciel klanu (założony lub przejęty)', nameEn: 'Clan owner (founded or taken over)', max: 1 },
  clan_size: { name: 'Członkowie klanu', nameEn: 'Clan members', max: 500 },
  community_joined: { name: 'Społeczności innych (członkostwo)', nameEn: 'Communities of others joined', max: 100 },
  community_founded: { name: 'Założone społeczności', nameEn: 'Communities founded', max: 100 },
  community_size: { name: 'Członkowie największej społeczności gracza', nameEn: 'Members of the biggest community one is in', max: 100_000 },
  media: { name: 'Zrzuty i klipy udostępnione linkiem', nameEn: 'Screenshots and clips shared', max: 10_000 },
  shares: { name: 'Profile udostępnione kodem', nameEn: 'Profiles shared by code', max: 10_000 },
  cloud: { name: 'Profile zapisane w chmurze', nameEn: 'Profiles saved to the cloud', max: 10_000 },
  sprays: { name: 'Spraye (najwyżej 1 na 30 s)', nameEn: 'Sprays (at most 1 per 30 s)', max: 100_000 },
  worn: { name: 'Kosmetyki noszone naraz', nameEn: 'Cosmetics worn at once', max: 20 },
  bought: { name: 'Przedmioty kupione w sklepie', nameEn: 'Items bought in the shop', max: 1000 },
  spent: { name: 'Iskry wydane w sklepie', nameEn: 'Sparks spent in the shop', max: 1_000_000 },
};

/** What the admin may change in an achievement of this file (kept apart, so "back to default" is deleting it). */
export interface Override {
  name?: string; nameEn?: string; description?: string; descriptionEn?: string; icon?: string; category?: Category;
  hidden?: boolean; goal?: number; sparks?: number; reward?: string; enabled?: boolean; server?: string;
}
export const OVERRIDE_KEYS = ['name', 'nameEn', 'description', 'descriptionEn', 'icon', 'category', 'hidden', 'goal', 'sparks', 'reward', 'enabled', 'server'] as const;

const parse = <T>(json: string): T | undefined => {
  try {
    return JSON.parse(json) as T;
  } catch {
    return undefined;
  }
};

/**
 * The achievements as they are now: the ones of this file with what the admin changed in them, then
 * the ones the admin made (both in the database, tables of their own). Read once and kept until a
 * change.
 */
export class AchievementRegistry {
  private readonly sql: DatabaseSync;
  private cache?: { list: Achievement[]; byId: Map<string, Achievement> };

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS achievement_overrides (id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL, by_uuid TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS achievement_custom (id TEXT PRIMARY KEY, data TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, by_uuid TEXT NOT NULL DEFAULT '');
`);
  }

  private load() {
    if (this.cache) return this.cache;
    const overrides = this.overrides();
    const list: Achievement[] = ACHIEVEMENTS.map((a) => {
      const o = overrides.get(a.id);
      if (!o) return a;
      const next = { ...a };
      for (const k of OVERRIDE_KEYS) if (o[k] !== undefined) (next as Record<string, unknown>)[k] = o[k];
      if (next.reward === '') delete next.reward;
      return next;
    });
    for (const r of this.sql.prepare('SELECT id, data FROM achievement_custom ORDER BY created_at, id').all() as { id: string; data: string }[]) {
      const a = parse<Achievement>(r.data);
      if (a) list.push({ ...a, id: r.id, custom: true, ...(a.reward ? {} : { reward: undefined }) });
    }
    this.cache = { list, byId: new Map(list.map((a) => [a.id, a])) };
    return this.cache;
  }

  /** Everything, switched off ones too (`enabled: false`). */
  all(): Achievement[] {
    return this.load().list;
  }

  /** The ones players can get now. */
  active(): Achievement[] {
    return this.all().filter((a) => a.enabled !== false);
  }

  get(id: string): Achievement | undefined {
    return this.load().byId.get(id);
  }

  /** The admin's changes to the achievements of this file. */
  overrides(): Map<string, Override> {
    const rows = this.sql.prepare('SELECT id, data FROM achievement_overrides').all() as { id: string; data: string }[];
    return new Map(rows.map((r) => [r.id, parse<Override>(r.data) ?? {}]));
  }

  /** Saves the changes to an achievement of this file (undefined: back to how this file has it). */
  setOverride(id: string, o: Override | undefined, by = '', at = Date.now()) {
    if (o && Object.keys(o).length) {
      this.sql.prepare('INSERT INTO achievement_overrides (id, data, updated_at, by_uuid) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, by_uuid = excluded.by_uuid')
        .run(id, JSON.stringify(o), at, by);
    } else this.sql.prepare('DELETE FROM achievement_overrides WHERE id = ?').run(id);
    this.cache = undefined;
  }

  /** Adds or changes an achievement made in the panel. */
  saveCustom(a: Achievement, by = '', at = Date.now()) {
    const { id, custom: _custom, ...data } = a;
    this.sql.prepare('INSERT INTO achievement_custom (id, data, created_at, updated_at, by_uuid) VALUES (?, ?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at, by_uuid = excluded.by_uuid')
      .run(id, JSON.stringify(data), at, at, by);
    this.cache = undefined;
  }

  deleteCustom(id: string) {
    this.sql.prepare('DELETE FROM achievement_custom WHERE id = ?').run(id);
    this.cache = undefined;
  }

  /** What all the achievements players can get pay together. */
  totalSparks(): number {
    return this.active().reduce((s, a) => s + a.sparks, 0);
  }

  /** The achievements that give an item (switched off ones too; the admin panel says which). */
  rewarding(itemId: string): Achievement[] {
    return this.all().filter((a) => a.reward === itemId);
  }
}

export const TICK_MS = 60_000;
/** A tick late by more than this (the server was busy or asleep) credits only this much. */
const MAX_CREDIT_MS = 2 * TICK_MS;
/** Minutes a day must have to count for the streak. */
export const DAY_MIN_SECONDS = 10 * 60;
/** More than this a day is not counted (a game left running all night). */
export const DAY_CAP_SECONDS = 12 * 3600;
/** Counted for hours only after this long in one place, so a quick look at a server is not a visit. */
const SERVER_MIN_TICKS = 2;
/** Only one spray in this long counts (the game allows one every few seconds). */
export const SPRAY_COUNT_GAP_MS = 30_000;
/** Message counts stop here: more is not needed and a long chat history is not counted through. */
const MESSAGES_CAP = 1000;
/** Night play counts from midnight to this hour, UTC. */
const NIGHT_UNTIL_HOUR = 4;
const DAY_MS = 86_400_000;
const YEAR_MS = 365 * DAY_MS;

/** The UTC day of a moment, as YYYY-MM-DD. */
export const dayOf = (at: number) => new Date(at).toISOString().slice(0, 10);
const prevDay = (day: string) => dayOf(Date.parse(`${day}T00:00:00Z`) - DAY_MS);

/**
 * The streak still going (ending today or yesterday: today may not have its 10 minutes yet) and the
 * longest one ever, from the days that count, in any order.
 */
export function streaks(days: string[], today: string): { current: number; best: number } {
  const sorted = [...new Set(days)].sort();
  let best = 0;
  let run = 0;
  let last = '';
  for (const d of sorted) {
    run = last && prevDay(d) === last ? run + 1 : 1;
    best = Math.max(best, run);
    last = d;
  }
  const alive = last === today || last === prevDay(today);
  return { current: alive ? run : 0, best };
}

/** Different weekends among the days (a Saturday and the Sunday after it are one weekend). */
export function weekends(days: string[]): number {
  const seen = new Set<string>();
  for (const d of days) {
    const at = Date.parse(`${d}T00:00:00Z`);
    const wd = new Date(at).getUTCDay();
    if (wd === 6) seen.add(d);
    else if (wd === 0) seen.add(dayOf(at - DAY_MS));
  }
  return seen.size;
}

/** The special days among the days played: New Year's Day, Halloween, a Friday the 13th. */
export function specialDays(days: string[]): { newyear: number; halloween: number; friday13: number } {
  let newyear = 0, halloween = 0, friday13 = 0;
  for (const d of days) {
    if (d.endsWith('-01-01')) newyear = 1;
    if (d.endsWith('-10-31')) halloween = 1;
    if (d.endsWith('-13') && new Date(`${d}T00:00:00Z`).getUTCDay() === 5) friday13 = 1;
  }
  return { newyear, halloween, friday13 };
}

/** How many whole years old the account was on the latest day played. */
export function anniversaryYears(days: string[], createdAt: number): number {
  let best = 0;
  // the end of the day: playing any time on the anniversary's day counts
  for (const d of days) best = Math.max(best, Math.floor((Date.parse(`${d}T00:00:00Z`) + DAY_MS - 1 - createdAt) / YEAR_MS));
  return best;
}

/** Addresses that are not a server one can "visit": this computer, a home network, a friend's LAN world through the relay. */
const LOCAL = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[?::1)/i;
export function serverKey(address: string | undefined): string | undefined {
  if (!address) return undefined;
  const a = address.trim().toLowerCase().replace(/\.$/, '').replace(/:25565$/, '');
  return a && !LOCAL.test(a) && /[a-z0-9]\.[a-z0-9]/.test(a) ? a.slice(0, 260) : undefined;
}

/** A server an achievement names: a host name (or a public address), with a port only when not 25565. */
const RULE = /^(?=.{3,253}(:|$))([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(:\d{1,5})?$/;
/** What the admin typed as an achievement's server, as `serverKey` keeps it ("SkyUp.pl:25565" → "skyup.pl"); undefined when it is not one. */
export function serverRule(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined;
  const k = serverKey(input.trim().replace(/^[a-z]+:\/\//i, '').replace(/\/.*$/, ''));
  return k && RULE.test(k) ? k : undefined;
}

/**
 * The SQL that picks a server column's rows of a rule: the server itself and its subdomains ("skyup.pl"
 * also "play.skyup.pl"), on any port unless the rule has one. A rule has no LIKE wildcards (`RULE`).
 */
function ruleSql(column: string, rule: string): [string, string[]] {
  if (rule.includes(':')) return [`(${column} = ? OR ${column} LIKE ?)`, [rule, `%.${rule}`]];
  return [`(${column} = ? OR ${column} LIKE ? OR ${column} LIKE ? OR ${column} LIKE ?)`, [rule, `${rule}:%`, `%.${rule}`, `%.${rule}:%`]];
}

/** What a player did on one server (and its subdomains). */
export interface ServerStats {
  /** Time there (counted from when it was first recorded, see `play_server_days`). */
  seconds: number;
  /** Days with at least 10 minutes there. */
  days: number;
  /** 1 when they ever played there (`play_servers`, kept from before the time was). */
  visited: number;
}

export interface Stats {
  totalSeconds: number; todaySeconds: number; streak: number; bestStreak: number; servers: number; friends: number; messages: number;
  daysPlayed: number; longestDaySeconds: number; weekends: number; anniversary: number; night: number; newyear: number; halloween: number; friday13: number;
  groupsJoined: number; groupsCreated: number; groupSize: number; clanJoined: number; clanFounded: number; clanSize: number;
  communityJoined: number; communityFounded: number; communitySize: number;
  waypoints: number; partiesCreated: number; partiesJoined: number; media: number; shares: number; cloud: number;
  sprays: number; worn: number; bought: number; spent: number;
  /** One server's numbers (`server_*` groups), asked when needed. */
  onServer: (rule: string) => ServerStats;
}

/** Counters kept by events (they only grow). */
export type Counter = 'media' | 'shares' | 'cloud' | 'parties_created' | 'parties_joined' | 'sprays' | 'night';

/** The tables (added on start, nothing else changes) and their queries. */
export class AchievementStore {
  private readonly sql: DatabaseSync;
  /** Messages that count (to friends and real groups, capped per day). */
  readonly messages: MessageCounter;

  constructor(sql: DatabaseSync) {
    this.sql = sql;
    sql.exec(`
CREATE TABLE IF NOT EXISTS play_days (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, day TEXT NOT NULL, seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uuid, day));
CREATE TABLE IF NOT EXISTS play_servers (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, server TEXT NOT NULL, first_at INTEGER NOT NULL, PRIMARY KEY (uuid, server));
CREATE TABLE IF NOT EXISTS achievements (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, id TEXT NOT NULL, unlocked_at INTEGER NOT NULL, PRIMARY KEY (uuid, id));
CREATE TABLE IF NOT EXISTS achievement_counters (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, key TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uuid, key));
CREATE TABLE IF NOT EXISTS play_server_days (uuid TEXT NOT NULL REFERENCES users(uuid) ON DELETE CASCADE, server TEXT NOT NULL, day TEXT NOT NULL, seconds INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (uuid, server, day));
`);
    this.messages = new MessageCounter(sql);
  }

  /** Adds play time to a day, never past the day's cap; returns how much it added (0 once the day is full). */
  addPlay(uuid: string, day: string, seconds: number): number {
    const s = Math.max(0, Math.min(DAY_CAP_SECONDS, Math.round(seconds)));
    if (!s) return 0;
    const had = (this.sql.prepare('SELECT seconds FROM play_days WHERE uuid = ? AND day = ?').get(uuid, day) as { seconds: number } | undefined)?.seconds ?? 0;
    this.sql.prepare(`INSERT INTO play_days (uuid, day, seconds) VALUES (?, ?, ?)
      ON CONFLICT (uuid, day) DO UPDATE SET seconds = MIN(${DAY_CAP_SECONDS}, seconds + excluded.seconds)`).run(uuid, day, s);
    return Math.max(0, Math.min(s, DAY_CAP_SECONDS - had));
  }

  /** Adds time on one server to a day (what `addPlay` credited, so the day's cap holds here too). */
  addServerPlay(uuid: string, server: string, day: string, seconds: number) {
    const s = Math.max(0, Math.min(DAY_CAP_SECONDS, Math.round(seconds)));
    if (!s) return;
    this.sql.prepare(`INSERT INTO play_server_days (uuid, server, day, seconds) VALUES (?, ?, ?, ?)
      ON CONFLICT (uuid, server, day) DO UPDATE SET seconds = MIN(${DAY_CAP_SECONDS}, seconds + excluded.seconds)`).run(uuid, server, day, s);
  }

  /** A player's numbers on one server and its subdomains (`rule`: see `serverRule`). */
  serverStats(uuid: string, rule: string): ServerStats {
    const [where, args] = ruleSql('server', rule);
    const total = this.sql.prepare(`SELECT COALESCE(SUM(seconds), 0) AS n FROM play_server_days WHERE uuid = ? AND ${where}`).get(uuid, ...args) as { n: number };
    // subdomains of one server on one day count together towards its 10 minutes
    const days = this.sql.prepare(`SELECT COUNT(*) AS n FROM (SELECT day FROM play_server_days WHERE uuid = ? AND ${where} GROUP BY day HAVING SUM(seconds) >= ?)`)
      .get(uuid, ...args, DAY_MIN_SECONDS) as { n: number };
    const visited = this.sql.prepare(`SELECT 1 AS n FROM play_servers WHERE uuid = ? AND ${where} LIMIT 1`).get(uuid, ...args);
    return { seconds: total.n, days: days.n, visited: visited ? 1 : 0 };
  }

  addServer(uuid: string, server: string, at: number) {
    this.sql.prepare('INSERT OR IGNORE INTO play_servers (uuid, server, first_at) VALUES (?, ?, ?)').run(uuid, server, at);
  }

  /** One more of something; `since` is how many the tables showed before the counter existed (it starts from there). */
  bump(uuid: string, key: Counter, since = 0) {
    this.sql.prepare('INSERT INTO achievement_counters (uuid, key, n) VALUES (?, ?, ?) ON CONFLICT (uuid, key) DO UPDATE SET n = MAX(n + 1, excluded.n)')
      .run(uuid, key, Math.max(1, since));
  }

  counter(uuid: string, key: Counter): number {
    return (this.sql.prepare('SELECT n FROM achievement_counters WHERE uuid = ? AND key = ?').get(uuid, key) as { n: number } | undefined)?.n ?? 0;
  }

  /** A count from another feature's table; 0 while that table is not there (an older database, a test without it). */
  private count(q: string, ...args: (string | number)[]): number {
    try {
      return Number((this.sql.prepare(q).get(...args) as { n: number | null } | undefined)?.n ?? 0);
    } catch {
      return 0;
    }
  }

  /** What the tables show now of the things the counters also count (screenshots, profiles, the cloud). */
  live(uuid: string, key: Counter): number {
    switch (key) {
      case 'media': return this.count('SELECT COUNT(*) AS n FROM shared_media WHERE owner = ?', uuid);
      case 'shares': return this.count('SELECT COUNT(*) AS n FROM profile_shares WHERE owner = ?', uuid);
      case 'cloud': return this.count('SELECT COUNT(*) AS n FROM cloud_profiles WHERE owner = ?', uuid);
      default: return 0;
    }
  }

  /** How many cosmetics the player wears at once: the account's set or one character's, the fuller. */
  private worn(uuid: string): number {
    const filled = (json: string, extra = 0) => {
      try {
        return Object.values(JSON.parse(json || '{}') as Record<string, unknown>).filter((v) => typeof v === 'string' && v).length + extra;
      } catch {
        return extra;
      }
    };
    const user = this.sql.prepare('SELECT cape, loadout FROM users WHERE uuid = ?').get(uuid) as { cape: string; loadout: string } | undefined;
    // the account's cape is kept apart from its other slots; a character's set has the cape inside
    let best = user ? filled(user.loadout, user.cape ? 1 : 0) : 0;
    for (const r of this.sql.prepare("SELECT loadout FROM identities WHERE uuid = ? AND provider = 'minecraft' AND loadout != ''").all(uuid) as { loadout: string }[]) best = Math.max(best, filled(r.loadout));
    return best;
  }

  stats(uuid: string, now: number, wallet?: Wallet): Stats {
    const today = dayOf(now);
    const total = this.sql.prepare('SELECT COALESCE(SUM(seconds), 0) AS s, COALESCE(MAX(seconds), 0) AS m FROM play_days WHERE uuid = ?').get(uuid) as { s: number; m: number };
    const todayRow = this.sql.prepare('SELECT seconds FROM play_days WHERE uuid = ? AND day = ?').get(uuid, today) as { seconds: number } | undefined;
    const days = (this.sql.prepare('SELECT day FROM play_days WHERE uuid = ? AND seconds >= ?').all(uuid, DAY_MIN_SECONDS) as { day: string }[]).map((r) => r.day);
    const { current, best } = streaks(days, today);
    const created = (this.sql.prepare('SELECT created_at FROM users WHERE uuid = ?').get(uuid) as { created_at: number } | undefined)?.created_at ?? now;
    const count = (q: string, ...args: (string | number)[]) => this.count(q, ...args);
    const counted = (key: Counter) => Math.max(this.counter(uuid, key), this.live(uuid, key));
    const shop = wallet?.purchases(uuid) ?? { count: 0, spent: 0 };
    const perServer = new Map<string, ServerStats>();
    return {
      totalSeconds: total.s,
      todaySeconds: todayRow?.seconds ?? 0,
      streak: current,
      bestStreak: best,
      servers: count('SELECT COUNT(*) AS n FROM play_servers WHERE uuid = ?', uuid),
      friends: count('SELECT COUNT(*) AS n FROM friendships WHERE a = ? OR b = ?', uuid, uuid),
      // counted when sent, a few a day (chatLimits.ts): not every line of a spammed chat
      messages: Math.min(MESSAGES_CAP, this.messages.total(uuid)),
      daysPlayed: days.length,
      longestDaySeconds: total.m,
      weekends: weekends(days),
      anniversary: anniversaryYears(days, created),
      night: this.counter(uuid, 'night'),
      ...specialDays(days),
      groupsJoined: count("SELECT COUNT(*) AS n FROM chat_group_members m JOIN chat_groups g ON g.id = m.group_id WHERE m.uuid = ? AND g.owner != ? AND g.clan = ''", uuid, uuid),
      groupsCreated: count("SELECT COUNT(*) AS n FROM chat_groups WHERE owner = ? AND clan = ''", uuid),
      groupSize: count("SELECT MAX(c) AS n FROM (SELECT COUNT(*) AS c FROM chat_group_members m JOIN chat_groups g ON g.id = m.group_id WHERE g.clan = '' AND m.group_id IN (SELECT group_id FROM chat_group_members WHERE uuid = ?) GROUP BY m.group_id)", uuid),
      // in a clan at all, one's own or someone else's (a player can be in only one, so founders count too)
      clanJoined: count('SELECT COUNT(*) AS n FROM clan_members WHERE uuid = ?', uuid),
      clanFounded: count('SELECT COUNT(*) AS n FROM clans WHERE owner = ?', uuid),
      clanSize: count('SELECT COUNT(*) AS n FROM clan_members WHERE clan_id = (SELECT clan_id FROM clan_members WHERE uuid = ?)', uuid),
      communityJoined: count("SELECT COUNT(*) AS n FROM community_members WHERE uuid = ? AND role != 'owner'", uuid),
      communityFounded: count('SELECT COUNT(*) AS n FROM communities WHERE owner = ?', uuid),
      communitySize: count('SELECT MAX(c.member_count) AS n FROM community_members m JOIN communities c ON c.id = m.community_id WHERE m.uuid = ?', uuid),
      waypoints: count('SELECT COUNT(*) AS n FROM (SELECT 1 FROM messages WHERE from_uuid = ? AND waypoint IS NOT NULL LIMIT 100)', uuid),
      partiesCreated: this.counter(uuid, 'parties_created'),
      partiesJoined: this.counter(uuid, 'parties_joined'),
      media: counted('media'),
      shares: counted('shares'),
      cloud: counted('cloud'),
      sprays: this.counter(uuid, 'sprays'),
      worn: this.worn(uuid),
      bought: shop.count,
      spent: shop.spent,
      onServer: (rule) => {
        let v = perServer.get(rule);
        if (!v) perServer.set(rule, (v = this.serverStats(uuid, rule)));
        return v;
      },
    };
  }

  unlocked(uuid: string): Map<string, number> {
    return new Map((this.sql.prepare('SELECT id, unlocked_at FROM achievements WHERE uuid = ?').all(uuid) as { id: string; unlocked_at: number }[]).map((r) => [r.id, r.unlocked_at]));
  }

  /** Records an achievement and grants its cosmetic; false when it was there already. */
  unlock(uuid: string, a: Achievement, at: number): boolean {
    const added = this.sql.prepare('INSERT OR IGNORE INTO achievements (uuid, id, unlocked_at) VALUES (?, ?, ?)').run(uuid, a.id, at).changes > 0;
    if (a.reward) this.sql.prepare('INSERT OR IGNORE INTO cape_grants (uuid, cape) VALUES (?, ?)').run(uuid, a.reward);
    return added;
  }

  /** Takes an achievement away (an admin's, given by hand); false when the player did not have it. */
  remove(uuid: string, id: string): boolean {
    return this.sql.prepare('DELETE FROM achievements WHERE uuid = ? AND id = ?').run(uuid, id).changes > 0;
  }

  /** Who has an achievement, the latest first. */
  holders(id: string, limit = 500): { uuid: string; handle: string; name: string; at: number }[] {
    return this.sql.prepare('SELECT a.uuid, u.handle, u.name, a.unlocked_at AS at FROM achievements a JOIN users u ON u.uuid = a.uuid WHERE a.id = ? ORDER BY a.unlocked_at DESC LIMIT ?').all(id, limit) as { uuid: string; handle: string; name: string; at: number }[];
  }

  /** How many players have each achievement. */
  holderCounts(): Record<string, number> {
    const rows = this.sql.prepare('SELECT id, COUNT(*) AS n FROM achievements GROUP BY id').all() as { id: string; n: number }[];
    return Object.fromEntries(rows.map((r) => [r.id, r.n]));
  }

  /** Every account, for the pass over all of them on start. */
  users(): string[] {
    return (this.sql.prepare('SELECT uuid FROM users').all() as { uuid: string }[]).map((r) => r.uuid);
  }

  /** Unlocked achievements not paid yet (from before the sparks, or a payout that failed): [uuid, id]. */
  unpaid(): { uuid: string; id: string; unlocked_at: number }[] {
    return this.sql.prepare("SELECT a.uuid, a.id, a.unlocked_at FROM achievements a WHERE NOT EXISTS (SELECT 1 FROM sparks_ledger l WHERE l.uuid = a.uuid AND l.reason = 'achievement' AND l.ref = a.id)").all() as { uuid: string; id: string; unlocked_at: number }[];
  }
}

/** How far a player is in an achievement's group (one given by hand: never, the admin gives it). */
export function value(a: Achievement, s: Stats): number {
  switch (a.group) {
    case 'streak': return s.bestStreak;
    case 'hours': return Math.floor(s.totalSeconds / 360) / 10;
    case 'friends': return s.friends;
    case 'messages': return s.messages;
    case 'servers': return s.servers;
    case 'days': return s.daysPlayed;
    case 'longday': return Math.floor(s.longestDaySeconds / 360) / 10;
    case 'weekends': return s.weekends;
    case 'anniversary': return s.anniversary;
    case 'night': return Math.min(1, s.night);
    case 'newyear': return s.newyear;
    case 'halloween': return s.halloween;
    case 'friday13': return s.friday13;
    case 'groups_joined': return s.groupsJoined;
    case 'groups_created': return s.groupsCreated;
    case 'group_size': return s.groupSize;
    case 'clan_joined': return s.clanJoined;
    case 'clan_founded': return s.clanFounded;
    case 'clan_size': return s.clanSize;
    case 'community_joined': return s.communityJoined;
    case 'community_founded': return s.communityFounded;
    case 'community_size': return s.communitySize;
    case 'waypoints': return s.waypoints;
    case 'parties_created': return s.partiesCreated;
    case 'parties_joined': return s.partiesJoined;
    case 'media': return s.media;
    case 'shares': return s.shares;
    case 'cloud': return s.cloud;
    case 'sprays': return s.sprays;
    case 'worn': return s.worn;
    case 'bought': return s.bought;
    case 'spent': return s.spent;
    case 'server_hours': return a.server ? Math.floor(s.onServer(a.server).seconds / 360) / 10 : 0;
    case 'server_days': return a.server ? s.onServer(a.server).days : 0;
    case 'server_visit': return a.server ? s.onServer(a.server).visited : 0;
    case 'manual': return 0;
  }
}

/** Whether the numbers reach an achievement (one given by hand never does by itself). */
const reached = (a: Achievement, s: Stats) => a.group !== 'manual' && value(a, s) >= a.goal;

/** What an achievement's reward is, for the pages and the game. */
function rewardOf(a: Achievement): { id: string; slot: Slot; name: string } | undefined {
  const it = a.reward ? item(a.reward) : undefined;
  return it ? { id: it.id, slot: it.slot, name: it.name } : undefined;
}

/** Its place among the achievements of its group, by goal (1 = the easiest). */
const tierOf = (a: Achievement, list: Achievement[]) => (a.group === 'manual' ? 1 : list.filter((x) => x.group === a.group && x.server === a.server && x.goal < a.goal).length + 1);

/** An achievement's icon: its own, or its group's. */
export const iconOf = (a: Achievement) => (a.icon && ICONS.includes(a.icon) ? a.icon : DEFAULT_ICONS[a.group] ?? 'fa-trophy');

/** One achievement as the launcher, the game and the website get it; a hidden one stays "???" until it unlocks. */
export function view(a: Achievement, unlockedAt: number | undefined, s?: Stats, list: Achievement[] = ACHIEVEMENTS) {
  const secret = a.hidden && unlockedAt === undefined;
  const v = s && !secret && a.group !== 'manual' ? value(a, s) : undefined;
  return {
    id: a.id, group: a.group, category: a.category, tier: tierOf(a, list), goal: secret ? 1 : a.goal, sparks: a.sparks,
    // its own icon only once it can be told (a hidden one's would give it away)
    icon: secret ? 'fa-question' : iconOf(a),
    ...(a.hidden ? { hidden: true } : {}),
    ...(a.custom ? { custom: true } : {}),
    ...(a.group === 'manual' ? { manual: true } : {}),
    ...(a.server && !secret ? { server: a.server } : {}),
    name: secret ? '???' : a.name, nameEn: secret ? '???' : a.nameEn || a.name,
    description: secret ? 'Ukryte osiągnięcie. Odkryj je sam!' : a.description, descriptionEn: secret ? 'A hidden achievement. Find it yourself!' : a.descriptionEn || a.description,
    ...(v === undefined ? {} : { value: v, progress: Math.min(1, v / a.goal) }),
    unlockedAt: unlockedAt ?? null, reward: rewardOf(a),
  };
}

/** How to get a cosmetic that an achievement gives (the cosmetics menus show it under the lock). */
export function hintOf(a: Achievement): { hint: string; hintEn: string } {
  if (a.hidden) return { hint: 'Ukryte osiągnięcie. Odkryj je sam!', hintEn: 'A hidden achievement. Find it yourself!' };
  const how = a.group === 'manual' ? 'przyznaje administracja' : a.description;
  const howEn = a.group === 'manual' ? 'given by the admins' : a.descriptionEn || a.description;
  return { hint: `Osiągnięcie „${a.name}”: ${how}`, hintEn: `Achievement "${a.nameEn || a.name}": ${howEn}` };
}

/** Requests that count for an achievement once they succeed: what they count, or null to only look again. */
const EVENTS: [string, RegExp, Counter | null][] = [
  ['POST', /^\/v1\/media$/, 'media'],
  ['POST', /^\/v1\/profile-shares$/, 'shares'],
  ['PUT', /^\/v1\/cloud-profiles\/[\w-]+$/, 'cloud'],
  ['POST', /^\/v1\/parties$/, 'parties_created'],
  ['POST', /^\/v1\/parties\/[\w-]+\/accept$/, 'parties_joined'],
  ['POST', /^\/v1\/mc\/spray$/, 'sprays'],
  ['POST', /^\/v1\/waypoints$/, null],
  ['POST', /^\/v1\/me$/, null],
  ['POST', /^\/v1\/groups(\/[\w-]+\/(members|messages))?$/, null],
  ['POST', /^\/v1\/clans(\/[\w-]+\/accept|\/invites|\/leave)?$/, null],
];

/** At most this many single notices for one check; more come as one summary (old players after the update). */
const SINGLE_NOTICES = 2;

interface Deps {
  sql: DatabaseSync;
  wallet: Wallet;
  /** Who plays right now: account → the server address (undefined in singleplayer). */
  playing: (now: number) => Map<string, string | undefined>;
  /** Sends an event to the account's connected launchers (and from there to its game). */
  push: (userId: string, event: unknown) => void;
  authed: (req: http.IncomingMessage) => string;
  areFriends: (a: string, b: string) => boolean;
  fail: (status: number, code: string) => never;
  /** After each tick: what each player in a game was credited, and where (the challenges count it too: challenges.ts). */
  played?: (credits: Map<string, { seconds: number; server?: string; stayed: boolean; ticks: number }>, now: number) => void;
}

export function createAchievements(deps: Deps) {
  const { wallet } = deps;
  const store = new AchievementStore(deps.sql);
  const registry = new AchievementRegistry(deps.sql);
  /** When each player was last credited, and where, for how many ticks in a row. */
  const last = new Map<string, { at: number; server?: string; ticks: number }>();
  /** When each player's last counted spray was. */
  const lastSpray = new Map<string, number>();

  /** Unlocks one achievement and pays it, together; false when it was there already. */
  function unlock(userId: string, a: Achievement, at: number): boolean {
    return inTransaction(deps.sql, () => {
      if (!store.unlock(userId, a, at)) return false;
      // paid once per player and achievement, ever (unlocked again after an admin took it away: nothing more)
      if (a.sparks > 0) wallet.change(userId, a.sparks, 'achievement', a.id, '', '', at);
      return true;
    });
  }

  /** Tells the player's launchers about new achievements: one by one, or several as one summary. */
  function announce(userId: string, fresh: ReturnType<typeof view>[]) {
    if (!fresh.length) return;
    const many = fresh.length > SINGLE_NOTICES;
    // older launchers know only single events; new ones skip the quiet ones and show the summary
    for (const v of fresh) deps.push(userId, { type: 'achievement', achievement: v, ...(many ? { quiet: true } : {}) });
    const sparks = fresh.reduce((n, v) => n + v.sparks, 0);
    if (many) deps.push(userId, { type: 'achievements-summary', count: fresh.length, sparks });
    deps.push(userId, { type: 'wallet', balance: wallet.balance(userId), change: sparks, reason: 'achievement', ref: '' });
  }

  /**
   * Unlocks what the player has reached and tells their launchers; returns the new ones. Several at
   * once (old players after an update) also come as one summary, which new launchers show instead.
   */
  function check(userId: string, now = Date.now()) {
    const s = store.stats(userId, now, wallet);
    const have = store.unlocked(userId);
    const list = registry.active();
    const fresh = [];
    for (const a of list) {
      if (have.has(a.id) || !reached(a, s)) continue;
      if (!unlock(userId, a, now)) continue;
      fresh.push(view(a, now, s, list));
    }
    announce(userId, fresh);
    return fresh;
  }

  /** Looks at every account once (on start, and after the admin made an achievement easier or new). */
  function checkAll(now = Date.now()) {
    let unlocked = 0;
    for (const uuid of store.users()) unlocked += check(uuid, now).length;
    return unlocked;
  }

  /**
   * On start: pays every unlocked achievement not paid yet (all of them, the first time after the
   * sparks came), then looks at every account once, so achievements already reached in the data
   * (friends, servers, days played…) unlock without the player having to play first. Safe to run
   * on every start: payouts are once per achievement, unlocks once per player.
   */
  function backfill(now = Date.now()) {
    let paid = 0;
    for (const r of store.unpaid()) {
      const a = registry.get(r.id);
      if (a && a.sparks > 0 && wallet.change(r.uuid, a.sparks, 'achievement', a.id, '', '', r.unlocked_at) !== undefined) paid++;
    }
    return { paid, unlocked: checkAll(now) };
  }

  /** An admin gives an achievement (one made to be given by hand); false when the player had it. */
  function give(userId: string, id: string, now = Date.now()): boolean {
    const a = registry.get(id);
    if (!a || !unlock(userId, a, now)) return false;
    announce(userId, [view(a, now, undefined, registry.active())]);
    return true;
  }

  /** Once a minute: play time for everyone in a game (see the top of this file). */
  function tick(now = Date.now()) {
    const playing = deps.playing(now);
    for (const id of last.keys()) if (!playing.has(id)) last.delete(id);
    const credits = new Map<string, { seconds: number; server?: string; stayed: boolean; ticks: number }>();
    for (const [userId, address] of playing) {
      const server = serverKey(address);
      const before = last.get(userId);
      const ticks = before && before.server === server ? before.ticks + 1 : 1;
      last.set(userId, { at: now, server, ticks });
      // the first tick only starts the clock: nothing is known about the time before it
      if (!before) continue;
      const credited = store.addPlay(userId, dayOf(now), Math.min(MAX_CREDIT_MS, Math.max(0, now - before.at)) / 1000);
      credits.set(userId, { seconds: credited, server, stayed: !!server && before.server === server, ticks });
      // the time since the last tick goes to the server only when the player was there then too (not singleplayer, not a LAN world)
      if (server && before.server === server) store.addServerPlay(userId, server, dayOf(now), credited);
      if (server && ticks >= SERVER_MIN_TICKS) store.addServer(userId, server, now);
      if (new Date(now).getUTCHours() < NIGHT_UNTIL_HOUR && !store.counter(userId, 'night')) store.bump(userId, 'night');
      check(userId, now);
    }
    deps.played?.(credits, now);
  }

  /**
   * After a request succeeded: counts what it did (a screenshot shared, a party…) and looks at the
   * achievements of everyone it may have moved (the members of a group or a clan too).
   */
  function after(method: string, path: string, userId: string | undefined, now = Date.now()) {
    if (!userId) return;
    const hit = EVENTS.find(([m, re]) => m === method && re.test(path));
    if (!hit) return;
    const key = hit[2];
    if (key === 'sprays') {
      if (now - (lastSpray.get(userId) ?? 0) < SPRAY_COUNT_GAP_MS) return;
      lastSpray.set(userId, now);
    }
    if (key) store.bump(userId, key, store.live(userId, key));
    check(userId, now);
    const others = new Set<string>();
    const group = /^\/v1\/groups\/([\w-]+)\//.exec(path)?.[1];
    try {
      if (path === '/v1/groups' || group) {
        const rows = group
          ? deps.sql.prepare('SELECT uuid FROM chat_group_members WHERE group_id = ?').all(group)
          : deps.sql.prepare('SELECT m.uuid FROM chat_group_members m JOIN chat_groups g ON g.id = m.group_id WHERE g.owner = ?').all(userId);
        for (const r of rows as { uuid: string }[]) others.add(r.uuid);
      } else if (path.startsWith('/v1/clans')) {
        for (const r of deps.sql.prepare('SELECT uuid FROM clan_members WHERE clan_id = (SELECT clan_id FROM clan_members WHERE uuid = ?)').all(userId) as { uuid: string }[]) others.add(r.uuid);
      }
    } catch {
      // the groups' or clans' tables are not there (a test without them)
    }
    others.delete(userId);
    for (const other of others) check(other, now);
  }

  /** What a player sees: the ones that can be got now, and switched off ones only when they have them. */
  const shown = (have: Map<string, number>) => registry.all().filter((a) => a.enabled !== false || have.has(a.id));

  function list(userId: string, now = Date.now()) {
    check(userId, now);
    const s = store.stats(userId, now, wallet);
    const have = store.unlocked(userId);
    const active = registry.active();
    const views = shown(have).map((a) => view(a, have.get(a.id), s, active));
    return {
      achievements: views,
      stats: {
        hours: Math.floor(s.totalSeconds / 360) / 10, todayMinutes: Math.floor(s.todaySeconds / 60), streak: s.streak, bestStreak: s.bestStreak,
        servers: s.servers, friends: s.friends, messages: s.messages, daysPlayed: s.daysPlayed,
      },
      rules: { dayStartsAt: '00:00 UTC', minMinutesPerDay: DAY_MIN_SECONDS / 60, maxHoursPerDay: DAY_CAP_SECONDS / 3600 },
      categories: CATEGORIES,
      sparks: {
        balance: wallet.balance(userId),
        earned: views.filter((v) => v.unlockedAt !== null).reduce((n, v) => n + v.sparks, 0),
        total: registry.totalSparks(),
      },
    };
  }

  /** How to get an item an achievement gives (the first one players can get now), for the cosmetics menus. */
  function rewardHint(itemId: string): ({ achievement: string } & ReturnType<typeof hintOf>) | undefined {
    const a = registry.rewarding(itemId).find((x) => x.enabled !== false);
    return a && { achievement: a.id, ...hintOf(a) };
  }

  const routes: [string, RegExp, (req: http.IncomingMessage, params: string[]) => unknown][] = [
    ['GET', /^\/v1\/achievements$/, (req) => list(deps.authed(req))],
    // a friend's unlocked achievements (without their hours and the rest)
    ['GET', /^\/v1\/achievements\/([\w-]{1,64})$/, (req, [other]) => {
      const me = deps.authed(req);
      if (other !== me && !deps.areFriends(me, other)) deps.fail(403, 'not_friends');
      const have = store.unlocked(other);
      const active = registry.active();
      return { achievements: shown(have).map((a) => view(a, have.get(a.id), undefined, active)) };
    }],
  ];

  return { routes, tick, check, checkAll, list, after, backfill, give, rewardHint, store, registry };
}
