// PM2 process config. Runs the API in cluster mode across all available CPU cores instead
// of a single fork_mode process — the VM's second core was otherwise sitting idle for
// request handling. `script` points at tsx's own CLI (not `npx tsx`) because PM2's cluster
// mode forks the given script directly; going through npx would fork npx itself, not the
// server.
//
// Deploy: pm2 start ecosystem.config.js  (or `pm2 reload ecosystem.config.js` to apply
// changes with zero-downtime rolling restarts instead of `pm2 restart`).
module.exports = {
  apps: [
    {
      name: 'sadhya-api',
      script: './node_modules/tsx/dist/cli.mjs',
      args: 'src/server.ts',
      instances: 2,
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production',
      },
      // Guards against a single leaking instance slowly consuming the whole box; PM2
      // restarts just that one worker, the other keeps serving traffic throughout.
      max_memory_restart: '1500M',
    },
  ],
};
