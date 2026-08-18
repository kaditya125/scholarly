/* k6 load test for the Sadhya chat + read endpoints.
 *
 * Run against STAGING only (never prod). Requires the k6 binary (https://k6.io) and:
 *   BASE_URL   — e.g. https://staging.example.com
 *   TOKEN      — a valid staging Firebase ID token
 *   STAGE      — one of: smoke | 100 | 500 | 1000 | 5000 | 10000 (default: smoke)
 *
 *   k6 run -e BASE_URL=https://staging.example.com -e TOKEN=$TOKEN -e STAGE=1000 tests/load/chat_load.js
 *
 * Thresholds encode the release SLOs: <1% errors and p95 latency bounds. Tune to the real target.
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL;
const TOKEN = __ENV.TOKEN;
const STAGE = __ENV.STAGE || 'smoke';

const ttft = new Trend('chat_ttft_ms', true);
const errors = new Rate('errors');

// Concurrency profiles. Ramp up, hold, ramp down. Adjust hold time as needed.
const PROFILES = {
  smoke: [{ duration: '30s', target: 5 }],
  100:   [{ duration: '1m', target: 100 },  { duration: '3m', target: 100 },  { duration: '1m', target: 0 }],
  500:   [{ duration: '2m', target: 500 },  { duration: '5m', target: 500 },  { duration: '1m', target: 0 }],
  1000:  [{ duration: '3m', target: 1000 }, { duration: '5m', target: 1000 }, { duration: '2m', target: 0 }],
  5000:  [{ duration: '5m', target: 5000 }, { duration: '10m', target: 5000 },{ duration: '3m', target: 0 }],
  10000: [{ duration: '8m', target: 10000 },{ duration: '10m', target: 10000 },{ duration: '5m', target: 0 }],
};

export const options = {
  stages: PROFILES[STAGE] || PROFILES.smoke,
  thresholds: {
    // Success criteria: error rate under 1%, and generation-latency p95 bounds.
    errors: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<8000'], // full chat response p95 < 8s (tune to SLO)
    chat_ttft_ms: ['p(95)<2000'],       // proxy for TTFT p95 < 2s (streaming endpoint)
  },
};

function authHeaders() {
  return { headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` } };
}

const QUERIES = [
  'What is photosynthesis?',
  'Explain Newton\'s second law with an example.',
  'Compare mitosis and meiosis.',
  'Solve: a car accelerates from 0 to 20 m/s in 4s, find acceleration.',
  'Summarize the French Revolution in 5 points.',
];

export default function () {
  const q = QUERIES[Math.floor(Math.random() * QUERIES.length)];

  // 1. Read endpoint (cheap) — exercises auth + Firestore read path.
  const sessions = http.get(`${BASE_URL}/api/chat/sessions`, authHeaders());
  check(sessions, { 'sessions 2xx': (r) => r.status >= 200 && r.status < 300 });
  errors.add(sessions.status >= 400);

  // 2. Chat generation (expensive) — the real hot path.
  const start = Date.now();
  const chat = http.post(
    `${BASE_URL}/api/chat`,
    JSON.stringify({ sessionId: `load-${__VU}-${__ITER}`, message: q, model: 'default', topicType: 'GENERAL' }),
    authHeaders(),
  );
  ttft.add(Date.now() - start);
  check(chat, {
    'chat 2xx': (r) => r.status >= 200 && r.status < 300,
    'chat has body': (r) => !!r.body && r.body.length > 0,
  });
  errors.add(chat.status >= 400);

  sleep(Math.random() * 2 + 1); // 1-3s think time between iterations
}
