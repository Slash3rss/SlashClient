#!/usr/bin/env bash
# Sends server/ to the VPS and restarts it: ./server/deploy/deploy.sh
# The VPS needs no access to GitHub: the code goes from this computer over SSH.
set -euo pipefail
HOST="${SLASHCLIENT_HOST:-root@93.95.119.130}"
KEY="${SLASHCLIENT_KEY:-$HOME/.ssh/slashclient_vps}"
SSH="ssh -i $KEY -o IdentitiesOnly=yes"
cd "$(dirname "$0")/.."

rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude data --exclude test --exclude '.*' \
  ./ "$HOST:/opt/slashclient/app/"

$SSH "$HOST" 'set -e
cd /opt/slashclient/app
npm ci --omit=dev --no-audit --no-fund --silent
chown -R root:root /opt/slashclient/app
install -m 644 deploy/slashclient.service /etc/systemd/system/slashclient.service
install -m 644 deploy/Caddyfile /etc/caddy/Caddyfile
systemctl daemon-reload
systemctl enable --quiet slashclient
systemctl restart slashclient
systemctl reload caddy || systemctl restart caddy
sleep 2
systemctl is-active slashclient caddy
curl -fsS http://127.0.0.1:8787/v1/health'
echo
echo "Gotowe: https://slashclient.pl/"
