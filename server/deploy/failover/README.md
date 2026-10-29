# Zapasowy serwer (awaryjność)

Drugi serwer stoi w gotowości i przejmuje stronę, konta, czat i znajomych, gdy główny przestanie odpowiadać.
Domena działa przez proxy Cloudflare, więc przełączenie to tylko zmiana adresu serwera w rekordzie DNS. Gracze nie
czekają, aż DNS się odświeży, a launcher i mod same połączą się ponownie.

## Jak to działa

- **Dzierżawa w R2.** Główny serwer co 15 s odnawia plik `leader.json` w magazynie. Zapisuje go tylko wtedy, gdy nikt
  go w międzyczasie nie zmienił (zapis warunkowy), więc dwa serwery nie mogą jej mieć naraz.
  - Serwer, który przy starcie widzi świeżą cudzą dzierżawę, nie startuje (kod 75).
  - Serwer, który ją straci w trakcie pracy, od razu się wyłącza.

  Dzięki temu stary główny, gdy wróci po awarii, nie zapisze niczego obok nowego.
- **Kopie.** Serwer z dzierżawą kopiuje do magazynu:
  - bazę co 30 s, gdy coś się zmieniło, a przy każdym zatrzymaniu przez systemd jeszcze raz;
  - pliki z folderu bazy (`/var/lib/slashclient`: udostępnione profile, logi, obrazki czatu, media i chmura z dysku
    serwera) co minutę, tylko nowe i zmienione;
  - dodatkowo kopie bazy co godzinę (trzymane 48 h) i co dzień (30 dni), czyli zwykły backup.

  Pliki, które panel admina trzyma już w R2 (Miejsce na pliki), i tak są w magazynie.
- **Strażnik na zapasowym.** Co 30 s pyta główny serwer bezpośrednio o `/v1/health`, z pominięciem Cloudflare. Po
  3 minutach bez odpowiedzi uruchamia `promote.sh`, który:
  1. sprawdza, że dzierżawa wygasła (główny naprawdę nie działa, a nie tylko zapasowy go nie widzi);
  2. pobiera ostatnią kopię bazy i pliki;
  3. startuje serwer, który bierze dzierżawę;
  4. przez API Cloudflare kieruje `client.slash3rss.dev` na siebie.

Utrata danych przy awarii: do ~30 s zmian w bazie i do minuty w plikach. Przerwa: około 4 minut.

## Uruchomienie (raz)

**1. Magazyn R2.** W Cloudflare: R2 → zasobnik, np. `slashclient-failover` (może być ten od multimediów, z osobnym
prefiksem). Potem R2 → Manage API tokens → token z „Object Read & Write” tylko do tego zasobnika.

**2. Oba serwery: zmienne w `/etc/slashclient/env`.** Do istniejących dopisz:
```
FAILOVER_NODE=pl1                 # na zapasowym inna nazwa, np. de1
FAILOVER_S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
FAILOVER_S3_BUCKET=slashclient-failover
FAILOVER_S3_KEY_ID=...
FAILOVER_S3_SECRET=...
```
Pozostałe zmienne (klucze OAuth, `STORAGE_SECRET_KEY`, `PUBLIC_URL`…) muszą być na obu serwerach takie same.
Bez tego zaszyfrowane klucze z panelu i logowanie nie zadziałają na zapasowym.

**3. Certyfikat.** Najprościej: Cloudflare → SSL/TLS → Origin Server → certyfikat dla `client.slash3rss.dev` na 15 lat,
wgrany na oba serwery, i tryb SSL „Full (strict)”. Caddy na obu: `tls /etc/caddy/origin.pem /etc/caddy/origin.key`
w bloku `client.slash3rss.dev`. Wtedy zapasowy ma ważny certyfikat już przed przejęciem.

**4. Zapasowy serwer.** Ta sama instalacja co główny: Node 24, Caddy, użytkownik `slashclient`, aplikacja w
`/opt/slashclient/app` razem z `deploy/failover/`, `slashclient.service`. Do tego:
```
cp deploy/failover/failover.env.example /etc/slashclient/failover.env   # uzupełnij, chmod 600
chmod +x deploy/failover/*.sh
cp deploy/failover/slashclient-watchdog.{service,timer} /etc/systemd/system/
systemctl daemon-reload
systemctl disable --now slashclient          # na zapasowym serwer czeka wyłączony
systemctl enable --now slashclient-watchdog.timer
```

**5. Główny serwer.** Nowa `slashclient.service` (z `RestartPreventExitStatus=75`), zmienne z punktu 2,
`systemctl daemon-reload && systemctl restart slashclient`. W logu ma się pojawić
„Awaryjność: pl1 jest głównym serwerem”, a w magazynie `leader.json`, `db/latest.db.gz` i `files/`.

## Próba przełączenia

1. Na głównym: `systemctl stop slashclient`. Strona przestaje działać.
2. Na zapasowym, po ~3 min: `journalctl -t slashclient-watchdog -t slashclient-promote`. Pojawi się „Gotowe: ten
   serwer … jest teraz głównym”.
3. `curl https://client.slash3rss.dev/v1/health`: pole `node` pokazuje nazwę zapasowego.
4. Główny teraz nie wystartuje sam. `systemctl start slashclient` kończy się komunikatem, że główny jest teraz
   zapasowy, i tak ma być.

Ręcznie, bez czekania: `sudo /opt/slashclient/app/deploy/failover/promote.sh`. Przejęcie się nie uda, dopóki główny
odnawia dzierżawę.

## Powrót na pierwotny serwer

Gdy pierwotny jest sprawny, zamień role, żeby nic nie zginęło:
1. Na obecnym głównym (dawnym zapasowym): `systemctl stop slashclient`. Przy zatrzymaniu robi ostatnią kopię bazy.
2. Poczekaj 90 s, aż dzierżawa wygaśnie.
3. Na pierwotnym: `promote.sh` (z jego własnym `failover.env`) albo ręcznie `node src/failoverTool.ts restore`,
   `systemctl start slashclient` i adres w Cloudflare. Jeśli `promote.sh` usunął rekord AAAA, dodaj go z powrotem.
4. Na dawnym zapasowym znów: `systemctl disable slashclient`, `systemctl enable --now slashclient-watchdog.timer`.

## Narzędzie

```
node src/failoverTool.ts lease     # kto ma dzierżawę i jak dawno odnowioną
node src/failoverTool.ts restore   # ostatnia kopia bazy i plików na miejsce (stara baza zostaje jako .before-restore-…)
```
Uruchamiaj ze zmiennymi z `/etc/slashclient/env`, np. `set -a; . /etc/slashclient/env; set +a`.
Kopie godzinowe i dzienne leżą w `db/hourly/` i `db/daily/`. Żeby wrócić do starszej, skopiuj ją na
`db/latest.db.gz` przed `restore`.
