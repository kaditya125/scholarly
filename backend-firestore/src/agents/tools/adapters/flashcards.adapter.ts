import { z } from 'zod';
import { featureFlags } from '../../../config/featureFlags';
import { DocumentSpec, FlashcardsSpec, MAX_CARDS, flashcardsSpecSchema } from '../../artifacts/artifact.types';
import { ToolDefinition, ToolRegistry } from '../ToolRegistry';
import { ToolError } from '../toolErrors';

/**
 * Flashcards from something the student already has (Phase 5, the acceptance test's second step:
 * "Create flashcards from this formula chart").
 *
 * The brief: "the agent should reuse the artifact instead of unnecessarily rebuilding everything".
 * So the cards are made from the chart's STORED spec — the verified formulae, definitions and
 * symbols it already holds — with no retrieval, no re-verification and no model call. Every card
 * therefore carries exactly the verified content (and page citation) of the chart it came from.
 */

const artifacts = () => require('../../artifacts/artifacts.service').getArtifactsService();
const usage = () => require('../../../services/usage.service').usageService;

type Card = FlashcardsSpec['cards'][number];

/** "Force equals mass times acceleration" → a question; the formula is the answer. */
export function composeFlashcards(source: { artifactId: string; title: string; spec: DocumentSpec }): FlashcardsSpec {
  const cards: Card[] = [];
  const seen = new Set<string>();
  const add = (card: Card) => {
    const key = `${card.front}\u0000${card.back}`.toLowerCase();
    if (seen.has(key) || cards.length >= MAX_CARDS) return;
    seen.add(key);
    cards.push(card);
  };

  for (const section of source.spec.sections ?? []) {
    for (const block of section.blocks ?? []) {
      if (block.type === 'formulae') {
        for (const item of block.items) {
          const lhs = item.formula.split(/=|≤|≥|<|>/)[0]?.trim();
          // With a meaning: meaning → formula. Without one: a cloze on the right-hand side.
          const front = item.meaning ? `Which formula says: ${item.meaning.replace(/\.$/, '')}?` : lhs && lhs !== item.formula ? `Complete: ${lhs} = ?` : 'Write the formula';
          add({ front: front.slice(0, 300), back: item.formula.slice(0, 500), kind: 'formula', ...(item.note ? { note: item.note.slice(0, 200) } : {}) });
        }
      } else if (block.type === 'keyValue') {
        const symbols = /symbols?\b/i.test(section.heading);
        for (const item of block.items) {
          add(
            symbols
              ? { front: `What does ${item.label} stand for, and in what unit?`, back: item.value.slice(0, 500), kind: 'symbol' }
              : {
                  // "State Newton's first law of motion." / "Define inertia."
                  front: `${/\blaws?\b|principle/i.test(item.label) ? 'State' : 'Define'} ${item.label}.`.slice(0, 300),
                  back: item.value.slice(0, 500),
                  kind: 'definition',
                },
          );
        }
      }
    }
  }
  if (cards.length === 0) throw new ToolError('not_found', 'That document has no formulae or definitions to turn into flashcards.');
  return { title: `${source.title} — Flashcards`.slice(0, 120), sourceArtifactId: source.artifactId, cards };
}

export function registerFlashcardTools(registry: ToolRegistry): ToolRegistry {
  const latest: ToolDefinition<any, any> = {
    name: 'find_my_latest_document',
    description:
      "Finds the student's most recent document (optionally one whose title contains a phrase, such as 'Formula Chart') and returns its stored content, " +
      'so a follow-up can build on it instead of regenerating it.',
    category: 'artifact',
    inputSchema: z.object({
      titleContains: z.string().max(80).optional().describe('Only documents whose title contains this, e.g. "Formula Chart".'),
    }),
    outputSchema: z
      .object({
        found: z.boolean(),
        artifactId: z.string().optional(),
        title: z.string().optional(),
        createdAt: z.number().optional(),
        spec: z.any().optional(),
      })
      .passthrough(),
    permissions: ['read:own-artifact'],
    costClass: 'free',
    timeoutMs: 15_000,
    retry: { maxAttempts: 2, baseBackoffMs: 400 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'GENERATED',
    isEnabled: () => featureFlags.agentArtifacts,
    async execute(input, ctx) {
      // Owner-scoped by construction: listForUser reads ctx.userId's artifacts only.
      const mine = await artifacts().listForUser(ctx.userId, 30);
      const phrase = input.titleContains?.toLowerCase();
      const doc = mine.find((a: any) => a.kind === 'document' && a.status === 'ready' && (!phrase || String(a.title).toLowerCase().includes(phrase)));
      if (!doc) return { data: { found: false }, provenance: 'GENERATED' };
      return {
        data: { found: true, artifactId: doc.artifactId, title: doc.title, createdAt: doc.createdAt, spec: doc.spec },
        provenance: doc.provenance ?? 'GENERATED',
      };
    },
    summarize: (out: any) => (out?.found ? { found: true, title: out.title } : { found: false }),
  };

  const compose: ToolDefinition<any, any> = {
    name: 'compose_flashcards_from_document',
    description:
      'Turns a stored document’s verified formulae, definitions and symbols into flashcards. Reads the document as it is; no retrieval, no model call.',
    category: 'document',
    inputSchema: z.object({
      artifactId: z.string(),
      title: z.string(),
      spec: z.object({ sections: z.array(z.any()) }).passthrough(),
    }),
    outputSchema: flashcardsSpecSchema,
    permissions: ['read:own-artifact'],
    costClass: 'free',
    timeoutMs: 5_000,
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: true,
    requiresApproval: false,
    provenance: 'GENERATED',
    async execute(input) {
      return { data: composeFlashcards(input as any), provenance: 'GENERATED' };
    },
    summarize: (out: any) => ({ cards: out?.cards?.length ?? 0 }),
  };

  const create: ToolDefinition<any, any> = {
    name: 'create_flashcards_artifact',
    description: 'Saves a flashcard deck the student owns and can open in the workspace.',
    category: 'artifact',
    inputSchema: flashcardsSpecSchema,
    outputSchema: z.object({ artifactId: z.string(), title: z.string(), cardCount: z.number() }).passthrough(),
    permissions: ['write:own-artifact'],
    costClass: 'low',
    timeoutMs: 20_000,
    // Writes: never retried automatically (a retry would bill twice and save two decks).
    retry: { maxAttempts: 1, baseBackoffMs: 0 },
    idempotent: false,
    requiresApproval: false,
    provenance: 'GENERATED',
    isEnabled: () => featureFlags.agentArtifacts,
    async execute(input, ctx) {
      try {
        await usage().consumeQuota(ctx.userId, 'artifactGenerations', 1);
      } catch (e: any) {
        if (e?.code === 'QUOTA_EXHAUSTED') throw new ToolError('permission', e.message || 'You have used all your generations for this period.');
        throw e;
      }
      const doc = await artifacts().createFlashcards({ userId: ctx.userId, runId: ctx.runId, spec: input });
      return {
        data: { artifactId: doc.artifactId, title: doc.title, cardCount: (doc.spec as FlashcardsSpec).cards.length, kind: 'flashcards' },
        provenance: 'GENERATED',
      };
    },
    summarize: (out: any) => ({ artifactId: out?.artifactId, cards: out?.cardCount }),
  };

  for (const tool of [latest, compose, create]) registry.register(tool);
  return registry;
}
