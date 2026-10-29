/** English texts of the friendly error messages (fileErrors.ts, the game bridge and a launcher that could not start). */
export const ERRORS_EN: Record<string, string> = {
  'Brak dostępu do pliku. Zamknij grę i programy, które mogą go używać (np. antywirus), i spróbuj ponownie.':
    'No access to the file. Close the game and programs that may be using it (e.g. an antivirus) and try again.',
  'Plik jest używany przez inny program. Zamknij grę i spróbuj ponownie.': 'The file is used by another program. Close the game and try again.',
  'Brak miejsca na dysku. Zwolnij trochę miejsca i spróbuj ponownie.': 'The disk is full. Free up some space and try again.',
  'Nie znaleziono pliku lub folderu. Mógł zostać przeniesiony albo usunięty.': 'File or folder not found. It may have been moved or deleted.',
  'Taki plik lub folder już istnieje.': 'Such a file or folder already exists.',
  'Folder nie jest pusty.': 'The folder is not empty.',
  'Dysk jest tylko do odczytu.': 'The disk is read-only.',
  'Ścieżka do pliku jest za długa. Przenieś folder bliżej początku dysku.': 'The path to the file is too long. Move the folder closer to the root of the disk.',
  'Za dużo otwartych plików. Zamknij kilka programów i spróbuj ponownie.': 'Too many open files. Close a few programs and try again.',
  'Błąd odczytu lub zapisu dysku. Sprawdź dysk i spróbuj ponownie.': 'A disk read or write error. Check the disk and try again.',
  'Nie można przenieść pliku na inny dysk.': 'The file cannot be moved to another disk.',
  // the game bridge: what the game shows when the launcher could not do something
  'Za dużo zapytań. Spróbuj ponownie za chwilę.': 'Too many requests. Try again in a moment.',
  'Serwer ma chwilowe problemy. Spróbuj ponownie później.': 'The server has temporary problems. Try again later.',
  'Launcher nie mógł tego zrobić. Spróbuj ponownie.': 'The launcher could not do this. Try again.',
  // a launcher that could not start
  'SlashClient nie mógł się uruchomić': 'SlashClient could not start',
  'Coś poszło nie tak przy uruchamianiu launchera. Uruchom go ponownie; jeśli to się powtórzy, wyślij nam plik z logiem: {0}':
    'Something went wrong while starting the launcher. Start it again; if it happens again, send us the log file: {0}',
};
