# Sadhya retrieval MCP server

Exposes Sadhya's verified corpus/retrieval (PYQ corpus, NCERT curriculum, reference books,
official syllabi, exam pattern analytics) as MCP tools for external clients — primarily Claude
Code, for exploring or querying Sadhya's data directly from a coding session.

**This is a local dev tool, not a deployment.** It runs as a stdio-only child process (no
HTTP/SSE transport, no port, no new auth surface) using whatever credentials are already in
`backend-firestore/.env` — nothing new to provision or rotate.

## Tools

| tool | purpose |
|---|---|
| `resolve_exam_id` | Resolve a free-text exam name to Sadhya's canonical exam id |
| `lookup_canonical_pyq` | Exact previous-year paper lookup from the verified corpus (Firestore, ordered by question number). `status: NOT_AVAILABLE_IN_VERIFIED_CORPUS` means the corpus genuinely holds nothing for that request. |
| `search_pyq` | Semantic search over previous-year questions for a topic (requires `examId`) |
| `search_curriculum` | Semantic search over the ingested NCERT curriculum |
| `search_reference_books` | Semantic search over ingested reference books (Lucent / S. Chand) |
| `search_official_syllabus` | Semantic search over the official exam syllabus |
| `get_exam_syllabus` | Full official syllabus structure for an exam, flattened |
| `get_exam_pattern_analytics` | Observed exam pattern data derived from the PYQ corpus |

All 8 wrap real service methods in `src/core/tools/retrievalTools.ts` — no separate retrieval
logic exists for this server; it is the same data the live chat pipeline reads.

## Setup

1. Ensure `backend-firestore/.env` is populated (the same file the Express server uses —
   Firebase credentials, `PINECONE_API_KEY`, `GEMINI_API_KEY`, etc.).
2. The repo root's `.mcp.json` already registers `sadhya-retrieval` for Claude Code:
   ```json
   {
     "mcpServers": {
       "sadhya-retrieval": {
         "command": "npx",
         "args": ["tsx", "scripts/mcp/server.ts"],
         "cwd": "backend-firestore"
       }
     }
   }
   ```
3. Reload/restart Claude Code so it picks up the new server, or run it manually to sanity-check:
   ```bash
   cd backend-firestore
   npm run mcp
   ```
   (It will sit waiting for JSON-RPC on stdin — that's expected when run directly; a real client
   drives it over stdio.)

## Notes for anyone touching this server

- **stdout is reserved for the JSON-RPC channel.** `scripts/mcp/_stdioGuard.ts` rebinds
  `console.log` to `console.error` and must stay the very first import in `server.ts` — several
  imported config modules (`src/config/env.ts`, `src/config/firebase.ts`) print their own startup
  banners via `console.log` on import, which would otherwise corrupt the protocol. If you add a
  new tool that pulls in another module with import-time logging, this guard already covers it;
  don't add ad-hoc `console.log` calls anywhere in this server's own code either — use
  `console.error`.
- No per-user authorization exists here (`userId: 'mcp-local-dev'` is a fixed constant) because
  none of the 8 tools touch a user's private notebook — only shared/admin corpora. If a future
  tool needs notebook-scoped access, that assumption needs to be re-checked before wiring it in.
- Adding a tool: add one entry to `RETRIEVAL_TOOL_SPECS` in
  `src/core/tools/retrievalTools.ts` (Gemini-shaped `parameters` + a matching `zodShape` for MCP's
  `inputSchema`) and one `case` in `executeRetrievalTool`. Both this server and the agentic
  retrieval orchestrator pick it up automatically.
