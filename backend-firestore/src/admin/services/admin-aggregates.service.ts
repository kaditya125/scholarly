import { GoogleEmbeddingProvider } from '../../services/ai/providers/google-embedding.provider';
import { db, auth } from '../../config/firebase';
import { env } from '../../config/env';
import { logger } from '../../utils/logger';
import { TelemetryService } from '../../services/telemetry.service';
import { FeedbackService } from '../../services/feedback.service';
import { FeatureFlagService } from '../../services/featureFlag.service';
import { pineconeService } from '../../services/rag/pinecone.service';
import { publishedAssetsService } from '../../services/publishedAssets.service';
import { GraphRepository } from '../../repositories/graph.repository';
import { notebookRepository } from '../../repositories/notebook.repository';
import { AdminAlert, AIResponseFeedback } from '../../types/observability';
import os from 'os';

/**
 * AdminAggregatesService
 * -----------------------
 * Single source of truth for every admin dashboard module. Each method returns
 * REAL production data pulled from Firestore, Firebase Admin, Pinecone, Telemetry,
 * Feedback, Feature Flags and Config. Nothing here is fabricated.
 *
 * Where a module has no real backing data source in this codebase (e.g. managed
 * GCP backups, dedicated request-log store), the method returns honest empty
 * results plus a `note` explaining the limitation rather than inventing values.
 */
export class AdminAggregatesService {
  private telemetry = new TelemetryService();
  private feedback = new FeedbackService();
  private graphRepo = new GraphRepository();

  // DI-dependent services are created lazily so we never touch the container
  // before bootstrapDI() has run.
  private _flags?: FeatureFlagService;
  private get flags(): FeatureFlagService {
    if (!this._flags) this._flags = new FeatureFlagService();
    return this._flags;
  }

  // ─── AI Monitoring ──────────────────────────────────────────────────
  async getAIMetrics(): Promise<any> {
    const health = await this.telemetry.getSystemHealth();

    // Real hourly request/latency timeline from the last 24h of telemetry.
    const dayAgo = Date.now() - 86400000;
    const snap = await db.collection('telemetry').where('timestamp', '>=', dayAgo).get();
    const buckets: Record<number, { requests: number; latencySum: number }> = {};
    for (const doc of snap.docs) {
      const t: any = doc.data();
      const hour = new Date(t.timestamp).getHours();
      if (!buckets[hour]) buckets[hour] = { requests: 0, latencySum: 0 };
      buckets[hour].requests++;
      buckets[hour].latencySum += t.totalLatencyMs || 0;
    }
    const timeline = Array.from({ length: 24 }, (_, h) => ({
      time: `${String(h).padStart(2, '0')}:00`,
      requests: buckets[h]?.requests || 0,
      avgLatencyMs: buckets[h] && buckets[h].requests > 0
        ? Math.round(buckets[h].latencySum / buckets[h].requests)
        : 0,
    }));

    const providers = Object.entries(health.aiMetrics.providerStats || {}).map(
      ([name, s]: [string, any]) => ({
        name,
        requests: s.requests,
        failures: s.failures,
        avgLatencyMs: Math.round(s.avgLatency),
        totalTokens: s.totalTokens,
        totalCostUSD: parseFloat((s.totalCost || 0).toFixed(4)),
      })
    );

    return {
      requestsToday: health.requestsToday,
      feedbackToday: health.feedbackToday,
      activeAlerts: health.activeAlerts,
      avgLatencyMs: health.aiMetrics.avgLatencyMs,
      avgTimeToFirstTokenMs: health.aiMetrics.avgTimeToFirstToken,
      totalTokensToday: health.aiMetrics.totalTokensToday,
      totalCostToday: health.aiMetrics.totalCostToday,
      verificationSuccessRate: health.aiMetrics.verificationSuccessRate,
      ragMetrics: health.ragMetrics,
      providers,
      timeline,
    };
  }

