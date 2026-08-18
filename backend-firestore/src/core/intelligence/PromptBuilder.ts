import { ExecutionPlan, PersonalizationPlan } from './types';
import { promptLibrary, PromptLibrary, PromptTemplateName } from './PromptLibrary';

/**
 * Inputs for building the adaptive directive. Everything is optional so the builder degrades
 * gracefully; all fields come from data ALREADY loaded on the hot path (the ExecutionPlan + the
 * StudentContext), so no extra I/O is introduced.
 */
export interface PromptBuildInput {
  plan: ExecutionPlan;
  preferences?: PersonalizationPlan;
  weakTopics?: string[];
  comprehensionDepth?: 'beginner' | 'intermediate' | 'advanced';
  masteryPercentage?: number;
  /** Concept-level mastery gaps (populated once the MasteryEngine lands). */
  weakConcepts?: string[];
  hasNotebook?: boolean;
  historyLength?: number;
}

export interface BuiltPrompt {
  /** The append-only directive block. Empty string when there is nothing adaptive to add. */
  directive: string;
  template: PromptTemplateName;
  signals: string[];
}

const DIRECTIVE_HEADER = '## Adaptive Teaching Directives (Sadhya Intelligence Layer)';

/**
 * PromptBuilder (Task 4) — dynamically composes an adaptive DIRECTIVE BLOCK from the ExecutionPlan
 * (Bloom level + semantic complexity), student preferences, mastery, and weak topics. It does NOT
 * build the whole prompt; it returns an additive block that the GenerationOrchestrator appends to
 * the existing system prompt. With the dynamic-prompt flag off it is never invoked, so output is
 * byte-for-byte unchanged.
 *
 * The directive automatically adjusts tone, depth, examples, analogies, tables, diagrams,
 * step-by-step reasoning, and difficulty — all explainable via the returned `signals`.
 */
export class PromptBuilder {
  constructor(private readonly library: PromptLibrary = promptLibrary) {}

  build(input: PromptBuildInput): BuiltPrompt {
    const { plan } = input;
    const signals: string[] = [];
    const lines: string[] = [];

    const template = this.library.templateFor(plan.category, plan.workflow.name);
    lines.push(`Role: ${this.library.template(template)}`);
    signals.push(`template:${template}`);

    // Bloom-level directive.
    if (plan.bloom) {
      lines.push(this.library.bloomDirective(plan.bloom.level));
      signals.push(`bloom:${plan.bloom.level}`);
    }

    // Depth / difficulty from comprehension + semantic complexity.
    const level = plan.semanticComplexity?.score ?? plan.complexity.level;
    const depth = this.depthDirective(input.comprehensionDepth, level);
    if (depth) { lines.push(depth.text); signals.push(depth.signal); }

    // Explicit reasoning scaffolding for heavy reasoning/synthesis.
    const sc = plan.semanticComplexity;
    if (sc && (sc.reasoningDepth > 0.6 || sc.synthesisRequirement > 0.5)) {
      lines.push('Show explicit step-by-step reasoning and connect the sub-parts into a coherent whole before concluding.');
      signals.push('reasoning-scaffold');
    }
    if (sc && sc.mathematicalReasoning > 0.5) {
      lines.push('Show the mathematical working clearly (each step on its own line) and state units/assumptions.');
      signals.push('math-working');
    }

    // Preference-driven formatting.
    const pref = input.preferences || plan.personalization || {};
    if (pref.language) { lines.push(`Respond in ${pref.language}.`); signals.push('pref:language'); }
    if (pref.depth === 'brief') { lines.push('Keep the answer concise and to the point.'); signals.push('pref:brief'); }
    else if (pref.depth === 'deep') { lines.push('Go deep: include derivations, edge cases, and thorough coverage.'); signals.push('pref:deep'); }
    if (pref.preferExamples) { lines.push('Include at least one concrete worked example.'); signals.push('pref:examples'); }
    if (pref.preferDiagrams) { lines.push('Include a diagram or a clear visual/structural description where it aids understanding.'); signals.push('pref:diagrams'); }
    if (pref.preferTables) { lines.push('Use a table to organize comparisons or enumerations.'); signals.push('pref:tables'); }

    // Mastery / weak-topic reinforcement.
    if (input.weakConcepts && input.weakConcepts.length > 0) {
      lines.push(`The student has weak mastery of prerequisite concept(s): ${input.weakConcepts.slice(0, 3).join(', ')}. Briefly reinforce these before the main explanation.`);
      signals.push('mastery:weak-concepts');
    } else if (input.weakTopics && input.weakTopics.length > 0) {
      lines.push(`The student has previously struggled with: ${input.weakTopics.slice(0, 3).join(', ')}. If any are prerequisites here, reinforce them first.`);
      signals.push('mastery:weak-topics');
    }
    if (typeof input.masteryPercentage === 'number' && input.masteryPercentage > 0 && input.masteryPercentage < 40) {
      lines.push('Overall mastery is still developing — reinforce fundamentals and check understanding at the end.');
      signals.push('mastery:low');
    }

    // Only emit a block if there is something beyond the role line.
    const directive = lines.length > 1 ? `${DIRECTIVE_HEADER}\n${lines.map((l) => `- ${l}`).join('\n')}` : '';
    return { directive, template, signals };
  }

  private depthDirective(
    depth: 'beginner' | 'intermediate' | 'advanced' | undefined,
    level: number,
  ): { text: string; signal: string } | null {
    if (depth === 'beginner' || level <= 2) {
      return { text: 'Assume limited background: define any jargon, proceed slowly, and use everyday analogies.', signal: 'depth:beginner' };
    }
    if (depth === 'advanced' || level >= 4) {
      return { text: 'Assume strong background: skip basic definitions and focus on edge cases, derivations, and exam-level nuance.', signal: 'depth:advanced' };
    }
    return { text: 'Pitch at an intermediate level: brief refresher of essentials, then the substantive explanation.', signal: 'depth:intermediate' };
  }
}

export const promptBuilder = new PromptBuilder();
