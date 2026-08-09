import { BloomLevel, BloomResult, IntelligenceInput } from './types';

/**
 * Bloom's Taxonomy Classifier (Task 3) — assigns each educational question a cognitive level
 * (remember → understand → apply → analyze → evaluate → create). Heuristic + deterministic
 * (verb/phrase driven), so it adds zero latency and no LLM cost. Rules are checked HIGH→LOW so a
 * question that mixes verbs is placed at its most demanding cognitive level.
 *
 * The Bloom level downstream influences prompt depth, retrieval breadth, explanation style,
 * question style and verification strictness (consumed by the PromptBuilder in a later increment).
 */
const PATTERNS: Array<{ level: BloomLevel; re: RegExp; signal: string }> = [
  // create — highest: produce something new
  { level: 'create', re: /\b(design|create|construct|develop|formulate|compose|invent|devise|propose|plan (an?|the)|build (an?|the)|generate (an?|a new)|write (an? )?(essay|story|poem|program|algorithm))\b/, signal: 'create-verb' },
  // evaluate — judge / critique / justify
  { level: 'evaluate', re: /\b(evaluate|critique|judge|justify|assess|appraise|argue|defend|recommend|is it (correct|right|better)|which is (better|best)|pros and cons|advantages and disadvantages|do you agree)\b/, signal: 'evaluate-verb' },
  // analyze — break apart / relate / compare
  { level: 'analyze', re: /\b(analy[sz]e|compare|contrast|differentiate|distinguish|examine|categori[sz]e|relationship between|how (are|do) .* related|why does|break down|classify the differences)\b/, signal: 'analyze-verb' },
  // apply — use in a new situation / solve
  { level: 'apply', re: /\b(solve|calculate|compute|apply|use (it|this) to|demonstrate|implement|find the (value|answer|result)|work out|show how to)\b/, signal: 'apply-verb' },
  // understand — explain / interpret / summarize
  { level: 'understand', re: /\b(explain|describe|summari[sz]e|interpret|discuss|paraphrase|how does|why is|elaborate|help me understand|in your own words|give an example)\b/, signal: 'understand-verb' },
  // remember — recall a fact / define / list
  { level: 'remember', re: /\b(what (is|are|was|were)|define|definition of|list|name|state|recall|identify|who (is|was)|when (did|was)|where (is|was)|how many)\b/, signal: 'remember-verb' },
];

export class BloomClassifier {
  classify(input: IntelligenceInput): BloomResult {
    const q = (input.query || '').toLowerCase().trim();
    if (!q) return { level: 'understand', confidence: 0.3, signals: ['empty-default'] };

    for (const p of PATTERNS) {
      if (p.re.test(q)) {
        // A "what is X and how does it work" recalls a fact but demands understanding.
        if (p.level === 'remember' && /\b(how|why|explain|works?|process|mechanism)\b/.test(q)) {
          return { level: 'understand', confidence: 0.75, signals: ['remember+understand'] };
        }
        return { level: p.level, confidence: this.confidenceFor(p.level), signals: [p.signal] };
      }
    }
    // Default: most classroom questions that name a topic without an explicit verb are "understand".
    return { level: 'understand', confidence: 0.5, signals: ['no-verb-default'] };
  }

  private confidenceFor(level: BloomLevel): number {
    // Higher-order verbs are less ambiguous → higher confidence.
    switch (level) {
      case 'create': return 0.85;
      case 'evaluate': return 0.82;
      case 'analyze': return 0.8;
      case 'apply': return 0.8;
      case 'understand': return 0.75;
      case 'remember': return 0.78;
      default: return 0.6;
    }
  }
}

export const bloomClassifier = new BloomClassifier();
