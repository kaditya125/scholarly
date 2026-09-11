import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { env } from '../config/env';
import { sourceRepository } from '../repositories/source.repository';
import { notebookService } from './notebook.service';
import { DocumentSource, ExtractionMetadata } from '../types';
import { FileParserService } from './fileParser.service';
import { TextChunker } from '../utils/textChunker';
import { GoogleEmbeddingProvider } from './ai/providers/google-embedding.provider';
import { pineconeService } from './rag/pinecone.service';
import { GeminiProvider } from './ai/gemini.provider';
import { withRetry } from '../utils/retry';
import {
  RICH_ASSET_SPECS,
  zodValidator,
  ExamQuestionSet,
  examQuestionsPrompt,
  type ExamSectionContext,
} from './assetSpecs';
import { callStructuredLLM } from './ai/structuredLlm';
import { geminiLimiter } from '../utils/rateLimiter';
import { RecordMetadata } from '@pinecone-database/pinecone';
import { firebaseApp } from '../config/firebase';


/**
 * The status a chapter reports while each asset generates.
 *
 * ChapterReader polls a fixed set of IN_PROGRESS_STATUSES that already includes
 * GENERATING_ARTICLE / GENERATING_STUDY_MODE / GENERATING_REVISION_MODE / GENERATING_EXAM_MODE.
 * Nothing on the server ever set them, so the reader's staged progress UI had states it could
 * never observe. These are those strings, so PreparingChapter shows real progress.
 */
/**
 * Chapters currently generating, as "notebookId/sourceId".
 *
 * The reader fires POST /generate automatically whenever it sees a chapter that is not READY,
 * throttled only client-side and only per mount — so two students opening the same unprepared
 * chapter, or one student with two tabs, each start a full eight-call generation of the same
 * material. The existence check below cannot catch that on its own: neither request has written
 * an asset yet when the other looks. This does.
 *
 * Process-local, which is enough here: PM2 runs sadhya-api as a single fork instance (cluster
 * mode crash-looped on this box and was reverted). If it is ever scaled out, this needs to move
 * to a Firestore lease or Redis lock — two instances would each keep their own Set.
 */
const GENERATION_IN_FLIGHT = new Set<string>();

const STATUS_FOR_ASSET: Record<string, string> = {
  DOCUMENTARY_ARTICLE: 'GENERATING_ARTICLE',
  EXAM_QUESTIONS: 'GENERATING_EXAM_MODE',
  REVISION_NOTES: 'GENERATING_REVISION_MODE',
  LEARNING_OBJECTIVES: 'GENERATING_STUDY_MODE',
  KEY_FORMULAE: 'GENERATING_STUDY_MODE',
  HIGH_YIELD_FACTS: 'GENERATING_STUDY_MODE',
  COMMON_MISTAKES: 'GENERATING_STUDY_MODE',
  EXAM_TIPS: 'GENERATING_EXAM_MODE',
};

export class SourceService {
  async processUpload(notebookId: string, userId: string, file: Express.Multer.File): Promise<DocumentSource> {
    await notebookService.getNotebookById(notebookId, userId);
    
    // Duplicate Detection
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const existingSources = await sourceRepository.getSourcesByNotebook(notebookId);
    const duplicate = existingSources.find(s => s.checksum === checksum);
    
    if (duplicate && duplicate.status === 'READY') {
      return duplicate;
    }

    const source: DocumentSource = {
      id: uuidv4(),
      notebookId,
      userId,
      title: file.originalname,
      originalName: file.originalname,
      type: file.originalname.split('.').pop()?.toUpperCase() || 'UNKNOWN',
      mimeType: file.mimetype,
      extension: file.originalname.split('.').pop()?.toLowerCase(),
      sizeBytes: file.size,
      status: 'UPLOADING',
      chunksExtracted: 0,
      conceptsExtracted: 0,
      authorityScore: 0.8,
      processingDurationMs: 0,
      createdAt: Date.now(),
      uploadedAt: Date.now(),
      checksum
    };

    await sourceRepository.createSource(source);
    await notebookService.addTimelineEvent(notebookId, 'DOCUMENT_UPLOADED', `Uploaded ${source.title}`);

    // Run processing in background
    this.processFileBackground(source, file).catch(err => console.error('Processing error:', err));

    return source;
  }

  private async processFileBackground(source: DocumentSource, file: Express.Multer.File) {
    const startTime = Date.now();
    try {
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'PROCESSING' });
      // 0. Upload to Storage
      if (env.FIREBASE_STORAGE_BUCKET) {
        const bucket = firebaseApp.storage().bucket(env.FIREBASE_STORAGE_BUCKET);
        const storagePath = `users/${source.userId}/uploads/${source.notebookId}/original/${file.originalname}`;
        const fileRef = bucket.file(storagePath);
        await fileRef.save(file.buffer, { contentType: file.mimetype });
        const gcsPath = `gs://${env.FIREBASE_STORAGE_BUCKET}/${storagePath}`;
        await sourceRepository.updateSource(source.notebookId, source.id, { gcsPath, storagePath });
      }

