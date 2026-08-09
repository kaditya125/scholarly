/**
 * Phase 9 Verification Test Script:
 * Document Versioning & Content Lineage Subsystem
 *
 * Verifies:
 * 1. Progression: Document -> Version 1 -> Version 2 -> Version 3
 * 2. Independent tracking of: documentVersionId, processingVersion, embeddingModel, embeddingVersion
 * 3. Vector isolation & deterministic ID scoping (Zero vector mixing across versions)
 * 4. Document version diff computation (chunk deltas, token deltas, content modifications)
 * 5. Complete 4-Level Traceability (Artifact -> Chunk -> Document Version -> Original Source)
 *    for RAG, Magic Chat, Podcasts, Articles, and Quizzes.
 */

import 'dotenv/config';
import { documentVersioningService } from '../core/pipeline/versioning/DocumentVersioningService';
import { contentLineageService } from '../core/pipeline/lineage/ContentLineageService';
import { generateDeterministicVectorId } from '../core/pipeline/idGenerator';
import { SemanticChunk } from '../core/pipeline/types';

async function runPhase9Verification() {
  console.log('================================================================');
  console.log('  PHASE 9: DOCUMENT VERSIONING & CONTENT LINEAGE TEST SUITE     ');
  console.log('================================================================\n');

  const testCollectionId = 'coll_test_phase9';
  const testDocId = 'doc_cbse_thermodynamics_2026';
  const testUserId = 'test_user_p9';

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  [PASS] Test ${totalTests}: ${testName}`);
    } else {
      console.error(`  [FAIL] Test ${totalTests}: ${testName} - ${detail || 'Condition failed'}`);
    }
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 1: Multi-Version Progression & Independent Identifiers
  // --------------------------------------------------------------------------
  console.log('--- TEST SUITE 1: Version Progression (Doc -> V1 -> V2 -> V3) ---');

  const v1 = await documentVersioningService.createVersion({
    userId: testUserId,
    collectionId: testCollectionId,
    sourceId: testDocId,
    versionNumber: 1,
    documentVersionId: 'v1',
    processingVersion: 1,
    embeddingModel: 'text-embedding-004',
    embeddingVersion: 1,
    chunkCount: 15,
    tokenCount: 4500,
    sizeBytes: 102400,
    hash: 'sha256_v1_00001111222233334444555566667777',
    storagePath: 'gs://scholarly-bucket/sources/v1/thermodynamics.pdf',
    changeSummary: 'Initial document upload and pipeline processing',
    isActive: true,
  });

  assert(v1.version === 1 && v1.documentVersionId === 'v1', 'Version 1 created with proper ID and version number');
  assert(v1.processingVersion === 1, 'v1 tracks processingVersion = 1');
  assert(v1.embeddingModel === 'text-embedding-004', 'v1 tracks embeddingModel = text-embedding-004');
  assert(v1.embeddingVersion === 1, 'v1 tracks embeddingVersion = 1');

  // Create Version 2 (Revised document edition)
  const v2 = await documentVersioningService.createVersion({
    userId: testUserId,
    collectionId: testCollectionId,
    sourceId: testDocId,
    versionNumber: 2,
    documentVersionId: 'v2',
    processingVersion: 2,
    embeddingModel: 'text-embedding-004',
    embeddingVersion: 2,
    chunkCount: 18,
    tokenCount: 5200,
    sizeBytes: 118000,
    hash: 'sha256_v2_88889999aaaabbbbccccddddeeeeffff',
    storagePath: 'gs://scholarly-bucket/sources/v2/thermodynamics_revised.pdf',
    changeSummary: 'Added Carnot Engine solved numericals and diagrams',
    isActive: true,
  });

  assert(v2.version === 2 && v2.documentVersionId === 'v2', 'Version 2 created with proper progression');
  assert(v2.processingVersion === 2, 'v2 tracks processingVersion = 2');
  assert(v2.embeddingVersion === 2, 'v2 tracks embeddingVersion = 2');

  // Create Version 3 (Final exam sprint edition)
  const v3 = await documentVersioningService.createVersion({
    userId: testUserId,
    collectionId: testCollectionId,
    sourceId: testDocId,
    versionNumber: 3,
    documentVersionId: 'v3',
    processingVersion: 3,
    embeddingModel: 'text-embedding-004',
    embeddingVersion: 2,
    chunkCount: 20,
    tokenCount: 5900,
    sizeBytes: 125000,
    hash: 'sha256_v3_123456789abcdef0123456789abcdef0',
    storagePath: 'gs://scholarly-bucket/sources/v3/thermodynamics_final.pdf',
    changeSummary: 'Integrated NCERT exemplar questions and formulas',
    isActive: true,
  });

  assert(v3.version === 3 && v3.documentVersionId === 'v3', 'Version 3 created successfully (Doc -> V1 -> V2 -> V3)');

  // --------------------------------------------------------------------------
  // TEST SUITE 2: Vector Isolation Invariant (No Old/New Vector Mixing)
  // --------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 2: Vector Isolation & Deterministic ID Scoping ---');

  const v1_vecId_chunk1 = generateDeterministicVectorId({
    userId: testUserId,
    tenantId: testUserId,
    collectionId: testCollectionId,
    documentId: testDocId,
    documentVersionId: 'v1',
    chunkSequence: 1,
  });

  const v2_vecId_chunk1 = generateDeterministicVectorId({
    userId: testUserId,
    tenantId: testUserId,
    collectionId: testCollectionId,
    documentId: testDocId,
    documentVersionId: 'v2',
    chunkSequence: 1,
  });

  const v3_vecId_chunk1 = generateDeterministicVectorId({
    userId: testUserId,
    tenantId: testUserId,
    collectionId: testCollectionId,
    documentId: testDocId,
    documentVersionId: 'v3',
    chunkSequence: 1,
  });

  assert(v1_vecId_chunk1 !== v2_vecId_chunk1, 'v1 and v2 vector IDs are strictly distinct for chunk sequence 1');
  assert(v2_vecId_chunk1 !== v3_vecId_chunk1, 'v2 and v3 vector IDs are strictly distinct for chunk sequence 1');
  assert(
    v1_vecId_chunk1.includes('_v1_chunk_1'),
    'Deterministic vector ID is scoped to documentVersionId v1'
  );
  assert(
    v2_vecId_chunk1.includes('_v2_chunk_1'),
    'Deterministic vector ID is scoped to documentVersionId v2'
  );

  // --------------------------------------------------------------------------
  // TEST SUITE 3: Version Chunks Storage & Version Diffing
  // --------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 3: Version Chunks & Multi-Version Diffing ---');

  const sampleChunksV1: SemanticChunk[] = [
    {
      chunkId: 'chk_v1_1',
      documentId: testDocId,
      documentVersionId: 'v1',
      collectionId: testCollectionId,
      sequence: 1,
      text: 'First Law of Thermodynamics states that energy cannot be created or destroyed, only transformed: dQ = dU + dW.',
      tokenCount: 22,
      charCount: 110,
      pageNumber: 1,
      pageEnd: 1,
      chapter: 'Thermodynamics',
      section: 'First Law',
      contentType: 'text',
      boundaryStrategy: 'paragraph_boundary',
    },
    {
      chunkId: 'chk_v1_2',
      documentId: testDocId,
      documentVersionId: 'v1',
      collectionId: testCollectionId,
      sequence: 2,
      text: 'An isothermal process occurs at constant temperature where dT = 0 and delta U = 0.',
      tokenCount: 17,
      charCount: 82,
      pageNumber: 2,
      pageEnd: 2,
      chapter: 'Thermodynamics',
      section: 'Processes',
      contentType: 'text',
      boundaryStrategy: 'paragraph_boundary',
    },
  ];

  const sampleChunksV2: SemanticChunk[] = [
    {
      chunkId: 'chk_v2_1',
      documentId: testDocId,
      documentVersionId: 'v2',
      collectionId: testCollectionId,
      sequence: 1,
      text: 'First Law of Thermodynamics: delta Q = delta U + delta W. Sign convention: work done by system is positive.',
      tokenCount: 24,
      charCount: 108,
      pageNumber: 1,
      pageEnd: 1,
      chapter: 'Thermodynamics',
      section: 'First Law (Revised)',
      contentType: 'text',
      boundaryStrategy: 'paragraph_boundary',
    },
    {
      chunkId: 'chk_v2_2',
      documentId: testDocId,
      documentVersionId: 'v2',
      collectionId: testCollectionId,
      sequence: 2,
      text: 'An isothermal process occurs at constant temperature where dT = 0 and delta U = 0.',
      tokenCount: 17,
      charCount: 82,
      pageNumber: 2,
      pageEnd: 2,
      chapter: 'Thermodynamics',
      section: 'Processes',
      contentType: 'text',
      boundaryStrategy: 'paragraph_boundary',
    },
    {
      chunkId: 'chk_v2_3',
      documentId: testDocId,
      documentVersionId: 'v2',
      collectionId: testCollectionId,
      sequence: 3,
      text: 'Carnot Engine efficiency is given by eta = 1 - (T2 / T1) where T1 is source and T2 is sink.',
      tokenCount: 23,
      charCount: 92,
      pageNumber: 3,
      pageEnd: 3,
      chapter: 'Thermodynamics',
      section: 'Carnot Cycle',
      contentType: 'text',
      boundaryStrategy: 'paragraph_boundary',
    },
  ];

  await documentVersioningService.storeVersionChunks(testCollectionId, testDocId, 'v1', sampleChunksV1);
  await documentVersioningService.storeVersionChunks(testCollectionId, testDocId, 'v2', sampleChunksV2);

  const diffResult = await documentVersioningService.diffVersions(testCollectionId, testDocId, 'v1', 'v2');

  assert(diffResult.chunksAddedCount === 1, 'Diff correctly identifies 1 added chunk in v2 (Carnot Engine)');
  assert(diffResult.chunksModifiedCount === 1, 'Diff correctly identifies 1 modified chunk in v2 (First Law)');
  assert(diffResult.tokenDelta === 700, 'Diff correctly computes positive tokenDelta');

  // --------------------------------------------------------------------------
  // TEST SUITE 4: Complete 4-Level Traceability Across AI Consumers
  // --------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 4: 4-Level Lineage (Artifact -> Chunk -> Version -> Source) ---');

  const consumers = [
    { type: 'RAG_CITATION' as const, name: 'Direct RAG Citation' },
    { type: 'MAGIC_CHAT' as const, name: 'Magic Chat Conversational Answer' },
    { type: 'PODCAST' as const, name: 'Podcast Audio Studio Script' },
    { type: 'ARTICLE' as const, name: 'Synthesized Study Article' },
    { type: 'QUIZ' as const, name: 'NCERT Practice Quiz Question' },
  ];

  for (const consumer of consumers) {
    const lineageRecord = await contentLineageService.resolveArtifactLineage({
      artifactId: `art_${consumer.type.toLowerCase()}_99`,
      artifactType: consumer.type,
      title: `${consumer.name} Grounding Trace`,
      consumerContext: `Grounding context for ${consumer.name}`,
      collectionId: testCollectionId,
      documentId: testDocId,
      documentVersionId: 'v2',
      citedChunkIds: ['chk_v2_1', 'chk_v2_3'],
    });

    assert(
      lineageRecord.lineageNodes.length === 2,
      `Resolved 4-level lineage for ${consumer.type} with 2 cited chunks`
    );

    const node1 = lineageRecord.lineageNodes[0];
    assert(
      node1.artifact.artifactType === consumer.type &&
        node1.chunk.chunkId === 'chk_v2_1' &&
        node1.documentVersion.documentVersionId === 'v2' &&
        node1.originalSource.sourceId === testDocId,
      `Complete 4-Level path verified for ${consumer.type}: Artifact (${consumer.type}) -> Chunk (chk_v2_1) -> Version (v2) -> Source (${testDocId})`
    );
  }

  // --------------------------------------------------------------------------
  // TEST SUITE 5: Downstream Provenance Graph Traversal
  // --------------------------------------------------------------------------
  console.log('\n--- TEST SUITE 5: Downstream Provenance Graph Traversal ---');

  const provenanceGraph = await contentLineageService.traceDocumentLineageGraph(
    testCollectionId,
    testDocId,
    'v2'
  );

  assert(provenanceGraph.type === 'source', 'Provenance graph root is source document');
  assert((provenanceGraph.children || []).length > 0, 'Provenance graph contains version children');
  assert(
    (provenanceGraph.children?.[0]?.children || []).length > 0,
    'Provenance graph contains chunk nodes under version'
  );

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`  PHASE 9 TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log(`  SUCCESS RATE: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('ALL PHASE 9 VERSIONING & LINEAGE INVARIANTS SATISFIED!');
    process.exit(0);
  } else {
    throw new Error(`Phase 9 Verification failed: ${totalTests - passedTests} tests failed`);
  }
}

runPhase9Verification().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

