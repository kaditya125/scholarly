#!/usr/bin/env bash
#
# Production release script for Sadhya (backend + frontend, one coordinated cutover).
#
# WHY THIS EXISTS. Deployment used to be a sequence of remembered commands, and the step that was
# easiest to forget was the one that broke production: the frontend is built by Vite, which inlines
# `import.meta.env.VITE_*` AT BUILD TIME from `frontend/.env`. That file is gitignored, so a build
# performed anywhere other than the live frontend directory silently produced a bundle with
# `apiKey: undefined`. The result was `FirebaseError: auth/invalid-api-key` thrown before first
# paint — a blank white page — while every server-side check (HTTP 200, correct SHA, correct
# bundle hash, contract strings present) reported success. Measured in production on 2026-08-21.
#
# The lesson encoded here: a bundle that contains the right feature strings is NOT a bundle that
# works. GATE 1 below checks the Firebase config specifically, because that is the check whose
# absence cost an outage.
#
# USAGE:  ./deploy.sh <release-sha>
#
# Deliberately NOT included: any Firestore write, any ingestion, any ENABLE_MASTERY change. This
# script deploys code and static assets. Nothing else.
set -euo pipefail

RELEASE_SHA="${1:-}"
REPO=/var/www/sadhya
FRONTEND="$REPO/frontend"
BUILD_ROOT="/home/azureuser/build-$RELEASE_SHA"
PM2_APP=sadhya-api
HEALTH=http://127.0.0.1:8080/health

ts() { date -u +%Y-%m-%dT%H:%M:%S.%3NZ; }
die() { echo "ABORT: $*" >&2; exit 1; }

[ -n "$RELEASE_SHA" ] || die "usage: ./deploy.sh <release-sha>"

echo "── preflight ──────────────────────────────────────────────"
cd "$REPO"
# Untracked build/backup dirs are expected; tracked modifications are not.
TRACKED_DIRTY=$(git status --porcelain --untracked-files=no | wc -l)
[ "$TRACKED_DIRTY" -eq 0 ] || die "working tree has $TRACKED_DIRTY tracked modifications"

git fetch origin --quiet
git cat-file -t "$RELEASE_SHA" >/dev/null 2>&1 || die "$RELEASE_SHA not found after fetch"
FULL_SHA=$(git rev-parse "$RELEASE_SHA")
BEFORE_SHA=$(git rev-parse HEAD)
echo "  current : $BEFORE_SHA"
echo "  target  : $FULL_SHA"

# Dependency changes must be a conscious decision, never a side effect of deploying.
if [ -n "$(git diff --name-only "$BEFORE_SHA".."$FULL_SHA" -- '*package.json' '*package-lock.json')" ]; then
  die "dependency files changed between $BEFORE_SHA and $FULL_SHA — review and install deliberately"
fi
echo "  deps    : unchanged (no npm install needed)"

echo "── backup ─────────────────────────────────────────────────"
BK="/home/azureuser/release-backup-$BEFORE_SHA"
mkdir -p "$BK"
echo "$BEFORE_SHA" > "$BK/git-sha-before.txt"
pm2 jlist > "$BK/pm2-before.json"
rm -rf "$FRONTEND/dist.bak-$BEFORE_SHA"
cp -a "$FRONTEND/dist" "$FRONTEND/dist.bak-$BEFORE_SHA"
echo "  backup  : $BK + dist.bak-$BEFORE_SHA ($(find "$FRONTEND/dist.bak-$BEFORE_SHA" -type f | wc -l) files)"

echo "── frontend build (isolated worktree) ─────────────────────"
# Built in a worktree so production source is untouched until the cutover instant. The .env copy
# below is the step whose absence caused the 2026-08-21 outage — it is not optional.
git worktree remove --force "$BUILD_ROOT" 2>/dev/null || true
rm -rf "$BUILD_ROOT"
git worktree add --detach "$BUILD_ROOT" "$FULL_SHA" >/dev/null
[ -f "$FRONTEND/.env" ] || die "$FRONTEND/.env is missing — the Vite build cannot produce a working bundle without it"
cp "$FRONTEND/.env" "$BUILD_ROOT/frontend/.env"
echo "  .env    : copied ($(grep -c '^VITE_' "$BUILD_ROOT/frontend/.env") VITE_ keys)"

cd "$BUILD_ROOT/frontend"
npm ci --no-audit --no-fund >/dev/null
npm run build >/dev/null
DIST="$BUILD_ROOT/frontend/dist"
echo "  built   : $(find "$DIST" -type f | wc -l) files, $(ls "$DIST/assets" | wc -l) assets"

