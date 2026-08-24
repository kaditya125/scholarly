// PM2 process config. `script` points at tsx's own CLI (not `npx tsx`) so PM2 forks the
// server directly rather than forking npx.
//
// instances is pinned at 1 / exec_mode 'fork' for now. A 2-instance cluster attempt
// (2026-08-18) crash-looped instance 1 hundreds of times within minutes while instance 0
// stayed perfectly stable the whole time — a real, unexplained problem specific to running
// two workers together (most likely PM2's cluster-mode port-sharing patch not interacting
// cleanly with tsx's loader), not something to guess-fix live against production traffic.
// Reverted here; multi-instance needs to be root-caused off-hours before retrying. See
// [[sadhya-production-deployment]] memory for the incident.
//
// Deploy: pm2 start ecosystem.config.js  (or `pm2 reload ecosystem.config.js` for a
// zero-downtime restart once multi-instance is safe to use again).
module.exports = {
  apps: [
    {
      name: 'sadhya-api',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'src/server.ts',
      // ⚠ PAYMENT CORRECTNESS DEPENDS ON THIS BEING 1.
      // payments.service.ts serialises order creation with an IN-PROCESS per-user queue
      // (withUserLock). Creating a Razorpay order is an external side effect that cannot sit
      // inside a Firestore transaction, so that queue is what stops two simultaneous clicks
      // each minting an order. It does not span workers. Raising `instances` above 1 — or
      // switching to cluster mode — silently removes that protection and reintroduces
      // duplicate orders. Replace it with a distributed lock BEFORE scaling horizontally.
      // Verified in production 2026-08-24: pm2 jlist -> 1 object, instances=1, fork_mode.
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      max_memory_restart: '1500M',
    },
  ],
};
