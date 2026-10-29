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
# this run's mark: a progress window of an earlier run sees another one started and keeps its own results
run="$mc-$(date +%s)"
echo "$run" > build/gametest-run
# a small window with the progress (progress/; off with SLASHCLIENT_TEST_WINDOW=0, never on CI)
electron=../node_modules/.bin/electron
if [ -z "${CI:-}" ] && [ "${SLASHCLIENT_TEST_WINDOW:-1}" != 0 ] && [ -e "$electron" ]; then
  # the window's "Restart" runs a share again with the same gradle arguments
  SLASHCLIENT_TEST_ARGS="$*" "$electron" progress --mc="$mc" --n="$n" --run="$run" > /dev/null 2>&1 &
fi
# A game whose world-closing got stuck in the test library's threads (it happens now and then, in any test)
# stops writing to its log: after HANG_SECONDS of silence (default 4 minutes) it is stopped and its share
# runs once more. The stuck run's log is kept as gametest-<mc>-<i>.hung.log.
stop_game() {
  # the game is told its share (build.gradle: -Dslashclient.test.shard=2/4)
  local mark="slashclient.test.shard=$1/$n"
  if command -v powershell.exe > /dev/null; then
    powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"name='java.exe'\" | Where-Object { \$_.CommandLine -like '*$mark *' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force }" > /dev/null 2>&1
  else
    pkill -f "$mark " || true
  fi
}
share() {
  local i=$1 try code
  shift
  for try in 1 2; do
    ./gradlew runClientGameTest -Pmc="$mc" -Pshard="$i/$n" $NO_COMPILE "$@" -q > "build/gametest-$i.log" 2>&1 &
    local game=$! last=-1 still=0 hung=0 size
    while kill -0 "$game" 2> /dev/null; do
      sleep 15
      size=$(wc -c < "build/gametest-$i.log" 2> /dev/null || echo 0)
      if [ "$size" = "$last" ]; then still=$((still + 15)); else still=0; last=$size; fi
      if [ "$still" -ge "${HANG_SECONDS:-240}" ]; then
        hung=1
        stop_game "$i"
        break
      fi
    done
    wait "$game"
    code=$?
    if [ "$hung" = 1 ] && [ "$try" = 1 ]; then
      cp "build/gametest-$i.log" "build/gametest-$mc-$i.hung.log"
      echo "share $i/$n: the game hung (log in hud/build/gametest-$mc-$i.hung.log), running it again" >&2
      continue
    fi
    return "$code"
  done
}

for i in $(seq 1 "$n"); do
  rm -rf "build/run/clientGameTest-${i}of$n/screenshots"
  # each share's exit code in a file when it ends, for the progress window
  # compiled once above: the games only run (the version preprocessor rewrites the sources each time
  # gradle starts, and four compiles at once would overwrite each other's classes mid-run)
  ( share "$i" "$@"; code=$?; echo $code > "build/gametest-$i.status"; exit $code ) &
  pids+=($!)
  # the games start a little apart, not all loading at the same moment
  sleep 8
done

failed=0
for i in $(seq 1 "$n"); do
  if wait "${pids[$((i - 1))]}"; then
    echo "share $i/$n: ok"
  else
    # kept beside the next run's logs, so a failure can still be read after another version's run
    cp "build/gametest-$i.log" "build/gametest-$mc-$i.failed.log"
    echo "share $i/$n: FAILED, see hud/build/gametest-$mc-$i.failed.log"
    # the test's own failure first; the game's harmless warnings (the Windows counters' OSHI one) are no reason
    reason=$(grep -m1 -A8 "AssertionError\|Test .* failed\|Minecraft has crashed\|NoClassDefFoundError\|ClassNotFoundException\|Caused by: " "build/gametest-$i.log")
    [ -z "$reason" ] && reason=$(grep -v "HkeyPerformanceDataUtil\|Win32Exception\|Advapi32Util\|Realms server" "build/gametest-$i.log" | grep -m1 -A8 "Exception:")
    printf '%s
' "$reason" | sed 's/^/    /'
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