      // 1. Extraction
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'EXTRACTING' });
      const base64 = file.buffer.toString('base64');
      const pages = await FileParserService.extractText(base64, file.mimetype, file.originalname);
      
      // Full document text — concepts are extracted across the ENTIRE document (windowed),
      // not just the first few pages, so the knowledge graph covers the whole chapter.
      const fullText = pages.map(p => p.text).join('\n');
      const textForMetadata = pages.slice(0, 5).map(p => p.text).join('\n'); // asset generation only

      // Extract metadata + concepts across the whole document
      const metadata = await this.extractRichMetadata(fullText, { notebookId: source.notebookId, userId: source.userId });

      // 2. Chunking
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'CHUNKING' });
      // Increased chunk size from 800 to 2000 chars to minimize token overhead from overlaps
      const chunks = TextChunker.chunkPages(pages, 2000, 200);

      // 3. Embedding & Incremental Indexing
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'EMBEDDING' });
      const embeddingProvider = new GoogleEmbeddingProvider();
      
      // Batch embedding and upload incrementally to avoid rate limits and serverless timeouts
      let chunksProcessed = 0;
      const batchSize = 50;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batchChunks = chunks.slice(i, i + batchSize);
        const embeddings = await embeddingProvider.generateEmbeddings(batchChunks.map(c => c.text), source.userId);
        
        const batchVectors = [];
        for (let j = 0; j < embeddings.length; j++) {
          const pineconeMetadata: RecordMetadata = {
            userId: source.userId,
            notebookId: source.notebookId,
            sourceId: source.id,
            sourceTitle: source.title,
            chapter: source.title,
            text: batchChunks[j].text,
            pageNumber: batchChunks[j].pageNumber,
            paragraphIndex: batchChunks[j].paragraphIndex,
            chunkIndex: i + j,
            createdAt: source.createdAt,
            // Enriched metadata so retrieval's freshness + tag weighting can actually engage.
            uploadedAt: new Date(source.createdAt).toISOString(),
            difficulty: metadata.difficultyLevel || 'Medium',
            tags: (metadata.keywords || []).slice(0, 10)
          };
          batchVectors.push({
            id: `${source.id}_chunk_${i + j}`,
            values: embeddings[j],
            metadata: pineconeMetadata
          });
        }

        // Upsert this batch immediately to the SHARED retrieval namespace.
        // This ensures if the background process times out on large textbooks,
        // we don't lose the vectors that were already embedded.
        await pineconeService.upsertVectors(batchVectors, env.PINECONE_NAMESPACE);
        chunksProcessed += batchVectors.length;
        
        // Update incremental progress
        await sourceRepository.updateSource(source.notebookId, source.id, { 
          chunksExtracted: chunksProcessed,
          status: 'INDEXING' 
        });
      }

      // 4.5 Generate Knowledge Graph Nodes
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'GENERATING_GRAPH' });
      // Build + link the knowledge graph from the extracted metadata (shared with the backfill path).
      await this.buildGraphFromMetadata(source, metadata);
      
      // 5. Auto Generate Assets
      await sourceRepository.updateSource(source.notebookId, source.id, { status: 'GENERATING_GRAPH' });
      await this.autoGenerateAssets(source, textForMetadata);

      // 6. Completion
      const duration = Date.now() - startTime;
      await sourceRepository.updateSource(source.notebookId, source.id, { 
        status: 'READY',
        chunksExtracted: chunks.length,
        conceptsExtracted: metadata.definitions.length + metadata.importantFacts.length,
        metadata: metadata,
        processingDurationMs: duration,
        summaryStatus: 'COMPLETED',
        flashcardStatus: 'COMPLETED',
        quizStatus: 'COMPLETED',
        knowledgeGraphStatus: 'COMPLETED'
      });
      
      await notebookService.addTimelineEvent(source.notebookId, 'DOCUMENT_INDEXED', `Successfully indexed ${source.title} (${chunks.length} chunks)`);

    } catch (error: any) {
      console.error(`Failed to process source ${source.id}:`, error);
      try {
        await sourceRepository.updateSource(source.notebookId, source.id, { status: 'FAILED' });
      } catch (updateError) {
        // Ignore errors if the document was already deleted
      }
    }
  }

  /**
   * Extracts structured learning metadata + concepts from the ENTIRE document by scanning it
   * in windows and merging the results. Previously only the first ~10k chars were scanned, so
   * the vast majority of a chapter never contributed concepts to the knowledge graph.
   */
  private async extractRichMetadata(fullText: string, ctx?: { notebookId?: string; userId?: string }): Promise<ExtractionMetadata> {
    const WINDOW_CHARS = 18000; // larger windows => fewer extraction calls (less token overhead)
    // Reduce default max windows from 8 to 3 to drastically save LLM tokens on huge documents
    const MAX_WINDOWS = Math.max(1, parseInt(process.env.KG_MAX_EXTRACTION_WINDOWS || '3', 10) || 3); 
    const clean = (fullText || '').trim();
    if (!clean) return this.emptyMetadata();

    const windows: string[] = [];
    for (let i = 0; i < clean.length && windows.length < MAX_WINDOWS; i += WINDOW_CHARS) {
      windows.push(clean.slice(i, i + WINDOW_CHARS));
    }

    const partials: ExtractionMetadata[] = [];
    for (const w of windows) {
      try {
        partials.push(await this.extractConceptsFromText(w, ctx));
      } catch (e) {
        console.error('[Extraction] window failed:', e);
      }
    }
    return partials.length > 0 ? this.mergeMetadata(partials) : this.emptyMetadata();
  }

  private emptyMetadata(): ExtractionMetadata {
    return {
      chapters: [], headings: [], definitions: [], theorems: [], formulae: [],
      importantFacts: [], keywords: [], people: [], places: [], dates: [], learningObjectives: [],
      difficultyLevel: 'Medium', estimatedStudyTimeMinutes: 30
    };
  }

  /** Merges per-window extraction results, deduplicating concepts across the whole document. */
  private mergeMetadata(parts: ExtractionMetadata[]): ExtractionMetadata {
    const uniq = (arrays: (string[] | undefined)[]): string[] => {
      const seen = new Map<string, string>();
      for (const arr of arrays) for (const s of arr || []) {
        const v = (s || '').trim();
        if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
      }
      return Array.from(seen.values());
    };
    const defMap = new Map<string, { term: string; definition: string }>();
    for (const p of parts) for (const d of p.definitions || []) {
      const term = (d?.term || '').trim();
      if (!term) continue;
      const key = term.toLowerCase();
      const prev = defMap.get(key);
      if (!prev || (d.definition?.length || 0) > (prev.definition?.length || 0)) {
        defMap.set(key, { term, definition: d.definition || '' });
      }
    }
    const rank: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };
    const difficultyLevel = (parts
      .map(p => p.difficultyLevel)
      .filter(Boolean)
      .sort((a, b) => (rank[b] || 2) - (rank[a] || 2))[0] || 'Medium') as ExtractionMetadata['difficultyLevel'];

    return {
      chapters: uniq(parts.map(p => p.chapters)),
      headings: uniq(parts.map(p => p.headings)),
      definitions: Array.from(defMap.values()),
      theorems: uniq(parts.map(p => p.theorems)),
      formulae: uniq(parts.map(p => p.formulae)),
      importantFacts: uniq(parts.map(p => p.importantFacts)),
      keywords: uniq(parts.map(p => p.keywords)),
      people: uniq(parts.map(p => p.people)),
      places: uniq(parts.map(p => p.places)),
      dates: uniq(parts.map(p => p.dates)),
      learningObjectives: uniq(parts.map(p => p.learningObjectives)),
      difficultyLevel,
      estimatedStudyTimeMinutes: Math.max(0, ...parts.map(p => p.estimatedStudyTimeMinutes || 0)) || 30
    };
  }

  /**
   * Merges freshly extracted nodes with any pre-existing nodes of the same id, so a concept
   * recurring across chapters accumulates its source documents and gains importance instead of
   * the latest document silently overwriting the earlier one.
   */
  private async mergeWithExistingNodes(
    notebookId: string,
    newNodes: import('../types').KGNode[]
  ): Promise<import('../types').KGNode[]> {
    try {
      const { notebookRepository } = await import('../repositories/notebook.repository');
      const existing = await notebookRepository.getKGNodes(notebookId);
      const byId = new Map(existing.map(n => [n.id, n]));
      return newNodes.map(n => {
        const prev = byId.get(n.id);
        if (!prev) return n;
        const sourceDocIds = Array.from(new Set([...(prev.sourceDocIds || []), ...(n.sourceDocIds || [])]));
        const definition = (n.definition?.length || 0) > (prev.definition?.length || 0) ? n.definition : prev.definition;
        const importance = Math.min(1, Math.max(prev.importance || 0, n.importance || 0) + 0.1 * (sourceDocIds.length - 1));
        return { ...prev, ...n, sourceDocIds, definition, importance, masteryPercentage: prev.masteryPercentage ?? 0 };
      });
    } catch (e) {
      console.error('[Ingestion] mergeWithExistingNodes failed; saving new nodes as-is:', e);
      return newNodes;
    }
  }

  private async extractConceptsFromText(textSample: string, ctx?: { notebookId?: string; userId?: string }): Promise<ExtractionMetadata> {
    const ai = new GeminiProvider();
    
    const prompt = `Extract structured learning metadata from the following text. 
    Respond ONLY in valid JSON matching this schema:
    {
      "chapters": ["string"],
      "headings": ["string"],
      "definitions": [{"term": "string", "definition": "string"}],
      "theorems": ["string"],
      "formulae": ["string"],
      "importantFacts": ["string"],
      "keywords": ["string"],
      "people": ["string"],
      "places": ["string"],
      "dates": ["string"],
      "learningObjectives": ["string"],
      "difficultyLevel": "Easy" | "Medium" | "Hard",
      "estimatedStudyTimeMinutes": number
    }
    
    TEXT:
    ${textSample}`;

    try {
      const response = await ai.generateResponse([{ role: 'user', content: prompt, timestamp: Date.now() }], "You are a data extraction AI. Output strictly valid JSON without markdown formatting.", { userId: ctx?.userId, notebookId: ctx?.notebookId, operation: 'kg_extraction' });
      // Clean markdown formatting if present
      let jsonStr = response.reply.replace(/```json/g, '').replace(/```/g, '').trim();
      const metadata = JSON.parse(jsonStr);
      return metadata as ExtractionMetadata;
    } catch (e) {
      console.error("Failed to extract metadata:", e);
      // Return empty fallback
      return {
        chapters: [], headings: [], definitions: [], theorems: [], formulae: [], 
        importantFacts: [], keywords: [], people: [], places: [], dates: [], learningObjectives: [],
        difficultyLevel: 'Medium', estimatedStudyTimeMinutes: 30
      };
    }
  }

  /**
   * Generate the rich assets for an ALREADY-ingested chapter — the article Reading Mode shows,
   * the exam questions Exam Mode shows, and the six supporting assets.
   *
   * ─────────────────────────────────────────────────────────────────────────────────────────
   *  WHY THIS EXISTS. It was being called and did not exist. bookLibrary.controller's
   *  `generateChapterAssets` has always run:
   *
   *      sourceService.asyncGenerateAssets(notebookId, sourceId).catch(console.error)
   *
   *  SourceService had `autoGenerateAssets` (private, upload-time, SUMMARY/FLASHCARDS/QUIZ) and
   *  no `asyncGenerateAssets` at all. Calling an undefined method throws a TypeError
   *  synchronously — before any promise exists, so the `.catch` never sees it — and the
   *  controller's try/catch turned it into a 500. POST /generate has therefore been failing and
   *  generating nothing. The chapters that do have articles were seeded by scripts.
   *
   *  services/assetSpecs.ts is the other half of the same gap: 200-odd lines of specs, Zod
   *  schemas and prompts, imported by nothing. It was written for this method. The title
   *  convention proves they were built together — the spec says titleSuffix 'Documentary
   *  Article' and contentKey 'article', and getChapterStatus looks for
   *  `${chapterTitle} - Documentary Article` and reads `content.article`.
   * ─────────────────────────────────────────────────────────────────────────────────────────
   *
   * Text comes from the chunk vectors already in Pinecone — the same reconstruction the
   * knowledge-graph backfill uses — so this never re-downloads or re-parses the PDF.
   *
   * Failure policy: one asset failing must not lose the other seven. Each is attempted
   * independently; the article is the only one whose absence downgrades the result, because it
   * is the only one the reader cannot open without. Everything else missing is READY_DEGRADED
   * at worst, which is what verification.service already treats DOCUMENTARY_ARTICLE as.
   */
  async asyncGenerateAssets(
    notebookId: string,
    sourceId: string,
    opts: { force?: boolean } = {},
  ): Promise<void> {
    const db = firebaseApp.firestore();
    const key = `${notebookId}/${sourceId}`;

    if (GENERATION_IN_FLIGHT.has(key)) {
      console.log(`[asyncGenerateAssets] already running for ${key}; ignoring duplicate request`);
      return;
    }

    const sourceRef = db.collection('notebooks').doc(notebookId).collection('sources').doc(sourceId);
    const snap = await sourceRef.get();
    if (!snap.exists) throw new Error(`Source ${sourceId} not found in notebook ${notebookId}`);

    const source: any = { id: sourceId, ...snap.data() };
    const chapterTitle: string = source.title || 'Chapter';

    // Which of this chapter's assets already exist, by the title convention every spec writes.
    // Without this, a repeat call regenerates all eight and ADDS them — getChapterStatus takes
    // the newest by createdAt, so the old copies are never read again but are never removed
    // either, and every call costs a full set of Gemini requests.
    const existing = new Set<string>();
    const assetsSnap = await db.collection('notebooks').doc(notebookId).collection('assets')
      .where('title', '>=', `${chapterTitle} - `)
      .where('title', '<=', `${chapterTitle} - \uf8ff`)
      .select('title', 'type')
      .get();
    assetsSnap.forEach((d: any) => { const t = d.data()?.type; if (t) existing.add(t); });

    const missing = RICH_ASSET_SPECS.filter((spec) => !existing.has(spec.type));
    // EXAM_QUESTIONS is generated per section, so it is not in RICH_ASSET_SPECS and has to be
    // counted separately here — otherwise a chapter holding all seven one-shot assets but no
    // questions (one generated before that asset existed) returns early and never gets them.
    const needsQuestions = !existing.has('EXAM_QUESTIONS');

    if (!opts.force && missing.length === 0 && !needsQuestions) {
      console.log(`[asyncGenerateAssets] "${chapterTitle}" already has all ${RICH_ASSET_SPECS.length + 1} assets; nothing to do`);
      // The reader polls until it sees a terminal status. If a chapter has every asset but was
      // left mid-pipeline, saying so here is what stops it asking again every 60 seconds.
      if (source.status !== 'READY' && source.status !== 'COMPLETED') {
        await sourceRef.update({ status: 'READY' }).catch(() => { /* advisory */ });
      }
      return;
    }

    // force means "replace", not "add another". Delete this chapter's existing assets for the
    // specs about to run, so a retry converges on one set instead of stacking copies.
    if (opts.force) {
      // EXAM_QUESTIONS is generated per section and is deliberately NOT in RICH_ASSET_SPECS, so
      // it has to be named here. Testing membership of that array alone let a second force run
      // append a second questions asset rather than replace the first.
      const REPLACEABLE = new Set<string>([...RICH_ASSET_SPECS.map((spec) => spec.type), 'EXAM_QUESTIONS']);
      const stale = assetsSnap.docs.filter((d: any) => REPLACEABLE.has(d.data()?.type));
      if (stale.length) {
        const batch = db.batch();
        stale.forEach((d: any) => batch.delete(d.ref));
        await batch.commit().catch((e: any) =>
          console.warn(`[asyncGenerateAssets] could not clear old assets for ${key}:`, e?.message || e));
        console.log(`[asyncGenerateAssets] force: cleared ${stale.length} existing asset(s) for "${chapterTitle}"`);
      }
    }

    const todo = opts.force ? RICH_ASSET_SPECS : missing;
    GENERATION_IN_FLIGHT.add(key);

    const setStatus = (status: string) => sourceRef.update({ status }).catch(() => { /* status is advisory */ });

    try {
      await setStatus('EXTRACTING');
      const fullText = await this.reconstructTextFromChunks(source);
      if (!fullText || fullText.length < 200) {
        await sourceRef.update({
          status: 'FAILED',
          failureReason: 'NO_TEXT',
          errorDetails: `No reconstructable text for "${chapterTitle}" (chunks=${source.chunksExtracted || 0}). Re-index the chapter before generating.`,
        });
        return;
      }

      // Gemini's context is large but not free. The article and the questions both need the whole
      // chapter to be any good, so this trims rather than samples — a windowed excerpt would give
      // Exam Mode questions from only part of the chapter, which is the one thing it must not do.
      const text = fullText.length > 120_000 ? fullText.slice(0, 120_000) : fullText;

      let articleOk = !opts.force && existing.has('DOCUMENTARY_ARTICLE');
      /** Held for the per-section exam-questions pass below, which reads its sections. */
      let articleData: any = null;
      let generated = 0;
      const failures: string[] = [];

      for (const spec of todo) {
        await setStatus(STATUS_FOR_ASSET[spec.type] || 'GENERATING_ARTICLE');
        try {
          const title = `${chapterTitle} - ${spec.titleSuffix}`;

          if (spec.kind === 'prose') {
            // The one call in this pipeline that does not go through callStructuredLLM, and so
            // the only one that was never rate-limited. In the first bulk run that asymmetry
            // showed up exactly where you would predict: REVISION_NOTES — the sole kind:'prose'
            // spec — failed on 15 of the first 41 chapters, while the seven JSON specs sharing
            // the limiter failed once or twice between them. generateResponse retries transient
            // errors internally but nothing was pacing it, so three concurrent workers pushed it
            // into sustained throttling and an empty reply is a hard failure here.
            await geminiLimiter.acquire();
            const ai = new GeminiProvider();
            const res = await ai.generateResponse(
              [{ role: 'user', content: spec.prompt(text), timestamp: Date.now() }],
              undefined,
              { userId: source.userId, notebookId, operation: spec.operation },
            );
            const body = (res.reply || '').trim();
            if (!body) { failures.push(spec.type); continue; }
            await this.writeAsset(notebookId, spec.type, title, body);
          } else {
            const res = await callStructuredLLM<any>({
              prompt: spec.prompt(text),
              model: spec.model,
              validate: zodValidator(spec.schema),
              label: spec.operation,
              context: { userId: source.userId, notebookId, operation: spec.operation },
            });
            if (!res.ok || res.data == null) {
              // Log the reason. This previously discarded res.error, so a JSON spec that failed
              // left no trace of WHY — which made the Hindi article regression undiagnosable
              // from the logs and cost a 19-minute blind re-run to notice.
              console.error(
                `[asyncGenerateAssets] ${spec.type} failed for "${chapterTitle}": ` +
                  `${res.error || 'unknown'} (repaired=${res.repaired} retried=${res.retried})`,
              );
              failures.push(spec.type);
              continue;
            }

            // An empty array is a legitimate answer (a chapter with no formulae) but not worth
            // storing — an absent asset and an empty one read the same to the client, and the
            // absent one does not make the reader render an empty panel.
            if (Array.isArray(res.data) && res.data.length === 0) continue;

            await this.writeAsset(notebookId, spec.type, title, { [spec.contentKey]: res.data });
            if (spec.type === 'DOCUMENTARY_ARTICLE') { articleOk = true; articleData = res.data; }
          }
          generated++;
        } catch (e: any) {
          console.error(`[asyncGenerateAssets] ${spec.type} failed for "${chapterTitle}":`, e?.message || e);
          failures.push(spec.type);
        }
      }

      // ── Exam questions, per section ──────────────────────────────────────────────────
      // Needs the article's sections, so it runs after the loop. If the article already existed
      // and was not regenerated, read it back rather than skipping — a chapter can legitimately
      // have an article and no questions (it was generated before this asset existed).
      const wantQuestions = opts.force || needsQuestions;
      if (wantQuestions) {
        await setStatus('GENERATING_EXAM_MODE');
        if (!articleData) articleData = await this.loadArticle(notebookId, chapterTitle);
        if (articleData) {
          const { count, sectionsFailed } = await this.generateExamQuestions(
            notebookId, chapterTitle, articleData, source.userId,
          );
          if (count > 0) {
            generated++;
            console.log(
              `[asyncGenerateAssets] "${chapterTitle}": ${count} exam questions` +
                (sectionsFailed ? ` (${sectionsFailed} section(s) failed)` : ''),
            );
          } else {
            failures.push('EXAM_QUESTIONS');
          }
        } else {
          // No article means no sections to anchor questions to. Not a failure of this asset so
          // much as a consequence of the article's — which is already recorded above.
          console.warn(`[asyncGenerateAssets] "${chapterTitle}": no article, skipping exam questions`);
        }
      }

      await sourceRef.update({
        status: articleOk ? 'READY' : 'READY_DEGRADED',
        assetsGeneratedAt: Date.now(),
        ...(failures.length ? { assetFailures: failures } : {}),
      });
      // +1 for the per-section questions pass when it ran, which `todo` does not include —
      // without it the first production run logged "8/7 generated".
      const attempted = todo.length + (wantQuestions ? 1 : 0);
      console.log(
        `[asyncGenerateAssets] "${chapterTitle}": ${generated}/${attempted} generated` +
          (opts.force ? ' (forced)' : existing.size ? ` (${existing.size} already present)` : '') +
          (failures.length ? ` — failed: ${failures.join(', ')}` : ''),
      );
    } catch (e: any) {
      console.error(`[asyncGenerateAssets] fatal for "${chapterTitle}":`, e);
      await sourceRef.update({
        status: 'FAILED',
        failureReason: 'GENERATION_ERROR',
        errorDetails: e?.message || String(e),
      }).catch(() => { /* the throw below is the real signal */ });
      throw e;
    } finally {
      // Released on every path, including the throw above — a key left behind would block this
      // chapter from ever generating again for the life of the process.
      GENERATION_IN_FLIGHT.delete(key);
    }
  }

  /**
   * Exam questions, generated one section at a time and merged into a single asset.
   *
   * Runs after the spec loop because it reads the article's sections — which carry the
   * ncertPageRef the source document actually printed. That is the difference between a page
   * anchor a student can trust and one the model inferred from position in a 25-minute chapter.
   *
   * Each section is its own call. A section that fails to parse costs that section's questions;
   * the chapter-wide version lost every question in the chapter to one bad parse.
   */
  private async generateExamQuestions(
    notebookId: string,
    chapterTitle: string,
    article: any,
    userId?: string,
  ): Promise<{ count: number; sectionsFailed: number }> {
    const sections: any[] = Array.isArray(article?.sections) ? article.sections : [];
    if (sections.length === 0) return { count: 0, sectionsFailed: 0 };

    const all: any[] = [];
    let sectionsFailed = 0;

    for (const section of sections) {
      const concepts: any[] = Array.isArray(section?.concepts) ? section.concepts : [];

      // Every page this section cites. The prompt offers these as the only legal anchors and the
      // clamp below enforces it, so a question can always be checked against the PDF.
      const pages = [
        ...new Set(
          [section?.ncertPageRef, ...concepts.map((c) => c?.ncertPageRef)]
            .map((n) => Number(n))
            .filter((n) => Number.isFinite(n) && n > 0),
        ),
      ].sort((a, b) => a - b);

      const text = [
        section?.intro || '',
        ...concepts.map((c) =>
          [c?.heading || '', ...(Array.isArray(c?.body) ? c.body : []), ...(Array.isArray(c?.bulletList) ? c.bulletList : [])]
            .filter(Boolean)
            .join('\n'),
        ),
      ].filter(Boolean).join('\n\n').trim();

      // A section that is only a heading has nothing to ask about.
      if (text.length < 200) continue;

      const ctx: ExamSectionContext = {
        title: section?.title || 'Section',
        pageRef: pages[0] || 1,
        pages,
        text,
      };

      try {
        const res = await callStructuredLLM<any>({
          prompt: examQuestionsPrompt(ctx, chapterTitle),
          model: 'gemini-2.5-flash',
          validate: zodValidator(ExamQuestionSet),
          label: 'asset_exam_questions_section',
          context: { userId, notebookId, operation: 'asset_exam_questions' },
        });

        if (!res.ok || !Array.isArray(res.data)) { sectionsFailed++; continue; }

        for (const q of res.data) {
          // Enforce the anchor rather than trusting it. The model is told which pages are legal
          // and mostly complies, but a question filed under a page it cannot be answered from
          // sends the reader to the wrong place in the PDF — worse than no anchor at all.
          const page = Number(q?.ncertPageRef);
          const anchored = pages.includes(page) ? page : ctx.pageRef;
          all.push({
            ...q,
            ncertPageRef: anchored,
            // Ids come back as "q-1" from every section, so they collide once merged. React keys
            // and the reveal/answer state in ExamMode are both keyed on this.
            id: `${section?.id || 'sec'}-${q?.id || Math.random().toString(36).slice(2, 7)}`,
          });
        }
      } catch (e: any) {
        console.warn(`[asyncGenerateAssets] exam questions failed for section "${section?.title}":`, e?.message || e);
        sectionsFailed++;
      }
    }

    if (all.length === 0) return { count: 0, sectionsFailed };

    all.sort((a, b) => a.ncertPageRef - b.ncertPageRef);
    await this.writeAsset(notebookId, 'EXAM_QUESTIONS', `${chapterTitle} - Exam Questions`, { questions: all });
    return { count: all.length, sectionsFailed };
  }

  /** Read this chapter's stored article back, for a run that did not regenerate it. */
  private async loadArticle(notebookId: string, chapterTitle: string): Promise<any | null> {
    const snap = await firebaseApp.firestore()
      .collection('notebooks').doc(notebookId).collection('assets')
      .where('type', '==', 'DOCUMENTARY_ARTICLE')
      .where('title', '==', `${chapterTitle} - Documentary Article`)
      .orderBy('createdAt', 'desc')
      .limit(1)
      .get();
    if (snap.empty) return null;
    return snap.docs[0].data()?.content?.article ?? null;
  }

  /** One asset document, in the shape the assets subcollection has always used. */
  private async writeAsset(notebookId: string, type: string, title: string, content: any): Promise<void> {
    await firebaseApp.firestore()
      .collection('notebooks').doc(notebookId).collection('assets')
      .add({ notebookId, type, title, content, createdAt: Date.now() });
  }

  /**
   * Rebuild a source's text from its indexed chunk vectors, so generation never re-downloads or
   * re-parses the original PDF. Same approach as scripts/backfill_knowledge_graph.ts.
   */
  private async reconstructTextFromChunks(source: any): Promise<string> {
    const chunkCount: number = source.chunksExtracted || 0;
    if (chunkCount <= 0) return '';

    // Metadata only. This reads every chunk of the chapter, and a bulk generation run does it
    // for hundreds of chapters; pulling the 768-float vector alongside text nobody here looks at
    // is what drained the monthly Pinecone egress budget.
    const recs = await pineconeService.fetchChunkMetadata(source.id, chunkCount, env.PINECONE_NAMESPACE);

    const collected: { idx: number; text: string }[] = [];
    for (const rec of recs) {
      const md: any = rec?.metadata || {};
      const text = typeof md.text === 'string' ? md.text : '';
      if (!text) continue;
      const idx = typeof md.chunkIndex === 'number' ? md.chunkIndex : collected.length;
      collected.push({ idx, text });
    }

    // Say so when the chapter comes back short. Empty text here surfaces downstream as a
    // generation failure with no obvious cause, and this path now selects chunks by metadata
    // filter rather than by id — so a chapter indexed without `sourceId` or `chunkIndex` in its
    // metadata would silently retrieve nothing at all.
    if (collected.length < chunkCount) {
      console.warn(
        `[reconstructTextFromChunks] "${source.title}": got ${collected.length}/${chunkCount} chunks` +
        `${collected.length === 0 ? ' — check that its vectors carry sourceId and chunkIndex metadata' : ''}`
      );
    }
    // Chunks come back in fetch order, not document order; the reader's page anchors depend on
    // the article seeing the chapter in sequence, so sort before joining.
    collected.sort((a, b) => a.idx - b.idx);
    return collected.map((c) => c.text).join('\n');
  }

  private async autoGenerateAssets(source: DocumentSource, textSample: string) {
    const ai = new GeminiProvider();
    
    // Summary
    try {
      const summaryPrompt = `Write a comprehensive 3-paragraph summary of this text:\n\n${textSample}`;
      const summaryResponse = await ai.generateResponse([{ role: 'user', content: summaryPrompt, timestamp: Date.now() }], undefined, { userId: source.userId, notebookId: source.notebookId, operation: 'asset_summary' });
      await firebaseApp.firestore().collection('notebooks').doc(source.notebookId).collection('assets').add({
        notebookId: source.notebookId,
        type: 'SUMMARY',
        title: `${source.title} - Summary`,
        content: summaryResponse.reply,
        createdAt: Date.now()
      });
    } catch(e) { console.error('Failed to generate summary', e); }

    // Flashcards
    try {
      const flashcardPrompt = `Generate 5 key flashcards from this text. Output ONLY valid JSON: [{"front": "Question?", "back": "Answer"}]\n\n${textSample}`;
      const fcResponse = await ai.generateResponse([{ role: 'user', content: flashcardPrompt, timestamp: Date.now() }], "You are a JSON generator. Output strictly valid JSON.", { userId: source.userId, notebookId: source.notebookId, operation: 'asset_flashcards' });
      const jsonStr = fcResponse.reply.replace(/```json/g, '').replace(/```/g, '').trim();
      const flashcards = JSON.parse(jsonStr);
      await firebaseApp.firestore().collection('notebooks').doc(source.notebookId).collection('assets').add({
        notebookId: source.notebookId,
        type: 'FLASHCARDS',
        title: `${source.title} - Key Flashcards`,
        content: { cards: flashcards },
        createdAt: Date.now()
      });
    } catch(e) { console.error('Failed to generate flashcards', e); }
    
    // Quiz
    try {
      const quizPrompt = `Generate a 3-question multiple choice quiz from this text. Output ONLY valid JSON: [{"question": "Q?", "options": ["A","B","C","D"], "correctAnswer": "A", "explanation": "Why"}]\n\n${textSample}`;
      const qzResponse = await ai.generateResponse([{ role: 'user', content: quizPrompt, timestamp: Date.now() }], "You are a JSON generator. Output strictly valid JSON.", { userId: source.userId, notebookId: source.notebookId, operation: 'asset_quiz' });
      const jsonStr = qzResponse.reply.replace(/```json/g, '').replace(/```/g, '').trim();
      const quiz = JSON.parse(jsonStr);
      await firebaseApp.firestore().collection('notebooks').doc(source.notebookId).collection('assets').add({
        notebookId: source.notebookId,
        type: 'QUIZ',
        title: `${source.title} - Quick Quiz`,
        content: { questions: quiz },
        createdAt: Date.now()
      });
    } catch(e) { console.error('Failed to generate quiz', e); }
  }

  /**
   * Builds knowledge-graph nodes from extracted metadata, merges them with any pre-existing
   * nodes (accumulating sources + importance), saves them, and links relationships. Shared by
   * live ingestion (processFileBackground) and the backfill script so both use identical logic.
   * Returns the number of unique concepts produced.
   */
  private async buildGraphFromMetadata(source: DocumentSource, metadata: ExtractionMetadata): Promise<number> {
    const nodes: import('../types').KGNode[] = [];
    const difficulty = metadata.difficultyLevel || 'Medium';
    const studyTime = metadata.estimatedStudyTimeMinutes || 10;
    const addNode = (label: string, type: import('../types').KGNode['type'], def: string, importance: number) => {
      if (!label || !label.trim()) return;
      const clean = label.trim();
      nodes.push({
        id: `${source.notebookId}_${type}_${clean.toLowerCase().replace(/[^a-z0-9]/g, '_')}`,
        notebookId: source.notebookId,
        label: clean,
        type,
        definition: def,
        sourceDocIds: [source.id],
        importance,
        difficulty,
        estimatedStudyTime: studyTime,
        masteryPercentage: 0
      });
    };

    // Importance reflects salience: defined terms / formulae / theorems outrank loose keywords.
    metadata.definitions?.forEach(d => addNode(d.term, 'CONCEPT', d.definition, 0.75));
    metadata.formulae?.forEach(f => addNode(f, 'FORMULA', `Formula: ${f}`, 0.7));
    metadata.theorems?.forEach(t => addNode(t, 'CONCEPT', `Theorem/principle: ${t}`, 0.65));
    metadata.people?.forEach(p => addNode(p, 'PERSON', `Notable person referenced in ${source.title}`, 0.5));
    metadata.places?.forEach(p => addNode(p, 'PLACE', `Notable place referenced in ${source.title}`, 0.5));
    metadata.keywords?.forEach(k => addNode(k, 'CONCEPT', 'Key term from the material', 0.4));

    if (nodes.length === 0) return 0;

    // Deduplicate within this document by id, keeping the most informative definition.
    const uniqueNodes = Array.from(
      nodes.reduce((map, n) => {
        const existing = map.get(n.id);
        if (!existing || (n.definition?.length || 0) > (existing.definition?.length || 0)) map.set(n.id, n);
        return map;
      }, new Map<string, import('../types').KGNode>()).values()
    );

    // Merge with pre-existing nodes so concepts recurring across chapters accumulate their
    // source documents + importance instead of overwriting each other.
    const nodesToSave = await this.mergeWithExistingNodes(source.notebookId, uniqueNodes);

    const { notebookRepository } = await import('../repositories/notebook.repository');
    await notebookRepository.addKGNodes(source.notebookId, nodesToSave);
    await notebookService.addTimelineEvent(source.notebookId, 'GRAPH_BUILT', `Added ${uniqueNodes.length} concepts to the Knowledge Graph`);

    // Trigger relationship linking (intra-document + cross-chapter).
    await this.linkGraphConcepts(source.notebookId, uniqueNodes, source.userId).catch(err => {
      console.error('[Ingestion] Failed to link concepts:', err);
    });
    return uniqueNodes.length;
  }

  /**
   * Re-runs full-document concept extraction + relationship linking for an ALREADY-ingested
   * document, using text reconstructed from its existing chunks (no re-download / re-embed).
   * Used by the knowledge-graph backfill script to upgrade existing curriculum in place.
   */
  async rebuildGraphFromText(source: DocumentSource, fullText: string): Promise<number> {
    const metadata = await this.extractRichMetadata(fullText, { notebookId: source.notebookId, userId: source.userId });
    return this.buildGraphFromMetadata(source, metadata);
  }

  async linkGraphConcepts(notebookId: string, newNodes: import('../types').KGNode[], userId?: string): Promise<void> {
    if (newNodes.length === 0) return;

    try {
      console.log(`[ConceptLinker] Starting connection analysis for ${newNodes.length} new nodes in notebook ${notebookId}...`);
      
      const { notebookRepository } = await import('../repositories/notebook.repository');
      const allNodes = await notebookRepository.getKGNodes(notebookId);
      
      const newIds = new Set(newNodes.map(n => n.id));
      const preExistingNodes = allNodes.filter(n => !newIds.has(n.id));

      // NOTE: we no longer bail out when there are no pre-existing nodes. The new concepts are
      // linked to EACH OTHER (intra-document), so a notebook's very first document also gets edges.

      // Relevance-select existing nodes (by label-token overlap) instead of an arbitrary slice,
      // then include the OTHER new nodes so new-to-new relationships are discovered too.
      const relevantExisting = this.selectRelevantNodes(newNodes, preExistingNodes, 120);
      const pool = Array.from(new Map([...newNodes, ...relevantExisting].map(n => [n.id, n])).values());
      if (pool.length < 2) return;
      // New nodes sit at the front of the pool (dedup preserves order); count them.
      let newCount = 0;
      while (newCount < pool.length && newIds.has(pool[newCount].id)) newCount++;
      const ai = new GeminiProvider();

      // TOKEN-EFFICIENT LINKING: reference concepts by short numeric INDEX (not their long ids),
      // with 1-char relationship codes and short keys. This avoids echoing long ids twice per edge
      // in the model output, cutting the linking response size dramatically with no loss of meaning.
      const catalog = pool.map((n, i) => `${i}:${n.label} [${n.type}]`).join('\n');
      const prompt = `You map relationships between study concepts. Concepts (index:label [type]):
${catalog}

Concepts 0..${newCount - 1} are NEWLY ADDED. Find relationships FROM each new concept to any concept in the list (0..${pool.length - 1}).
Codes: P=prerequisite-of, R=related-to, PART=part-of, O=opposite-of.
Rules: reference concepts by index number only; never relate a concept to itself; include only confident links; return at most 3 of the STRONGEST relationships per new concept (do NOT exhaustively connect everything — this keeps the output small).
Output ONLY a raw JSON array (no markdown/prose): [{"s":<srcIndex>,"t":<tgtIndex>,"r":"P|R|PART|O","c":<0-1>}]`;

      const response = await withRetry(
        () => ai.generateResponse(
          [{ role: 'user', content: prompt, timestamp: Date.now() }],
          "You are a strict JSON data connector AI. Output strictly valid JSON arrays without markdown formatting.",
          { userId, notebookId, operation: 'kg_linking' }
        ),
        { retries: 4, label: 'conceptLinker.generate' }
      );

      let jsonStr = response.reply.replace(/```json/g, '').replace(/```/g, '').trim();
      let relations: any[] = [];
      try {
        relations = JSON.parse(jsonStr);
      } catch {
        // The array may be truncated (very large output). Salvage complete objects up to the
        // last full '}' so we still capture most edges instead of discarding the whole response.
        const lastObj = jsonStr.lastIndexOf('}');
        if (lastObj > 0) {
          try { relations = JSON.parse(jsonStr.slice(0, lastObj + 1) + ']'); } catch { /* give up */ }
        }
        if (!Array.isArray(relations) || relations.length === 0) {
          console.warn('[ConceptLinker] Could not parse relationship JSON (even after salvage).');
          return;
        }
        console.warn(`[ConceptLinker] Salvaged ${relations.length} relationships from truncated JSON.`);
      }
      if (!Array.isArray(relations) || relations.length === 0) {
        console.log('[ConceptLinker] No connections identified by the AI.');
        return;
      }

      console.log(`[ConceptLinker] Identified ${relations.length} relationships. Saving edges...`);

      const CODE_TO_TYPE: Record<string, import('../types').KGEdge['relationshipType']> = {
        P: 'PREREQUISITE_OF', R: 'RELATED_TO', PART: 'PART_OF', O: 'OPPOSITE_OF',
      };
      const edges: import('../types').KGEdge[] = [];
      const nodesToUpdateMap = new Map<string, import('../types').KGNode>();

      for (const rel of relations) {
        const si = typeof rel.s === 'number' ? rel.s : parseInt(rel.s, 10);
        const ti = typeof rel.t === 'number' ? rel.t : parseInt(rel.t, 10);
        if (!Number.isInteger(si) || !Number.isInteger(ti) || si === ti) continue; // valid + no self-loop
        const sourceNode = pool[si];
        const targetNode = pool[ti];
        if (!sourceNode || !targetNode) continue;
        const relType = CODE_TO_TYPE[rel.r];
        if (!relType) continue;
        const confidence = typeof rel.c === 'number' ? rel.c : 0.8;
        if (confidence < 0.6) continue; // keep only reasonably confident links
        const edgeId = `edge_${sourceNode.id}_${targetNode.id}_${relType}`;
        if (edges.some(e => e.id === edgeId)) continue; // dedupe by (source,target,type)
        edges.push({ id: edgeId, sourceNodeId: sourceNode.id, targetNodeId: targetNode.id, relationshipType: relType, confidence });

        if (relType === 'PREREQUISITE_OF') {
          const tgt = nodesToUpdateMap.get(targetNode.id) || targetNode;
          const currentPrereqs = tgt.prerequisites || [];
          if (!currentPrereqs.includes(sourceNode.id)) {
            nodesToUpdateMap.set(targetNode.id, { ...tgt, prerequisites: [...currentPrereqs, sourceNode.id] });
          }
        }
      }

      if (edges.length > 0) {
        await notebookRepository.addKGEdges(notebookId, edges);
        console.log(`[ConceptLinker] Saved ${edges.length} edges successfully.`);

        const nodesToUpdate = Array.from(nodesToUpdateMap.values());
        if (nodesToUpdate.length > 0) {
          console.log(`[ConceptLinker] Updating prerequisites for ${nodesToUpdate.length} target nodes...`);
          await notebookRepository.addKGNodes(notebookId, nodesToUpdate);
        }
      }
    } catch (err: any) {
      console.error('[ConceptLinker] Error linking graph concepts:', err?.message || err);
    }
  }

  /**
   * Ranks candidate nodes by label-token overlap with the new nodes (plus a small importance
   * boost) and returns the top `limit`. Cheap, deterministic relevance selection so cross-chapter
   * links are discovered without embedding every existing node on each ingestion.
   */
  private selectRelevantNodes(
    newNodes: import('../types').KGNode[],
    pool: import('../types').KGNode[],
    limit: number
  ): import('../types').KGNode[] {
    if (pool.length <= limit) return pool;
    const stop = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'which', 'their', 'into', 'some', 'type', 'types', 'concept', 'formula', 'theorem']);
    const tokenize = (s: string) => (s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length >= 4 && !stop.has(w));
    const newTokens = new Set<string>();
    for (const n of newNodes) for (const t of tokenize(n.label)) newTokens.add(t);
    const scored = pool.map(n => {
      let score = 0;
      for (const t of tokenize(n.label)) if (newTokens.has(t)) score++;
      return { n, score: score + (n.importance || 0) * 0.5 };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map(s => s.n);
  }

  async deleteSource(notebookId: string, sourceId: string, userId: string): Promise<void> {
    await notebookService.getNotebookById(notebookId, userId);
    await sourceRepository.deleteSource(notebookId, sourceId);
    // Also delete from Pinecone
    // Note: pineconeService.deleteVectors doesn't easily support deleting by metadata filter in the free tier
    // So we might need to store chunk IDs or just accept they are orphaned for now if we can't delete them.
    // Let's assume we can't easily delete by metadata in this basic wrapper.
  }
}

export const sourceService = new SourceService();
