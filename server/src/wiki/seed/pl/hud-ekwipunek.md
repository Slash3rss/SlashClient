<!-- dzial: hud | kolejnosc: 100 | ikona: fa-box-open | opis: Sortowanie, wyszukiwarka, blokada slotów, podgląd shulkerów, kolory zaklęć, mouse tweaks i szybki crafting -->
# Ekwipunek i crafting

Pomoce w ekwipunku, skrzyniach i craftingu. Wszystkie są w **Prawy Shift → Ustawienia → Dodatki** (blokada slotów – w kategorii Walka). Działają zwykłymi kliknięciami gry, takimi jak ręka gracza, więc serwer nie widzi nic dziwnego.

![Ekwipunek z wyszukiwarką, kolorami zaklęć i blokadą slotu](hud-ekwipunek-zaklecia.webp)

## Sortowanie skrzyń i ekwipunku

**R** nad otwartą skrzynią, beczką, shulkerem albo skrzynią Kresu sortuje jej zawartość, a w ekwipunku – plecak. To samo robi mały przycisk w rogu okna. Kolejność: narzędzia i zbroja, bloki, jedzenie, reszta; potem nazwa i liczba. Niepełne stosy tego samego przedmiotu najpierw się łączą.

| Ustawienie | Co robi |
|---|---|
| Odstęp między kliknięciami | 0–250 ms, dla serwerów, które wyrzucają za szybkie klikanie |
| Sortuj też pasek szybkiego wyboru | domyślnie hotbar zostaje |
| Przycisk sortowania w oknie | mały przycisk w rogu |
| Strzałki „włóż wszystko” i „weź wszystko” w skrzyniach | przenoszą wszystko jednym kliknięciem |
| Wkładaj też z hotbara | „włóż wszystko” bierze także z paska |
| Wyłączone na serwerach | lista adresów; domyślnie `hypixel.net`, którego zasady zabraniają sortowania |

Zamknięcie okna przerywa sortowanie. Ekwipunek trybu kreatywnego nie jest sortowany.

## Wyszukiwarka w ekwipunku

Nad ekwipunkiem i skrzyniami jest pole **Szukaj…**. Pasujące sloty dostają ramkę, reszta przygasa. Szuka po nazwie, zaklęciach, opisie, ID przedmiotu, a w shulkerze – po jego zawartości. Pole łapie klawisze dopiero po kliknięciu; Enter z niego wychodzi, Esc zamyka okno.

## Blokada slotów paska

**K** blokuje slot w ręce, a w ekwipunku – slot paska pod myszką. Z zablokowanego slotu nic nie wypadnie ani nie zostanie zabrane: Q, Ctrl+Q, zamiana rąk, klawisze cyfr, Shift-klik i podnoszenie są zatrzymywane. Zablokowany slot ma kłódkę.

## Podgląd zawartości shulkerów

Podpowiedź shulkera pokazuje jego 27 slotów jako siatkę przedmiotów z liczbami, na tle w kolorze skrzynki.

![Podgląd zawartości shulkera w podpowiedzi](hud-ekwipunek-shulker.webp)

## Kolory poziomów zaklęć

Poziomy zaklęć w opisie przedmiotu mają kolory: szary – poniżej połowy najwyższego poziomu, turkusowy – od połowy, złoty – najwyższy, różowy – ponad najwyższy (z serwera). Klątwy zostają czerwone.

## Mouse tweaks

- **Shift + przeciąganie** lewym przyciskiem po slotach przenosi każdy z nich, jak Shift-klik.
- **Kółko myszy** nad slotem przenosi jedną sztukę: w dół – na drugą stronę (do skrzyni albo między paskiem a plecakiem), w górę – jedną taką samą z powrotem.

## Shift w craftingu tylko tyle, ile się zmieści

Shift-klik na wyniku craftingu robi tylko tyle, ile zmieści się w ekwipunku – z miejscem na to, co zostanie na siatce. Po zamknięciu stołu resztki wracają do Ciebie, zamiast wypaść na ziemię. Gdy miejsca nie ma, pokazuje się komunikat.

## Szybki crafting

Kliknięcie przepisu w książce receptur od razu go crafuje i wkłada wynik do ekwipunku; z **Shiftem** – cały stack. W przecinarce do kamienia wybranie wariantu wycina jedną sztukę, z Shiftem całe wejście. Domyślnie wyłączony.

- **Alt** (i opcjonalnie **Ctrl**) trzymany przy kliknięciu tylko układa składniki, jak zwykle.
- **Klawisz wyrzucania** trzymany przy kliknięciu wyrzuca wynik na ziemię.
- Klawisze (domyślnie brak): **Powtórz ostatni przepis** (trzymany crafuje w kółko) i **Wyłącz na chwilę**.

## Ochrona przed wyrzuceniem

Q nie wyrzuca od razu cennego przedmiotu – opis na stronie [Walka](/wiki/hud-walka#ochrona-przed-wyrzuceniem).
