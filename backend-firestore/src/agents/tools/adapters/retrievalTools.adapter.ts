import { z } from 'zod';
import { RETRIEVAL_TOOL_SPECS, executeRetrievalTool } from '../../../core/tools/retrievalTools';
import { Provenance } from '../../runtime/agent.types';
import { CostClass, ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError, classifyError } from '../toolErrors';

/**
 * Registers Sadhya's eight existing retrieval tools with the agent ToolRegistry.
 *
 * These are the same tools the MCP server and the agentic-retrieval branch use
 * (core/tools/retrievalTools.ts). Nothing is re-implemented here: input schemas come from the
 * shared zod shapes, execution goes through `executeRetrievalTool`, and this adapter only adds the
 * registry metadata the agent runtime needs — output schemas, timeouts, retry policy, cost class,
 * provenance and a summary of counts for progress events.
 *
 * Identity: `executeRetrievalTool` receives `ctx.userId`, the run owner's token uid. None of these
 * tools read a student's private notebook; they only read shared, admin-ingested corpora.
 */

type SpecName = (typeof RETRIEVAL_TOOL_SPECS)[number]['name'];

const searchResultSchema = z
  .object({
    text: z.string(),
    source: z.string(),
    score: z.number(),
    sourceId: z.any().optional(),
    pageNumber: z.any().optional(),
  })
  .passthrough();

const searchOutput = z.object({ results: z.array(searchResultSchema) }).passthrough();

const OUTPUT_SCHEMAS: Record<SpecName, z.ZodTypeAny> = {
  resolve_exam_id: z.object({ examId: z.string().nullable() }).passthrough(),
  lookup_canonical_pyq: z
    .object({
      status: z.string(),
      retrievedCount: z.number(),
      questions: z.array(z.any()),
    })
    .passthrough(),
  search_pyq: searchOutput,
  search_curriculum: searchOutput,
  search_reference_books: searchOutput,
  search_official_syllabus: searchOutput,
  get_exam_syllabus: z.object({ available: z.boolean() }).passthrough(),
  get_exam_pattern_analytics: z.object({}).passthrough(),
};

const META: Record<SpecName, { costClass: CostClass; timeoutMs: number; provenance: Provenance }> = {
  resolve_exam_id: { costClass: 'free', timeoutMs: 15_000, provenance: 'SYSTEM' },
  lookup_canonical_pyq: { costClass: 'free', timeoutMs: 30_000, provenance: 'VERIFIED_CORPUS' },
  search_pyq: { costClass: 'low', timeoutMs: 30_000, provenance: 'VERIFIED_CORPUS' },
  search_curriculum: { costClass: 'low', timeoutMs: 30_000, provenance: 'VERIFIED_CORPUS' },
  search_reference_books: { costClass: 'low', timeoutMs: 30_000, provenance: 'VERIFIED_CORPUS' },
  search_official_syllabus: { costClass: 'low', timeoutMs: 30_000, provenance: 'VERIFIED_CORPUS' },
  get_exam_syllabus: { costClass: 'free', timeoutMs: 20_000, provenance: 'VERIFIED_CORPUS' },
  get_exam_pattern_analytics: { costClass: 'low', timeoutMs: 45_000, provenance: 'VERIFIED_CORPUS' },
};

function summarizeRetrieval(name: SpecName, data: any): Record<string, unknown> {
  switch (name) {
    case 'resolve_exam_id':
      return { examId: data?.examId ?? null };
    case 'lookup_canonical_pyq':
      return {
        status: data?.status,
        retrievedCount: data?.retrievedCount ?? 0,
        expectedCount: data?.expectedCount ?? null,
      };
    case 'get_exam_syllabus':
      return {
        available: Boolean(data?.available),
        nodeCount: data?.nodeCount ?? 0,
        version: data?.version ?? null,
      };
    case 'get_exam_pattern_analytics':
      return {
        totalQuestionsAnalyzed: data?.totalQuestionsAnalyzed ?? 0,
        highYieldTopicCount: Array.isArray(data?.highYieldTopics) ? data.highYieldTopics.length : 0,
      };
    default: {
      const results: any[] = Array.isArray(data?.results) ? data.results : [];
      return {
        resultCount: results.length,
        sources: [...new Set(results.map((r) => r?.source).filter(Boolean))].slice(0, 5),
      };
    }
  }
}

export function registerRetrievalTools(registry: ToolRegistry): ToolRegistry {
  for (const spec of RETRIEVAL_TOOL_SPECS) {
    const name = spec.name as SpecName;
    const meta = META[name];
    const def: ToolDefinition<any, any> = {
      name,
      description: spec.description,
      category: 'knowledge',
      inputSchema: z.object(spec.zodShape as unknown as z.ZodRawShape),
      outputSchema: OUTPUT_SCHEMAS[name],
      permissions: ['read:shared-corpus'],
      costClass: meta.costClass,
      timeoutMs: meta.timeoutMs,
      retry: { maxAttempts: 2, baseBackoffMs: 600 },
      idempotent: true,
      requiresApproval: false,
      provenance: meta.provenance,
      async execute(input, ctx) {
        const res = await executeRetrievalTool(name, input as Record<string, unknown>, { userId: ctx.userId });
        if (!res.ok) {
          const message = res.error || `${name} failed`;
          throw new ToolError(classifyError(new Error(message)), message);
        }
        return { data: res.data, provenance: meta.provenance };
      },
      summarize: (output) => summarizeRetrieval(name, output),
    };
    registry.register(def);
  }
  return registry;
}
