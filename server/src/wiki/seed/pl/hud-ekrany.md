<!-- dzial: hud | kolejnosc: 110 | ikona: fa-house | opis: Menu główne i menu pauzy SlashClient, lista serwerów, ekran ładowania, paczki zasobów serwerów i ponowne łączenie -->
# Menu, lista serwerów i ekrany

SlashClient ma własne menu główne, menu pauzy, listę serwerów i ekran ładowania w wyglądzie launchera. Każde z nich wyłączysz w **Prawy Shift → Ustawienia → Dodatki** – wtedy wraca ekran z gry.

## Menu główne SlashClient

Logo, powitanie („Cześć, …!”), duże przyciski gry jednoosobowej i wieloosobowej, rzadziej używane opcje jako ikonki (nazwa pokazuje się po najechaniu) i Twój skin, który patrzy na kursor. Obok są Twoje serwery z przyciskiem **Dołącz**. Z menu otworzysz też znajomych, kosmetyki, zmianę konta i ustawienia HUD.

![Menu główne SlashClient](hud-menu-glowne.webp)

- **Przełącz na menu Minecrafta** – wraca menu z gry (z niego jest przycisk **Menu SlashClient** z powrotem).
- **Wygląd sezonowy** – świąteczne dodatki, np. na Halloween i 11 listopada.

## Menu pauzy SlashClient

Ten sam wygląd co menu główne: powrót do gry, znajomi, HUD, opcje (w 26.3 także opcje świata) i wyjście; postępy, statystyki, waypointy i menu pauzy z gry jako ikonki. Wyjście działa jak w grze.

![Menu pauzy SlashClient](hud-menu-pauzy.webp)

## Lista serwerów

Jeden panel z wyszukiwarką na górze i kartą każdego serwera: ikona, nazwa, opis serwera w jego kolorach, liczba graczy z paskiem, ping jako kolorowe kreski, inna wersja gry zaznaczona na czerwono. Serwery partnerskie mają swój obrazek i złotą plakietkę, przypięte – pinezkę. Pod spodem są gry w sieci lokalnej.

![Lista serwerów SlashClient](hud-lista-serwerow.webp)

| Klawisz | Co robi |
|---|---|
| strzałki | wybór serwera |
| Shift + strzałki | przesuwa serwer na liście |
| Enter | dołącza |
| Delete | usuwa (po pytaniu) |
| F5 | odświeża |
| pisanie | szuka po nazwie i adresie |

Dodawanie, edycja i łączenie działają przez ekran gry, więc wszystko zachowuje się tak samo jak w zwykłej liście.

### Znajomi przy serwerach na liście

Przy serwerze widać głowy znajomych ze SlashClient, którzy grają na nim teraz. Znajomi, którzy ukrywają, gdzie grają, albo są niewidoczni, się nie pokazują.

## Ekran ładowania

Podczas łączenia z serwerem, pobierania jego paczki zasobów, wczytywania terenu i wchodzenia do świata widać tło SlashClient, kartę z ikoną i nazwą serwera lub świata, etap z paskiem postępu oraz przycisk **Anuluj**, gdy gra go ma.

- **Podpowiedzi na dole ekranu** – losowe wskazówki o klawiszach i funkcjach SlashClient.

## Paczki zasobów serwerów

Dla każdego serwera z listy wybierzesz w jego edycji, co robić z paczką zasobów. Karta **Paczki zasobów serwerów** ustawia to samo dla serwerów spoza listy (bezpośrednie połączenie, LAN).

| Tryb | Co robi |
|---|---|
| Pytaj | gra pyta, jak zawsze |
| Akceptuj automatycznie | paczka pobiera się i wczytuje bez pytania |
| Odrzuć | paczka jest odrzucana; serwer, który jej wymaga, może wyrzucić |
| Ignoruj | paczka się nie pobiera, ale serwer słyszy, że się wczytała – zostają Twoje tekstury |
| Na stałe | paczka zapisuje się w Twoich resourcepackach i zostaje włączona; przy kolejnych wejściach nic się nie pobiera od nowa, a nowsza wersja z serwera sama ją aktualizuje |

Pytanie gry o paczkę ma też pole **Ustaw na stałe**.

## Przycisk „Połącz ponownie”

Gdy serwer Cię rozłączy, na ekranie rozłączenia jest przycisk **Połącz ponownie** – od razu na ten sam serwer.

## Automatyczne odnawianie sesji

Sesja Microsoft, którą gra dostaje przy starcie, wygasa po mniej więcej dobie – potem serwery odpowiadają „Invalid session”. SlashClient prosi launcher o nową sesję dla tego samego konta, zanim stara wygaśnie, i sprawdza ją tuż przed wejściem na serwer. Gdy serwer mimo to odrzuci sesję, zostaje odnowiona od razu, a ekran mówi, żeby połączyć się ponownie.
