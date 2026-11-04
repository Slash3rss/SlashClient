<!-- dzial: launcher | kolejnosc: 30 | ikona: fa-puzzle-piece | opis: Szukanie i instalowanie modów, paczek zasobów, shaderów, modpacków i datapacków z Modrinth i CurseForge -->
# Mody i paczki

Launcher sam pobiera mody, paczki zasobów, shadery, modpacki i datapacki z **Modrinth** i **CurseForge** i instaluje je do wybranego profilu. Ta sama przeglądarka jest w dwóch miejscach:

- **Profile → wybrany profil → Mody i zasoby** – instaluje do tego profilu;
- zakładka **Mody** w menu – na górze wybierasz profil, do którego trafią pobrane rzeczy.

![Mody i zasoby w profilu](launcher-mody.webp)

## Szukanie

- Rodzaj: **Mody**, **Paczki zasobów**, **Shadery**, **Modpacki**, **Datapacki**.
- Źródło: **Modrinth** albo **CurseForge**.
- **Przeglądaj** pokazuje najpopularniejsze pasujące do wersji i loadera profilu, a pole **Szukaj na Modrinth…** szuka po nazwie.
- Gdy znajomi pozwolili to pokazywać, nad listą jest pasek **Popularne wśród znajomych** („używa 3 znajomych”).

Przy każdej pozycji są przyciski:

| Przycisk | Co robi |
|---|---|
| **Instaluj** | pobiera najnowszą pasującą wersję razem z wymaganymi zależnościami |
| Szczegóły (ikona „i”) | opis, galeria zrzutów, link do strony projektu |
| **Wybierz wersję** | lista wszystkich wersji; **Tylko wersje zgodne z tym profilem** ukrywa niepasujące |
| Podgląd tekstur (oko, tylko paczki zasobów) | pokazuje tekstury paczki obok tekstur z gry przed instalacją |

![Szczegóły projektu](launcher-szczegoly-projektu.webp)

> Shadery wymagają moda Iris. Launcher przypomina o tym na zakładce Shadery.

## Zakładka Mody

Zakładka **Mody** to ta sama przeglądarka, otwarta bez wchodzenia w profil. Kafelek profilu na górze pokazuje, dokąd trafią pobrane rzeczy; kliknij go, żeby wybrać inny profil.

![Zakładka Mody z shaderami](launcher-odkrywaj.webp)

## Zainstalowane

Zakładka **Zainstalowane** pokazuje wszystko, co jest w profilu, z wyszukiwarką **Szukaj w zainstalowanych…**.

- **Sprawdź aktualizacje** i **Aktualizuj wszystko** – aktualizują mody do nowszych wersji.
- Zaznaczając kilka pozycji, dostajesz pasek z przyciskami **Włącz**, **Wyłącz**, **Aktualizuj** i **Usuń**.
- Szczegóły moda pokazują, czego **Wymaga** i komu jest **Potrzebny**. Gdy wyłączasz mod, którego potrzebują inne, launcher ostrzega i proponuje **Wyłącz razem z zależnymi**. Biblioteki, których nic już nie potrzebuje, launcher proponuje usunąć.
- Sprawdzanie modów wykrywa brakujące zależności i mody, które do siebie nie pasują; **Zainstaluj brakujące** dociąga to, czego brakuje.

## Mody wydajności

Przycisk **Mody wydajności** otwiera listę sprawdzonych modów przyspieszających grę (np. Sodium, Lithium) dla wersji profilu. Zaznacz, które chcesz, i kliknij **Zainstaluj zaznaczone**.

## Modpacki

Modpack instaluje się jako nowy profil. Przycisk **Importuj modpack** wczytuje modpack z pliku. W ustawieniach profilu z modpacka jest ramka z jego nazwą i wersją oraz przyciskami **Sprawdź aktualizację** i **Zmień wersję…**. Przed każdą aktualizacją launcher robi migawkę profilu, więc łatwo wrócić do poprzedniej wersji.

## Zablokowane pliki z CurseForge

Niektórzy autorzy na CurseForge nie pozwalają launcherom pobierać swoich plików. Wtedy launcher pokazuje okno **Znaleziono zablokowane modyfikacje** z linkami do tych plików:

- **Otwórz brakujące** otwiera ich strony w przeglądarce;
- pobrane pliki możesz przeciągnąć na okno;
- zakładka **Obserwowane foldery** to foldery (domyślnie Pobrane), w których launcher sam szuka pobranych plików i kopiuje je do profilu po kliknięciu **OK**.

## Datapacki

Datapacki instalują się do konkretnego świata: launcher pyta **Do którego świata?**. Listę datapacków świata znajdziesz w **Światy i zrzuty** (zobacz [Światy, zrzuty, klipy i configi](/wiki/launcher-swiaty)).
