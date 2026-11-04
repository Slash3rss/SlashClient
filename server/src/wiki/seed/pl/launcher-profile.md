<!-- dzial: launcher | kolejnosc: 20 | ikona: fa-layer-group | opis: Tworzenie profili, wersje i loadery, pamięć, Java, tryb dla słabszych komputerów, benchmark, migawki, chmura i udostępnianie -->
# Profile

Profil to osobna instalacja Minecrafta: wersja gry, mod loader, mody, ustawienia i światy. Każdy profil ma swój folder, więc mody z jednego nie mieszają się z drugim. Wszystko jest w zakładce **Profile**.

![Ustawienia profilu](launcher-profile.webp)

Po lewej jest lista profili (ikona, wersja, loader, czas gry) i przycisk **Statystyki**. Po prawej cztery zakładki wybranego profilu:

- **Ustawienia** – wszystko z tej strony;
- **Mody i zasoby** – zobacz [Mody i paczki](/wiki/launcher-mody);
- **Światy i zrzuty** i **Configi** – zobacz [Światy, zrzuty, klipy i configi](/wiki/launcher-swiaty);
- **Statystyki** – zobacz [Statystyki i podsumowanie sesji](/wiki/launcher-statystyki).

## Nowy profil

Przycisk **Nowy profil** otwiera krótki kreator w trzech krokach: **Gra**, **Wydajność**, **Nazwa**.

1. Wybierz wersję Minecrafta (zaznacz **Wszystkie wersje**, żeby zobaczyć starsze i snapshoty) i rodzaj gry: **Fabric + SlashClient HUD** (zalecane), **Czysta gra (vanilla)** albo **Inny loader modów** (Quilt, NeoForge, Forge).
2. Ustaw pamięć RAM, mody wydajności i **Tryb dla słabszych komputerów**.
3. Nadaj nazwę i kliknij **Utwórz profil**.

**Pusty profil** pomija kreator i tworzy profil z samymi ustawieniami domyślnymi.

![Kreator nowego profilu](launcher-nowy-profil.webp)

## Ustawienia profilu

| Ustawienie | Co robi |
|---|---|
| **Nazwa** | nazwa na liście i na ekranie Graj |
| **Konto** | konto, którym ten profil zawsze gra (albo to wybrane na karcie Graj) |
| **Wersja** | wersja gry; **Snapshoty** i **Stare** dokładają kolejne wersje do listy |
| **Mod loader** i **Wersja loadera** | Brak (vanilla), Fabric, Quilt, NeoForge albo Forge; domyślnie najnowsza stabilna wersja loadera |
| **Ikona** | jeden z bloków albo **Własny obrazek…** |
| **Mod SlashClient** | włącza SlashClient HUD w grze (profile Fabric na wspieranych wersjach) |
| **Kopiuj kod HUD / Wklej kod HUD** | przenosi układ HUD między profilami albo do znajomego |
| **Wspólne ustawienia gry z innymi profilami** | grafika, dźwięk, sterowanie i lista serwerów wspólne dla profili z tą opcją |
| **Pamięć RAM** | ile pamięci dostaje gra; **Ustaw zalecane** dobiera ilość do modów i komputera |
| **Szerokość / Wysokość okna** | rozmiar okna gry |
| **Folder gry** | puste = osobny folder profilu |
| **Wydajność (flagi JVM)** | **Zoptymalizowane G1 (zalecane)**, **ZGC** (Java 21+, dużo RAM) albo **Domyślne Minecrafta** |
| **Dodatkowe argumenty JVM** | własne argumenty dla Javy |
| **Java** | **Jak w ustawieniach**, Mojang, Eclipse Temurin, GraalVM Community, Azul Zulu albo **Własna ścieżka do Javy** |

Przy wyborze innej Javy przycisk **Porównaj w benchmarku** uruchamia ten sam test na dwóch Javach i pokazuje różnicę w FPS.

Na dole są przyciski **Otwórz folder**, **Folder modów**, **Kopiuj profil**, **Eksportuj profil**, **Udostępnij kodem**, **Usuń** i **Zapisz**.

> Usuwając profil, możesz zaznaczyć **Przenieś też folder gry do kosza**. Pliki trafiają do kosza systemowego, więc da się je odzyskać.

### Tryb dla słabszych komputerów

Gotowe ustawienia dla słabszego sprzętu: **Wyłączony**, **Lekki – słabszy laptop**, **Bardzo lekki – stary komputer** i **Raspberry Pi**. Launcher sam podpowiada tryb dla Twojego komputera. Każdą część trybu możesz wyłączyć osobno:

