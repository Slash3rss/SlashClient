<!-- dzial: hud | kolejnosc: 20 | ikona: fa-sliders | opis: Edytor układu, okno ustawień, wygląd HUD, gotowe układy, kody udostępniania i układy dla serwerów -->
# Menu i edytor HUD

Wszystko w modzie ustawiasz w jednym miejscu: w edytorze HUD. Ma dwie części – **edytor układu**, w którym przesuwasz moduły po ekranie, i **okno ustawień** z kartami wszystkich modułów i dodatków.

## Edytor układu

**Prawy Shift** w świecie otwiera edytor. Każdy włączony moduł ma ramkę; moduły, które w tej chwili nie mają nic do pokazania (np. Ping w singleplayerze), pokazują przykładową treść, żeby dało się je ustawić.

![Edytor układu z modułami i częściami interfejsu gry](hud-edytor-ukladu.webp)

- **Przeciągnij** moduł myszką, żeby go przesunąć. Moduł przyciąga się do krawędzi ekranu, do środka i do linii innych modułów; postawiony obok innego modułu ustawia się równo z nim, z małym odstępem.
- **Strzałki** (albo WASD) przesuwają ostatnio chwycony moduł o piksel, z **Shiftem** o 10 pikseli.
- **Prawy przycisk myszy** na module otwiera jego ustawienia. Ikona zębatki obok modułu robi to samo, a **×** w rogu go ukrywa (wróci z jego karty w ustawieniach).
- Gdy moduły leżą jeden na drugim, drugie kliknięcie w to samo miejsce albo **Alt+klik** chwyta ten spod spodu.
- Części interfejsu gry (czat, tablica wyników, pasek bossa, lista graczy, tytuły, powiadomienia, pasek akcji) też mają ramki i przesuwasz je tak samo – zobacz [Interfejs gry](/wiki/hud-interfejs-gry).
- **Ctrl+Z** cofa, **Ctrl+Y** (albo Ctrl+Shift+Z) ponawia zmianę; na Macu z Cmd. Te same przyciski są na górze okna ustawień.

Przycisk **Ustawienia** na środku ekranu otwiera okno ustawień.

## Okno ustawień

![Okno ustawień: kategorie po lewej, karty modułów i wyszukiwarka](hud-ustawienia.webp)

- Po lewej są kategorie: **Wszystkie**, **Informacje**, **Walka**, **Świat**, **Interfejs gry**, **Dodatki**, **SkyUp**, **Czat**, **Udostępnij**. Karty SkyUp.pl są tylko w swojej kategorii, nie w „Wszystkie”. Na dole jest przycisk **Edytuj układ**, który wraca do przesuwania modułów.
- **Wyszukiwarka** szuka po polsku i po angielsku, także bez polskich znaków („zegar”, „clock” i „zrodlo” znajdą to, co trzeba).
- **Kliknięcie karty** włącza albo wyłącza moduł. Zębatka na karcie otwiera jego ustawienia. Karty, które tylko coś otwierają (np. Klawisze, Kalkulator XP), otwierają to kliknięciem.
- **Gwiazdka** w rogu karty dodaje ją do ulubionych – ulubione są zawsze na początku listy.

### Ustawienia każdego modułu

Każdy moduł ma najpierw swoje własne opcje, a pod nimi wspólne ustawienia wyglądu i widoczności:

![Ustawienia modułu Współrzędne](hud-opcje-coords.webp)

| Ustawienie | Co robi |
|---|---|
| Rozmiar | skala modułu od 0,5× do 2× |
| Tło, Krycie tła | tło pod modułem i jego przezroczystość |
| Ramka | obwódka wokół modułu |
| Własne zaokrąglenie rogów | rogi inne niż w całym HUD |
| Własny kolor tekstu, Cień | kolor i cień tekstu tylko tego modułu |
| Pokazuj | zawsze, tylko w świecie jednoosobowym, tylko na serwerach albo tylko na wybranym serwerze (wpisujesz część adresu, np. `skyup.pl`) |
| Chowaj przy otwartym czacie | moduł znika, gdy piszesz na czacie |
| Chowaj przy otwartym ekwipunku i innych oknach | moduł znika w ekwipunku, skrzyniach itd. |

Moduły będące obrazkiem (np. minimapa) nie mają opcji tła, a moduły kolorujące tekst same (np. pancerz) nie mają koloru tekstu.

## Wygląd HUD

Karta **Wygląd HUD** w kategorii Dodatki zmienia wygląd wszystkich modułów naraz.

![Ustawienia wyglądu HUD](hud-opcje-appearance.webp)

- **Akcent okien SlashClienta** – kolor przycisków i zaznaczeń w oknach moda; jeden z gotowych albo własny w formacie `#RRGGBB`.
- **Kolor tekstu**, **Cień** – domyślne dla modułów.
- **Tło pod modułami**, **Kolor tła**, **Kolor obwódki**.
- **Zaokrąglenie rogów modułów** – od kwadratowych do mocno zaokrąglonych.

## Udostępnij: kody, gotowe układy i układy dla serwerów

Kategoria **Udostępnij** zbiera wszystko, co dotyczy całego układu.

![Strona Udostępnij: kody, gotowe układy i układy dla serwerów](hud-kategoria-share.webp)

### Kod ustawień

- **Kopiuj kod** zapisuje do schowka kod z modułami, ich miejscami, dodatkami i zakładkami czatu. Wklej go znajomemu na czacie albo na Discordzie.
- **Wklej kod** wczytuje ustawienia z kodu, który masz w schowku.
- **Domyślne** przywraca ustawienia fabryczne.

### Gotowe układy

Jednym kliknięciem włączasz zestaw modułów. Zmieniają się tylko moduły, a Twój układ wraca przyciskiem **Wróć do mojego układu** albo przez Ctrl+Z.

| Układ | Co włącza |
|---|---|
| Minimalny | FPS, współrzędne, efekty |
| PvP | CPS, klawisze, cel, pancerz |
| Survival i budowanie | minimapa, kompas, biom |
| Serwery partnerskie | mapa dungeonu, łupy, zadania |
| Streamer | klawisze, muzyka, czas, czat |

Własny układ zapiszesz, wpisując nazwę i klikając **Zapisz obecny** – możesz mieć do 12 własnych układów. Zapisany układ usuwasz × na jego karcie (trzeba kliknąć dwa razy).

### Układy dla serwerów

Gdy jesteś na serwerze, możesz zapisać układ tylko dla niego. Włącza się sam, kiedy na ten serwer wejdziesz, a w singleplayerze i na innych serwerach wraca Twój zwykły układ. Układ serwera to sam wygląd HUD: miejsca i ustawienia modułów, części interfejsu gry, kolory i rozmiar czatu. Dodatki i zakładki czatu są wszędzie te same.
