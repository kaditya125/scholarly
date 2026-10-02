import { z } from 'zod';
import { featureFlags } from '../../../config/featureFlags';
import { documentSpecSchema } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';

/**
 * The artifact tool (Phase 3): turns a structured document the agent has assembled into a stored,
 * owner-only PDF.
 *
 * This is the first tool that WRITES, which changes three things:
 *   - it is not idempotent, so the registry forbids automatic retries (a retry would bill the
 *     student twice and leave two identical PDFs);
 *   - it charges the student's `artifactGenerations` meter through the existing usage service, so
 *     there is still exactly one quota mechanism;
 *   - the content is only ever what the plan assembled — the tool does not call a model, so it
 *     cannot invent a formula that no earlier step retrieved.
 */

const artifacts = () => require('../../artifacts/artifacts.service').getArtifactsService();
const usage = () => require('../../../services/usage.service').usageService;

export function registerArtifactTools(registry: ToolRegistry): ToolRegistry {
  const createDocument: ToolDefinition<any, any> = {
    name: 'create_document_artifact',
    description:
      'Renders an assembled document (title, sections, bullets, formulae) into a PDF the student owns and can download. ' +
      'Only include content earlier steps actually retrieved; this tool writes what it is given.',
    category: 'artifact',
    // The document's fields ARE the tool's input, rather than a nested `document` object: step
    // references may only replace a whole top-level input value (see stepRefs.ts), so flattening
    // is what lets a plan pass `title` from the chapter resolver and `sections` from the step that
    // assembled them.
    inputSchema: documentSpecSchema,
    outputSchema: z
      .object({
        artifactId: z.string(),
        title: z.string(),
        pageCount: z.number(),
        sizeBytes: z.number(),
        fileUrl: z.string(),
      })
      .passthrough(),
    permissions: ['write:own-artifact'],
    costClass: 'low',
    timeoutMs: 60_000,
    // Writes: never retried automatically (the registry enforces idempotent+retry consistency).
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: false,
    requiresApproval: false,
    provenance: 'GENERATED',
    isEnabled: () => featureFlags.agentArtifacts,
    async execute(input, ctx) {
      try {
        await usage().consumeQuota(ctx.userId, 'artifactGenerations', 1);
      } catch (e: any) {
        if (e?.code === 'QUOTA_EXHAUSTED') throw new ToolError('permission', e.message || 'You have used all your document generations for this period.');
        throw e;
      }

      const doc = await artifacts().createDocument({
        userId: ctx.userId,
        runId: ctx.runId,
        spec: input,
        // The document is assembled by Sadhya from retrieved material; the steps that fetched that
        // material carry their own provenance on their own results.
        provenance: 'GENERATED',
      });
      const current = doc.versions[doc.versions.length - 1];
      return {
        data: {
          artifactId: doc.artifactId,
          title: doc.title,
          pageCount: current.pageCount,
          sizeBytes: current.sizeBytes,
          fileUrl: `/api/agent/artifacts/${doc.artifactId}/file`,
        },
        provenance: 'GENERATED',
      };
    },
    summarize: (out: any) => ({ artifactId: out?.artifactId, pages: out?.pageCount }),
  };

  return registry.register(createDocument);
}
