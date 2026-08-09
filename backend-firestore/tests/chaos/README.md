# Chaos testing (Toxiproxy)

Validates graceful degradation (§3.6 of `docs/STAGING_CERTIFICATION_PLAN.md`) by injecting
dependency faults **without changing `src/`**. Faults are injected at the network layer via
[Toxiproxy](https://github.com/Shopify/toxiproxy), which sits between the staging backend and its
dependencies. The production build stays clean — there is no fault-injection code in the app.

## How it works

```
staging backend  ──►  toxiproxy (localhost:600x)  ──►  real dependency
                        ▲
                        └── toggle.sh injects latency / downtime via the control API (:8474)
```

## Setup (staging only)

```bash
# 1. Start the proxy
docker compose -f tests/chaos/docker-compose.toxiproxy.yml up -d

# 2. Create proxies to the real upstreams (set the host:port for each dep you can route)
UPSTREAM_PINECONE=your-index.svc.pinecone.io:443 \
UPSTREAM_REDIS=your-redis-host:6379 \
bash tests/chaos/toggle.sh setup

# 3. Repoint the STAGING backend's dependency endpoints at the proxy ports (6001-6005) via env.
```

> Caveat: HTTPS/gRPC Google endpoints (Firestore, Gemini/Vertex) are TLS to fixed hostnames.
> Toxiproxy proxies TCP, so for those you must either (a) route via a hostname the backend trusts,
> or (b) inject those faults at the egress-network / firewall layer instead. Pinecone and Redis
> proxy cleanly.

## Fault matrix → resilience assertion

Run each fault one at a time under light load, then execute the resilience suite:

```bash
bash tests/chaos/toggle.sh down pinecone
CHAOS_ENABLED=1 CHAOS_FAULT=pinecone-down STAGING_BASE_URL=$URL STUDENT_A_TOKEN=$TOK \
  npx jest tests/integration/resilience.test.ts --runInBand
bash tests/chaos/toggle.sh clear pinecone
```

| Toggle | Expected behavior |
|---|---|
| `down pinecone` | Chat degrades (answer without retrieval) or clean 5xx; **no crash**; `/health/ready` may stay 200 (retrieval is degradable). |
| `down firestore` | Reads fail cleanly (5xx structured); `/health/ready` → 503; process stays up. |
| `down gemini` | Generation fails to a structured error / fallback provider; no hang. |
| `down cohere` | Retrieval proceeds without reranking (degraded ordering), not a crash. |
| `down redis` | Cache misses fall through to the live pipeline; correctness preserved, latency up. |
| `latency <dep> 5000` | Requests slow but complete within timeout, or time out to a structured error — never hang indefinitely. |

## Exit criterion
Every single-dependency fault degrades gracefully (structured 5xx or degraded 200, correct
`/health/ready`), the process never crashes, and behavior recovers after `clear`. Record outcomes
in the Chaos Test Report.
