#!/usr/bin/env bash
# Builds SlashClient HUD for every game version in versions/ and collects the jars the
# launcher ships in build/bundle (slashclient-hud-<game version>.jar).
set -euo pipefail
cd "$(dirname "$0")"
rm -rf build/bundle
for f in versions/*.properties; do
  mc=$(basename "$f" .properties)
  echo "== SlashClient HUD for Minecraft $mc"
  ./gradlew build bundle -Pmc="$mc" --no-daemon "$@"
done
ls build/bundle
