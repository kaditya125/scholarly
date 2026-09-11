#!/usr/bin/env bash
#
# Install Qdrant as a systemd service, bound to loopback, with a generated API key.
#
# Idempotent: re-running upgrades the binary and rewrites the unit, but never touches
# /var/lib/qdrant/storage and never regenerates an existing API key. That matters — regenerating
# the key on an upgrade would silently break the application at the next restart.
#
#   sudo bash backend-firestore/deploy/qdrant/install.sh
#
set -euo pipefail

QDRANT_VERSION="${QDRANT_VERSION:-v1.12.5}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then echo "must run as root (sudo)"; exit 1; fi

echo "==> Qdrant ${QDRANT_VERSION}"

# ── service account ─────────────────────────────────────────────────────────────────────────
if ! id -u qdrant >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin qdrant
  echo "    created service user 'qdrant'"
fi

install -d -o qdrant -g qdrant -m 0750 /var/lib/qdrant /var/lib/qdrant/storage /var/lib/qdrant/snapshots
install -d -m 0755 /etc/qdrant

# ── binary ──────────────────────────────────────────────────────────────────────────────────
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  TARGET="x86_64-unknown-linux-musl" ;;
  aarch64) TARGET="aarch64-unknown-linux-musl" ;;
  *) echo "unsupported architecture: $ARCH"; exit 1 ;;
esac

TARBALL="qdrant-${TARGET}.tar.gz"
URL="https://github.com/qdrant/qdrant/releases/download/${QDRANT_VERSION}/${TARBALL}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "==> downloading ${URL}"
curl -fsSL "$URL" -o "$TMP/$TARBALL"
tar -xzf "$TMP/$TARBALL" -C "$TMP"
install -m 0755 "$TMP/qdrant" /usr/local/bin/qdrant
echo "    installed $(/usr/local/bin/qdrant --version 2>/dev/null || echo 'qdrant') to /usr/local/bin/qdrant"

# ── config, preserving an existing key ──────────────────────────────────────────────────────
EXISTING_KEY=""
if [[ -f /etc/qdrant/config.yaml ]]; then
  EXISTING_KEY="$(grep -oP '^\s*api_key:\s*\K\S+' /etc/qdrant/config.yaml 2>/dev/null || true)"
fi

if [[ -n "$EXISTING_KEY" && "$EXISTING_KEY" != "REPLACE_ME_AT_INSTALL" ]]; then
  API_KEY="$EXISTING_KEY"
  echo "==> keeping the existing API key (rotate deliberately, not by reinstalling)"
else
  API_KEY="$(head -c 32 /dev/urandom | base64 | tr -d '/+=' | head -c 40)"
  echo "==> generated a new API key"
fi

sed "s|REPLACE_ME_AT_INSTALL|${API_KEY}|" "$HERE/config.yaml" > /etc/qdrant/config.yaml
chown qdrant:qdrant /etc/qdrant/config.yaml
chmod 0640 /etc/qdrant/config.yaml

# ── service ─────────────────────────────────────────────────────────────────────────────────
install -m 0644 "$HERE/qdrant.service" /etc/systemd/system/qdrant.service
systemctl daemon-reload
systemctl enable qdrant >/dev/null
systemctl restart qdrant

sleep 3

# ── verify ──────────────────────────────────────────────────────────────────────────────────
echo
echo "==> verification"
systemctl is-active --quiet qdrant && echo "    service   : active" || { echo "    service   : FAILED"; journalctl -u qdrant -n 30 --no-pager; exit 1; }
echo "    enabled   : $(systemctl is-enabled qdrant)  (survives reboot)"

BIND="$(ss -lntp 2>/dev/null | grep ':6333' | awk '{print $4}' | head -1)"
echo "    listening : ${BIND:-<none>}"
case "$BIND" in
  127.0.0.1:*) echo "    binding   : loopback only — correct" ;;
  *)           echo "    binding   : WRONG — expected 127.0.0.1, got '${BIND}'"; exit 1 ;;
esac

echo -n "    health    : "
curl -fsS -H "api-key: ${API_KEY}" http://127.0.0.1:6333/healthz || echo "FAILED"
echo

echo -n "    auth      : "
if curl -fsS http://127.0.0.1:6333/collections >/dev/null 2>&1; then
  echo "WARNING — the API answered WITHOUT a key; check api_key in /etc/qdrant/config.yaml"
else
  echo "rejects unauthenticated requests — correct"
fi

echo
echo "============================================================"
echo "Add to backend-firestore/.env:"
echo
echo "  VECTOR_STORE=pinecone"
echo "  QDRANT_URL=http://127.0.0.1:6333"
echo "  QDRANT_API_KEY=${API_KEY}"
echo
echo "Leave VECTOR_STORE=pinecone until the migration is verified."
echo "============================================================"
