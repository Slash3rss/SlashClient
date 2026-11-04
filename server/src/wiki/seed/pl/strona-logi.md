<!-- dzial: strona | kolejnosc: 60 | ikona: fa-file-lines | opis: Udostępnianie logu gry linkiem, żeby ktoś pomógł Ci znaleźć problem -->
# Udostępnianie logów

Gdy gra nie działa, log mówi dlaczego. Launcher wyśle go jednym kliknięciem na stronę i da link **slashclient.pl/logi/…**, który wkleisz na czacie albo w [zgłoszeniu błędu](/wiki/strona-zgloszenia).

![Udostępniony log gry](strona-logi.webp)

## Jak udostępnić log

- **Z konsoli**: w launcherze, w zakładce **Graj**, otwórz kartę **Konsola** i kliknij **Udostępnij**. Launcher zapyta „Udostępnić log publicznie?” i po potwierdzeniu skopiuje link.
- **Po crashu**: gdy gra się wysypie, launcher pokaże, co poszło nie tak. Przycisk **Zgłoś błąd** udostępni log i od razu otworzy nowe zgłoszenie z linkiem do niego.

Konto nie jest potrzebne.

## Co launcher ukrywa

Zanim log trafi na stronę, launcher zamienia:

- ścieżkę do Twojego folderu domowego (z nazwą użytkownika komputera) na `~`,
- token logowania Minecrafta na `[ukryte]`,
- inne tokeny na `[ukryty token]`.

Mimo to log może zawierać nick i nazwy serwerów – każdy z linkiem może go przeczytać.

## Co widać na stronie

- liczba linii, rozmiar, kiedy wysłany, kiedy zniknie i ile jest błędów;
- **Szukaj w logu…** i przełącznik **Tylko błędy i ostrzeżenia**; błędy są na czerwono, ostrzeżenia na żółto;
- numery linii – kliknięcie daje link do konkretnej linii;
- przyciski **Kopiuj link**, **Pobierz** i **Zgłoś błąd** (otwiera zgłoszenie z tym logiem).

## Limity

Domyślne wartości (admin może je zmienić):

| Co | Ile |
|---|---|
| Jak długo log zostaje | 90 dni |
| Największy log (zalogowany) | 4 MB |
| Największy log (bez konta) | 1 MB |
