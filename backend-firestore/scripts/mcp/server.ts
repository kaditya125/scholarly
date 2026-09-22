/**
 * Sadhya retrieval MCP server — exposes the shared retrieval tool layer
 * (src/core/tools/retrievalTools.ts) to EXTERNAL MCP clients (e.g. Claude Code) over stdio.
 *
 * Local dev tool only. Deliberately stdio-only: no HTTP/SSE transport, no port, no new auth
 * surface. It is spawned as a local child process using whatever Firebase/Pinecone/Gemini
 * credentials are already in this machine's .env — nothing new to provision or rotate.
 *
 * IMPORTANT: the stdio transport reserves stdout for the JSON-RPC channel. Any stray
 * console.log() here corrupts the protocol silently from the client's point of view. All
 * diagnostic output in this file goes to stderr via console.error(). This is not just about
 * this file's own code: importing src/config/env.ts and src/config/firebase.ts triggers their
 * own startup banners via plain console.log — verified by a raw stdio capture that those banners
 * land on stdout before this server ever connects. `./_stdioGuard` rebinds console.log to
 * console.error and MUST stay the first import (see its own header comment for why a plain
 * statement here would not work).
 *
 * PERFORMANCE: Firebase init and this file's own service imports used to be eager, static
 * imports here. Profiling showed importing retrieval.service.ts alone (Pinecone/Cohere SDKs)
 * cost ~1.2s and Firebase init ~0.5s, BEFORE the MCP SDK's own ~1.9s import cost, BEFORE
 * server.connect() even starts the stdio handshake — several seconds an MCP client's connection
 * timeout could plausibly not tolerate. None of that work is needed to answer `initialize` or
 * `tools/list`, only `tools/call` — so retrievalTools.ts now imports those services lazily
 * (see its own header comment), and Firebase's admin.apps.length-guarded singleton import is
 * dropped from this file entirely: it gets triggered naturally, once, whichever lazily-imported
 * service needs `db`/`auth` first, the first time a tool is actually called.
 */
import './_stdioGuard';
import 'dotenv/config';
import { env } from '../../src/config/env';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RETRIEVAL_TOOL_SPECS, executeRetrievalTool, warmUpRetrievalServices } from '../../src/core/tools/retrievalTools';

function preflight() {
  const present = (v: string | undefined) => Boolean(v && v.length > 0);
  console.error('[sadhya-mcp] pre-flight:');
  console.error(`  PINECONE_INDEX_NAME = ${env.PINECONE_INDEX_NAME}`);
  console.error(`  PINECONE_NAMESPACE  = ${env.PINECONE_NAMESPACE}`);
  console.error(`  PINECONE_API_KEY    = ${present(env.PINECONE_API_KEY) ? 'present' : 'MISSING'}`);
  console.error(`  GEMINI_API_KEY      = ${present(env.GEMINI_API_KEY) ? 'present' : 'MISSING'}`);
  console.error(`  COHERE_API_KEY      = ${present((env as any).COHERE_API_KEY) ? 'present' : 'not set (reranking may be skipped)'}`);
}

async function main() {
  preflight();

  const server = new McpServer({ name: 'sadhya-retrieval', version: '0.1.0' });

  for (const spec of RETRIEVAL_TOOL_SPECS) {
    server.registerTool(
      spec.name,
      { description: spec.description, inputSchema: spec.zodShape as any },
      async (args: Record<string, unknown>) => {
        const result = await executeRetrievalTool(spec.name, args, { userId: 'mcp-local-dev' });
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      },
    );
  }

  console.error(`[sadhya-mcp] registered ${RETRIEVAL_TOOL_SPECS.length} tools, connecting stdio transport...`);
  await server.connect(new StdioServerTransport());
  console.error('[sadhya-mcp] ready.');

  // Fire-and-forget: never awaited, never blocks the handshake above. Loads every lazily-imported
  // service into Node's module cache in the background so the client's first real tool call
  // doesn't race a cold import (see warmUpRetrievalServices's own header comment for why this
  // exists — two different lazy imports resolved back to back were observed to occasionally
  // stall for many seconds).
  const warmupStart = Date.now();
  warmUpRetrievalServices()
    .then(() => console.error(`[sadhya-mcp] background service warm-up complete in ${Date.now() - warmupStart}ms`))
    .catch((e) => console.error('[sadhya-mcp] background warm-up failed (non-fatal):', e));
}

main().catch((e) => {
  console.error('[sadhya-mcp] fatal:', e);
  process.exit(1);
});
