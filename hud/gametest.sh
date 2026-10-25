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

NO_COMPILE="-x compileJava -x processResources -x compileGametestJava -x processGametestResources"
export NO_COMPILE
pids=()
for i in $(seq 1 "$n"); do rm -f "build/gametest-$i.log" "build/gametest-$i.status"; done
# a small window with the progress (progress/; off with SLASHCLIENT_TEST_WINDOW=0, never on CI)
electron=../node_modules/.bin/electron
if [ -z "${CI:-}" ] && [ "${SLASHCLIENT_TEST_WINDOW:-1}" != 0 ] && [ -e "$electron" ]; then
  # the window's "Restart" runs a share again with the same gradle arguments
  SLASHCLIENT_TEST_ARGS="$*" "$electron" progress --mc="$mc" --n="$n" > /dev/null 2>&1 &
fi
for i in $(seq 1 "$n"); do
  rm -rf "build/run/clientGameTest-${i}of$n/screenshots"
  # each share's exit code in a file when it ends, for the progress window
  # compiled once above: the games only run (the version preprocessor rewrites the sources each time
  # gradle starts, and four compiles at once would overwrite each other's classes mid-run)
  ( ./gradlew runClientGameTest -Pmc="$mc" -Pshard="$i/$n" $NO_COMPILE "$@" -q > "build/gametest-$i.log" 2>&1; code=$?; echo $code > "build/gametest-$i.status"; exit $code ) &
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
