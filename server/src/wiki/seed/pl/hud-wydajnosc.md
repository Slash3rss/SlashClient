<!-- dzial: hud | kolejnosc: 140 | ikona: fa-gauge-high | opis: Benchmark FPS, scena testowa, tryb dla słabszych komputerów i moduły do pilnowania wydajności -->
# Wydajność i benchmark

## Benchmark

Powtarzalny test FPS. Po krótkiej rozgrzewce kamera obraca się powoli dookoła na wysokości oczu, potem w pół obrotu patrzy w niebo, a na koniec stoi w miejscu – w tym czasie zapisywany jest czas każdej klatki.

**Jak uruchomić:** w świecie kliknij kartę **Benchmark** (Prawy Shift → Ustawienia → Dodatki); w menu ta sama karta pokazuje ostatni wynik. Benchmark uruchomisz też przyciskiem przy świecie w launcherze.

Wynik pokazuje:
- średni FPS dużą liczbą i zmianę względem poprzedniego pomiaru,
- **1% low** i **0,1% low** (płynność w najgorszych momentach), medianę i liczbę przycięć,
- obciążenie CPU i GPU,
- wykres czasu każdej klatki,
- ustawienia, z którymi test szedł: zasięg renderowania, VSync, limit klatek i mody.

Wyniki zapisują się w pliku `config/slashclient-benchmarks.json` i widzi je też launcher.

### Scena testowa SlashClient

Jak w benchmarkach innych gier: osobny świat ze stałym ziarnem, stałą porą i pogodą, bez chodzących mobów, przez który kamera leci zawsze tą samą trasą. Każda część sceny jest mierzona osobno: **Las**, **Panorama**, **Wioska**, **Woda**, **Stworzenia**, **Cząsteczki**, **Noc**. Przy pierwszym uruchomieniu scena szuka miejsc i wczytuje teren – kolejne przebiegi lecą od razu. Wyniki sceny porównuje się tylko z innymi przebiegami sceny.

## Moduły do pilnowania wydajności

- **FPS** i **Wykres FPS** (z 1% low) – zobacz [Moduły: informacje](/wiki/hud-informacje#fps).
- **Pamięć**, **Procesor (CPU)**, **Karta graficzna (GPU)** – obciążenie na żywo.
- **Ping**, **Wykres pingu**, **TPS serwera**, **Zużycie sieci** – czy przycina gra, czy serwer.

## Tryb dla słabszych komputerów

Gdy w launcherze włączysz **tryb dla słabszych komputerów** z oszczędzaniem, mod:
- nie pokazuje kosmetyków innych graczy,
- wyłącza efekty sezonowe,
- zatrzymuje ruchome tło menu,
- przy pierwszym uruchomieniu włącza tylko części interfejsu gry – moduły SlashClient włączasz sam.

## Co kosztuje więcej

- **Klipy** i **Natychmiastowa powtórka** trzymają ostatnie sekundy obrazu w pamięci – im wyższa rozdzielczość i więcej klatek, tym więcej pamięci (zobacz [Zrzuty ekranu, klipy i powtórka](/wiki/hud-nagrania)).
- **Minimapa** rysuje się tylko, gdy coś się zmieniło, więc stojąc w miejscu prawie nic nie kosztuje.
- **Nakładka poziomu światła** sprawdza bloki kilka razy na sekundę w ustawionym zasięgu – mniejszy zasięg to mniej pracy.
