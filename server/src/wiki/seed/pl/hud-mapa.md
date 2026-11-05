<!-- dzial: hud | kolejnosc: 60 | ikona: fa-map | opis: Minimapa, mapa świata na cały ekran, waypointy, punkt śmierci i znajomi na mapie -->
# Mapa, minimapa i waypointy

SlashClient ma własną minimapę, mapę świata na cały ekran i waypointy (punkty), które zapisują się osobno dla każdego serwera i świata.

## Minimapa

Teren wokół Ciebie z góry, Twoje waypointy, gracze i moby w pobliżu oraz Ty jako strzałka. Pod mapą są współrzędne i kierunek.

![Minimapa kwadratowa, północ u góry](hud-minimapa.webp)

**Jak włączyć:** Prawy Shift → Ustawienia → Świat → **Minimapa**. Domyślnie stoi w prawym górnym rogu; przesuniesz ją w edytorze.

| Ustawienie | Co robi |
|---|---|
| Rozmiar minimapy | od 64 do 200 pikseli |
| Przybliżenie | od 0,5 do 4 pikseli na blok |
| Kształt | kwadrat albo koło |
| Obracaj z graczem | mapa obraca się, a Twoja strzałka zawsze patrzy w górę |
| Współrzędne i kierunek pod mapą | |
| Punkty na mapie | waypointy jako romby; te poza mapą jako strzałki na jej brzegu |
| Gracze / Wrogie moby / Pozostałe moby na mapach | kto jest widoczny (dotyczy też mapy świata) |

![Ustawienia minimapy](hud-opcje-minimap.webp)

![Minimapa okrągła, obracana z graczem](hud-minimapa-okragla.webp)

W Netherze minimapa rysuje teren z poziomu, na którym jesteś, a nie dach z bedrocku – widać korytarze, którymi chodzisz.

Karta **Minimapa** ma też opcje wyglądu, wspólne z mapą świata:

| Ustawienie | Co robi |
|---|---|
| Jaskinie | **Pod ziemią** – pod ziemią mapa sama pokazuje jaskinie; **Zawsze**; **Wyłączone** |
| Cieniowanie | **Rzeźba terenu** (zbocza jaśniejsze i ciemniejsze, widać wzniesienia) albo **Jak mapa w grze** |
| Ciemniej w nocy | w nocy mapa jest ciemniejsza |
| Ślad przejścia | kropki tam, gdzie szedłeś w ostatnich minutach; bledną z czasem i znikają po czasie z opcji **Długość śladu** (domyślnie 5 minut, od 1 do 30) |

![Minimapa z cieniowaniem „Jak mapa w grze”](hud-minimapa-klasyczna.webp)

### Tryb jaskiń

Pod ziemią (albo zawsze, jeśli tak ustawisz) mapa nie rysuje powierzchni nad Tobą, tylko podłogę jaskini na Twojej wysokości. Lita skała jest ciemna, więc korytarze, groty i woda dobrze się odcinają. Jaskinie mają na mapie świata osobną warstwę – na górze mapy widać wtedy dopisek **Jaskinie**.

![Minimapa w jaskini](hud-minimapa-jaskinie.webp)

![Mapa świata w trybie jaskiń](hud-mapa-jaskinie.webp)

Mapa rysuje się tylko wtedy, gdy coś się zmieniło (ruszyłeś się, obróciłeś albo teren się zmienił), więc stojąc w miejscu nic nie kosztuje.

## Mapa świata

**M** otwiera mapę na cały ekran: cały teren, który widziała minimapa w tym wymiarze tego świata – także tam, gdzie już Cię nie ma.

![Mapa świata z waypointami i znajomymi](hud-mapa-swiata.webp)

- **Przeciągnij** – przesuwa mapę.
- **Kółko myszy** – przybliża i oddala wokół kursora.
- **Spacja** albo przycisk **Do mnie** – wraca do Ciebie.
- **Prawy przycisk** – nowy waypoint w tym miejscu (na wysokości terenu, gdy jest znana), od razu otwarty do nazwania.
- **Klik na waypoint** – otwiera go: zmienisz nazwę i kolor, ukryjesz, udostępnisz znajomym albo usuniesz.
- **M**, **Esc** albo ✕ zamyka mapę.
- **Ctrl + klik** – teleport w to miejsce, na powierzchnię. Działa tylko tam, gdzie możesz używać komendy `/spreadplayers` (świat jednoosobowy z kodami albo serwer, na którym jesteś operatorem); wtedy podpowiedź na dole mapy mówi „Ctrl+klik: teleport”.

### Siatka i biomy

