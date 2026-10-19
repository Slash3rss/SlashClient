# Miejsce na pliki: dysk serwera, Cloudflare R2 i Backblaze B2

Udostępnione zrzuty i klipy (`/media/<id>`) oraz profile trzymane na kontach (chmura profili) to pliki graczy.
Domyślnie leżą na dysku VPS (`MEDIA_DIR`, `CLOUD_DIR`, czyli `/var/lib/slashclient/media` i `/var/lib/slashclient/cloud-profiles`).
Dysk VPS jest mały, więc w panelu admina można dodać **miejsca na pliki** w chmurze: Cloudflare R2, Backblaze B2
albo dowolny inny serwis zgodny z S3, także kilka naraz.

Jak to działa:

- Każdy plik ma w bazie zapisane, gdzie leży. Odczyt, usuwanie i sprzątanie idą zawsze tam.
- **Nowy plik** trafia do pierwszego **włączonego** miejsca (według **priorytetu**, niższy = pierwszy), które ma na niego miejsce:
  nie przekracza **limitu** ustawionego w panelu (zajętość liczona z bazy), a na dysku VPS zostaje co najmniej **2 GB wolnego**
  (`STORAGE_MIN_FREE_MB`). Gdy nigdzie nie ma miejsca, launcher dostaje błąd `storage_full` i pokazuje graczowi komunikat.
- Jeśli zapis do bucketu się nie uda (awaria, zły klucz), serwer próbuje następnego miejsca.
- Pliki zawsze przechodzą przez serwer SlashClient (te same nagłówki co dotąd, przewijanie klipów). Gracze nigdy nie
  dostają linku do bucketu, więc bucket jest **prywatny**.
- Klucze dostępu do bucketów są w bazie zaszyfrowane (AES-256-GCM) kluczem `STORAGE_SECRET_KEY`, który jest tylko
  w ustawieniach serwera. Panel nigdy ich nie pokazuje: widać tylko „ustawiony” i 4 ostatnie znaki identyfikatora klucza.
- Wyłączone miejsce nie przyjmuje nowych plików, ale te, które już w nim są, dalej działają.

Kolejność wdrożenia: najpierw `STORAGE_SECRET_KEY` na serwerze (punkt 3), potem bucket(y) w R2 lub B2 (punkty 1–2),
na końcu dodanie ich w panelu (punkt 4).

## 1. Cloudflare R2

1. Zaloguj się na <https://dash.cloudflare.com>, w menu po lewej **R2 Object Storage**. Przy pierwszym wejściu Cloudflare
   każe włączyć R2 (plan darmowy wymaga podania karty, ale do 10 GB nic nie kosztuje).
2. **Identyfikator konta (Account ID)**: na stronie R2 po prawej stronie, w sekcji „Account Details” (32 znaki, cyfry i litery a–f).
   Jest też w adresie panelu: `dash.cloudflare.com/<Account ID>/r2/...`.
3. **Create bucket**: nazwa np. `slashclient-pliki`, lokalizacja automatyczna (albo jurysdykcja **EU**, wtedy w panelu
   SlashClient zaznacz „Bucket w jurysdykcji UE”). Nie włączaj publicznego dostępu (Public access zostaje wyłączony).
4. **Klucz API**: na stronie R2 **Manage API tokens** (albo „API” → „Manage API Tokens”) → **Create API token**:
   - **Permissions:** `Object Read & Write`,
   - **Specify bucket(s):** `Apply to specific buckets only` → wybierz swój bucket,
   - **TTL:** `Forever` (albo data, ale wtedy pamiętaj o wymianie klucza),
   - **Create API Token**.
5. Skopiuj **Access Key ID** i **Secret Access Key**. Sekret jest pokazywany tylko raz (zapisz go od razu w menedżerze haseł
   albo wpisz od razu w panelu SlashClient).
6. Endpoint S3: `https://<Account ID>.r2.cloudflarestorage.com` (UE: `https://<Account ID>.eu.r2.cloudflarestorage.com`),
   region `auto`. Panel SlashClient wpisze go sam po podaniu identyfikatora konta.

## 2. Backblaze B2

1. Załóż konto na <https://www.backblaze.com/sign-up/cloud-storage>. **Region konta** (US West, US East albo EU Central)
   wybierasz przy zakładaniu i nie da się go potem zmienić. Dla serwera w Europie wybierz **EU Central**.
2. **B2 Cloud Storage → Buckets → Create a Bucket**:
   - nazwa (unikalna na całym B2), np. `slashclient-pliki-xyz`,
   - **Files in Bucket are:** `Private`,
   - szyfrowanie i Object Lock: wyłączone (można włączyć szyfrowanie SSE-B2, nie przeszkadza).
3. W karcie bucketu jest **Endpoint**, np. `s3.eu-central-003.backblazeb2.com`. Część między `s3.` a `.backblazeb2.com`
   to region (`eu-central-003`), endpoint dla panelu to `https://s3.eu-central-003.backblazeb2.com`.
4. **Ważne: wersje plików.** B2 domyślnie trzyma stare wersje usuniętych plików (i liczy je do zajętego miejsca).
   W karcie bucketu **Lifecycle Settings** wybierz **Keep only the last version of the file**.
5. **Application Keys → Add a New Application Key**:
   - **Name of Key:** np. `slashclient-serwer`,
   - **Allow access to Bucket(s):** tylko Twój bucket,
   - **Type of Access:** `Read and Write`,
   - reszta pól pusta → **Create New Key**.
