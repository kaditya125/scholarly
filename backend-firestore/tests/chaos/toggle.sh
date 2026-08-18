#!/usr/bin/env bash
# Chaos toggle for Sadhya staging resilience tests. Injects/clears faults via the Toxiproxy
# control API — NO code change in src/. Corresponds to §3.6 of docs/STAGING_CERTIFICATION_PLAN.md.
#
# Usage:
#   ./toggle.sh setup                      # create proxies (reads UPSTREAM_* env vars)
#   ./toggle.sh down    <dep>              # take a dependency fully offline
#   ./toggle.sh latency <dep> <ms>         # add fixed latency to a dependency
#   ./toggle.sh clear   <dep>              # remove all toxics from a dependency
#   ./toggle.sh clear-all                  # remove all toxics from every dependency
#
#   <dep> ∈ { pinecone | firestore | gemini | cohere | redis }
#
# Then run the resilience suite with CHAOS_ENABLED=1 CHAOS_FAULT="pinecone-down" against staging.
set -euo pipefail

API="${TOXIPROXY_API:-http://localhost:8474}"

# proxy_name : listen_port : upstream_env_var (host:port of the real dependency)
declare -A PORT=( [pinecone]=6001 [firestore]=6002 [gemini]=6003 [cohere]=6004 [redis]=6005 )
declare -A UPSTREAM=(
  [pinecone]="${UPSTREAM_PINECONE:-}"
  [firestore]="${UPSTREAM_FIRESTORE:-firestore.googleapis.com:443}"
  [gemini]="${UPSTREAM_GEMINI:-generativelanguage.googleapis.com:443}"
  [cohere]="${UPSTREAM_COHERE:-api.cohere.ai:443}"
  [redis]="${UPSTREAM_REDIS:-}"
)

setup() {
  for dep in "${!PORT[@]}"; do
    local up="${UPSTREAM[$dep]}"
    [ -z "$up" ] && { echo "skip $dep (no UPSTREAM set)"; continue; }
    curl -sf -X POST "$API/proxies" -d "{\"name\":\"$dep\",\"listen\":\"0.0.0.0:${PORT[$dep]}\",\"upstream\":\"$up\",\"enabled\":true}" >/dev/null \
      && echo "proxy up: $dep :${PORT[$dep]} -> $up" || echo "proxy exists: $dep"
  done
  echo "Point the staging backend's $dep endpoints at the proxy host:port above, then inject faults."
}

down()    { curl -sf -X POST "$API/proxies/$1" -d '{"enabled":false}' >/dev/null && echo "$1 DOWN"; }
latency() { curl -sf -X POST "$API/proxies/$1/toxics" -d "{\"type\":\"latency\",\"attributes\":{\"latency\":$2}}" >/dev/null && echo "$1 +${2}ms"; }
clear_one() {
  curl -sf -X POST "$API/proxies/$1" -d '{"enabled":true}' >/dev/null || true
  for t in $(curl -sf "$API/proxies/$1/toxics" | grep -o '"name":"[^"]*"' | cut -d'"' -f4); do
    curl -sf -X DELETE "$API/proxies/$1/toxics/$t" >/dev/null || true
  done
  echo "$1 cleared"
}
clear_all() { for dep in "${!PORT[@]}"; do clear_one "$dep" || true; done; }

case "${1:-}" in
  setup)     setup ;;
  down)      down "$2" ;;
  latency)   latency "$2" "$3" ;;
  clear)     clear_one "$2" ;;
  clear-all) clear_all ;;
  *) echo "usage: $0 {setup|down <dep>|latency <dep> <ms>|clear <dep>|clear-all}"; exit 1 ;;
esac