- **Lżejsza grafika** – zasięg widzenia, cząsteczki, chmury i limit FPS (Twoje ustawienia wracają po wyłączeniu);
- **Mniej pamięci dla gry** – więcej zostaje dla systemu;
- **Mody wydajności** – Sodium, Lithium i inne, instalowane przy zapisie;
- **Tryb oszczędny w grze** – bez cudzych kosmetyków, efektów i animacji menu;
- dla Raspberry Pi także **Poprawka grafiki dla Raspberry Pi** i **Limit 30 FPS**.

Link **Raspberry Pi – co warto wiedzieć** otwiera porady dla Pi (grafika, FPS, Java dla ARM, chłodzenie).

## Benchmark (Wydajność)

Karta **Wydajność** mierzy, jak szybko działa gra na tym profilu. **Scena testowa SlashClient** to zawsze ten sam przelot kamery (las, wioska, woda, stworzenia, noc, ok. półtorej minuty), więc wyniki można porównywać między ustawieniami, modami i komputerami. Możesz też mierzyć we własnym świecie (kamera obraca się w miejscu przez ok. 30 sekund).

- Okno testu: **W oknie**, **Pełny ekran** albo **Okno pełnoekranowe**.
- Wynik to średnie FPS, 1% low i przycięcia, z podpowiedziami **Co poprawić**.
- Wynik możesz skopiować albo udostępnić linkiem ze specyfikacją komputera.

![Karta Wydajność z benchmarkiem](launcher-benchmark.webp)

## Migawki profilu

**Migawki profilu** to kopie folderów mods i config z ustawieniami modpacka. **Zrób migawkę** tworzy ją ręcznie, a launcher robi ją sam przed każdą aktualizacją modpacka i trzyma 5 ostatnich. Przycisk **Przywróć** wraca do stanu z migawki.

## Konflikty klawiszy

Karta **Konflikty klawiszy** wypisuje klawisze, które w grze mają przypisane dwie akcje naraz, i proponuje wolne klawisze. **Napraw konflikty** ustawia je jednym kliknięciem.

## Profil na koncie (chmura)

Karta **Profil na koncie** zapisuje mody, ustawienia, configi i układ HUD na Twoim koncie SlashClient, żeby ten sam profil działał na drugim komputerze. Światy nie są wysyłane, a profil widzisz tylko Ty.

- **Synchronizuj z kontem** – profil trafia na konto sam po każdej grze;
- **Synchronizuj teraz**, **Wyślij na konto**, **Pobierz z konta** – ręcznie;
- gdy oba komputery coś zmieniły, launcher pyta, która wersja ma zostać.

Wymaga zalogowania do SlashClient (zakładka [Znajomi](/wiki/launcher-znajomi)).

![Profil na koncie](launcher-profil-na-koncie.webp)

## Przenieś na inną wersję Minecrafta

Wybierz **Docelową wersję** i kliknij **Sprawdź mody**. Launcher sprawdzi na Modrinth, które mody mają wersję dla nowego Minecrafta, pokaże listę i po kliknięciu **Przenieś profil** przeniesie go (najpierw zrobi migawkę). Mody, które nie są jeszcze gotowe, zostaną wyłączone i będą na liście; **Sprawdź ponownie** sprawdzi je później.

![Przenoszenie profilu na inną wersję](launcher-przenies-wersje.webp)

## Udostępnianie, eksport i import

### Udostępnij kodem

**Udostępnij kodem** wysyła profil na serwer SlashClient na 30 dni i daje krótki kod. Znajomy wpisuje go w **Importuj profil** i dostaje taki sam profil. Mody z Modrinth i CurseForge są w nim zapisane jako linki. Zaznaczasz, co wysłać (konfiguracja modów, ustawienia profilu i inne), a pliki, które wyglądają na hasła lub tokeny, launcher wyróżnia i pozwala odznaczyć. Konta i logowanie nigdy nie trafiają do paczki. Lista **Moje udostępnione profile** pokazuje Twoje kody.

![Udostępnianie profilu kodem](launcher-udostepnij-kodem.webp)

### Eksportuj profil

**Eksportuj profil** zapisuje jeden plik **.mrpack**, który otworzy SlashClient i inne launchery. Mody z Modrinth i CurseForge są w nim linkami, więc plik jest mały.

### Importuj profil

**Importuj profil** przyjmuje plik .mrpack albo .zip z CurseForge, kod od znajomego albo profil zapisany **Z konta SlashClient**.

![Importowanie profilu](launcher-importuj-profil.webp)

### Importuj z innego launchera

**Importuj z innego launchera** znajduje profile z Prism Launchera, MultiMC, CurseForge, Modrinth App i oficjalnego launchera. Pliki są kopiowane, oryginały zostają bez zmian. **Inny folder…** pozwala wskazać folder ręcznie.

### Odzyskaj profile

Gdy na dysku są foldery profili, których nie ma na liście, pojawia się przycisk **Odzyskaj profile**. Zaznaczasz, które przywrócić; reszta zostaje na dysku bez zmian.
