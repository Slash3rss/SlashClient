<!-- dzial: hud | kolejnosc: 40 | ikona: fa-shield-halved | opis: CPS, klawisze, pancerz, efekty, cel, combo, znacznik trafienia, autoclicker i inne moduły do walki -->
# Moduły: walka

Kategoria **Walka** zbiera to, co przydaje się w PvP i przy walce z mobami. Włączysz je w **Prawy Shift → Ustawienia → Walka**.

![Karty kategorii Walka](hud-kategoria-combat.webp)

## CPS i Wskaźnik ataku

**CPS** to kliknięcia na sekundę lewym i prawym przyciskiem myszy. **Wskaźnik ataku** pokazuje, czy następny cios będzie pełny – rysuje się pod celownikiem, gdy używasz celownika SlashClient (zobacz [Dodatki](/wiki/hud-dodatki#celownik)).

![CPS](hud-cps.webp)

## Klawisze

Klawisze WASD, przyciski myszy i spacja na ekranie – wciśnięty klawisz się podświetla. Przydaje się na nagraniach i streamach.

![Klawisze z wciśniętym W](hud-klawisze.webp)

- **Kolor wciśniętego klawisza**.
- **Przyciski myszy**, **CPS pod przyciskami**, **Spacja** – każdą część włączysz osobno.

## Pancerz

Założona zbroja i przedmiot w ręce z wytrzymałością. Kolor podpowiada, ile zostało.

![Pancerz](hud-pancerz.webp)

- **Wytrzymałość** – liczba, procent albo pasek.
- **Poziomo** – w jednym rzędzie zamiast w kolumnie.
- **Przedmiot w ręce** – dokłada broń albo narzędzie.

## Efekty

Lista aktywnych efektów mikstur z czasem do końca. Zastępuje ikonki efektów z gry w prawym górnym rogu.

![Efekty](hud-efekty.webp)

- **Ikonki efektów** – ikonka przy nazwie.

## Licznik przedmiotów

Ile masz w ekwipunku ważnych rzeczy: strzał, pereł Endu, totemów, złotych jabłek, butelek z doświadczeniem, fajerwerków i mikstur.

![Licznik przedmiotów](hud-licznik-przedmiotow.webp)

- Każdą grupę włączysz osobno.
- **Przedmiot w ręce** – liczy też to, co trzymasz (np. bloki przy budowaniu).
- **Własne przedmioty** – wpisz ID po przecinku, np. `cobblestone, tnt, cobweb`.

## Wytrzymałość w ręce

Wytrzymałość narzędzia lub broni, którą trzymasz.

![Wytrzymałość w ręce](hud-wytrzymalosc.webp)

- **Format** – „zostało / maks.” albo procent.
- **Pasek** pod liczbą.
- **Mruga poniżej** – od ilu procent moduł mruga (0–50%).

## Amunicja

Gdy trzymasz łuk albo kuszę, pokazuje, ile masz strzał (zwykłych, spektralnych i z efektami). Z elytrą na sobie albo kuszą w ręce liczy też rakiety.

![Amunicja](hud-amunicja.webp)

## Cel

Nazwa moba albo gracza pod celownikiem, z paskiem zdrowia i odległością.

- **Pasek zdrowia**, **Odległość** – włączane osobno.

![Cel: mob pod celownikiem](hud-cel.webp)

## Siła ciosu, Combo, Zasięg ciosu, Zabójstwa i śmierci

- **Siła ciosu** – jak mocny był ostatni cios w procentach, a przy ciosie krytycznym „Krytyk!”.
- **Combo** – ile trafień z rzędu.
- **Zasięg ciosu** – z jakiej odległości trafiłeś.
- **Zabójstwa i śmierci** – zabójstwa, śmierci i stosunek K/D w tej sesji.

![Siła ciosu, combo, zasięg i K/D](hud-cios.webp)

## Znacznik trafienia

Znaczek przy celowniku, gdy trafisz (działa też z celownikiem z gry). Włączasz go w kategorii Walka: **Znacznik trafienia**.

![Znacznik trafienia po ciosie](hud-trafienie.webp)

| Ustawienie | Co robi |
|---|---|
| Kształt | X, grube X albo plus |
| Kolor, Rozmiar, Jak długo | wygląd i czas pokazywania (100–1000 ms) |
| Osobny kolor przy zabiciu, Kolor zabicia | inny kolor, gdy cios zabił |
| Także strzały i trójzęby | znacznik przy trafieniu z daleka |
| Dźwięk, Jaki dźwięk, Głośność | dzwonek, klik albo kula doświadczenia |

## Koniec wypitej mikstury

Daje znać, gdy skończy się mikstura, którą **wypiłeś** – albo kilka sekund wcześniej. Liczą się tylko efekty z wypitej mikstury: nie te z beaconu, złotego jabłka czy od serwera. Gdy ten sam efekt dostaniesz potem z czegoś innego, przestaje się liczyć. Włączone od razu (Walka → **Koniec wypitej mikstury**).

![Baner u góry: mikstura się kończy](hud-mikstura-baner.webp)

![Powiadomienie w rogu: mikstura się skończyła](hud-mikstura-powiadomienie.webp)

| Ustawienie | Co robi |
|---|---|
| Gdzie | powiadomienie w rogu, baner u góry, nad paskiem przedmiotów albo na czacie |
| Ostrzeż przed końcem | 0–30 sekund wcześniej (0 – dopiero na końcu) |
| Dźwięk | bez dźwięku, pling, dzwonek, ametyst, butelka, kula doświadczenia |
| Głośność | 0–100% |

## Wskaźniki obrażeń

Gdy mob albo gracz obok Ciebie traci zdrowie, nad nim na chwilę unosi się liczba obrażeń – żółta, pomarańczowa przy mocnym ciosie, czerwona przy bardzo mocnym. Włączone od razu.

## Ochrona przed wyrzuceniem

Q nie wyrzuca od razu cennego przedmiotu z ręki (narzędzia, broni, zbroi, czegoś zaklętego lub rzadkiego, shulkera). Na ekranie pojawia się „Naciśnij jeszcze raz, żeby wyrzucić”, a drugie naciśnięcie chwilę później go wyrzuca. Włączone od razu.

## Blokada slotów paska

**K** blokuje slot paska w ręce (a w ekwipunku – slot pod myszką). Z zablokowanego slotu nic nie wypadnie ani nie zostanie przeniesione: Q, Ctrl+Q, zamiana do drugiej ręki, klawisze cyfr i klikanie w ekwipunku są zatrzymywane. Zablokowany slot ma kłódkę na pasku i w ekwipunku. Ekwipunek trybu kreatywnego działa po staremu.

## Ostrzeżenie o zniszczeniu narzędzia

Gdy narzędzie w ręce jest bliskie zniszczenia, na ekranie pojawia się ostrzeżenie z liczbą użyć, które zostały.

![Ostrzeżenie o zniszczeniu narzędzia](hud-ostrzezenie-narzedzie.webp)

- **Ostrzegaj poniżej** – od ilu procent wytrzymałości (1–30%).

## Autoclicker

Klika za Ciebie lewym i/lub prawym przyciskiem myszy.

> Autoclicker, auto tool i uzupełnianie ręki są w porządku w singleplayerze, ale na wielu serwerach (np. z anticheatem) są zakazane i mogą skończyć się banem. Przy pierwszym włączeniu mod o tym ostrzega. Sprawdź zasady serwera.

| Ustawienie | Co robi |
|---|---|
| Tryb | **Przytrzymanie** – klika, dopóki trzymasz przycisk myszy (kopanie działa normalnie); **Przełącznik** – klawisz autoclickera włącza i wyłącza klikanie |
| Lewy przycisk, Lewy: kliknięć na sekundę | 1–20 CPS |
| Prawy przycisk, Prawy: kliknięć na sekundę | 1–20 CPS |
| Lewy klika w | wszystko albo tylko moby – nigdy w graczy |
| Pełne ciosy na moby | czeka na pełną siłę ciosu |
| Nie klikaj lewym z podniesioną tarczą | |
| Klikanie w oknach skrzyń | np. przy sprzedawaniu na serwerach |
| Skakanie, Skoków na sekundę | w trybie Przełącznik może też skakać |

Klawisz autoclickera ustawisz w oknie **Klawisze** (domyślnie brak).
