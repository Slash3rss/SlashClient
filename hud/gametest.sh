#!/usr/bin/env bash
# Runs the game tests of one Minecraft version split over several games side by side (each with its
# own folder, 1.5 GB and a free port), then puts all screenshots in build/run/clientGameTest-all.
#   ./gametest.sh 26.3            4 games
#   ./gametest.sh 26.3 3 -Pshots  3 games, more gradle arguments after the count
# Only some tests, in one game: ./gradlew runClientGameTest -Pmc=26.3 -Ptests=GameProps,HudScreenshots
set -u
cd "$(dirname "$0")"
mc=$1
n=${2:-4}
shift
[ $# -gt 0 ] && shift
# compiled once, so the games only start (several builds of the same classes at once would collide)
./gradlew compileGametestJava processGametestResources -Pmc="$mc" -q || exit 1

pids=()
for i in $(seq 1 "$n"); do
  rm -rf "build/run/clientGameTest-${i}of$n/screenshots"
  ./gradlew runClientGameTest -Pmc="$mc" -Pshard="$i/$n" "$@" -q > "build/gametest-$i.log" 2>&1 &
  pids+=($!)
  # the games start a little apart, not all loading at the same moment
  sleep 8
done

failed=0
for i in $(seq 1 "$n"); do
  if wait "${pids[$((i - 1))]}"; then
    echo "share $i/$n: ok"
  else
    echo "share $i/$n: FAILED, see hud/build/gametest-$i.log"
    grep -m1 -A8 "AssertionError\|Exception:" "build/gametest-$i.log" | sed 's/^/    /'
    failed=1
  fi
done

out=build/run/clientGameTest-all
rm -rf "$out"
mkdir -p "$out"
for i in $(seq 1 "$n"); do
  for f in "build/run/clientGameTest-${i}of$n/screenshots"/*; do
    [ -e "$f" ] && cp "$f" "$out/"
  done
done
echo "screenshots: hud/$out ($(ls "$out" | wc -l))"
grep -h "SlashClient test time" build/gametest-*.log | sort -k5 -n -r | head -8
exit $failed
