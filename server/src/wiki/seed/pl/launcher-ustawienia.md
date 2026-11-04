<!-- dzial: launcher | kolejnosc: 130 | ikona: fa-gear | opis: Ustawienia launchera: język, pamięć, Java, okno, powiadomienia, aktualizacje i kanał beta, pobieranie, sprzątanie miejsca i wsparcie -->
# Ustawienia i aktualizacje

Zakładka **Ustawienia** zbiera ustawienia całego launchera. Karty są obok siebie na szerokim oknie i jedna pod drugą na wąskim.

![Ustawienia launchera](launcher-ustawienia.webp)

## Ustawienia ogólne

| Ustawienie | Co robi |
|---|---|
| **Język** | Polski albo English; zmienia się od razu |
| **Pamięć RAM dla nowych profili** | ile pamięci dostają nowe profile (każdy może mieć swoją) |
| **Ustawiaj zalecaną ilość** | nowe profile i modpacki dostają tyle, ile zalecamy dla ich modów i Twojego komputera (albo ile zalecają autorzy modpacka) |
| **Java dla profili** | Mojang (domyślna), Eclipse Temurin, GraalVM Community albo Azul Zulu; profil może wybrać inną, a gdy wybranej nie ma dla wersji gry, gra uruchomi się na Javie od Mojang |
| **Okno launchera przy uruchomieniu** | rozmiar od 1000 × 640 do 1920 × 1080, **Zapamiętaj ostatni rozmiar i miejsce**, **Zmaksymalizowane** albo **Pełny ekran** |
| **Chowaj launcher podczas gry** | launcher znika na czas gry i wraca po jej zamknięciu |
| **Pokazuj podsumowanie sesji po zamknięciu gry** | okno [Podsumowanie sesji](/wiki/launcher-statystyki) |
| **Ogranicz animacje (dla słabszych komputerów)** | bez przejść, nieruchome tło i postacie 3D |
| **Wygląd sezonowy (Halloween, 11 listopada)** | halloweenowy wygląd pod koniec października i biało-czerwony na Święto Niepodległości |
| **Pokazuj na Discordzie, w co grasz** | status na Discordzie: na jakim serwerze, w grze jednoosobowej albo w menu |
| **Powiadomienia systemowe, gdy launcher jest w tle** | wiadomości, zaproszenia, osiągnięcia i zakończone pobierania jako powiadomienia systemu |
| **Dźwięk powiadomień systemowych** | dźwięk przy tych powiadomieniach |

**Uruchom kreator ponownie** otwiera kreator pierwszego uruchomienia: język, konto Minecraft, import z innych launcherów, pierwszy profil, wygoda i znajomi. Każdy krok można pominąć (**Pomiń kreator**).

![Kreator pierwszego uruchomienia](launcher-kreator.webp)

Pod ustawieniami jest **Folder danych** – miejsce, gdzie launcher trzyma profile, wersje gry i ustawienia.

## Aktualizacje

Launcher aktualizuje się sam: pobiera nową wersję w tle, a pasek na górze okna pokazuje postęp i przycisk **Uruchom ponownie**. Gdy grasz, aktualizacja zainstaluje się po zamknięciu gry.

- **Sprawdź aktualizacje** – sprawdza od razu; obok jest wersja launchera.
- **Kanał aktualizacji**: **Stabilny** albo **Beta**. Beta to wcześniejsze wersje z nowościami przed wydaniem – mogą mieć błędy. Powrót na stabilny czeka na następne zwykłe wydanie. Wybór kanału pojawia się, gdy serwer SlashClient udostępnia bety.
- **Historia zmian** – notki wszystkich wydań.
- **Wróć do poprzedniej wersji** – lista ostatnich wydań; po powrocie automatyczne aktualizacje czekają na wydanie nowsze niż to, z którego wróciłeś (przełącznik **Automatyczne aktualizacje** pozwala je włączyć wcześniej).
- **Pokazuj „Co nowego” po aktualizacjach** – okno z nowościami przy pierwszym uruchomieniu nowej wersji.

![Historia zmian](launcher-historia-zmian.webp)

## Pobieranie i grafika

- **Limit prędkości pobierania** – **Bez limitu** albo od 0,5 do 50 MB/s, dla modów, modpacków, plików gry i Javy.
- **Uruchamiaj grę na dedykowanej karcie graficznej** – dla laptopów z dwiema kartami (Windows ustawia preferencję „Wysoka wydajność” dla Javy launchera, Linux używa PRIME).

## Sprzątanie miejsca

Karta **Sprzątanie miejsca** pokazuje, ile miejsca zajmują dane launchera, i proponuje, co można bezpiecznie usunąć.

1. Wybierz, od ilu dni logi i kopie zapasowe są stare (**Logi i kopie zapasowe starsze niż** 7, 30, 90 albo 180 dni).
2. Kliknij **Sprawdź** – zobaczysz zajęte miejsce według rodzaju i listę do usunięcia: nieużywana Java, wersje gry i biblioteki, stare logi i kopie zapasowe, pamięć podręczna oraz foldery usuniętych profili.
3. Zaznacz, co usunąć, i kliknij **Przenieś do kosza**. Wszystko trafia do kosza systemowego, więc da się to odzyskać.

![Sprzątanie miejsca](launcher-sprzatanie.webp)

> Sprzątanie jest niedostępne, gdy gra jest włączona.

## Wesprzyj projekt

SlashClient jest darmowy. Karta **Wesprzyj projekt** pozwala dobrowolnie go wesprzeć na stronie – wspierający dostają rangę Wspierający, kosmetyki i więcej miejsca w chmurze, bez przewag w grze.

- **Wesprzyj projekt** – otwiera stronę wsparcia w przeglądarce;
- **Historia płatności** – Twoje płatności ze statusem, potwierdzeniem i przyciskiem **Poproś o zwrot**;
- **Płatności i zwroty na stronie** – szczegóły na stronie SlashClient.

![Karta Wesprzyj projekt](launcher-wsparcie.webp)

## Ogłoszenia i wyłączone funkcje

Administrator SlashClient może wyświetlić ogłoszenie na górze launchera (z przyciskiem **Więcej**) albo chwilowo wyłączyć część funkcji (np. sklep, społeczności, chmurę). Wyłączona funkcja pokazuje wtedy „Chwilowo wyłączone przez administratora”.