Przyciski na górnym pasku mapy włączają:
- **Siatkę** – granice chunków, a grubszymi liniami regionów (512 bloków);
- **Biomy** – zamiast terenu kolory biomów (oceany niebieskie, pustynie piaskowe, ośnieżone białe…), a nazwa biomu pod kursorem jest przy współrzędnych.

![Mapa świata z siatką chunków](hud-mapa-siatka.webp)

![Mapa świata w widoku biomów](hud-mapa-biomy.webp)

### Zapamiętywanie mapy

Z opcją **Zapamiętuj mapę na dysku** (karta Mapa świata, domyślnie włączona) wszystko, co mapa widziała – teren, biomy i jaskinie – zostaje do następnego wejścia na ten sam serwer lub świat. Mapy leżą w folderze `.minecraft/slashclient/maps`, osobno dla każdego świata i wymiaru. Zapis idzie w tle co kilka minut, przy wyjściu ze świata i przy zamknięciu gry. Plik, którego nie da się odczytać, jest odkładany na bok (`.bad`), nigdy usuwany.

Na górze widać wymiar, liczbę znanych chunków i skalę. Na mapie są Twoje waypointy, punkty od znajomych, punkt śmierci, gracze i moby w pobliżu oraz znajomi, którzy udostępniają pozycję.

**Ustawienia** (karta **Mapa świata** w kategorii Świat): włączenie klawisza M, **Przybliżenie na start**, **Zapamiętuj mapę na dysku**, **Jaskinie**, **Siatka**, **Biomy**, **Ślad przejścia**, **Długość śladu** i to, kogo pokazywać. Na serwerach partnerskich w dungeonie M otwiera mapę dungeonu zamiast mapy świata.

## Waypointy

Waypoint to zapisane miejsce z nazwą i kolorem. W świecie widać go jako znacznik z nazwą i odległością w metrach.

![Waypointy w świecie: znacznik z nazwą i odległością](hud-waypointy-w-swiecie.webp)

**B** otwiera listę waypointów tego świata.

![Lista waypointów](hud-lista-waypointow.webp)

- **Dodaj tutaj** – nowy punkt w miejscu, w którym stoisz (puste pole nazwy da „Punkt 1”, „Punkt 2”…).
- Przy każdym punkcie: pokaż/ukryj, kolor, usuń, **udostępnij znajomym** (gdy masz konto SlashClient).
- **Odebrane** – punkty, które znajomi udostępnili dla innych serwerów lub światów; przyjmujesz je albo odrzucasz.
- **Przenieś…** – punkty zapisane pod innym adresem serwera albo nazwą świata przeniesiesz tutaj jednym kliknięciem.

Gdzie zapisują się punkty:
- na serwerze – pod jego adresem (wielkość liter i port 25565 nie mają znaczenia, ale `play.serwer.pl` i `serwer.pl` to dwa różne miejsca);
- w świecie jednoosobowym – pod folderem świata, więc zmiana nazwy świata nie gubi punktów;
- na serwerach z trybami (jeden adres, wiele trybów) punkty mogą być osobno dla każdego trybu – przełącznik **Rozdzielaj waypointy według trybu** jest nad listą, a starszy punkt przypiszesz do obecnego trybu przyciskiem **Tylko ten tryb**.

Karta **Waypointy** w kategorii Świat włącza i wyłącza znaczniki w świecie.

### Koordynaty z czatu

Współrzędne napisane na czacie (np. `120 64 -340` albo `x: 120 z: -340`) są podkreślone – kliknięcie otwiera okienko, które zapisuje je jako waypoint. Więcej na stronie [Czat](/wiki/hud-czat).

## Punkt śmierci

Gdy zginiesz, w tym miejscu sam pojawia się waypoint „Śmierć” – widać, jak daleko są Twoje rzeczy. Jest jeden na świat (lub serwer) i wymiar; następna śmierć go przesuwa. Usuniesz go z listy (B) jak każdy inny. Na ekranie śmierci przycisk **Ustaw punkt** zapisuje też stały punkt, którego kolejna śmierć nie zabierze.

**Jak włączyć:** Świat → **Punkt śmierci** (włączony od razu).

## Znajomi na minimapie

Znajomi ze SlashClient, którzy udostępniają Ci swoją pozycję, widać na minimapie i mapie świata jako ich głowę z nickiem – albo strzałkę na brzegu, gdy są daleko. Widać tylko tych, którzy są na tym samym serwerze i w tym samym wymiarze.

- **Nicki pod głowami**.
- **Udostępniaj znajomym moją pozycję** – to samo, co w ustawieniach konta w launcherze. Domyślnie wyłączone; pozycja idzie tylko do znajomych na tym samym serwerze i serwer SlashClient jej nie zapisuje.
