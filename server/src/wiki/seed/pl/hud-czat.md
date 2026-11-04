<!-- dzial: hud | kolejnosc: 80 | ikona: fa-comments | opis: Zakładki i okna czatu, wyszukiwarka, godziny, łączenie powtórzeń, kopiowanie, klikalne koordynaty i czat Twitch/Kick -->
# Czat

SlashClient dokłada do czatu gry zakładki, osobne okna, wyszukiwarkę i kilka drobnych udogodnień. Wszystko jest w **Prawy Shift → Ustawienia → Czat**.

![Karty kategorii Czat](hud-kategoria-chat.webp)

![Czat z godzinami, zakładkami, połączonymi powtórzeniami i podkreślonymi koordynatami](hud-czat.webp)

## Zakładki czatu

Nad polem pisania jest rząd zakładek: **Wszystko** i Twoje własne. Zakładka łapie linie zawierające jej tekst albo pasujące do jej wyrażenia regularnego. Zakładki, których nie oglądasz, liczą nowe linie.

Na start są dwie:
- **@** – wiadomości, w których ktoś Cię wspomina (`{nick}` to Twój nick; Twoje własne linie się nie liczą);
- **PM** – prywatne wiadomości w typowych formatach serwerów.

Karta **Zakładki czatu** otwiera ich ustawienia:

![Ustawienia zakładek czatu](hud-opcje-chattabs.webp)

- **Nazwa**, **Co wyłapywać** (słowa po przecinku albo regex), **Bez** – linie z tym tekstem do zakładki nie trafią. Puste „Co wyłapywać” i coś w „Bez” to wszystko oprócz.
- **Prefiks odpowiedzi** – co dodać przed wiadomością wysłaną z tej zakładki, np. `/msg Steve ` albo `/g `.
- **Pole do pisania** – wyciągnięta zakładka dostaje własną linię do pisania.
- **Dźwięk oznaczenia** – dzwonek, pling, kurant, harfa, kula doświadczenia, ametyst, klik albo bez dźwięku.
- Kolejność zakładek zmienisz strzałkami.
- **Kopiuj zakładki** / **Wklej zakładki** – kod zakładek do udostępnienia (zakładki o tej samej nazwie są zastępowane).

### Wyciągnięte okna

Zakładkę złap myszką i wyciągnij z rzędu – staje się osobnym okienkiem czatu w dowolnym miejscu ekranu, pokazującym tylko jej linie. W grze nowe linie znikają jak na czacie; z otwartym czatem okno pokazuje historię, przewija się kółkiem, przesuwa za tytuł, a róg zmienia jego rozmiar. Kliknięcie tytułu zwija okno, a przycisk przypina je z powrotem do czatu.

- **Wyciągnięte zakładki tylko w swoich oknach** – ich linie znikają z „Wszystko”.

## Wyszukiwarka czatu

Pole **Szukaj na czacie…** przy otwartym czacie zostawia tylko pasujące linie.

![Wyszukiwarka czatu](hud-czat-szukaj.webp)

## Godzina w czacie

Przed każdą linią godzina, o której przyszła, np. `[18:05]`.

## Łączenie powtórzeń

Ta sama linia kilka razy z rzędu nie zapycha czatu – zostaje jedna z dopiskiem „×3”. Włączone od razu.

## Kopiowanie prawym klikiem

Prawy klik na linii kopiuje całą wiadomość do schowka.

| Ustawienie | Opcje |
|---|---|
| Format | tekst, kody §, kody &, JSON |
| Godzina na początku | bez, GG:MM, GG:MM:SS |
| Bez nadawcy | sama treść |
| Powiadomienie | bez, krótkie, z tekstem |

## Klikalne koordynaty w czacie

Współrzędne w wiadomościach (`123 64 -456`, `x: 123 y: 64 z: -456`, `X 123 Z -456`, `123, 64, -456`) są podkreślone. Kliknięcie otwiera okienko **Zapisz jako waypoint** z nazwą „Z czatu: nadawca”. Godziny, daty, ceny i liczby w słowach nie są brane za koordynaty.

## Oznaczenia (dźwięk i @)

Gdy ktoś napisze Twój nick, słychać dźwięk, a zakładka **@** dostaje znaczek. Działa też w wyciągniętych oknach.

## Dłuższa historia czatu

Zamiast 100 linii gra pamięta ich tyle, ile ustawisz (**Linii w historii**, do 16 000) – i tyle samo Twoich wysłanych wiadomości pod strzałką w górę. Na płynność gry to nie wpływa.

## Zachowaj czat po wyjściu z serwera

Gra normalnie czyści czat przy wyjściu z serwera; z tą opcją zostaje. Włączone od razu.

## Czat Twitch i Kick

Moduły **Czat Twitch** i **Czat Kick** pokazują na ekranie gry czat wybranego kanału na żywo.

| Ustawienie | Co robi |
|---|---|
| Kanał | nazwa kanału albo link |
| ID czatu (gdy Kick blokuje) | tylko Kick: numer czatu, gdy Kick odmawia wyszukania kanału |
| Liczba linii | 3–20 |
| Szerokość | 120–400 px |
| Odznaki ([MOD], [SUB], [VIP]) | odznaki przy nickach |
| Kolory nicków | kolory z Twitcha/Kicka |
| Wiadomości znikają | jak czat gry |

Moduł sam się łączy i ponawia połączenie; jego stan (np. „łączenie z …”) widać, dopóki nie przyjdą wiadomości.
