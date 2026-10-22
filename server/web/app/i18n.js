// The app's language: Polish in the code, English from the list below (the server's test checks every
// text has one). The phone's language picks it the first time; the player can switch in "Ja".

const LANG = 'slashclient.app.lang';

let current;
export function lang() {
  if (current) return current;
  let saved = '';
  try {
    saved = localStorage.getItem(LANG) ?? '';
  } catch {
    // private mode
  }
  current = saved === 'pl' || saved === 'en' ? saved : /^pl\b/i.test(navigator.language || 'pl') ? 'pl' : 'en';
  return current;
}

export function setLang(value) {
  current = value === 'en' ? 'en' : 'pl';
  try {
    localStorage.setItem(LANG, current);
  } catch {
    // private mode
  }
}

/** The text in the player's language, {0} {1}… filled in. */
export function t(text, ...args) {
  const s = lang() === 'en' ? EN[text] ?? text : text;
  return args.length ? s.replace(/\{(\d)\}/g, (_, i) => String(args[i] ?? '')) : s;
}

export const EN = {
  'Napisz wiadomość…': 'Write a message…',
  'Wiadomość': 'Message',
  'Wyślij': 'Send',
  'Wcześniejsze wiadomości': 'Earlier messages',
  'Wstecz': 'Back',
  'Wczytywanie…': 'Loading…',
  'Na tym kanale nie możesz pisać.': 'You cannot write in this channel.',
  '{0} pisze…': '{0} is typing…',
  '{0} tworzy grupę „{1}”': '{0} created the group “{1}”',
  '{0} dodaje: {1}': '{0} added {1}',
  '{0} usuwa: {1}': '{0} removed {1}',
  '{0} wychodzi': '{0} left',
  '{0} dołącza': '{0} joined',
  '{0} zmienia nazwę na „{1}”': '{0} renamed it to “{1}”',
  '{0} awansuje: {1}': '{0} promoted {1}',
  '{0} zmienia rolę: {1}': '{0} changed the role of {1}',
  '{0} przekazuje klan: {1}': '{0} handed the clan to {1}',
  '{0} zmienia logo': '{0} changed the logo',
  'Wiadomość usunięta': 'Message deleted',
  'Zaproszenie do gry': 'Game invite',
  'Dołączysz z launchera na komputerze.': 'Join it from the launcher on your computer.',
  'edytowano': 'edited',
  'Zaszyfrowana': 'Encrypted',
  'przeczytano': 'read',
  'Zdjęcie zaszyfrowane dla innego urządzenia': 'Picture encrypted for another device',
  'Zdjęcie': 'Picture',
  'Nie udało się otworzyć zdjęcia': 'Could not open the picture',
  'Pokaż zdjęcie': 'Show picture',
  'Napisz pierwszą wiadomość. Rozmowa jest szyfrowana.': 'Write the first message. This conversation is encrypted.',
  'Jeszcze nic tu nie ma.': 'Nothing here yet.',
  'Wiadomość zaszyfrowana dla innego urządzenia.': 'Message encrypted for another device.',
  'Offline · {0}': 'Offline · {0}',
  'Offline': 'Offline',
  'Gra na {0} · {1}': 'Playing on {0} · {1}',
  '{0} · na {1}': '{0} · on {1}',
  '{0} · na serwerze': '{0} · on a server',
  '{0} · gra jednoosobowa': '{0} · singleplayer',
  '{0} · w menu': '{0} · in the menu',
  'Dostępny': 'Online',
  'Zaraz wracam': 'Away',
  'Nie przeszkadzać': 'Do not disturb',
  'Niewidoczny': 'Invisible',
  'Spróbuj ponownie': 'Try again',
  'Zaloguj przez {0}': 'Sign in with {0}',
  'Nick (logowanie testowe)': 'Nick (test sign-in)',
  'Nick': 'Nick',
  'Wejdź': 'Enter',
  'Logowanie nie jest jeszcze skonfigurowane na tym serwerze.': 'Signing in is not set up on this server yet.',
  'Znajomi, czaty, klany i społeczności z launchera – na telefonie.': 'Friends, chats, clans and communities from the launcher – on your phone.',
  'Konto SlashClient zakłada się w launcherze, razem z kontem Minecraft. Tutaj zalogujesz się sposobem, który do niego podpiąłeś (Znajomi → konto w launcherze).':
    'A SlashClient account is made in the launcher, with your Minecraft account. Here you sign in with a way you linked to it (Friends → account in the launcher).',
  'Wpisz kod u Microsoftu': 'Enter the code at Microsoft',
  'Otwórz stronę i wpisz kod:': 'Open the page and enter the code:',
  'Skopiowano kod': 'Code copied',
  'Kopiuj kod': 'Copy code',
  'Anuluj': 'Cancel',
  'Czekam na zalogowanie…': 'Waiting for you to sign in…',
  'Łączenie z serwerem…': 'Connecting to the server…',
  'Zakładki': 'Tabs',
  '{0} zaprasza Cię do znajomych.': '{0} sent you a friend request.',
  '{0} przyjmuje zaproszenie.': '{0} accepted your friend request.',
  '{0} zaprasza Cię do klanu [{1}]': '{0} invites you to the clan [{1}]',
  '{0} zaprasza Cię do społeczności {1}': '{0} invites you to the community {1}',
  'Znajomi': 'Friends',
  'Dodaj znajomego': 'Add a friend',
  'Zaproszenia do znajomych: {0}': 'Friend requests: {0}',
  'Nie masz jeszcze znajomych. Dodaj kogoś po nicku.': 'No friends yet. Add someone by their nick.',
  'Nick w SlashClient': 'SlashClient nick',
  'Wyślij zaproszenie': 'Send request',
  'Jesteście teraz znajomymi.': 'You are friends now.',
  'Zaproszenie wysłane.': 'Invitation sent.',
  'Czaty': 'Chats',
  'Nowa grupa': 'New group',
  'Nie masz jeszcze czatów grupowych.': 'No group chats yet.',
  '{0} członków · {1} online': '{0} members · {1} online',
  'Zaproś do klanu': 'Invite to the clan',
  'Zaproś': 'Invite',
  'Najpierw dodaj znajomych.': 'Add some friends first.',
  'Nazwa grupy': 'Group name',
  'Podaj nazwę i wybierz znajomych.': 'Give it a name and pick friends.',
  'Utwórz grupę': 'Create group',
  'Opuść grupę': 'Leave group',
  'Opuścić grupę „{0}”?': 'Leave the group “{0}”?',
  '{0} osób · szyfrowane': '{0} people · encrypted',
  'Społeczności': 'Communities',
  '{0} członków': '{0} members',
  'Nie należysz jeszcze do żadnej społeczności. Dołączysz do nich w launcherze albo z zaproszenia.': 'You are not in any community yet. Join them in the launcher or from an invitation.',
  'Do znajomych': 'Friend requests',
  'Przyjmij': 'Accept',
  'Odrzuć': 'Decline',
  'Do klanu': 'Clan invitations',
  'od {0} · {1} członków': 'from {0} · {1} members',
  'Dołącz': 'Join',
  'Do społeczności': 'Community invitations',
  'Wysłane': 'Sent',
  'czeka na odpowiedź': 'waiting for an answer',
  'Prośby o dołączenie': 'Requests to join',
  'Zaproszenia': 'Invitations',
  'Brak zaproszeń.': 'No invitations.',
  'Status': 'Status',
  'Osiągnięcia': 'Achievements',
  'Ja': 'Me',
  'Wyloguj': 'Sign out',
  'Status dla znajomych': 'Status for friends',
  'Język': 'Language',
  'Powiadomienia': 'Notifications',
  'Powiadomienia są wyłączone na serwerze.': 'Notifications are switched off on the server.',
  'Na iPhonie powiadomienia działają po dodaniu aplikacji do ekranu początkowego: Udostępnij → Do ekranu początkowego (iOS 16.4 lub nowszy).':
    'On an iPhone, notifications work once the app is on the home screen: Share → Add to Home Screen (iOS 16.4 or newer).',
  'Ta przeglądarka nie obsługuje powiadomień.': 'This browser does not support notifications.',
  'Powiadomienia są zablokowane w ustawieniach przeglądarki lub telefonu. Zezwól na nie tam i wróć tutaj.': 'Notifications are blocked in the browser’s or the phone’s settings. Allow them there and come back.',
  'Dostaniesz powiadomienie o nowej wiadomości, wzmiance lub zaproszeniu, także gdy aplikacja jest zamknięta. Treść szyfrowanych wiadomości nigdy nie trafia do powiadomień.':
    'Get notified of new messages, mentions and invitations, even when the app is closed. The text of encrypted messages never goes into notifications.',
  'Powiadomienia włączone.': 'Notifications on.',
  'Nie zezwolono na powiadomienia.': 'Notifications were not allowed.',
  'Włącz powiadomienia': 'Turn on notifications',
  'Wysłano powiadomienie testowe.': 'Test notification sent.',
  'Wyślij testowe': 'Send a test',
  'Wyłącz na tym telefonie': 'Turn off on this phone',
  'Nie udało się wczytać osiągnięć.': 'Could not load achievements.',
  'Iskry': 'Sparks',
  'Zdobyte: {0} z {1} · {2} godz. gry · seria {3} dni': 'Unlocked: {0} of {1} · {2} h played · {3}-day streak',
  'Zamknij': 'Close',
  'Zainstaluj SlashClient na telefonie.': 'Install SlashClient on your phone.',
  'Zainstaluj': 'Install',
  'Dodaj aplikację do ekranu: Udostępnij → Do ekranu początkowego. Dopiero wtedy działają powiadomienia.': 'Add the app to your home screen: Share → Add to Home Screen. Notifications work only then.',
  'Wiadomości od znajomych': 'Messages from friends',
  'Czaty grupowe': 'Group chats',
  'Czat klanu': 'Clan chat',
  'Wzmianki w społecznościach': 'Mentions in communities',
  'przed chwilą': 'just now',
  'Coś poszło nie tak.': 'Something went wrong.',
  'Brak połączenia z serwerem.': 'No connection to the server.',
  'Nie znaleziono.': 'Not found.',
  'To Ty.': 'That is you.',
  'Już jesteście znajomymi.': 'You are friends already.',
  'Za szybko. Spróbuj za chwilę.': 'Too fast. Try again in a moment.',
  'Za dużo wiadomości naraz. Zwolnij na chwilę.': 'Too many messages at once. Slow down for a moment.',
  'Tryb powolny: poczekaj chwilę przed kolejną wiadomością.': 'Slow mode: wait a little before the next message.',
  'Wiadomość jest za długa.': 'The message is too long.',
  'Wiadomość jest pusta.': 'The message is empty.',
  'Nie jesteście znajomymi.': 'You are not friends.',
  'Ta funkcja jest chwilowo wyłączona.': 'This feature is switched off for now.',
  'Ten telefon nie ma jeszcze włączonych powiadomień.': 'This phone has no notifications turned on yet.',
  'To konto jest zablokowane.': 'This account is banned.',
  'To konto nie jest połączone z kontem SlashClient. Połącz je w launcherze (Znajomi → konto).': 'This account is not linked to a SlashClient account. Link it in the launcher (Friends → account).',
  'Nick: 3–16 liter, cyfr lub _.': 'Nick: 3–16 letters, digits or _.',
  'Masz wyciszenie w tej społeczności.': 'You are muted in this community.',
  'Klan jest pełny.': 'The clan is full.',
  'Osiągnięto limit.': 'Limit reached.',
  'Nazwa grupy: do 32 znaków.': 'Group name: up to 32 characters.',
  'Już jest w środku.': 'Already a member.',
  'Nie masz do tego uprawnień.': 'You are not allowed to do that.',
};
