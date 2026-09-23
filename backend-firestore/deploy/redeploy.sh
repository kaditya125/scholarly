#!/usr/bin/env bash
# Zero-downtime redeploy on the production VM (sadhya-vm). Run as ubuntu:
#   bash /var/www/sadhya/backend-firestore/deploy/redeploy.sh
# The frontend rebuilds only when the pull changed frontend/; FRONTEND=1 forces it.
#
# Backend: nginx proxies /api and /voice to upstream `sadhya_api` (/etc/nginx/conf.d/sadhya-api-upstream.conf):
#   server 127.0.0.1:8080 max_fails=0;   server 127.0.0.1:8081 backup;
# A request refused by the restarting main instance was never delivered, so nginx passes it —
# POSTs included — to the backup. The backup is the deploy-only `sadhya-api-standby` PM2 app
# (see ecosystem.config.js): started here, removed once the main instance is healthy again.
# max_fails=0 keeps one slow request from marking 8080 down while no standby is running.
# Frontend: built beside the live dist/ and swapped in whole (Vite empties its outDir first).
set -euo pipefail

# Everything runs inside main(): bash parses a function whole, so the `git pull` below may rewrite
# this file without the running copy reading half-old, half-new lines.
main() {
  APP=/var/www/sadhya
  cd "$APP"

  if [ -n "$(git status --porcelain --untracked-files=no -- . ':!backend-firestore/node_modules')" ]; then
    echo "Tracked files are modified on the server — back them up and resolve before deploying:" >&2
    git status --porcelain --untracked-files=no -- . ':!backend-firestore/node_modules' >&2
    exit 1
  fi

  OLD=$(git rev-parse HEAD)
  git pull --ff-only origin main
  NEW=$(git rev-parse HEAD)
  # -C: pathspecs are repo-root paths, but this is called from inside frontend/ and backend-firestore/.
  changed() { git -C "$APP" diff --name-only "$OLD" "$NEW" -- "$1" | grep -q .; }
  echo "deploying $(git log --oneline -1)"

  # ── Frontend ────────────────────────────────────────────────────────────────────────────────
  cd "$APP/frontend"
  if changed frontend/package-lock.json; then npm ci --no-audit --no-fund; fi
  if [ "${FRONTEND:-}" = 1 ] || changed frontend/; then
    rm -rf dist-next
    node --max-old-space-size=6144 ./node_modules/vite/bin/vite.js build --outDir dist-next --emptyOutDir
    SEO_DIST=dist-next node ./node_modules/tsx/dist/cli.mjs scripts/seo-prerender.ts
    test -f dist-next/index.html
    mv dist dist-old && mv dist-next dist && rm -rf dist-old
    echo "frontend swapped"
  fi

  # ── Backend ─────────────────────────────────────────────────────────────────────────────────
  cd "$APP/backend-firestore"
  if changed backend-firestore/package-lock.json; then npm ci --no-audit --no-fund; fi

  ready() { curl -fs -m 3 "http://127.0.0.1:$1/health/ready" >/dev/null; }
  wait_ready() { for _ in $(seq 1 60); do ready "$1" && return 0; sleep 2; done; return 1; }

  pm2 delete sadhya-api-standby >/dev/null 2>&1 || true
  pm2 start ecosystem.config.js --only sadhya-api-standby >/dev/null
  if ! wait_ready 8081; then
    pm2 delete sadhya-api-standby >/dev/null 2>&1 || true
    echo "standby never became ready — aborting before touching sadhya-api (still on the old code)" >&2
    exit 1
  fi
  echo "standby ready on 8081"

  # Through the ecosystem file, not by name, so edits to its options (kill_timeout…) take effect.
  pm2 restart ecosystem.config.js --only sadhya-api >/dev/null
  if ! wait_ready 8080; then
    echo "sadhya-api did not come back on 8080 — the standby is left serving; investigate now" >&2
    exit 1
  fi
  # New requests are back on 8080. Let answers the standby started during the restart finish
  # (20 s here, plus its 10 s shutdown grace) before removing it.
  sleep 20
  pm2 delete sadhya-api-standby >/dev/null
  pm2 save >/dev/null
  echo "backend live on 8080: $(curl -s -m 5 http://127.0.0.1:8080/health/ready | head -c 60)"
}

main "$@"