echo "── build gates ────────────────────────────────────────────"
# GATE 1 — Firebase config. THE check that was missing. A bundle can carry every feature string
# and still be dead on arrival if this is undefined.
grep -rqE 'apiKey:"AIzaSy[A-Za-z0-9_-]{20,}"' "$DIST/assets/" \
  || die "GATE 1: no populated Firebase apiKey in bundle (this is the blank-page failure)"
EMPTY=$(grep -rEc 'apiKey:""|apiKey:void 0|apiKey:undefined' "$DIST/assets/" | awk -F: '{s+=$2} END{print s+0}')
[ "$EMPTY" -eq 0 ] || die "GATE 1: $EMPTY empty/undefined apiKey occurrence(s) in bundle"
# The key must match what the currently-serving bundle uses; a different project is a misconfigure.
NEWK=$(grep -rhoE 'apiKey:"[^"]+"' "$DIST/assets/" | head -1 | sha256sum | cut -c1-16)
OLDK=$(grep -rhoE 'apiKey:"[^"]+"' "$FRONTEND/dist/assets/" | head -1 | sha256sum | cut -c1-16)
[ "$NEWK" = "$OLDK" ] || die "GATE 1: Firebase key differs from the live bundle (new=$NEWK live=$OLDK)"
echo "  gate 1  : Firebase config populated and matches live ($NEWK)"

# GATE 2 — no BACKEND secret may reach a client bundle. Vite only inlines VITE_*, but a mistaken
# VITE_ prefix on a server credential would ship it to every visitor.
for LEAK in FIREBASE_PRIVATE_KEY REDIS_URL GEMINI_API_KEY GROQ_API_KEY ANTHROPIC_API_KEY CRON_SECRET HMS_SECRET; do
  grep -rqs "$LEAK" "$DIST/assets/" && die "GATE 2: backend secret name '$LEAK' present in client bundle"
done
echo "  gate 2  : no backend secret names in client bundle"

echo "── cutover ────────────────────────────────────────────────"
rm -rf "$FRONTEND/dist.new"
cp -a "$DIST" "$FRONTEND/dist.new"
echo "  T_staged   : $(ts)"
cd "$REPO"
git checkout --detach "$FULL_SHA" --quiet
[ "$(git rev-parse HEAD)" = "$FULL_SHA" ] || die "checkout did not land on $FULL_SHA"
echo "  T_checkout : $(ts)"
# ONE restart, with the asset swap immediately after so the mismatch window is milliseconds.
pm2 restart "$PM2_APP" --update-env >/dev/null
echo "  T_restart  : $(ts)"
mv "$FRONTEND/dist" "$FRONTEND/dist.prev-$BEFORE_SHA"
mv "$FRONTEND/dist.new" "$FRONTEND/dist"
echo "  T_swapped  : $(ts)"

echo "── verify ─────────────────────────────────────────────────"
OK=0
for i in $(seq 1 40); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "$HEALTH" || echo 000)" = "200" ]; then OK=1; break; fi
  sleep 3
done
[ "$OK" -eq 1 ] || die "health never reached 200 — roll back with: $0 --rollback $BEFORE_SHA"
echo "  T_healthy  : $(ts)"
echo "  sha        : $(git rev-parse --short HEAD)"
echo "  entry      : $(grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$FRONTEND/index.html" 2>/dev/null | head -1 || grep -oE 'assets/index-[A-Za-z0-9_-]+\.js' "$FRONTEND/dist/index.html" | head -1)"
echo "  public     : HTTP $(curl -s -o /dev/null -w '%{http_code}' --max-time 20 https://sadhya.app/)"
echo "  boot log   : registrations=$(grep -c 'Registering domain event subscribers' /home/azureuser/.pm2/logs/sadhya-api-out-0.log) dupWarnings=$(grep -c 'Subscribers already registered' /home/azureuser/.pm2/logs/sadhya-api-out-0.log)"

# Credential leakage check — the boot line must be redacted (see redactRedisUrl).
if grep -qE 'redis(s)?://[^:]+:[^@*]+@' /home/azureuser/.pm2/logs/sadhya-api-out-0.log; then
  echo "  WARNING: an unredacted Redis credential appears in the PM2 log"
fi

cat <<EOM

DEPLOYED $FULL_SHA
Rollback:
  cd $REPO && git checkout --detach $BEFORE_SHA
  rm -rf $FRONTEND/dist && mv $FRONTEND/dist.prev-$BEFORE_SHA $FRONTEND/dist
  pm2 restart $PM2_APP

STILL REQUIRED, and NOT done by this script:
  - load https://sadhya.app/ in a real browser and confirm the console is clean.
    Every server-side check above passed during the 2026-08-21 outage while the page was blank.
EOM
