<!-- dzial: hud | kolejnosc: 70 | ikona: fa-table-columns | opis: Tablica wyników, pasek bossa, lista graczy, tytuły, czat, stackowanie serc i podgląd jedzenia -->
# Interfejs gry

Kategoria **Interfejs gry** zmienia części ekranu, które rysuje sama gra: tablicę wyników, pasek bossa, listę graczy, pasek akcji, tytuły, powiadomienia i czat. Każdą z nich przesuniesz w edytorze (Prawy Shift) jak zwykły moduł, przeskalujesz albo ukryjesz.

![Tablica wyników, pasek bossa, waypoint i stackowane serca w grze](hud-interfejs-gry.webp)

![Karty kategorii Interfejs gry](hud-kategoria-game.webp)

## Tablica wyników

Scoreboard serwera z boku ekranu.

- **Rozmiar** – od 0,5× do 1,5×.
- **Czerwone liczby** – liczby punktów po prawej; wyłączone zostawiają same nazwy.

## Pasek bossa

Pasek zdrowia bossa (albo komunikatów serwera) u góry. **Rozmiar** od 0,5× do 1,5×.

## Lista graczy (TAB)

| Ustawienie | Co robi |
|---|---|
| Rozmiar | 0,5×–1,5× |
| Ping w milisekundach | liczba zamiast kresek |
| Ukryj nagłówek serwera / Ukryj stopkę serwera | chowa teksty serwera nad i pod listą |
| Najwięcej graczy na liście | 10–80 |
| Tło pod graczami, Tło listy | przezroczystość tła |

## Pasek akcji

Napis nad paskiem szybkiego wyboru. **Rozmiar** i **Kolor komunikatów SlashClient** – kolor, w jakim mod wyświetla tam swoje komunikaty (np. „Fullbright włączony”). W Minecrafcie 1.20.1–1.20.4 pasek akcji nie ma ramki w edytorze.

## Tytuły na ekranie

Duży tytuł i podtytuł na środku ekranu. **Rozmiar** od 0,5× do 1,5×.

## Powiadomienia (toasty)

Wyskakujące okienka gry (osiągnięcia, przepisy) i SlashClient. W edytorze przeniesiesz je w inny róg. Jakie powiadomienia SlashClient się pokazują, ustawisz w karcie **Powiadomienia SlashClient** – zobacz [Znajomi, emotki i powiadomienia](/wiki/hud-spolecznosc).

## Czat

Czat gry w edytorze ma swoją ramkę – przesuniesz go w dowolne miejsce. **Krycie tła** i **Rozmiar** to te same ustawienia co w „Ustawieniach czatu” gry, ale rozmiar może być większy niż 1×. Funkcje czatu SlashClient opisuje strona [Czat](/wiki/hud-czat).

## Twój nick na F5

Pokazuje Twój własny nick nad głową w widoku z trzeciej osoby.

## Stackowanie serc

Niezależnie od liczby serc zawsze jeden rząd. Pierwsze 10 serc to zwykłe czerwone; każde kolejne 10 wypełnia rząd od nowa w następnym kolorze, a mały napis „×2”, „×3” obok mówi, który to rząd. Serca absorpcji pokazują się jako złote „+4” po lewej. Włączone od razu.

![Stackowane serca (×3, +4 absorpcji) i podgląd jedzenia na pasku głodu](hud-serca-i-jedzenie.webp)

## Jedzenie: głód, nasycenie i leczenie

Gdy trzymasz jedzenie, na pasku głodu migają udka, które doda, złoty obrys pokazuje nasycenie, a migające serca – ile zdrowia odnowisz po zjedzeniu. Włączone od razu.

| Ustawienie | Co robi |
|---|---|
| Wartości jedzenia w opisie przedmiotu | głód i nasycenie w podpowiedzi |
| Nasycenie na pasku głodu zawsze | nie tylko z jedzeniem w ręce |
| Pasek zmęczenia na udkach | tylko w świecie jednoosobowym (serwer go nie wysyła) |
| Serca odnowione po zjedzeniu | migające serca |
| Głód, nasycenie i zmęczenie w F3 | dodatkowe linie na ekranie debugowania |
