<!-- dzial: start | kolejnosc: 50 | ikona: fa-microchip | opis: Na jakim komputerze działa SlashClient: systemy, pamięć RAM, Java i miejsce na dysku -->
# Wymagania systemowe

SlashClient działa wszędzie tam, gdzie działa sam Minecraft, a launcher dobiera ustawienia do Twojego komputera.

## Systemy

| System | Wymagania |
|---|---|
| **Windows** | Windows 10 albo 11, 64-bit |
| **macOS** | macOS 12 (Monterey) lub nowszy; osobne wersje dla Apple Silicon i Intela |
| **Linux** | 64-bit (x64) albo ARM64, np. Raspberry Pi 5; plik AppImage |

## Pamięć RAM

Launcher sam proponuje, ile pamięci dać grze: zostawia co najmniej 4 GB dla systemu i nie schodzi poniżej 2 GB.

| Profil | Ile launcher poleca dać grze |
|---|---|
| Czysta gra (vanilla) | do 4 GB |
| Fabric z kilkoma modami | do 6 GB |
| Ponad 60 modów | do 8 GB |
| Ponad 150 modów | do 10 GB |

Na komputerze z 8 GB RAM gra dostanie więc około 4 GB, a z 16 GB – tyle, ile potrzebuje. Wartość zmienisz w ustawieniach profilu (**Pamięć RAM**) albo dla nowych profili w **Ustawieniach** (**Pamięć RAM dla nowych profili**).

> Więcej pamięci nie zawsze znaczy szybciej. Za dużo RAM-u potrafi wydłużyć przycięcia. Trzymaj się podpowiedzi launchera.

## Java

Nie musisz instalować Javy. Launcher pobiera sam taką wersję, jakiej potrzebuje wybrana wersja gry (Java 17 dla 1.20.1–1.20.4, 21 dla 1.20.5–1.21.x, 25 dla 26.x). W ustawieniach profilu możesz wybrać inną Javę albo własną ścieżkę, a w benchmarku porównać, która działa szybciej.

## Karta graficzna

Wystarczy karta ze sterownikami obsługującymi OpenGL wymagany przez Minecrafta. Jeśli gra wysypie się przez sterowniki, launcher powie to po zamknięciu gry („Problem ze sterownikami grafiki”) – zaktualizuj wtedy sterowniki karty.

## Słabszy komputer

- W [kreatorze](/wiki/start-pierwsze-uruchomienie) albo w ustawieniach profilu wybierz **Tryb dla słabszych komputerów**.
- Zainstaluj mody poprawiające wydajność (Sodium, Lithium…) – kreator robi to jednym kliknięciem.
- Włącz **Ogranicz animacje** w ustawieniach launchera.
- Zmierz efekty [benchmarkiem](/wiki/strona-benchmark).

## Miejsce na dysku

Launcher z jedną wersją gry zajmuje zwykle około 1–2 GB, więcej z modami, paczkami zasobów i światami. Pliki gry i profili są w folderze danych SlashClient – zob. [Gdzie są moje pliki](/wiki/faq-czeste-pytania).
