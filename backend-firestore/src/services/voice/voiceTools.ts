/**
 * Sadhya tool layer for the voice assistant.
 *
 * Gemini Live can ask for these by name; it can never reach Firestore, a repository, or an
 * arbitrary service. Two rules make that safe:
 *
 *  1. Only the functions declared in VOICE_TOOL_DECLARATIONS exist. Anything else the model
 *     invents is refused by name.
 *  2. The caller's identity is injected by the gateway from the verified Firebase token and is
 *     NOT a tool parameter. The model can ask "who is this student" but cannot say *which*
 *     student — so a hallucinated or malicious uid simply has nowhere to go.
 *
 * Results are deliberately compact. These answers get spoken aloud, so a tool returning ten
 * paragraphs of retrieved text would either be read out verbatim or blow the turn's latency.
 * Each tool returns a few short snippets and lets the model do the explaining.
 */
import { retrievalService } from '../rag/retrieval.service';
import { studentContextService } from '../studentContext.service';

/** Keeps spoken answers short and the turn fast. */
const MAX_SNIPPETS = 4;
const SNIPPET_CHARS = 420;

export interface VoiceToolContext {
  /** Always the authenticated uid from the gateway. Never supplied by the model. */
  userId: string;
}

/**
 * Declarations handed to Gemini Live. Descriptions are written for the model: they say when to
 * reach for a tool, because a vague description is the difference between grounded answers and
 * the model guessing from general knowledge.
 */
export const VOICE_TOOL_DECLARATIONS = [
  {
    name: 'searchSyllabus',
    description:
      'Look up the OFFICIAL exam syllabus. Use this whenever the student asks what is in the syllabus, ' +
      'whether a topic is included, what the exam covers, or anything where being wrong would mislead ' +
      'their preparation. Never answer syllabus questions from memory.',
    parameters: {
      type: 'OBJECT',
      properties: {
        examId: { type: 'STRING', description: "Exam identifier, e.g. 'ssc-cgl'. Omit to use the student's current exam." },
        query: { type: 'STRING', description: 'What to look up, in a few words.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'searchKnowledge',
    description:
      "Search Sadhya's verified study material for an explanation, definition or worked concept. " +
      'Use this for academic questions where accuracy matters more than speed.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: { type: 'STRING', description: 'The concept or question to look up.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'getStudentContext',
    description:
      'Get this student\'s current exam, subjects and recent study activity, so you can pitch the ' +
      'explanation at the right level. Takes no arguments — it always refers to the student you are ' +
      'speaking with.',
    parameters: { type: 'OBJECT', properties: {} },
  },
] as const;

const trim = (s: unknown) =>
  String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, SNIPPET_CHARS);

function toSnippets(results: any[]): Array<{ text: string; source?: string }> {
  return (results || []).slice(0, MAX_SNIPPETS).map((r) => ({
    text: trim(r?.content ?? r?.text ?? r?.pageContent ?? ''),
    source: r?.metadata?.title || r?.metadata?.source || undefined,
  })).filter((s) => s.text.length > 0);
}

/**
 * Executes one model-requested tool.
 *
 * Always resolves — a thrown error here would stall the spoken turn with no explanation, so
 * failures come back as a structured `found: false` that the model can voice naturally
 * ("I couldn't pull that up") instead of inventing an answer.
 */
export async function executeVoiceTool(
  name: string,
  args: Record<string, unknown>,
  ctx: VoiceToolContext,
): Promise<Record<string, unknown>> {
  try {
    switch (name) {
      case 'searchSyllabus': {
        const query = String(args?.query ?? '').slice(0, 300);
        if (!query) return { found: false, reason: 'no query supplied' };

        let examId = typeof args?.examId === 'string' ? args.examId : '';
        if (!examId) {
          // Fall back to the student's own exam rather than trusting the model to know it.
          const sc: any = await studentContextService.aggregateContext(ctx.userId).catch(() => null);
          examId = sc?.profile?.examId || sc?.profile?.exam || '';
        }
        if (!examId) return { found: false, reason: 'no exam selected for this student' };

        const results = await retrievalService.retrieveOfficialSyllabusContext(examId, query, MAX_SNIPPETS);
        const snippets = toSnippets(results);
        return snippets.length
          ? { found: true, examId, snippets, authoritative: true }
          : { found: false, examId, reason: 'nothing in the official syllabus matched' };
      }

      case 'searchKnowledge': {
        const query = String(args?.query ?? '').slice(0, 300);
        if (!query) return { found: false, reason: 'no query supplied' };
        const results = await retrievalService.retrievePublicKnowledge(query, MAX_SNIPPETS);
        const snippets = toSnippets(results);
        return snippets.length
          ? { found: true, snippets }
          : { found: false, reason: 'no verified material matched' };
      }

      case 'getStudentContext': {
        // Note the uid comes from ctx, never from args — see the header.
        const sc: any = await studentContextService.aggregateContext(ctx.userId);
        return {
          found: true,
          exam: sc?.profile?.examName || sc?.profile?.exam || null,
          level: sc?.profile?.level || null,
          recentTopics: (sc?.memory?.recentTopics || []).slice(0, 5),
          weakAreas: (sc?.analytics?.weakAreas || []).slice(0, 5),
        };
      }

      default:
        // An undeclared name means the model invented it; refuse rather than dispatch.
        return { found: false, reason: `unknown tool: ${name}` };
    }
  } catch (e: any) {
    return { found: false, reason: 'lookup failed', detail: String(e?.message || e).slice(0, 120) };
  }
}
