#!/usr/bin/env bash
# On the spare server, every 30 s (slashclient-watchdog.timer). While the main server answers: nothing.
# When it has not answered FAILS_NEEDED times in a row (default 6, so 3 minutes), the spare takes over
# (promote.sh), which also checks that the main one stopped renewing its lease.
set -uo pipefail
# shellcheck source=/dev/null
source /etc/slashclient/failover.env
STATE=/var/lib/slashclient-watchdog
mkdir -p "$STATE"

# this one is the main server already (taken over before): nothing to watch
if systemctl is-active --quiet slashclient; then exit 0; fi

# asked straight at the main server's address, past Cloudflare (-k: its certificate may be Cloudflare's origin one)
if curl -fsk -m 8 --resolve "$CF_RECORD:443:$PRIMARY_IP" "https://$CF_RECORD/v1/health" > /dev/null; then
  echo 0 > "$STATE/fails"
  exit 0
fi

fails=$(( $(cat "$STATE/fails" 2> /dev/null || echo 0) + 1 ))
echo "$fails" > "$STATE/fails"
logger -t slashclient-watchdog "główny serwer ($PRIMARY_IP) nie odpowiada: $fails/${FAILS_NEEDED:-6}"
[ "$fails" -lt "${FAILS_NEEDED:-6}" ] && exit 0
if [ "${AUTO_PROMOTE:-1}" != 1 ]; then
  logger -t slashclient-watchdog "przejęcie wyłączone (AUTO_PROMOTE=0): uruchom ręcznie promote.sh"
  exit 0
fi
logger -t slashclient-watchdog "przejmuję: promote.sh"
exec /opt/slashclient/app/deploy/failover/promote.sh
