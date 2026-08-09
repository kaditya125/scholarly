# Load testing (k6)

Measures concurrency/throughput behavior of the chat + read endpoints against **staging** (never
production). Corresponds to §3.5 of `docs/STAGING_CERTIFICATION_PLAN.md`.

## Prerequisites
- [k6](https://k6.io/docs/get-started/installation/) installed.
- A running **staging** backend and a valid staging Firebase ID token.

## Run

```bash
# Smoke (5 VUs, 30s) — validate the script + auth before a real run:
k6 run -e BASE_URL=https://staging.example.com -e TOKEN=$TOKEN -e STAGE=smoke tests/load/chat_load.js

# Ramp tiers (run each separately, watch the system between runs):
k6 run -e BASE_URL=$URL -e TOKEN=$TOKEN -e STAGE=100   tests/load/chat_load.js
k6 run -e BASE_URL=$URL -e TOKEN=$TOKEN -e STAGE=500   tests/load/chat_load.js
k6 run -e BASE_URL=$URL -e TOKEN=$TOKEN -e STAGE=1000  tests/load/chat_load.js
k6 run -e BASE_URL=$URL -e TOKEN=$TOKEN -e STAGE=5000  tests/load/chat_load.js
k6 run -e BASE_URL=$URL -e TOKEN=$TOKEN -e STAGE=10000 tests/load/chat_load.js
```

## Pass criteria (thresholds enforced by the script)
- `errors` rate < 1% and `http_req_failed` < 1%.
- `http_req_duration` p95 < 8s (full chat response) — **tune to your real SLO**.
- `chat_ttft_ms` p95 < 2s.

## What to record for the Load Test Report
For each tier: error rate, throughput (req/s), p50/p95/p99 latency, backend CPU/memory,
autoscaling reaction (instance count over time), queue growth, and provider 429/throttle counts.
Beyond your target concurrency, confirm the system **sheds load with 429s rather than crashing**.

> Note: 10,000 VUs is included for completeness — define your **actual** target concurrency from
> business projections before treating the 10k tier as a release gate.
