# Content Pipeline Phase 9: Document Versioning & Content Lineage Report

## Executive Summary

Phase 9 establishes an immutable, version-controlled ingestion pipeline and 4-level end-to-end content lineage architecture across Scholarly. Every document update spawns an isolated version lifecycle without cross-version vector pollution, and every downstream AI generation (RAG, Magic Chat, Podcasts, Articles, Quizzes, Flashcards) is bidirectionally traceable to its originating source text.

---

## 1. Multi-Version Lifecycle Architecture

### Version Progression Model
When a document is re-uploaded, edited, or reprocessed:
```
Document (Original Source)
  │
  ├── Version 1 (Initial processing, embeddingModel: text-embedding-004, embeddingVersion: 1)
  ├── Version 2 (Updated diagrams/sections, processingVersion: 2, isActiveVersion: false)
  └── Version 3 (Latest exam exemplar questions, processingVersion: 3, isActiveVersion: true)
```

### Version Record Schema
Each version is persisted under `/notebooks/{collectionId}/sources/{documentId}/versions/{documentVersionId}` with immutable properties:
- **`documentVersionId`**: Deterministic unique version key (e.g. `v1`, `v2`, `v3`).
- **`versionNumber`**: Sequential integer progression (1, 2, 3...).
- **`processingVersion`**: Pipeline execution engine revision.
- **`embeddingModel`**: AI embedding model used (e.g. `text-embedding-004`).
- **`embeddingVersion`**: Vector representation schema revision.
- **`hash`**: SHA-256 content checksum for deduplication and tamper detection.
- **`chunkCount` & `tokenCount`**: Precise chunk and token totals for version diffing.
- **`isActiveVersion`**: Boolean flag indicating which version serves production AI retrievals.

---

## 2. Vector Isolation & Zero Mixing Invariant

### Deterministic Vector ID Scoping
Vectors are never mixed across versions. Vector IDs are constructed deterministically with version namespaces:
$$\text{Vector ID} = \text{hash}(\text{userId} + \text{collectionId} + \text{documentId} + \text{documentVersionId} + \text{chunkSequence})$$

Example Vector IDs:
- **V1 Vector**: `usr_p9_coll_thermo_doc_101_v1_chunk_1`
- **V2 Vector**: `usr_p9_coll_thermo_doc_101_v2_chunk_1`
- **V3 Vector**: `usr_p9_coll_thermo_doc_101_v3_chunk_1`

### Vector Invariant Verification
1. **Zero Vector Mixing**: Query filters restrict results strictly to `documentVersionId == activeVersion`.
2. **Clean Version Purging**: `VectorIndexingService.deleteVersionVectors` and `PineconeService.deleteByFilter` allow atomic removal of old versions without affecting active embeddings.

---

## 3. Document Version Diff Computation

`DocumentVersioningService.diffVersions()` computes structural, token, and content changes between any two arbitrary versions:
- **`chunksAddedCount` & `addedChunkIds`**: Novel chunks introduced in the target version.
- **`chunksRemovedCount` & `removedChunkIds`**: Deprecated chunks omitted from the base version.
- **`chunksModifiedCount` & `modifiedChunkPairs`**: Chunks with matching sequence numbers but altered text/formulas, with visual diff snippets.
- **`tokenDelta` & `sizeDelta`**: Metric shifts across document revisions.

---

## 4. End-to-End 4-Level Content Lineage

Every downstream generation is mapped through a strict 4-level provenance graph:

```
[Level 1: Downstream Artifact]
  (e.g., Magic Chat Turn, Podcast Script Segment, Quiz Question, Deep Article Section)
        │
        ▼
[Level 2: Semantic Chunk]
  (chunkId, sequence, exact text snippet, pageNumber, chapter/section, tokenCount)
        │
        ▼
[Level 3: Document Version]
  (documentVersionId, versionNumber, embeddingModel, embeddingVersion, processingVersion)
        │
        ▼
[Level 4: Original Source]
  (sourceId, sourceName, collectionId, mimeType, storageUri, ingestedAt)
```

### Supported Downstream AI Consumers:
1. **RAG Citations**: `RAG_CITATION` - Direct citation cards with page numbers and exact quotes.
2. **Magic Chat**: `MAGIC_CHAT` - Grounded chat responses linking answers to specific source chunks.
3. **Podcast Studio**: `PODCAST` - Dialogue scripts with audio cue citations back to text chunks.
4. **Deep Articles**: `ARTICLE` - Long-form syntheses with academic references to chunk versions.
5. **Adaptive Quizzes**: `QUIZ` - Question-answer items linking explanations to source textbook sections.

---

## 5. Verification & Test Suite Results

The Phase 9 test suite (`tests/unit/documentVersioningLineage.test.ts`) verified all invariants:

| Test Suite Item | Status | Verified Invariant |
|---|---|---|
| Multi-Version Creation & Identifiers | **PASS** | Independent tracking of `documentVersionId`, `processingVersion`, `embeddingModel`, `embeddingVersion` |
| Version Progression V1 -> V2 -> V3 | **PASS** | Sequential numbering and active version toggling |
| Vector Isolation | **PASS** | Strict deterministic ID isolation across versions |
| Version Diff Calculation | **PASS** | Accurate chunk, token, and size delta calculations |
| RAG Retrieval Lineage Trace | **PASS** | Full 4-level lineage resolution |
| Magic Chat Lineage Trace | **PASS** | Full 4-level lineage resolution |
| Podcast Studio Lineage Trace | **PASS** | Full 4-level lineage resolution |
| Deep Article Lineage Trace | **PASS** | Full 4-level lineage resolution |
| Adaptive Quiz Lineage Trace | **PASS** | Full 4-level lineage resolution |
| Document Lineage Provenance Tree | **PASS** | Hierarchical graph traversal from source root |

---

## Conclusion
Phase 9 is complete and verified. Content versioning and lineage tracking provide auditability, vector cleanliness, and accurate citation traceability across all downstream AI workflows.
