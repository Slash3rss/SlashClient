import { t } from './i18n';

/**
 * Plain words for the system's file errors (EPERM, ENOSPC…): the player sees what to do about it
 * instead of the error's code and the full paths. The details stay in the log.
 */
const FILE_ERRORS: Record<string, () => string> = {
  EPERM: () => t('Brak dostępu do pliku. Zamknij grę i programy, które mogą go używać (np. antywirus), i spróbuj ponownie.'),
  EACCES: () => t('Brak dostępu do pliku. Zamknij grę i programy, które mogą go używać (np. antywirus), i spróbuj ponownie.'),
  EBUSY: () => t('Plik jest używany przez inny program. Zamknij grę i spróbuj ponownie.'),
  ENOSPC: () => t('Brak miejsca na dysku. Zwolnij trochę miejsca i spróbuj ponownie.'),
  EDQUOT: () => t('Brak miejsca na dysku. Zwolnij trochę miejsca i spróbuj ponownie.'),
  ENOENT: () => t('Nie znaleziono pliku lub folderu. Mógł zostać przeniesiony albo usunięty.'),
  EEXIST: () => t('Taki plik lub folder już istnieje.'),
  ENOTEMPTY: () => t('Folder nie jest pusty.'),
  EROFS: () => t('Dysk jest tylko do odczytu.'),
  ENAMETOOLONG: () => t('Ścieżka do pliku jest za długa. Przenieś folder bliżej początku dysku.'),
  EMFILE: () => t('Za dużo otwartych plików. Zamknij kilka programów i spróbuj ponownie.'),
  ENFILE: () => t('Za dużo otwartych plików. Zamknij kilka programów i spróbuj ponownie.'),
  EIO: () => t('Błąd odczytu lub zapisu dysku. Sprawdź dysk i spróbuj ponownie.'),
  EXDEV: () => t('Nie można przenieść pliku na inny dysk.'),
};

/** The codes with a message of their own. */
export const FILE_ERROR_CODES = Object.keys(FILE_ERRORS);

// "EPERM: operation not permitted, rename 'C:\…' -> '…'", also inside a longer text ("Could not import: EPERM: …")
const CODE = new RegExp(`\\b(${FILE_ERROR_CODES.join('|')})\\b(?::|,|$)`);

/**
 * The text with a file error's raw part (its code and everything after it, paths included) put in
 * plain words; whatever came before it (e.g. "Nie udało się zaimportować świata: ") stays.
 * Undefined when the text has no such error.
 */
export function fileErrorText(text: string): string | undefined {
  const found = CODE.exec(text);
  if (!found) return undefined;
  return text.slice(0, found.index) + FILE_ERRORS[found[1]]();
}
