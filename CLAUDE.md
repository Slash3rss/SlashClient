@AGENTS.md

## Dodatkowo dla Claude Code

- Właściciel często pisze z telefonu: odpowiadaj po polsku, krótko, a zrzuty ekranu wysyłaj jako pliki.
- Niezależne części dużej zmiany (serwer, launcher, mod) można dać subagentom w osobnych worktree; po ich pracy
  scal gałęzie do `main`, rozwiąż konflikty (zwykle „zostaw obie strony”: importy, kategorie ustawień, słowniki),
  i przepuść wszystkie testy jeszcze raz.
- Skrypty edycji z polskimi znakami zapisuj narzędziem Write do pliku i uruchamiaj – heredoc w powłoce psuje znaki.
- Pliki tymczasowe, bazy testowe i dane izolowanego launchera trzymaj w scratchpadzie, nie w repo.
