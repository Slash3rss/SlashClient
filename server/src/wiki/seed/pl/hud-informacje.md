<!-- dzial: hud | kolejnosc: 30 | ikona: fa-circle-info | opis: FPS, ping, współrzędne, zegar, komputer, serwer, znajomi online, muzyka i inne moduły z informacjami -->
# Moduły: informacje

Moduły z kategorii **Informacje** pokazują stan gry, komputera i serwera. Włączysz je w oknie ustawień: **Prawy Shift → Ustawienia → Informacje** i kliknięcie karty. Każdy moduł przesuwasz w edytorze, a wspólne opcje (rozmiar, tło, kiedy się pokazuje) opisuje strona [Menu i edytor HUD](/wiki/hud-edytor).

![Karty kategorii Informacje](hud-kategoria-hud.webp)

## FPS

Liczba klatek na sekundę.

![Moduł FPS](hud-fps.webp)

- **Kolor zależny od FPS** – zielony przy dobrej płynności, żółty, potem czerwony.
- **Zielony przy** / **Czerwony przy** – progi kolorów (domyślnie 60 i 20 FPS).

## Wykres FPS

Klatki z ostatnich chwil jako wykres, z obecnym FPS i „1% low” – płynnością w najgorszych momentach.

![Wykres FPS](hud-wykres-fps.webp)

- **Długość wykresu (klatki)** – od 30 do 240 klatek.
- **Najniższy i najwyższy FPS** – linia „min … · max …” pod wykresem.

## Ping i wykres pingu

**Ping** to opóźnienie do serwera w milisekundach, mierzone przez SlashClient (nie z listy graczy, gdzie wiele serwerów pokazuje 0). **Wykres pingu** rysuje go w czasie razem ze średnią. Oba działają tylko na serwerach – w świecie jednoosobowym nie ma sieci.

- **Zielony przy** / **Czerwony przy** – progi kolorów (domyślnie 60 i 250 ms).

## Serwer, Gracze online, TPS serwera

- **Serwer** – adres serwera, na którym grasz.
- **Gracze online** – ilu graczy jest na liście graczy.
- **TPS serwera** – jak szybko działa serwer (20 to pełna prędkość) i ile pakietów na sekundę przychodzi i wychodzi. Progi kolorów ustawisz (domyślnie zielony od 19, czerwony od 12).

![Serwer, gracze online, ping i TPS](hud-serwer.webp)

Te moduły pokazują się tylko na serwerach.

## Zużycie sieci

Ile danych na sekundę gra pobiera (↓) i wysyła (↑). Tylko na serwerach.

![Zużycie sieci i wykres pingu](hud-siec.webp)

## Współrzędne

Twoja pozycja X, Y, Z i kierunek, w którym patrzysz.

![Współrzędne](hud-wspolrzedne.webp)

- **Miejsca po przecinku** – od 0 do 2.
- **Wysokość (Y)** – pokazuj albo ukryj Y.
- **Pokazuj kierunek** i **Kierunek w tej samej linii**.

## Prędkość

Prędkość w blokach na sekundę. **Miejsca po przecinku** od 0 do 3.

![Prędkość](hud-predkosc.webp)

## Zegar i Czas sesji

**Zegar** pokazuje godzinę z komputera, a **Czas sesji** – jak długo grasz.

![Zegar z datą i czas sesji](hud-zegar.webp)

- Zegar: **Sekundy**, **Format 12-godzinny**, **Data**.
- Czas sesji: **Liczony od uruchomienia gry** – nie zeruje się przy zmianie serwera.

## Pamięć, Procesor (CPU), Karta graficzna (GPU)

Zajęta pamięć RAM gry (procent i megabajty) oraz obciążenie procesora i karty graficznej. Każdy ma swoje progi kolorów **Zielony przy** / **Czerwony przy**.

![Pamięć, CPU i GPU](hud-komputer.webp)

## Znajomi online

Twoi znajomi ze SlashClient, którzy są teraz w grze, z tym, gdzie grają. Działa w grze uruchomionej z launchera, z kontem zalogowanym w zakładce Znajomi.

![Znajomi online](hud-znajomi-online.webp)

- **Najwięcej znajomych** – ilu pokazać (1–15).

## Ekwipunek

27 slotów plecaka na ekranie – widać, co niesiesz, bez otwierania ekwipunku.

![Moduł Ekwipunek](hud-ekwipunek-modul.webp)

- **Pasek szybkiego wyboru** – dokłada też hotbar.

## Sprint i skradanie

Napis, gdy biegniesz albo się skradasz, z dopiskiem „(przełączony)”, gdy działa przełączany sprint lub skradanie. W kategorii Świat jest podobny moduł **Sprint/skradanie**.

![Sprint i skradanie](hud-sprint.webp)

## Teraz gra

Utwór, który gra na tym komputerze: Spotify, przeglądarka (YouTube, SoundCloud…) albo inny odtwarzacz – nic nie trzeba łączyć. Muzyki z telefonu czy głośnika nie widać. Działa w grze uruchomionej z launchera SlashClient.

![Teraz gra jako karta z okładką](hud-teraz-gra.webp)

| Ustawienie | Co robi |
|---|---|
| Wygląd | karta albo jedna linia |
| Okładka albumu, Rozmiar okładki | obrazek albumu i jego wielkość |
| Tytuł, Wykonawcy, Album | które linie pokazać |
| Pasek postępu, Czas (minęło / całość) | postęp utworu |
| Akcent | zieleń Spotify albo kolor modułu |
| Pokazuj wstrzymany utwór, Znak pauzy | co robić przy pauzie |
| Ukryj, gdy nic nie gra | moduł znika bez muzyki |
| Największa szerokość, Przewijaj długie teksty | długie tytuły przewijają się zamiast się ucinać |
| Znak, skąd gra | ikonka źródła |
| Tylko Spotify | pomija przeglądarkę i inne odtwarzacze |

## Czat Twitch i Czat Kick

Czat Twojego kanału z Twitcha albo Kicka na ekranie gry – przydaje się streamerom grającym na jednym monitorze. Ustawienia są w kategorii **Czat**, opisuje je strona [Czat](/wiki/hud-czat#czat-twitch-i-kick).
