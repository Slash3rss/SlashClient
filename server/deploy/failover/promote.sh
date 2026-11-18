#!/usr/bin/env bash
# Makes this spare the main server: only when the main one stopped renewing its lease (it is down or
# cut off), then the last copies of the database and the files from the bucket, the server started,
# and Cloudflare pointed at this server. Run by watchdog.sh, or by hand: sudo ./promote.sh
set -euo pipefail
# shellcheck source=/dev/null
source /etc/slashclient/failover.env
cd /opt/slashclient/app
log() { echo "$*"; logger -t slashclient-promote "$*"; }
node_run() { (set -a; source /etc/slashclient/env; set +a; node --disable-warning=ExperimentalWarning "$@"); }

if systemctl is-active --quiet slashclient; then
  log "Serwer już działa na tym komputerze – nic do przejęcia."
  exit 0
fi

lease=$(node_run src/failoverTool.ts lease)
if ! grep -q '"stale":true' <<< "$lease"; then
  log "Dzierżawa jest świeża – główny serwer działa ($lease). Przerywam."
  exit 1
fi
log "Dzierżawa wygasła ($lease). Odtwarzam bazę i pliki z magazynu."
node_run src/failoverTool.ts restore
chown -R slashclient:slashclient /var/lib/slashclient

systemctl enable --quiet slashclient
systemctl start slashclient
for _ in $(seq 1 30); do
  curl -fsS http://127.0.0.1:8787/v1/health > /dev/null 2>&1 && break
  sleep 1
done
if ! curl -fsS http://127.0.0.1:8787/v1/health > /dev/null 2>&1; then
  log "Serwer nie wystartował (journalctl -u slashclient). Cloudflare bez zmian."
  exit 1
fi
log "Serwer działa. Kieruję $CF_RECORD w Cloudflare na ten serwer."

# Cloudflare: the record's address (or addresses) changed to this server's, proxied as before
cf() { curl -fsS -H "Authorization: Bearer $CF_API_TOKEN" -H 'Content-Type: application/json' "$@"; }
ids() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{for(const r of JSON.parse(s).result)console.log(r.id)})'; }
api="https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records"
for id in $(cf "$api?type=A&name=$CF_RECORD" | ids); do
  cf -X PATCH "$api/$id" --data "{\"content\":\"$SELF_IP\"}" > /dev/null
done
for id in $(cf "$api?type=AAAA&name=$CF_RECORD" | ids); do
  if [ -n "${SELF_IPV6:-}" ]; then
    cf -X PATCH "$api/$id" --data "{\"content\":\"$SELF_IPV6\"}" > /dev/null
  else
    # an IPv6 address of the main server left in place would send part of the players to it
    cf -X DELETE "$api/$id" > /dev/null
    log "Usunięto rekord AAAA (ten serwer nie ma IPv6) – przy powrocie na główny dodaj go z powrotem."
  fi
done
systemctl disable --now --quiet slashclient-watchdog.timer || true
log "Gotowe: ten serwer ($SELF_IP) jest teraz głównym. Stary główny, gdy wróci, sam się nie uruchomi (dzierżawa)."
