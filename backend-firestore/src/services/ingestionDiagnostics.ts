/**
 * Per-source ingestion diagnostics.
 *
 * Accumulates warnings, errors, stage timings, failure counters, and a token/cost rollup
 * during processing, then serializes them as ADDITIVE fields onto the source document.
 *
 * Backward compatible: existing READY documents that predate these fields keep working —
 * every field is optional and consumers must treat them as such.
 */

export type IssueSeverity = 'warning' | 'error';

export interface ProcessingIssue {
  timestamp: number;
  stage: string;
  severity: IssueSeverity;
  message: string;
  stack?: string;
  retryAttempt?: number;
  resolved?: boolean;
}

export interface IngestionCost {
  inputTokens: number;
  outputTokens: number;
  embeddingTokens: number;
  llmCostUsd: number;
  embeddingCostUsd: number;
  totalCostUsd: number;
}

// Same rates used by lib/telemetry.ts, kept in sync so per-source rollups match platform totals.
const RATE_LLM_INPUT_PER_1K = 0.000125;
const RATE_LLM_OUTPUT_PER_1K = 0.000375;
const RATE_EMBEDDING_PER_1K = 0.00002;

export class IngestionDiagnostics {
  warnings: ProcessingIssue[] = [];
  errors: ProcessingIssue[] = [];
  stageDurations: Record<string, number> = {};
  counters = { retryCount: 0, llmFailures: 0, embeddingFailures: 0, assetFailures: 0, graphFailures: 0 };
  cost: IngestionCost = {
    inputTokens: 0, outputTokens: 0, embeddingTokens: 0,
    llmCostUsd: 0, embeddingCostUsd: 0, totalCostUsd: 0,
  };

  warn(stage: string, message: string, extra?: Partial<ProcessingIssue>): void {
    this.warnings.push({ timestamp: Date.now(), stage, severity: 'warning', message: String(message).slice(0, 500), ...extra });
  }

  error(stage: string, err: any, extra?: Partial<ProcessingIssue>): void {
    this.errors.push({
      timestamp: Date.now(),
      stage,
      severity: 'error',
      message: String(err?.message || err).slice(0, 500),
      stack: typeof err?.stack === 'string' ? err.stack.slice(0, 1500) : undefined,
      ...extra,
    });
  }

  /** Record (accumulate) how long a named stage took, in ms. */
  time(stage: string, ms: number): void {
    this.stageDurations[stage] = (this.stageDurations[stage] || 0) + Math.max(0, Math.round(ms));
  }

  addLlmUsage(promptTokens = 0, completionTokens = 0): void {
    this.cost.inputTokens += promptTokens;
    this.cost.outputTokens += completionTokens;
    this.cost.llmCostUsd += (promptTokens / 1000) * RATE_LLM_INPUT_PER_1K + (completionTokens / 1000) * RATE_LLM_OUTPUT_PER_1K;
    this.recomputeTotal();
  }

  addEmbeddingTokens(tokens = 0): void {
    this.cost.embeddingTokens += tokens;
    this.cost.embeddingCostUsd += (tokens / 1000) * RATE_EMBEDDING_PER_1K;
    this.recomputeTotal();
  }

  private recomputeTotal(): void {
    this.cost.totalCostUsd = this.cost.llmCostUsd + this.cost.embeddingCostUsd;
  }

  /** Rounded numbers so Firestore documents stay compact. */
  private roundedCost(): IngestionCost {
    const r = (n: number) => Math.round(n * 1e6) / 1e6;
    return {
      inputTokens: this.cost.inputTokens,
      outputTokens: this.cost.outputTokens,
      embeddingTokens: this.cost.embeddingTokens,
      llmCostUsd: r(this.cost.llmCostUsd),
      embeddingCostUsd: r(this.cost.embeddingCostUsd),
      totalCostUsd: r(this.cost.totalCostUsd),
    };
  }

  /** Serialize to the additive fields written onto the source document. */
  toFirestore(): Record<string, any> {
    return {
      // Cap arrays so a pathological run cannot bloat the document.
      processingWarnings: this.warnings.slice(-50),
      processingErrors: this.errors.slice(-50),
      processingMetrics: {
        stageDurations: this.stageDurations,
        cost: this.roundedCost(),
      },
      retryCount: this.counters.retryCount,
      llmFailures: this.counters.llmFailures,
      embeddingFailures: this.counters.embeddingFailures,
      assetFailures: this.counters.assetFailures,
      graphFailures: this.counters.graphFailures,
      diagnosticsVersion: 1,
    };
  }
}
