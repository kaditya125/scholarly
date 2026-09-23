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
// Deploy: `bash deploy/redeploy.sh` on the server (zero-downtime via the standby below). First
// start only: pm2 start ecosystem.config.js --only sadhya-api — never start the whole file.
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
      // server.ts closes the listener on SIGINT and exits once open requests finish (10 s cap).
      // PM2's default 1.6 s would SIGKILL in-flight chat streams mid-answer on every deploy.
      kill_timeout: 11000,
    },
    {
      // Deploy-time standby ONLY — started by deploy/redeploy.sh just before `sadhya-api`
      // restarts and deleted once it is healthy again. nginx lists it as a `backup` upstream, so
      // it takes traffic only while the main instance refuses connections: one active instance at
      // a time, as the payment note above requires. It must never be left running.
      //   EVENTBUS_LOCAL_ONLY  — no Redis pub/sub subscription, so the two never both handle an
      //                          event; its own events still dispatch locally and BullMQ jobs
      //                          still enqueue through REDIS_URL.
      //   NODE_APP_INSTANCE=1  — server.ts skips the BullMQ workers (the main instance owns them).
      //                          `instance_var` is renamed because PM2 otherwise overwrites
      //                          NODE_APP_INSTANCE with 0 even in fork mode.
      name: 'sadhya-api-standby',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'src/server.ts',
      instances: 1,
      exec_mode: 'fork',
      autorestart: false,
      instance_var: 'SADHYA_PM2_INSTANCE',
      env: {
        NODE_ENV: 'production',
        PORT: '8081',
        NODE_APP_INSTANCE: '1',
        EVENTBUS_LOCAL_ONLY: 'true',
      },
      max_memory_restart: '1500M',
      kill_timeout: 11000,
    },
  ],
};
