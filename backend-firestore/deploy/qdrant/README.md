# Qdrant on the Sadhya VM

Self-hosted vector store, installed as a static binary under systemd. No Docker: the VM has 2
vCPU and 22GB of disk, and a container runtime would be a second thing to patch and monitor for
a single-process database that ships a static binary.

## What gets installed

| Path | What |
|---|---|
| `/usr/local/bin/qdrant` | the binary (single static executable) |
| `/etc/qdrant/config.yaml` | config — loopback bind, API key, storage paths |
| `/var/lib/qdrant/storage` | collection data (persists across restarts and reboots) |
| `/var/lib/qdrant/snapshots` | snapshot output |
| `/etc/systemd/system/qdrant.service` | unit — `Restart=always`, `WantedBy=multi-user.target` |
| user/group `qdrant` | unprivileged service account, no login shell |

Nothing else. No package repositories added, no Docker, no reverse proxy, no firewall changes —
the service binds to `127.0.0.1` so no inbound rule is needed or wanted.

## Security posture

- **Loopback only.** `service.host: 127.0.0.1`. Not reachable from the internet regardless of
  cloud firewall rules. Verify with `ss -lntp | grep 633` — the address must be `127.0.0.1`,
  never `0.0.0.0`.
- **API key required.** Generated at install, stored in `/etc/qdrant/config.yaml` (mode `0640`,
  owned by `qdrant`) and in the application's `.env` as `QDRANT_API_KEY`. Rotatable through
  admin Settings like the other keys, because `QDRANT_API_KEY` is in `MANAGEABLE_SECRET_KEYS`.
- **No public ingress.** nginx is not configured to proxy it. If you ever need remote access,
  use an SSH tunnel (`ssh -L 6333:127.0.0.1:6333 …`) rather than opening the port.
- **Systemd hardening.** `ProtectSystem=strict` with `ReadWritePaths=/var/lib/qdrant`, so a
  compromised process cannot write outside its data directory.

## Install

Run from the repo root on the VM. Prints the generated API key once — put it in `.env`.

```bash
sudo bash backend-firestore/deploy/qdrant/install.sh
```

Then add to `backend-firestore/.env`:

```
VECTOR_STORE=pinecone          # keep pinecone until the migration is verified
QDRANT_URL=http://127.0.0.1:6333
QDRANT_API_KEY=<printed by install.sh>
```

## Health check

```bash
curl -s -H "api-key: $QDRANT_API_KEY" http://127.0.0.1:6333/healthz
curl -s -H "api-key: $QDRANT_API_KEY" http://127.0.0.1:6333/collections | jq .
systemctl status qdrant --no-pager
```

## Persistence across reboot

`storage_path` is `/var/lib/qdrant/storage`, outside the application tree, and the unit is
enabled with `WantedBy=multi-user.target`. To prove it rather than assume it:

```bash
curl -s -H "api-key: $QDRANT_API_KEY" http://127.0.0.1:6333/collections/edtech_ai_rag | jq .result.points_count
sudo systemctl restart qdrant && sleep 3
curl -s -H "api-key: $QDRANT_API_KEY" http://127.0.0.1:6333/collections/edtech_ai_rag | jq .result.points_count
```

The two counts must match. A full reboot test is the stronger check if you can afford the
downtime.

## Backup and restore

Migrating off Pinecone removes one single point of failure and introduces another. Qdrant is now
the only copy of the vectors once Pinecone is retired, so snapshots are not optional.

**Create a snapshot:**

```bash
curl -s -X POST -H "api-key: $QDRANT_API_KEY" \
  http://127.0.0.1:6333/collections/edtech_ai_rag/snapshots | jq .
# writes to /var/lib/qdrant/snapshots/edtech_ai_rag/
```

**Copy it off the box** — a snapshot on the same disk does not survive the disk:

```bash
scp -i ~/.ssh/<key> azureuser@<vm>:/var/lib/qdrant/snapshots/edtech_ai_rag/<snapshot>.snapshot ./
```

**Restore:**

```bash
curl -s -X PUT -H "api-key: $QDRANT_API_KEY" \
  "http://127.0.0.1:6333/collections/edtech_ai_rag/snapshots/recover" \
  -H 'Content-Type: application/json' \
  -d '{"location":"file:///var/lib/qdrant/snapshots/edtech_ai_rag/<snapshot>.snapshot"}' | jq .
```

**Suggested cadence:** weekly snapshot plus one immediately after the migration completes and
verifies, copied off the VM. The corpus changes only at ingestion, so daily is overkill.

## Rollback

Qdrant runs alongside Pinecone; it does not replace it. To go back:

```
VECTOR_STORE=pinecone
```

and restart the API. Qdrant can be left running (idle, ~100MB) or stopped with
`sudo systemctl stop qdrant`. No data is lost either way — Pinecone is never modified by the
migration, which only ever reads from it.

## Known representation difference: Qdrant normalises cosine vectors

Verified directly against this install, not inferred:

```
Cosine collection:  input [2,0,0,…] |v|=2  →  stored [1,0,0,…] |v|=1
Dot collection:     input [2,0,0,…] |v|=2  →  stored [2,0,0,…] |v|=2
```

Qdrant rescales vectors to unit length on write when a collection's distance is `Cosine`, which
turns cosine similarity into a plain dot product at query time. **The stored vector is therefore
not byte-identical to what Pinecone held**, and no configuration of a Cosine collection avoids
that.

It does not affect retrieval. Cosine similarity is scale-invariant — `cos(a,b) == cos(â,b̂)` — so
ranking and scores are unchanged, which is why `verify-migration.ts` judges vectors on direction
(`|cosine similarity − 1|`) and on component agreement after normalising, rather than on bitwise
equality. Raw `max|Δ|` is still reported so the rescaling stays visible.

Gemini embeddings arrive very close to unit length already, so in practice the raw difference is
float32 epsilon (~1e-7) rather than a visible rescale.

**If byte-identical storage is ever a hard requirement**, the options are a `Dot` collection with
vectors pre-normalised by the application (identical maths, the normalisation just moves into our
code), or keeping the original vector in the payload at roughly +150MB of storage. Neither buys
anything for retrieval; they only matter if something downstream needs to reproduce Pinecone's
exact stored bytes.
