#!/usr/bin/env bash
# Sends server/ to the server (CT 821 on the Proxmox host, reached through its jump account) and restarts it:
# ./server/deploy/deploy.sh. The server needs no access to GitHub: the code goes from this computer over SSH.
set -euo pipefail
# "slashclient" from ~/.ssh/config: CT 821 through the jump account (AGENTS.md, "Wdrożenie serwera")
HOST="${SLASHCLIENT_HOST:-slashclient}"
SSH="ssh"
remote() { ssh "$@"; }
cd "$(dirname "$0")/.."

rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude data --exclude test --exclude '.*' \
  ./ "$HOST:/opt/slashclient/app/"

remote "$HOST" 'set -e
cd /opt/slashclient/app
npm ci --omit=dev --no-audit --no-fund --silent
chown -R root:root /opt/slashclient/app
install -m 644 deploy/slashclient.service /etc/systemd/system/slashclient.service
install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
install -m 755 deploy/slashclient-backup.sh /usr/local/sbin/slashclient-backup
install -m 644 deploy/slashclient-backup.service deploy/slashclient-backup.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --quiet slashclient slashclient-backup.timer
systemctl restart slashclient
systemctl reload caddy || systemctl restart caddy
sleep 2
systemctl is-active slashclient caddy
curl -fsS http://127.0.0.1:8787/v1/health'
echo
echo "Gotowe: https://slashclient.pl/"
