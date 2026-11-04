<!-- dzial: launcher | kolejnosc: 10 | ikona: fa-play | opis: Ekran startowy launchera: wybór profilu i konta, powrót do gry, nowości, konsola i pomoc przy awarii -->
# Graj

Zakładka **Graj** to pierwszy ekran launchera. Wybierasz tu profil i konto, uruchamiasz grę, czytasz nowości i podglądasz konsolę.

![Zakładka Graj z nowościami z Minecrafta](launcher-graj.webp)

## Uruchamianie gry

Na dole ekranu jest pasek z trzema elementami:

- **Profil** – który profil (wersja gry, mody, ustawienia) uruchomić;
- **Konto** – którym kontem Minecraft grać; profil może mieć na stałe przypisane swoje konto (zobacz [Profile](/wiki/launcher-profile));
- **GRAJ** – pobiera brakujące pliki (gra, loader, Java, mody) i uruchamia Minecrafta.

Nad paskiem widać nazwę, ikonę i wersję wybranego profilu, ilość pamięci RAM i łączny czas gry. Postęp pobierania i instalacji pokazuje się w prawym górnym rogu w kartach zadań; po instalacji jest tam przycisk **Graj teraz**.

> Gdy gra jest już włączona, launcher nie uruchamia jej drugi raz. Dołączenie do serwera z zakładki [Serwery](/wiki/launcher-serwery) połączy działającą grę.

## Wróć do gry

Karta **Wróć do gry** pokazuje serwer albo świat, na którym grałeś ostatnio, z ikoną i czasem („Ostatnio 3 godziny temu”). Przycisk **Graj** uruchamia profil i od razu łączy z tym serwerem albo otwiera ten świat.

## Nowości z Minecrafta

Zakładka **Nowości z Minecrafta** pokazuje artykuły Mojang o wydaniach i snapshotach (są tylko po angielsku). Filtr **Wszystkie / Wydania / Snapshoty** zawęża listę, a kliknięcie karty otwiera cały artykuł w okienku.

## Nowości w launcherze

Zakładka **Nowości w launcherze** to lista wydań SlashClienta. Kropka przy nazwie zakładki oznacza wydanie, którego jeszcze nie widziałeś.

- Twoja wersja ma znaczek **Twoja wersja**, nowsza – **Nowa** i przycisk **Aktualizuj**.
- **Pokaż zmiany** rozwija notki wydania, **Pokaż starsze** dokłada starsze wydania.
- **Historia zmian** otwiera pełną historię wszystkich wersji.

![Nowości w launcherze](launcher-nowosci-launchera.webp)

## Konsola

Zakładka **Konsola** pokazuje log gry na żywo (zielona kropka przy nazwie oznacza, że gra działa). Launcher zapisuje logi ostatnich 10 sesji każdego profilu, więc możesz wrócić do wcześniejszej sesji po zamknięciu gry.

| Element | Co robi |
|---|---|
| Lista sesji | wybór sesji gry (data i godzina) |
| **Szukaj w logu…** | filtruje linie po tekście |
| **Wszystko / Ostrzeżenia / Błędy** | pokazuje tylko wybrane poziomy |
| Kopiuj | kopiuje log do schowka |
| **Udostępnij** | wysyła log na serwer SlashClient i kopiuje link (log jest trzymany 90 dni, ścieżki z nazwą użytkownika i tokeny są ukrywane) |

![Konsola z zapisanym logiem gry](launcher-konsola.webp)

## Pomoc przy awarii gry

Gdy gra się wyłączy z błędem, na ekranie Graj pojawia się karta awarii z opisem przyczyny i podpowiedzią **Co zrobić**. Launcher rozpoznaje m.in.:

- za mało pamięci RAM;
- loader za stary na wersję Javy;
- mody, które do siebie nie pasują, albo brakujące zależności;
- ten sam mod zainstalowany dwa razy;
- mod, który nie działa z tą wersją gry;
- uszkodzony plik .jar albo niepełną instalację;
- problem ze sterownikiem grafiki (OpenGL);
- zamknięcie gry przez system.

Przyciski na karcie: **Zainstaluj brakujące** (gdy brakuje zależności – szuka ich na Modrinth i CurseForge), **Pokaż crash report**, **Kopiuj log** i **Zgłoś błąd**. Pod kartą jest krótkie podsumowanie sesji.

## Podsumowanie sesji

Po zamknięciu gry launcher pokazuje **Podsumowanie sesji**: czas gry, gdzie grałeś i najważniejsze liczby z sesji. Więcej w [Statystyki i podsumowanie sesji](/wiki/launcher-statystyki).
