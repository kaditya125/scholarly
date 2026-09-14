#!/usr/bin/env bash
#
# Supervisor for the PYQ vector backfill.
#
# The job is ~27,000 embeddings against a ~9.8/min ceiling, so it runs for days. Over that span a
# transient Vertex outage, a Qdrant restart or an OOM is likely at least once, and a worker that
# simply dies at hour 30 and waits for someone to notice is not a backfill — it is a coin flip. So
# the worker is restarted until the queue is genuinely empty. It is idempotent and checkpointed, so
# a restart re-derives the remaining queue from Qdrant and continues; nothing is re-embedded.
#
# PACING. The default leaves headroom on purpose. The measured ceiling is ~9.8 embeddings/minute and
# it is SHARED with live chat — topic search embeds one query per request. Running the backfill at
# the ceiling would mean students get 429s for two days so that the corpus finishes slightly
# sooner. PACE_MS=10000 spends ~6/min and leaves ~3.8/min for real traffic.
#
#   PACE_MS=10000 ./run-backfill.sh          # default, production-friendly
#   PACE_MS=7000  ./run-backfill.sh          # faster, near the ceiling — expect user-visible 429s
#
# Stop it with:  touch /var/www/sadhya/backend-firestore/scripts/pyq/audit/.backfill.stop
# Watch it with: tail -f /var/www/sadhya/backend-firestore/scripts/pyq/audit/out/backfill.log

set -uo pipefail
cd "$(dirname "$0")/../../.." || exit 1

PACE_MS="${PACE_MS:-10000}"

# Which exam to finish before doing the rest.
#
# The worker walks the queue in Firestore document-id order, which is alphabetical and has nothing
# to do with need. Left alone it spent its first four hours on JEE Main — already at 90% coverage —
# while UGC NET sat at 0.65%, meaning the one corpus that is actually unusable would have been
# reached last, three days in. Draining the starved exam first makes UGC NET searchable in hours
# instead of days; the total work is identical either way.
EXAM_PRIORITY="${EXAM_PRIORITY:-UGC_NET}"

OUT_DIR="scripts/pyq/audit/out"
LOG="$OUT_DIR/backfill.log"
STOP_FILE="scripts/pyq/audit/.backfill.stop"
PID_FILE="scripts/pyq/audit/.backfill.pid"
MAX_RESTARTS="${MAX_RESTARTS:-200}"

mkdir -p "$OUT_DIR"

# One supervisor at a time. Two backfills would not corrupt anything — the point ids are derived,
# so they would overwrite each other's work — but they would double the quota draw and halve the
# rate each one achieves.
if [ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE" 2>/dev/null)" 2>/dev/null; then
  echo "A backfill supervisor is already running (pid $(cat "$PID_FILE")). Not starting another."
  exit 1
fi
echo $$ > "$PID_FILE"
rm -f "$STOP_FILE"

trap 'rm -f "$PID_FILE"; echo "[supervisor] exiting" >> "$LOG"' EXIT

{
  echo "==============================================================="
  echo "[supervisor] backfill started $(date -u +%Y-%m-%dT%H:%M:%SZ)  pace=${PACE_MS}ms"
  echo "==============================================================="
} >> "$LOG"

restarts=0
phase=1
while [ "$restarts" -lt "$MAX_RESTARTS" ]; do
  if [ -f "$STOP_FILE" ]; then
    echo "[supervisor] stop file present — halting after $restarts pass(es)" >> "$LOG"
    break
  fi

  # Phase 1 drains the prioritised exam; phase 2 does everything else.
  exam_arg=""
  if [ -n "$EXAM_PRIORITY" ] && [ "$phase" = "1" ]; then
    exam_arg="--exam=$EXAM_PRIORITY"
  fi

  echo "[supervisor] pass $((restarts + 1)) phase=$phase ${exam_arg:-(all exams)} starting $(date -u +%H:%M:%SZ)" >> "$LOG"
  node ./node_modules/tsx/dist/cli.mjs scripts/pyq/audit/index-worker.ts \
    --execute --pace="$PACE_MS" $exam_arg >> "$LOG" 2>&1
  code=$?
  echo "[supervisor] pass $((restarts + 1)) exited code=$code $(date -u +%H:%M:%SZ)" >> "$LOG"

  # The worker prints the eligible queue on every start. When it reaches zero there is nothing
  # left to do and re-running would only rescan the corpus every 30 seconds forever.
  remaining=$(grep -E "QUEUE \(eligible, no vector\)" "$LOG" | tail -1 | grep -oE '[0-9]+$' || echo "unknown")
  if [ "$remaining" = "0" ]; then
    if [ "$phase" = "1" ] && [ -n "$EXAM_PRIORITY" ]; then
      echo "[supervisor] $EXAM_PRIORITY drained — moving to the remaining exams $(date -u +%H:%M:%SZ)" >> "$LOG"
      phase=2
      continue
    fi
    echo "[supervisor] queue empty — backfill complete $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
    break
  fi

  restarts=$((restarts + 1))
  # A clean exit means the pass finished its slice; restart promptly. A crash gets a pause, so a
  # persistent failure (expired credentials, Qdrant down) does not spin at full speed.
  if [ "$code" -eq 0 ]; then sleep 10; else
    echo "[supervisor] non-zero exit, backing off 120s" >> "$LOG"
    sleep 120
  fi
done

echo "[supervisor] finished after $restarts restart(s) $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$LOG"
