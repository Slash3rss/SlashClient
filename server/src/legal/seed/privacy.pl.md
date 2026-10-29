## 1. Administrator danych i kontakt {#administrator}

Administratorem Twoich danych osobowych jest {{admin.name}}, {{admin.address}}, {{admin.nip}} („my”). W sprawach danych osobowych pisz na {{admin.email}}. [UZUPEŁNIJ: inspektor ochrony danych, jeśli został wyznaczony; inaczej usuń to zdanie]

Polityka dotyczy launchera SlashClient, moda (HUD), strony [slashclient.pl](https://slashclient.pl/) i serwera usług online (konto, znajomi, czat, klany, osiągnięcia, Kosmetyki, udostępnianie plików, wsparcie). Pojęcia znaczą to samo co w [Regulaminie](/regulamin).

## 2. W skrócie {#w-skrocie}

- Launcher działa bez Konta SlashClient; konto jest potrzebne tylko do funkcji online.
- Nie mamy reklam, analityki ani śledzących plików cookie. Strona zapisuje w przeglądarce tylko token logowania.
- Wiadomości i obrazy w czatach ze znajomymi, w grupach i klanach są szyfrowane end-to-end — nie możemy ich przeczytać. Wyjątek: czat społeczności (duże grupy do 1000 osób) nie jest szyfrowany end-to-end.
- Nie znamy Twoich haseł ani danych kart płatniczych. Tokeny konta Microsoft zostają na Twoim komputerze, zaszyfrowane.
- Udostępniane pliki usuwamy automatycznie (zrzuty i klipy, kody profili i obrazy w czacie po 30 dniach, logi po 90 dniach).

## 3. Skąd mamy dane {#zrodla}

- **Od Ciebie** — gdy korzystasz z funkcji online (np. piszesz wiadomość, tworzysz klan, udostępniasz plik, zgłaszasz błąd, wspierasz projekt).
- **Od dostawców logowania** — Discord, Microsoft, Google i GitHub przekazują nam identyfikator konta, nazwę użytkownika, nazwę wyświetlaną i adres zdjęcia profilowego (zakresy: Discord „identify”, Microsoft i Google „openid profile”, GitHub bez dodatkowych uprawnień). **Nie pobieramy adresu e-mail.**
- **Od Mojang/Microsoft** — przy logowaniu kontem Minecraft serwery Mojang potwierdzają, że grasz jako dane konto (UUID i nick Minecraft). Tokenu Minecraft nie przesyłamy na nasz serwer.
- **Od operatorów płatności** — Stripe i PayPal potwierdzają płatność, zwrot lub obciążenie zwrotne (identyfikatory, kwota, status).
- **Z korzystania z Usług** — np. czas gry potrzebny do osiągnięć, adresy serwerów Minecraft, na których grasz, dane techniczne zapytań.

## 4. Jakie dane, po co i na jakiej podstawie {#dane-i-cele}

Podstawy prawne (art. 6 ust. 1 RODO): **(b)** wykonanie umowy — świadczenie Usług, o które prosisz; **(f)** nasz prawnie uzasadniony interes — bezpieczeństwo, zapobieganie nadużyciom, obsługa błędów, dochodzenie i obrona roszczeń; **(a)** zgoda — funkcje opcjonalne, które sam włączasz; **(c)** obowiązek prawny — rachunkowość i podatki przy płatnościach.

| Kategoria | Dane | Cel i podstawa |
|---|---|---|
| Konto SlashClient | identyfikator konta, nazwa (handle), nazwa wyświetlana, avatar (twarz ze skina Minecraft albo zdjęcie od dostawcy logowania), identyfikatory u dostawców logowania, podpięte konta Minecraft (UUID, nick), data założenia i ostatniej aktywności, rola, ranga, odznaka, blokada | prowadzenie konta i logowanie — (b) |
| Sesje | skrót (SHA-256) tokenu sesji — samego tokenu nie przechowujemy, daty utworzenia i ostatniego użycia | utrzymanie zalogowania, bezpieczeństwo — (b), (f) |
| Znajomi i status | lista znajomych, zaproszenia, wyciszenia; status (online, zaraz wracam, zajęty, niewidoczny), aktywność (launcher, menu, gra jednoosobowa, serwer, wersja gry) i adres serwera — adres tylko gdy włączysz „Pokazuj znajomym, na jakim serwerze gram”; status i aktywność są tylko w pamięci serwera | znajomi — (b) |
| Wiadomości (prywatne, grupowe, klanowe) | treść zaszyfrowana end-to-end (przechowujemy tylko szyfrogram); metadane: nadawca, odbiorca lub grupa, czas wysłania, odczytu, edycji i usunięcia; zaproszenia do gry (adres serwera, wersja) i udostępnione punkty trasy (współrzędne, wymiar, świat/serwer) — bez szyfrowania end-to-end; dzienna liczba wysłanych wiadomości | czat — (b); limity antyspamowe — (f) |
| Kanały Twitch i Kick (jeśli je połączysz) | identyfikator, login i nazwa kanału; stan transmisji (czy trwa, tytuł, kategoria, liczba widzów, czas rozpoczęcia, miniatura) pobierany od Twitch/Kick; Twoje wybory: powiadomienia o streamach znajomych i ukrywanie własnego statusu. Nie przechowujemy tokenów dostępu — po połączeniu od razu je unieważniamy | status „na żywo” u znajomych, na profilu i w grze, powiadomienia — (b); odłączenie w każdej chwili w „Konto i profil” lub na stronie konta |
| Społeczności | nazwa, tag, opis, logo, widoczność; członkowie i ich role, prośby o dołączenie, zaproszenia, bany i wyciszenia; **wiadomości czatu społeczności w postaci jawnej** (bez szyfrowania end-to-end), ich edycje i usunięcia; zgłoszenia wiadomości (z kopią treści) i dziennik moderacji | społeczności — (b); moderacja i bezpieczeństwo — (f) |
| Obrazy w czacie | zaszyfrowany plik, nadawca, odbiorca, rozmiar, czas | czat — (b) |
| Klucze szyfrowania | klucz publiczny każdego launchera (do 10 ostatnich urządzeń) i jego losowy identyfikator | szyfrowanie end-to-end — (b) |
| Osiągnięcia i statystyki | czas gry w poszczególnych dniach (UTC), adresy serwerów, na których grasz, z datą pierwszej wizyty, odblokowane osiągnięcia, liczniki (np. wysłane wiadomości, udostępnienia) | osiągnięcia, Iskry, statystyki na profilu — (b) |
| Iskry i sklep | saldo, historia zmian (kwota, powód, czas, administrator przy ręcznej korekcie), zakupy | Iskry — (b); korekty przy nadużyciach — (f) |
| Kosmetyki | posiadane i założone Kosmetyki (także osobno dla każdej postaci Minecraft), przyznania | Kosmetyki — (b) |
| Klany i grupy | tag, nazwa i logo klanu, właściciel, członkowie i role, zaproszenia; grupy czatu i ich członkowie | klany i czat grupowy — (b) |
| Profil publiczny | ustawienia prywatności (kto widzi profil, które sekcje, zgoda na indeksowanie w wyszukiwarkach), ukrycie przez administratora i jego powód | profil — (b); indeksowanie — (a), domyślnie wyłączone; moderacja — (f) |
| Gra (mod) | UUID Minecraft graczy z SlashClient na serwerze (żeby pokazać logo i Kosmetyki innym graczom) i powiązanie UUID z kontem na czas gry; emotki i spraye (UUID, serwer, wymiar, współrzędne) — przekazywane na żywo graczom w pobliżu, nie zapisywane | Kosmetyki i emotki w grze — (b) |
| Wspólna gra (party) | lider, zaproszeni, odpowiedzi — tylko w pamięci, do 3 godzin | (b) |
| Zrzuty ekranu i klipy udostępnione linkiem | plik, tytuł, wymiary, rozmiar, liczba wyświetleń, właściciel, daty | udostępnianie — (b) |
| Kody profili i chmura profili | paczka profilu (.mrpack: lista modów, ustawienia, pliki konfiguracyjne), nazwa, wersja gry, loader, urządzenie (w chmurze), daty | udostępnianie i synchronizacja — (b) |
| Logi (/logi) | treść logu gry lub launchera wysłana przez Ciebie (launcher wycina folder domowy i tokeny; log może zawierać nick, adresy serwerów, listę modów, dane systemu), konto (jeśli zalogowany), rozmiar, data | diagnozowanie problemów — (b), (f) |
| Zgłoszenia błędów | tytuł, opis, link do logu, wersja, system, komentarze, autor (widoczne publicznie) | obsługa zgłoszeń — (f) |
| Wsparcie i płatności | konto, poziom, rodzaj (jednorazowe/miesięczne), kwota, waluta, status, daty płatności i zwrotu, identyfikatory płatności, klienta i subskrypcji u operatora (Stripe, PayPal), potwierdzenie pełnoletności lub zgody rodzica (czas), przyznane korzyści; dane z potwierdzenia płatności (rodzaj metody, np. karta lub BLIK, link do potwierdzenia u operatora, kwota zwrotu, koniec opłaconego okresu); obecność na ścianie wspierających, odznaka na profilu. Danych kart i kont płatniczych nie otrzymujemy. | wsparcie — (b); rachunkowość i podatki — (c); reklamacje, zwroty, obciążenia zwrotne — (f); ściana wspierających — (a), domyślnie wyłączona |
| Prośby o zwrot | płatność, konto, powód (tekst do 500 znaków, jeśli go podasz), informacja, że prosi rodzic lub opiekun, stan, odpowiedź i identyfikator administratora, który zdecydował, identyfikator zwrotu u operatora, daty. Widzi je tylko osoba prosząca i administratorzy. | obsługa zwrotów — (b); rozliczenia — (c); obrona przed roszczeniami — (f) |
| Dane techniczne | zob. pkt 5 | bezpieczeństwo i działanie Usług — (f) |
| Dziennik administracyjny | działania administratorów (kto, co, wobec kogo, kiedy, szczegóły) | rozliczalność moderacji — (f) |

## 5. Dane techniczne, logi i limity {#techniczne}

- **Dziennik zapytań API** — dla panelu administratora serwer zapisuje zapytania: czas, metodę, ścieżkę (bez parametrów i treści), kod odpowiedzi, czas obsługi, identyfikator konta, **adres IP z ukrytą końcówką** (np. 203.0.113.x), rodzaj i wersję klienta, kod błędu. Wpisy są usuwane po 7 dniach (najwyżej 50 000 ostatnich).
- **Statystyki dla administratora** — dni, w których konto korzystało z usług (sama data), ostatnia wersja launchera na koncie i dzienny szczyt liczby graczy online; służą tylko zbiorczym statystykom w panelu administratora.
- **Logi serwera WWW** — serwer pośredniczący (Caddy) zapisuje dostęp do strony i API (pełny adres IP, czas, adres URL, przeglądarka). Pliki są rotowane po 10 MB, przechowywanych jest 5 ostatnich. [UZUPEŁNIJ: rzeczywisty okres przechowywania; ewentualne ograniczenie logów]
- **Logi systemowe** — komunikaty błędów serwera. [UZUPEŁNIJ: okres przechowywania logów systemowych na serwerze]
- **Limity zapytań** — liczniki per adres IP lub konto (np. logowania, udostępnianie logów) trzymane tylko w pamięci, przez kilka minut.
- **Kopie zapasowe** — [UZUPEŁNIJ: czy i jak często tworzone są kopie bazy, gdzie są przechowywane i jak długo]

Podstawa: nasz prawnie uzasadniony interes w zapewnieniu bezpieczeństwa i ciągłości działania Usług (art. 6 ust. 1 lit. f RODO).

## 6. Szyfrowanie end-to-end — jak to działa {#szyfrowanie}

Każdy launcher tworzy własną parę kluczy. Klucz prywatny nie opuszcza Twojego komputera (jest zapisany zaszyfrowany mechanizmem systemu operacyjnego); na serwer trafia tylko klucz publiczny. Wiadomość jest szyfrowana na Twoim komputerze kluczem, który potrafią odczytać wyłącznie launchery odbiorców (i Twoje inne launchery). Serwer przechowuje i przekazuje tylko zaszyfrowaną kopertę, więc **nie możemy przeczytać treści wiadomości ani zobaczyć obrazów**.

Ograniczenia, o których warto wiedzieć:

- widzimy metadane: kto, do kogo i kiedy pisze, kiedy wiadomość odczytano, edytowano lub usunięto;
- **czat społeczności nie jest szyfrowany end-to-end**: szyfrowanie dla każdego z nawet 1000 członków nie jest praktyczne, a moderatorzy muszą móc reagować na zgłoszenia. Treść jest szyfrowana tylko w drodze (HTTPS) i przechowywana na serwerze; widzą ją członkowie społeczności, jej moderatorzy i administratorzy SlashClient. Launcher i gra pokazują o tym informację nad polem wiadomości;
- zaproszenia do gry i udostępnione punkty trasy (adres serwera, współrzędne) nie są szyfrowane end-to-end;
- jeśli znajomy używa bardzo starej wersji launchera bez kluczy szyfrowania, wiadomość tekstowa do niego jest wysyłana bez szyfrowania end-to-end (obrazów wtedy nie da się wysłać) [UZUPEŁNIJ: rozważcie wyłączenie tej możliwości];
- po zalogowaniu na nowym komputerze starsze wiadomości mogą być nieczytelne, bo były zaszyfrowane dla innych urządzeń.

Połączenia z serwerem są szyfrowane (HTTPS/TLS).

## 7. Dane na Twoim komputerze (launcher i mod) {#urzadzenie}

- Konta Microsoft/Minecraft: token odświeżania jest zapisywany **tylko lokalnie**, zaszyfrowany mechanizmem systemu operacyjnego. Nie wysyłamy go na nasz serwer. To samo dotyczy tokenu Konta SlashClient i klucza prywatnego czatu.
- Ustawienia, profile, statystyki czasu gry, zrzuty i klipy są przechowywane lokalnie i trafiają do nas tylko, gdy sam je udostępnisz lub zsynchronizujesz.
- Launcher nie zawiera telemetrii ani analityki. Łączy się z: naszym serwerem (konto, aktualizacje — pliki pobierane są z GitHub), serwerami Mojang/Microsoft (logowanie, pliki gry, nowości), Fabric, Quilt, Forge i NeoForge (loadery), Modrinth i CurseForge (mody; CurseForge przez nasz serwer), minecraft.wiki (zakładka Wiki), mc-heads.net i s.optifine.net (podgląd skina i peleryny — przekazywany jest nick), listą serwerów lista.slash3rss.dev / api.slash3rss.dev. Te podmioty widzą Twój adres IP i działają według własnych polityk prywatności.
- Discord Rich Presence (opcjonalnie, „Pokazuj na Discordzie, w co grasz”) przekazuje informację o grze do aplikacji Discord na Twoim komputerze.
- Mod: opcjonalny moduł czatu transmisji łączy się anonimowo z czatem Twitch lub Kick wskazanego kanału.

## 8. Strona internetowa, cookies i localStorage {#cookies}

- Strona **nie używa plików cookie do analityki ani reklam** i nie zawiera zewnętrznych skryptów śledzących.
- Po zalogowaniu token sesji jest zapisywany w pamięci przeglądarki (localStorage, klucz `slashclient.token`) — jest niezbędny do utrzymania zalogowania; usuwa go wylogowanie.
- Strona może być obsługiwana przez sieć Cloudflare, która w celach bezpieczeństwa może ustawiać techniczne cookies (np. ochrona przed botami). [UZUPEŁNIJ: potwierdźcie, czy domena jest za proxy Cloudflare i jakie cookies się pojawiają]
- Przy logowaniu przekierowujemy Cię do wybranego dostawcy logowania; jego strona działa według jego zasad i cookies. Avatary dostawców (Discord, Google, GitHub) są wczytywane z ich serwerów.
- Strona płatności przekierowuje do Stripe lub PayPal, które stosują własne cookies.

## 9. Komu przekazujemy dane {#odbiorcy}

Nie sprzedajemy danych. Dane mogą otrzymać:

- **dostawca serwera (VPS)** — [UZUPEŁNIJ: nazwa dostawcy hostingu, kraj, umowa powierzenia];
- **Cloudflare, Inc.** — sieć dostarczania treści i ochrona strony [UZUPEŁNIJ: potwierdzić]; opcjonalnie **Cloudflare R2** lub **Backblaze B2** — przechowywanie udostępnionych plików i chmury profili, jeśli zostały włączone w panelu [UZUPEŁNIJ: które są używane, w jakiej lokalizacji/jurysdykcji, np. UE];
- **Stripe** i **PayPal** — obsługa płatności; przekazujemy identyfikator Konta SlashClient, poziom i kwotę, a dane płatnicze podajesz bezpośrednio operatorowi, który w tym zakresie jest odrębnym administratorem;
- **dostawcy logowania** (Discord, Microsoft, Google, GitHub) i **Mojang/Microsoft** — w zakresie logowania i potwierdzenia konta Minecraft; są odrębnymi administratorami;
- **GitHub** — z jego serwerów pobierane są instalatory i aktualizacje launchera (widzi adres IP);
- **inni gracze** — w zakresie, w jakim sam udostępniasz dane (profil, status, wiadomości, klany, linki);
- **organy publiczne** — gdy wymaga tego prawo.

## 10. Przekazywanie danych poza EOG {#transfer}

Niektórzy odbiorcy (np. Cloudflare, Stripe, PayPal, Backblaze, Discord, Google, GitHub, Microsoft) mają siedziby lub serwery w USA lub innych państwach spoza Europejskiego Obszaru Gospodarczego. Przekazanie odbywa się na podstawie [UZUPEŁNIJ: dla każdego odbiorcy — decyzja Komisji Europejskiej o odpowiednim stopniu ochrony (EU-US Data Privacy Framework) albo standardowe klauzule umowne]. Kopię zabezpieczeń możesz otrzymać, pisząc do nas.

## 11. Jak długo przechowujemy dane {#przechowywanie}

| Dane | Okres |
|---|---|
| Konto, znajomi, Kosmetyki, Iskry, osiągnięcia, statystyki, klany, ustawienia profilu | do usunięcia konta |
| Wiadomości prywatne i grupowe (szyfrogram i metadane) | do usunięcia wiadomości przez autora (zostaje znacznik „usunięta” bez treści) albo usunięcia konta [UZUPEŁNIJ: rozważcie automatyczne usuwanie starych wiadomości] |
| Obrazy w czacie | 30 dni (niedołączone do wiadomości — 1 godzina) |
| Zrzuty ekranu i klipy udostępnione linkiem | 30 dni albo wcześniejsze usunięcie przez Ciebie |
| Kody profili | 30 dni albo wcześniejsze usunięcie przez Ciebie |
| Chmura profili | do usunięcia przez Ciebie albo usunięcia konta |
| Logi (/logi) | 90 dni |
| Zgłoszenia błędów i komentarze | do usunięcia przez administratora [UZUPEŁNIJ: docelowy okres] |
| Sesje | do wylogowania; sesja nieużywana przez 90 dni wygasa |
| Klucze publiczne urządzeń | 10 ostatnio używanych urządzeń, do usunięcia konta |
| Status, aktywność, party, emotki, spraye, limity zapytań | tylko w pamięci serwera — od minut do kilku godzin |
| Dziennik zapytań API (zamaskowany IP) | 7 dni (najwyżej 50 000 wpisów) |
| Dni aktywności konta, wersja launchera (statystyki) | do usunięcia konta |
| Logi serwera WWW (pełny IP) | rotacja 5 × 10 MB [UZUPEŁNIJ: okres] |
| Płatności | [UZUPEŁNIJ: np. 5 lat od końca roku, w którym nastąpiła płatność (ustawa o rachunkowości, Ordynacja podatkowa)] |
| Prośby o zwrot | jak dane płatności [UZUPEŁNIJ: rozważcie usuwanie treści powodu kilka miesięcy po zamknięciu prośby] |
| Potwierdzenia przeczytania zmian dokumentów | do usunięcia konta |
| Dziennik administracyjny | [UZUPEŁNIJ: okres] |
| Kopie zapasowe | [UZUPEŁNIJ: okres] |

Po upływie okresu dane są usuwane automatycznie (pliki udostępnione — przez cogodzinne sprzątanie). Dane potrzebne do obrony przed roszczeniami możemy zachować do ich przedawnienia.

## 12. Twoje prawa {#prawa}

Masz prawo do:

- **dostępu** do danych i otrzymania ich kopii (art. 15 RODO),
- **sprostowania** (art. 16),
- **usunięcia** („prawo do bycia zapomnianym”, art. 17),
- **ograniczenia przetwarzania** (art. 18),
- **przenoszenia danych** (art. 20),
- **sprzeciwu** wobec przetwarzania na podstawie prawnie uzasadnionego interesu (art. 21),
- **cofnięcia zgody** w dowolnym momencie, bez wpływu na zgodność z prawem wcześniejszego przetwarzania,
- **skargi do Prezesa Urzędu Ochrony Danych Osobowych** (ul. Stawki 2, 00-193 Warszawa, [uodo.gov.pl](https://uodo.gov.pl/)).

## 13. Jak skorzystać z praw {#jak-skorzystac}

Wiele możesz zrobić sam:

- ustawienia prywatności profilu i zgoda na indeksowanie — w launcherze (Znajomi → Prywatność profilu);
- ukrycie serwera, na którym grasz — przełącznik na stronie [/konto](/konto) i w launcherze; status „niewidoczny” w launcherze;
- odłączenie dostawcy logowania lub konta Minecraft, wylogowanie — [/konto](/konto) i launcher;
- usunięcie własnej wiadomości, udostępnionego zrzutu lub klipu, kodu profilu, profilu w chmurze — w launcherze;
- ściana wspierających i odznaka — w ustawieniach wsparcia na stronie konta.

W pozostałych sprawach — w szczególności **usunięcia konta i kopii danych** — napisz na {{admin.email}}. [UZUPEŁNIJ: po wdrożeniu dopisz przyciski „Pobierz moje dane” i „Usuń konto” na stronie /konto] Żeby nikt nie podszył się pod Ciebie, możemy poprosić o potwierdzenie, że konto należy do Ciebie (np. wiadomość z czatu SlashClient do administratora albo zalogowanie na stronie). Odpowiemy w ciągu miesiąca; w złożonych sprawach termin może zostać przedłużony o kolejne dwa miesiące — wtedy Cię o tym poinformujemy.

## 14. Czy musisz podać dane {#dobrowolnosc}

Podanie danych jest dobrowolne, ale bez nich nie da się korzystać z funkcji online (konto powstaje przy logowaniu). Launchera i gry możesz używać bez Konta SlashClient. Nie podejmujemy wobec Ciebie decyzji opartych wyłącznie na zautomatyzowanym przetwarzaniu, które wywoływałyby skutki prawne; automatycznie działają jedynie limity antyspamowe i ochrona przed nadużyciami (np. czasowe ograniczenie liczby wiadomości).

## 15. Dzieci {#dzieci}

Usługi są przeznaczone dla osób od 16 lat. Młodsi mogą z nich korzystać za zgodą rodzica lub opiekuna (Regulamin, pkt 6). Nie pobieramy adresów e-mail ani innych danych kontaktowych. Rodzic lub opiekun może zażądać dostępu do danych dziecka lub ich usunięcia, pisząc na {{admin.email}}. Profil publiczny domyślnie nie pokazuje serwerów ani czasu ostatniej aktywności i nie jest indeksowany przez wyszukiwarki. Wsparcie finansowe wymaga potwierdzenia pełnoletności albo zgody rodzica lub opiekuna.

## 16. Bezpieczeństwo {#bezpieczenstwo}

- połączenia szyfrowane (HTTPS z HSTS), ograniczenia zawartości strony (Content Security Policy);
- szyfrowanie end-to-end wiadomości i obrazów w czacie;
- tokeny sesji przechowywane na serwerze tylko jako skróty; tokeny w launcherze zaszyfrowane mechanizmem systemu;
- klucze dostępu do magazynów plików i operatorów płatności zaszyfrowane (AES-256-GCM), magazyny prywatne;
- usługa serwera działa z ograniczonymi uprawnieniami systemu; dostęp administracyjny mają tylko wyznaczone osoby, a ich działania są zapisywane;
- limity zapytań chroniące przed nadużyciami; adres IP w panelu administratora jest maskowany.

## 17. Zmiany polityki {#zmiany}

Politykę aktualizujemy, gdy zmieniają się Usługi lub przepisy. Datę ostatniej zmiany podajemy na górze strony. O istotnych zmianach informujemy na stronie i w launcherze; zalogowanym użytkownikom pokazujemy powiadomienie.