  async getCostAnalytics(days: number = 30): Promise<any> {
    const base = await this.telemetry.getCostAnalytics(days);

    // Real daily cost time-series bucketed from cost_records.
    const since = Date.now() - days * 86400000;
    const snap = await db.collection('cost_records').where('timestamp', '>=', since).get();
    const dayBuckets: Record<string, number> = {};
    for (const doc of snap.docs) {
      const r: any = doc.data();
      const day = new Date(r.timestamp).toISOString().slice(0, 10);
      dayBuckets[day] = (dayBuckets[day] || 0) + (r.estimatedCostUSD || 0);
    }
    const dailyCosts = Object.entries(dayBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost: +cost.toFixed(4) }));

    const byProviderArray = Object.entries(base.byProvider || {}).map(
      ([name, value]) => ({ name, value: +(value as number).toFixed(4) })
    );

    return { ...base, dailyCosts, byProviderArray, recordCount: snap.size };
  }

  // ─── System Health (real process + dependency probes) ───────────────
  async getSystemHealth(): Promise<any> {
    const health = await this.telemetry.getSystemHealth();

    const mem = process.memoryUsage();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const cpus = os.cpus();
    const load = os.loadavg(); // [1,5,15]; returns [0,0,0] on Windows

    // Dependency probes
    let firestoreOk = false;
    const fsStart = Date.now();
    let firestoreLatencyMs = 0;
    try {
      await db.collection('_healthcheck').limit(1).get();
      firestoreOk = true;
      firestoreLatencyMs = Date.now() - fsStart;
    } catch (e) {
      logger.warn('Admin system-health: Firestore probe failed', { error: (e as Error).message });
    }

    let pineconeOk = false;
    let pineconeVectors: number | null = null;
    try {
      const stats = await pineconeService.getIndexStats();
      pineconeOk = true;
      pineconeVectors = stats.totalVectorCount;
    } catch (e) {
      logger.warn('Admin system-health: Pinecone probe failed', { error: (e as Error).message });
    }

    const redisConfigured = Boolean(env.REDIS_URL);

    const services = [
      { name: 'API Server', status: 'operational', detail: `uptime ${Math.round(process.uptime())}s` },
      { name: 'Firestore', status: firestoreOk ? 'operational' : 'degraded', detail: firestoreOk ? `${firestoreLatencyMs}ms` : 'unreachable' },
      { name: 'Pinecone Vector DB', status: pineconeOk ? 'operational' : 'degraded', detail: pineconeVectors != null ? `${pineconeVectors} vectors` : 'unreachable' },
      {
        name: 'Redis Cache',
        status: redisConfigured ? 'operational' : 'not_configured',
        detail: redisConfigured ? 'configured' : 'In-memory cache in use (no REDIS_URL)',
      },
    ];

    const overall = firestoreOk ? (pineconeOk ? 'Healthy' : 'Degraded') : 'Critical';

    return {
      status: overall,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: Date.now(),
      memory: {
        rssMB: +(mem.rss / 1048576).toFixed(1),
        heapUsedMB: +(mem.heapUsed / 1048576).toFixed(1),
        heapTotalMB: +(mem.heapTotal / 1048576).toFixed(1),
        systemUsedPct: +(((totalMem - freeMem) / totalMem) * 100).toFixed(1),
      },
      cpu: {
        cores: cpus.length,
        model: cpus[0]?.model?.trim() || 'unknown',
        loadAvg1m: +load[0].toFixed(2),
      },
      services,
      // AI-layer health from telemetry (real)
      requestsToday: health.requestsToday,
      avgLatencyMs: health.aiMetrics.avgLatencyMs,
      verificationSuccessRate: health.aiMetrics.verificationSuccessRate,
      activeAlerts: health.activeAlerts,
    };
  }

  // ─── Continuous Evaluation (real feedback aggregates) ───────────────
  async getEvaluation(): Promise<any> {
    const [summary7, summary1, recent] = await Promise.all([
      this.feedback.getFeedbackSummary(7),
      this.feedback.getFeedbackSummary(1),
      this.feedback.getRecentFeedback(30),
    ]);

    // 7-day daily satisfaction trend, computed from real feedback docs.
    const weekAgo = Date.now() - 7 * 86400000;
    const trendSnap = await db.collection('user_feedback').where('createdAt', '>=', weekAgo).get();
    const dayBuckets: Record<string, { positive: number; total: number }> = {};
    for (const doc of trendSnap.docs) {
      const f = doc.data() as AIResponseFeedback;
      const day = new Date(f.createdAt).toISOString().slice(0, 10);
      if (!dayBuckets[day]) dayBuckets[day] = { positive: 0, total: 0 };
      dayBuckets[day].total++;
      if (f.rating === 'thumbs_up' || f.rating === 'very_helpful') dayBuckets[day].positive++;
    }
    const trendData = Object.entries(dayBuckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        date: day,
        satisfactionRate: v.total > 0 ? +((v.positive / v.total) * 100).toFixed(1) : 0,
        evaluations: v.total,
      }));

    const negativeRatings = ['thumbs_down', 'incorrect', 'hallucination', 'outdated', 'needs_citation', 'report_issue'];
    const recentFailures = recent
      .filter(f => negativeRatings.includes(f.rating))
      .slice(0, 15)
      .map(f => ({
        id: f.id,
        topic: f.examMode || f.learningMode || 'general',
        issue: f.rating,
        provider: f.providerUsed,
        promptVersion: f.promptVersion,
        timestamp: f.createdAt,
        severity: (f.rating === 'hallucination' || f.rating === 'incorrect') ? 'critical' : 'warning',
      }));

    return {
      // overallScore derived directly from real satisfaction rate (0-100 -> 0-10)
      overallScore: +(summary7.satisfactionRate / 10).toFixed(1),
      satisfactionRate: summary7.satisfactionRate,
      evaluationsThisWeek: summary7.total,
      evaluationsToday: summary1.total,
      criticalFailures: summary1.negative,
      distribution: summary7.distribution,
      byExamMode: summary7.byExamMode,
      byProvider: summary7.byProvider,
      trendData,
      recentFailures,
      // Per-dimension LLM-judge scores are not implemented in this codebase.
      dimensions: [],
      dimensionsAvailable: false,
      note: 'Scores derive from real user_feedback. Per-dimension LLM-judge evaluation is not implemented, so the dimensions array is intentionally empty.',
    };
  }

  // ─── Curriculum Ingestion Jobs (real document sources) ──────────────
  async getIngestionJobs(limit: number = 50): Promise<any> {
    // collectionGroup over every notebook's `sources` subcollection.
    const snap = await db.collectionGroup('sources').limit(200).get();
    const sources = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
    sources.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const stageOrder = ['PENDING', 'EXTRACTING', 'CHUNKING', 'EMBEDDING', 'GRAPH_BUILDING', 'INDEXING', 'READY'];
    const jobs = sources.slice(0, limit).map(s => {
      const status: string = s.status || 'PENDING';
      const idx = stageOrder.indexOf(status);
      const progress = status === 'READY' ? 100 : status === 'FAILED' ? 100 : idx >= 0 ? Math.round((idx / (stageOrder.length - 1)) * 100) : 0;
      return {
        id: s.id,
        filename: s.title || s.fileName || s.name || s.id,
        title: s.title,
        chunksExtracted: s.chunksExtracted,
        type: s.type || s.sourceType || 'document',
        status,
        progress,
        error: s.error || s.errorMessage || null,
        createdAt: s.createdAt || null,
        updatedAt: s.updatedAt || null,
      };
    });

    const totalAgg = await db.collectionGroup('sources').count().get();
    const now = Date.now();
    const dayAgo = now - 86400000;
    const recent24h = sources.filter(s => (s.createdAt || 0) >= dayAgo);

    return {
      jobs,
      stats: {
        totalSources: totalAgg.data().count,
        active: sources.filter(s => !['READY', 'FAILED'].includes(s.status)).length,
        failed: sources.filter(s => s.status === 'FAILED').length,
        completedLast24h: recent24h.filter(s => s.status === 'READY').length,
      },
      note: 'Ingestion jobs are derived from the real `sources` subcollections across all notebooks. Stats for active/failed reflect the most recent 200 sources; totalSources is a full count.',
    };
  }

  // ─── Knowledge Graph (global aggregation) ───────────────────────────
  async getKnowledgeGraph(limit: number = 100): Promise<any> {
    const [stats, nodes, edges] = await Promise.all([
      this.graphRepo.getGlobalStats(),
      this.graphRepo.getRecentNodesGlobal(limit),
      this.graphRepo.getGlobalEdges(limit * 2), // Fetch more edges to increase chance of connectivity
    ]);

    const mappedNodes = nodes.map((n: any) => {
      const mastery = typeof n.masteryPercentage === 'number' ? n.masteryPercentage : null;
      return {
        id: n.id,
        concept: n.label || n.concept || n.id,
        type: n.type || 'concept',
        connections: Array.isArray(n.prerequisites) ? n.prerequisites.length : 0,
        masteryPercentage: mastery,
        status: mastery == null ? 'unknown' : mastery < 40 ? 'weak' : mastery < 75 ? 'developing' : 'strong',
        revisionStatus: n.revisionStatus || null,
        ...n, // pass through other properties for the graph viewer metadata
      };
    });
    
    // Also map edges properly
    const mappedEdges = edges.map((e: any) => ({
      id: e.id,
      sourceNodeId: e.sourceNodeId || e.source || e.from,
      targetNodeId: e.targetNodeId || e.target || e.to,
      relationshipType: e.relationshipType || e.type || e.relationship || 'related',
      ...e,
    }));

    const weakConcepts = mappedNodes.filter(n => n.status === 'weak').length;

    return {
      stats: {
        totalNodes: stats.totalNodes,
        totalEdges: stats.totalEdges,
        weakConceptsInSample: weakConcepts,
        sampleSize: mappedNodes.length,
        edgesSampleSize: mappedEdges.length,
      },
      nodes: mappedNodes,
      edges: mappedEdges,
      note: 'Totals are exact platform-wide counts via collectionGroup aggregation. The node table shows a bounded sample; weakConceptsInSample is computed over that sample.',
    };
  }

  // ─── Pinecone Vector DB ─────────────────────────────────────────────
  async getVectorDBStats(): Promise<any> {
    const stats = await pineconeService.getIndexStats();
    
    // Aggregate curriculum metadata to get distribution
    const curriculumSnap = await db.collection('curriculum').get();
    const subjectDistribution: Record<string, number> = {};
    
    curriculumSnap.docs.forEach(doc => {
      const data = doc.data();
      const subject = data.subject || 'Unknown';
      const vectorCount = data.vectorsCount || 0;
      if (!subjectDistribution[subject]) subjectDistribution[subject] = 0;
      subjectDistribution[subject] += vectorCount;
    });

    const curriculumStats = Object.entries(subjectDistribution).map(([name, value]) => ({ name, value }));

    return {
      indexName: stats.indexName,
      dimension: stats.dimension,
      totalVectors: stats.totalVectorCount,
      indexFullness: stats.indexFullness,
      embeddingModel: 'gemini-embedding-001',
      curriculumStats,
      namespaces: stats.namespaces.map(ns => ({
        name: ns.name,
        vectorCount: ns.vectorCount,
        dimensions: stats.dimension,
        status: 'Ready',
      })),
    };
  }

  async queryPinecone(query: string, namespace: string, topK: number = 5): Promise<any> {
    const embedder = new GoogleEmbeddingProvider();
    const queryVector = await embedder.generateEmbedding(query);
    const results = await pineconeService.queryVectors(queryVector, topK, undefined, namespace);
    return results;
  }

  async deleteNamespace(namespace: string): Promise<void> {
    await pineconeService.deleteAllVectors(namespace);
  }

  // ─── Prompt Studio (real experiments + telemetry versions) ──────────
  async getPrompts(): Promise<any> {
    const insights = await this.telemetry.getAIImprovementInsights();

    // Real prompt versions observed in telemetry, with real usage + cost.
    const thirtyDaysAgo = Date.now() - 30 * 86400000;
    const telSnap = await db.collection('telemetry').where('timestamp', '>=', thirtyDaysAgo).get();
    const byVersion: Record<string, { calls: number; latencySum: number; cost: number; providers: Set<string> }> = {};
    for (const doc of telSnap.docs) {
      const t: any = doc.data();
      const v = t.promptVersion || 'default';
      if (!byVersion[v]) byVersion[v] = { calls: 0, latencySum: 0, cost: 0, providers: new Set() };
      byVersion[v].calls++;
      byVersion[v].latencySum += t.totalLatencyMs || 0;
      byVersion[v].cost += t.estimatedCostUSD || 0;
      if (t.provider) byVersion[v].providers.add(t.provider);
    }
    const prompts = Object.entries(byVersion).map(([version, v]) => ({
      id: version,
      name: version,
      version,
      status: 'production',
      provider: Array.from(v.providers).join(', ') || 'groq',
      calls: v.calls,
      avgLatencyMs: v.calls > 0 ? Math.round(v.latencySum / v.calls) : 0,
      costUSD: +v.cost.toFixed(4),
    }));

    // Real A/B experiments
    const expSnap = await db.collection('prompt_experiments').get();
    const experiments = expSnap.docs.map(d => {
      const e: any = d.data();
      return {
        id: d.id,
        name: e.name || d.id,
        status: e.status || 'unknown',
        variants: Array.isArray(e.variants) ? e.variants.length : 0,
        createdAt: e.createdAt || null,
      };
    });

    return {
      prompts,
      experiments,
      mostExpensivePrompts: insights.mostExpensivePrompts,
      note: prompts.length === 0 && experiments.length === 0
        ? 'No tracked prompt versions or A/B experiments recorded yet. Values populate as telemetry accrues.'
        : 'Prompt rows reflect real prompt versions observed in telemetry; experiments come from the prompt_experiments collection.',
    };
  }

  // ─── Feature Flags (real, with default seeding) ─────────────────────
  async getFeatureFlags(): Promise<any> {
    try {
      await this.flags.seedDefaults();
    } catch (e) {
      logger.warn('Feature flag seedDefaults failed (non-fatal)', { error: (e as Error).message });
    }
    const flags = await this.flags.getAllFlags();
    return {
      flags: flags.map((f: any) => ({
        id: f.name,
        name: f.name,
        description: f.description || '',
        enabled: f.enabled,
        scope: f.scope || 'global',
        targetCount: Array.isArray(f.targetUserIds) ? f.targetUserIds.length : 0,
        rolloutPercentage: typeof f.rolloutPercentage === 'number' ? f.rolloutPercentage : null,
        updatedAt: f.updatedAt || null,
      })),
    };
  }

  async setFeatureFlag(name: string, enabled: boolean, updatedBy: string = 'admin'): Promise<any> {
    const all = await this.flags.getAllFlags();
    const existing = all.find(f => f.name === name);
    const flag: any = existing
      ? { ...existing, enabled, updatedBy }
      : { name, enabled, scope: 'global', description: '', targetUserIds: [], updatedBy };
    await this.flags.setFlag(flag);
    return { name, enabled };
  }

  // ─── Learning Assets (real published assets) ────────────────────────
  async getLearningAssets(): Promise<any> {
    const all = await publishedAssetsService.getPublishedAssets();
    const list = all.slice(0, 100);
    return {
      assets: list.map((a: any) => ({
        id: a.id,
        title: a.title || a.name || 'Untitled',
        type: a.type || a.assetType || 'asset',
        subject: a.subject || null,
        exam: a.exam || null,
        author: a.authorName || a.author || 'unknown',
        status: 'published',
        downloads: a.downloads || 0,
        rating: a.rating || null,
        publishedAt: a.publishedAt || a.createdAt || null,
      })),
    };
  }

  // ─── Notebook Management (global) ───────────────────────────────────
  async getNotebooks(limit: number = 50): Promise<any> {
    const [stats, recent] = await Promise.all([
      notebookRepository.getGlobalStats(),
      notebookRepository.listRecent(limit),
    ]);
    return {
      stats: {
        totalNotebooks: stats.totalNotebooks,
        activeThisWeek: stats.activeThisWeek,
      },
      notebooks: recent.map((n: any) => ({
        id: n.id,
        title: n.title || 'Untitled',
        owner: n.userId || n.owner || 'unknown',
        sharedWith: (Array.isArray(n.editors) ? n.editors.length : 0) + (Array.isArray(n.viewers) ? n.viewers.length : 0),
        documents: n.stats?.documentCount ?? 0,
        kgNodes: n.stats?.knowledgeGraphNodes ?? 0,
        isArchived: !!n.isArchived,
        isFavorite: !!n.isFavorite,
        updatedAt: n.updatedAt || null,
        createdAt: n.createdAt || null,
      })),
    };
  }

  /** Full detail for one notebook (admin, ownership-agnostic) + its sources. */
  async getNotebookDetail(id: string): Promise<any | null> {
    const nb: any = await notebookRepository.getByIdAdmin(id);
    if (!nb) return null;
    const sources = await notebookRepository.getSources(id);
    return {
      notebook: {
        id: nb.id,
        title: nb.title || 'Untitled',
        owner: nb.userId || nb.owner || 'unknown',
        editors: Array.isArray(nb.editors) ? nb.editors.length : 0,
        viewers: Array.isArray(nb.viewers) ? nb.viewers.length : 0,
        documents: nb.stats?.documentCount ?? 0,
        kgNodes: nb.stats?.knowledgeGraphNodes ?? 0,
        flashcards: nb.stats?.flashcardsCount ?? 0,
        quizzes: nb.stats?.quizCount ?? 0,
        isArchived: !!nb.isArchived,
        isFavorite: !!nb.isFavorite,
        color: nb.color || null,
        createdAt: nb.createdAt || null,
        updatedAt: nb.updatedAt || null,
      },
      sources: (sources || []).map((s: any) => ({
        id: s.id,
        title: s.title || s.fileName || s.name || s.id,
        type: s.type || s.sourceType || 'document',
        status: s.status || 'PENDING',
        createdAt: s.createdAt || null,
        error: s.error || s.errorMessage || null,
      })),
    };
  }

  /** Archive or unarchive a notebook (admin). */
  async setNotebookArchived(id: string, archived: boolean): Promise<any> {
    await notebookRepository.updateAdmin(id, { isArchived: archived } as any);
    return { id, isArchived: archived };
  }

  /** Rename a notebook (admin). */
  async renameNotebook(id: string, title: string): Promise<any> {
    await notebookRepository.updateAdmin(id, { title } as any);
    return { id, title };
  }

  /** Delete a notebook and cascade its subcollections (admin, destructive). */
  async deleteNotebook(id: string): Promise<any> {
    await notebookRepository.deleteWithSubcollections(id);
    return { id, deleted: true };
  }

  // ─── User Management (Firebase Admin) ───────────────────────────────
  async getUsers(limit: number = 200): Promise<any> {
    const list = await auth.listUsers(Math.min(limit, 1000));
    const staffRoles = ['super_admin', 'admin', 'moderator', 'content_manager', 'support', 'analytics_viewer'];
    const users = list.users.map(u => {
      const role = (u.customClaims?.role as string) || 'student';
      return {
        id: u.uid,
        name: u.displayName || (u.email ? u.email.split('@')[0] : u.uid),
        email: u.email || '—',
        role,
        status: u.disabled ? 'suspended' : (u.metadata.lastSignInTime ? 'active' : 'pending'),
        lastLogin: u.metadata.lastSignInTime || null,
        joined: u.metadata.creationTime || null,
        emailVerified: u.emailVerified,
      };
    });
    return {
      users,
      stats: {
        totalUsers: users.length,
        activeStudents: users.filter(u => u.role === 'student' && u.status === 'active').length,
        staffAndAdmins: users.filter(u => staffRoles.includes(u.role)).length,
        suspended: users.filter(u => u.status === 'suspended').length,
      },
      note: list.pageToken
        ? 'Showing the first page of users. Additional users exist beyond this page.'
        : undefined,
    };
  }

  // ─── Security Monitoring (real admin_alerts + verification rate) ────
  async getSecurity(): Promise<any> {
    const [alerts, health] = await Promise.all([
      this.telemetry.getActiveAlerts(),
      this.telemetry.getSystemHealth(),
    ]);

    const mapSeverity = (a: AdminAlert) =>
      a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'medium' : 'low';

    const threats = alerts.map(a => ({
      id: a.id,
      type: a.type,
      severity: mapSeverity(a),
      message: a.message,
      source: (a.metadata as any)?.traceId || 'system',
      timestamp: a.createdAt,
      status: a.resolved ? 'resolved' : 'investigating',
    }));

    // Hourly alert timeline over last 24h (real)
    const dayAgo = Date.now() - 86400000;
    const timelineBuckets: Record<number, number> = {};
    for (const a of alerts) {
      if (a.createdAt >= dayAgo) {
        const hour = new Date(a.createdAt).getHours();
        timelineBuckets[hour] = (timelineBuckets[hour] || 0) + 1;
      }
    }
    const alertTimeline = Array.from({ length: 24 }, (_, h) => ({
      time: `${String(h).padStart(2, '0')}:00`,
      events: timelineBuckets[h] || 0,
    }));

    return {
      threats,
      stats: {
        activeAlerts: alerts.length,
        criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
        verificationFailures: alerts.filter(a => a.type === 'verification_failure').length,
        guardrailPassRate: health.aiMetrics.verificationSuccessRate,
      },
      alertTimeline,
      note: 'Security signals are derived from real admin_alerts (latency, verification failures, token usage) and the RAG verification pass-rate. Dedicated prompt-injection/WAF threat tracking is not implemented in this codebase.',
    };
  }

  /** Resolve an admin alert (used by Security + Notifications). */
  async resolveAlert(alertId: string): Promise<void> {
    await this.telemetry.resolveAlert(alertId);
  }

  // ─── System Logs (honest: admin_alerts event stream) ────────────────
  async getLogs(limit: number = 100): Promise<any> {
    const snap = await db.collection('admin_alerts').orderBy('createdAt', 'desc').limit(limit).get();
    const logs = snap.docs.map(d => {
      const a = d.data() as AdminAlert;
      const level = a.severity === 'critical' ? 'error' : a.severity === 'warning' ? 'warn' : 'info';
      return {
        id: (a as any).id || d.id,
        level,
        type: a.type,
        message: a.message,
        timestamp: a.createdAt,
      };
    });
    return {
      logs,
      source: 'admin_alerts',
      note: 'Application request/debug logs are written to stdout (winston) and are not persisted to a queryable store. This endpoint surfaces the real Firestore admin_alerts event stream. A durable log sink (e.g. Cloud Logging) is required for full request-level logs.',
    };
  }

  // ─── Notifications (honest: unresolved admin_alerts) ────────────────
  async getNotifications(): Promise<any> {
    const alerts = await this.telemetry.getActiveAlerts();
    return {
      notifications: alerts.map(a => ({
        id: a.id,
        title: a.type,
        message: a.message,
        severity: a.severity,
        createdAt: a.createdAt,
        read: false,
      })),
      note: 'System notifications are derived from unresolved admin_alerts. User-facing broadcast/campaign notifications are not implemented.',
    };
  }

  // ─── Backup & Restore (honest gap) ──────────────────────────────────
  async getBackups(): Promise<any> {
    return {
      backups: [],
      supported: false,
      note: 'Firestore backups are managed by Google Cloud (scheduled exports and Point-in-Time Recovery) and are not exposed through the application/Admin SDK. Configure and inspect them via the GCP console or gcloud. This endpoint intentionally returns no fabricated backup records.',
    };
  }

  // ─── Settings (real runtime config, no secrets) ─────────────────────
  async getSettings(): Promise<any> {
    let flags: any[] = [];
    try {
      flags = await this.flags.getAllFlags();
    } catch {
      flags = [];
    }
    return {
      settings: {
        environment: env.NODE_ENV,
        port: env.PORT,
        aiProvider: 'groq',
        chatModel: env.GROQ_MODEL || 'openai/gpt-oss-20b',
        embeddingModel: 'gemini-embedding-001',
        pineconeIndex: env.PINECONE_INDEX_NAME || null,
        pineconeNamespace: env.PINECONE_NAMESPACE || null,
        corsConfigured: Boolean(env.CORS_ORIGINS),
        redisConfigured: Boolean(env.REDIS_URL),
      },
      featureFlags: flags.map((f: any) => ({ name: f.name, enabled: f.enabled, scope: f.scope })),
      note: 'Read-only runtime configuration sourced from environment variables and Firestore feature_flags. Secret values (API keys, private keys) are never returned.',
    };
  }
}

export const adminAggregatesService = new AdminAggregatesService();
