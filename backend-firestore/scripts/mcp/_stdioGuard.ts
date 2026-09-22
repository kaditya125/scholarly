/**
 * Must be the FIRST import in scripts/mcp/server.ts, before anything else — including
 * 'dotenv/config'. Rebinds console.log to console.error so any transitively-imported module that
 * logs on import (src/config/env.ts and src/config/firebase.ts both do, confirmed by a raw stdio
 * capture) cannot write to stdout, which the stdio MCP transport reserves for the JSON-RPC
 * channel.
 *
 * Why this needs its own zero-dependency module rather than a plain statement at the top of
 * server.ts: ES module `import` declarations all execute, in source order, before any of the
 * importing file's own non-import top-level code — regardless of where that code is textually
 * placed relative to the imports. A `console.log = console.error;` statement sitting "above" the
 * imports in server.ts's source still runs AFTER every one of those imports' module bodies has
 * already executed, which is too late. Importing this guard module first sidesteps that: its own
 * top-level code has no imports of its own, so it runs before the engine moves on to resolve the
 * next import.
 */
console.log = console.error;
export {};
