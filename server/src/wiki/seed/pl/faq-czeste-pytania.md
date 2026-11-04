<!-- dzial: faq | kolejnosc: 10 | ikona: fa-circle-question | opis: Rozwiązania częstych problemów: gra nie startuje, Java, pamięć, antywirus, mody, pliki i zgłaszanie błędów -->
# Częste pytania

## Gra się nie uruchamia

Gdy gra się wysypie albo zamknie z błędem, launcher czyta log i mówi, co poszło nie tak – z podpowiedzią, jak to naprawić. Najczęstsze komunikaty:

| Komunikat | Co zrobić |
|---|---|
| **Grze zabrakło pamięci RAM** | Zwiększ pamięć w ustawieniach profilu (zob. niżej) albo zmniejsz liczbę modów i zasięg renderowania. |
| **Mod loader nie obsługuje tej wersji Javy** | Zaktualizuj mod loader i mody do wersji pod tę wersję gry. |
| **Mody nie pasują do siebie** | Brakuje moda albo wersje się gryzą – kliknij **Zainstaluj brakujące** albo sprawdź mody (zob. niżej). |
| **Ten sam mod jest zainstalowany dwa razy** | Usuń starszą kopię moda z profilu. |
| **Uszkodzony plik** | Usuń i zainstaluj ponownie ostatnio dodane mody; jeśli to nie pomoże, uruchom grę jeszcze raz, a launcher sprawdzi pliki. |
| **Niepełna instalacja gry** | Uruchom grę jeszcze raz – launcher dociągnie brakujące pliki. |
| **Problem ze sterownikami grafiki** | Zaktualizuj sterowniki karty graficznej. Na laptopie z dwiema kartami ustaw dla Javy kartę dedykowaną. |
| **Gra wysypała się w kodzie natywnym** | Zaktualizuj sterowniki; z shaderami albo modami graficznymi (Sodium, Iris) spróbuj bez nich. |
| **System zamknął grę** | Zamknij inne programy albo zmniejsz RAM w profilu. |

Nie pomogło? [Udostępnij log](/wiki/strona-logi) i [zgłoś błąd](/wiki/strona-zgloszenia) – przycisk **Zgłoś błąd** w oknie po crashu zrobi oba kroki naraz.

## Java

Nie musisz instalować Javy – launcher pobiera sam taką, jakiej potrzebuje wersja gry (zob. [Wspierane wersje](/wiki/start-wersje)). Jeśli w ustawieniach profilu ustawiłeś własną Javę albo własną ścieżkę i gra nie startuje, wróć do domyślnej (**Mojang (domyślna)**).

## Ile pamięci RAM dać grze

Trzymaj się podpowiedzi launchera pod suwakiem **Pamięć RAM** w ustawieniach profilu. Za mało pamięci kończy się crashem, za dużo – dłuższymi przycięciami i brakiem pamięci dla systemu. Szczegóły: [Wymagania systemowe](/wiki/start-wymagania).

## Antywirus blokuje launcher albo pliki gry

- Przy pierwszym uruchomieniu na Windowsie może pojawić się okno „System Windows ochronił ten komputer” – kliknij **Więcej informacji** → **Uruchom mimo to**.
- Komunikat „Brak dostępu do pliku” zwykle znaczy, że plik trzyma inny program (często antywirus). Zamknij grę i takie programy i spróbuj ponownie.
- Jeśli antywirus usuwa pliki gry, dodaj folder danych SlashClient (zob. niżej) do wyjątków.
- Na macOS przy pierwszym uruchomieniu kliknij aplikację prawym przyciskiem → **Otwórz**. Zob. [Instalacja](/wiki/start-instalacja).

## Mody się gryzą

Launcher sprawdza mody w profilu, zanim uruchomi grę. Jeśli widzi problem (brakujący mod, mod do innej wersji gry albo innego loadera, ten sam mod dwa razy, mody, które nie działają razem), pyta, czy uruchomić mimo to.

Szczegóły i poprawki są w **Profile** → **Mody i zasoby** → **Zainstalowane**: brakujące mody launcher sam poszuka na Modrinth i CurseForge, a niepasujące możesz wyłączyć albo zaktualizować. Mod SlashClient HUD launcher dokłada sam – nie wrzucaj go do folderu modów.

## Gdzie są moje pliki

Wszystko, co pobiera launcher, jest w folderze danych SlashClient:

| System | Folder |
|---|---|
| Windows | `%APPDATA%\SlashClient` |
| macOS | `~/Library/Application Support/SlashClient` |
| Linux | `~/.slashclient` |

Każdy profil (mody, światy, zrzuty ekranu, ustawienia) ma własny folder w `instances`. Najprościej otworzysz go w launcherze przyciskiem **Otwórz folder** w ustawieniach profilu.

> Przed ręcznym usuwaniem czegokolwiek zrób kopię światów.

## Nie widzę znajomych ani kosmetyków w grze

- Zaloguj się w launcherze w zakładce **Znajomi** ([Konto SlashClient](/wiki/start-konto)).
- Uruchom grę z launchera, na wersji z [SlashClient HUD](/wiki/start-wersje).
- Kosmetyki innych mogą być wyłączone w menu HUD → **Dodatki** → **Kosmetyki innych graczy** – zob. [Kto widzi kosmetyki](/wiki/kosmetyki-widocznosc).

## Czy mogę dostać bana za SlashClient?

HUD pokazuje tylko to, co gra i tak wie, i nie daje przewagi jak cheaty. Serwery mają jednak własne zasady: jeśli serwer zabrania np. freelooka, wyłącz go w menu HUD.

## Jak zgłosić błąd

Na [stronie zgłoszeń](/wiki/strona-zgloszenia): zaloguj się, kliknij **Nowe zgłoszenie**, opisz, co się stało, i dołącz [link do logu](/wiki/strona-logi).

## Gdzie szukać pomocy

1. Ta wiki – zacznij od [Witaj w SlashClient](/wiki/start-witaj).
2. [Zgłoszenia na stronie](https://slashclient.pl/zgloszenia) – poszukaj, czy ktoś miał ten sam problem, albo zgłoś nowy.
3. Zapytaj znajomych z SlashClient na [czacie](/wiki/spolecznosc-czat) albo w [społeczności](/wiki/spolecznosc-spolecznosci).

## Dokumenty

- [Regulamin](https://slashclient.pl/regulamin)
- [Polityka prywatności](https://slashclient.pl/polityka-prywatnosci)
