<!-- dzial: start | kolejnosc: 20 | ikona: fa-download | opis: Jak pobrać i zainstalować SlashClient na Windowsie, macOS i Linuksie oraz jak działają aktualizacje -->
# Pobieranie i instalacja

SlashClient pobierzesz ze strony głównej [slashclient.pl](https://slashclient.pl). Strona sama rozpoznaje system i pokazuje przycisk **Pobierz dla …**. Pod nim, w linii **Inne systemy:**, są wersje dla pozostałych systemów.

![Sekcja pobierania na stronie głównej](strona-pobierz.webp)

## Która wersja jest dla mnie

| System | Plik | Bezpośredni link |
|---|---|---|
| Windows 10 i 11 (64-bit) | instalator `SlashClient-Setup-….exe` | [/pobierz/windows](https://slashclient.pl/pobierz/windows) |
| macOS na Apple Silicon (M1 i nowsze) | `….dmg` (arm64) | [/pobierz/mac](https://slashclient.pl/pobierz/mac) |
| macOS na procesorze Intel | `….dmg` | [/pobierz/mac-intel](https://slashclient.pl/pobierz/mac-intel) |
| Linux (x64) | `….AppImage` | [/pobierz/linux](https://slashclient.pl/pobierz/linux) |
| Linux na ARM (np. Raspberry Pi 5) | `…-arm64.AppImage` | [/pobierz/linux-arm](https://slashclient.pl/pobierz/linux-arm) |

Linki zawsze prowadzą do najnowszego wydania. Na telefonie przycisk pobierania jest wyłączony i mówi, że SlashClient działa na komputerze – na telefon jest za to [aplikacja do czatu ze znajomymi](/wiki/strona-aplikacja).

## Windows

1. Pobierz instalator i uruchom go.
2. Jeśli Windows pokaże okno „System Windows ochronił ten komputer”, kliknij **Więcej informacji**, a potem **Uruchom mimo to**.
3. Wybierz folder instalacji (możesz zostawić domyślny) i kliknij **Zainstaluj**. Instalator doda skrót na pulpicie i w menu Start.

## macOS

1. Pobierz plik `.dmg` dla swojego procesora i otwórz go.
2. Przeciągnij **SlashClient** do folderu **Aplikacje**.
3. Przy pierwszym uruchomieniu macOS może powiedzieć, że nie może sprawdzić aplikacji (SlashClient nie jest jeszcze podpisany przez Apple). Kliknij aplikację prawym przyciskiem, wybierz **Otwórz** i potwierdź. Wystarczy raz.

> Trzymaj SlashClient w folderze **Aplikacje**. Uruchomiony z innego miejsca (np. prosto z obrazu `.dmg` albo z Pobranych) nie może się sam aktualizować i launcher zaproponuje przeniesienie.

## Linux

1. Pobierz plik `.AppImage`.
2. Nadaj mu prawo do uruchamiania (we właściwościach pliku albo `chmod +x SlashClient-*.AppImage`) i uruchom go.
3. Launcher zaproponuje instalację: przeniesie się do folderu `~/Applications`, doda się do menu aplikacji z ikoną i dalej będzie się sam aktualizował. W kreatorze możesz też dodać skrót na pulpicie.

## Aktualizacje

Launcher sam sprawdza nowe wersje. Na Windowsie i Linuksie nowa wersja pobiera się w tle i instaluje przy ponownym uruchomieniu. Na Macu tak samo, o ile SlashClient jest w folderze Aplikacje. Co się zmieniło, zobaczysz w [historii zmian](/wiki/strona-zmiany).

## Co dalej

Po pierwszym uruchomieniu otworzy się [kreator](/wiki/start-pierwsze-uruchomienie), który w minutę przygotuje wszystko do gry.