6. Skopiuj **keyID** i **applicationKey**. Klucz jest pokazywany tylko raz.

## 3. `STORAGE_SECRET_KEY` na VPS

Serwer czyta ustawienia z `/etc/slashclient/env` (`EnvironmentFile` w `deploy/slashclient.service`).
Bez tego klucza panel odmówi zapisania kluczy R2/B2 i powie o tym na stronie „Miejsce na pliki”.

```bash
# na VPS, jako root
openssl rand -base64 32                 # wypisze np. q3k0…= (44 znaki)
nano /etc/slashclient/env               # dopisz linię: STORAGE_SECRET_KEY=<to, co wypisał openssl>
chmod 600 /etc/slashclient/env          # plik czyta tylko root (systemd), usługa dostaje go jako zmienną
systemctl restart slashclient
journalctl -u slashclient -n 30         # bez błędu „STORAGE_SECRET_KEY musi mieć 32 bajty”
```

- Zapisz kopię klucza poza serwerem (menedżer haseł). Klucz szyfruje tylko klucze dostępu do bucketów, nie same pliki.
  Gdy go zgubisz albo zmienisz, buckety w panelu będą „niedostępne”, dopóki nie wpiszesz ich kluczy ponownie (Edytuj).
- Opcjonalnie `STORAGE_MIN_FREE_MB=2048`: ile wolnego miejsca musi zostać na dysku VPS, żeby przyjmował nowe pliki (domyślnie 2048).

## 4. Dodanie miejsca w panelu

1. Wejdź na `https://client.slash3rss.dev/admin` → **Miejsce na pliki** → **Dodaj miejsce**.
2. **Rodzaj:** Cloudflare R2, Backblaze B2, Inne S3 albo Folder na serwerze.
3. Wypełnij:
   - **Nazwa**, np. „R2 darmowe”,
   - R2: **Identyfikator konta** (endpoint uzupełni się sam); B2: **Region** z listy (endpoint też się uzupełni),
   - **Bucket**: nazwa bucketu,
   - **Prefiks kluczy**: domyślnie `slashclient/` (pliki trafią do `slashclient/media/…` i `slashclient/cloud/…`),
   - **Identyfikator klucza** i **Sekret klucza** z punktu 1 albo 2,
   - **Limit miejsca (GB)**: dla darmowego planu np. `9.5` (zostaw zapas pod 10 GB),
   - **Priorytet**: niższy = wybierany pierwszy. Dysk serwera ma 100, nowe miejsca domyślnie 10, więc od razu przejmują nowe pliki.
4. **Test połączenia**: serwer zapisuje, odczytuje i usuwa mały plik testowy. Jeśli coś nie działa, panel podpowiada,
   co (zły sekret, klucz bez dostępu do bucketu, zła nazwa bucketu, zły endpoint).
5. **Dodaj**. Nowe zrzuty, klipy i profile trafią już do bucketu; karta pokazuje zajętość, liczbę plików i podział na
   zrzuty, klipy i profile.

Kilka bucketów naraz: np. R2 z priorytetem 10 i limitem 9.5 GB, B2 z priorytetem 20 i limitem 9.5 GB, dysk serwera 100
jako ostatnia deska ratunku (albo wyłączony). Gdy R2 się zapełni, nowe pliki pójdą do B2, potem na dysk.

**Przenoszenie starych plików:** w karcie „Dysk serwera” wybierz **Przenieś pliki do…** i bucket. Pliki przenoszą się
w tle po jednym (kopia, zmiana w bazie, usunięcie ze starego miejsca), linki działają cały czas, postęp widać na stronie,
można zatrzymać. Gdy w miejscu docelowym skończy się miejsce, przenoszenie staje. Restart serwera przerywa przenoszenie;
wystarczy uruchomić je ponownie (przeniesie resztę).

**Wyłączanie i usuwanie:** „Wyłącz” = koniec nowych plików w tym miejscu, stare działają. Miejsca z plikami nie da się
usunąć (najpierw przenieś pliki). Usunięcie z panelu nie rusza zawartości bucketu. Dysku serwera nie da się usunąć,
tylko wyłączyć. Wszystkie zmiany trafiają do **Dziennika** panelu (bez kluczy).

Dodatkowy **Folder na serwerze** (np. drugi dysk) musi być zapisywalny dla usługi: dopisz go do `ReadWritePaths=`
w `deploy/slashclient.service` (domyślnie tylko `/var/lib/slashclient`).

## Koszty (stan na 2026, sprawdź aktualne cenniki)

- **Cloudflare R2:** 10 GB miejsca za darmo co miesiąc, potem ok. 0,015 USD za GB miesięcznie. **Bez opłat za transfer**
  (egress). Darmowe są też miliony operacji miesięcznie (1 mln zapisów/list, 10 mln odczytów), co wystarcza z zapasem.
- **Backblaze B2:** pierwsze 10 GB za darmo, potem ok. 6 USD za TB miesięcznie. Transfer darmowy do **3× ilości
  trzymanych danych** miesięcznie, potem ok. 0,01 USD za GB. Odczyty mają darmowy dzienny limit (2500 dziennie), potem grosze.
- Każde wyświetlenie zrzutu lub klipu to jeden odczyt z bucketu (Cloudflare przed serwerem trzyma pliki w pamięci podręcznej
  do godziny, co zmniejsza liczbę odczytów). Sprzątanie raz na godzinę listuje bucket (kilka operacji na godzinę).
- Transfer do graczy dalej idzie przez VPS (jak dotąd), bo serwer sam przesyła pliki.
