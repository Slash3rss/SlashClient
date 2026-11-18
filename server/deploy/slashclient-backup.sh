#!/bin/sh
# Nightly copy of SlashClient's data: a consistent SQLite snapshot (safe while the server runs) and the
# uploaded files next to it. Kept 30 days at most, as the privacy policy promises.
set -eu
T=$(date +%Y%m%d-%H%M%S)
D=/var/backups/slashclient
mkdir -p "$D"
chmod 700 "$D"
sqlite3 /var/lib/slashclient/social.db ".backup $D/social-$T.db"
gzip -9 "$D/social-$T.db"
tar czf "$D/files-$T.tgz" -C /var/lib/slashclient --exclude='./social.db' --exclude='./social.db-wal' --exclude='./social.db-shm' .
find "$D" -type f -mtime +30 -delete
