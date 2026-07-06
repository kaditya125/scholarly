# CURRICULUM STATUS REPORT — Scholarly AI (Phase 9)

**Date:** 2026-07-05
**Question:** Is curriculum ingestion actually implemented for SSC CGL, UPSC, Bihar TRE, NEET, JEE, BPSC, and State PCS — with a syllabus hierarchy, ingestion, vector indexing, metadata extraction, and chapter mapping?

## Verdict: **Generic document RAG exists; a structured, exam-specific curriculum system does NOT.**

The platform has a real generic document → RAG pipeline, and document metadata *fields* for exam/board/subject/chapter exist. But there is **no canonical syllabus hierarchy**, **no wired admin curriculum-ingestion endpoint**, and the admin "Curriculum Ingestion" view is **mocked**. Exam "knowledge" lives as **prose in the system prompt**, not as queryable curriculum data.

---

## Capability-by-capability

| Capability | Status | Evidence |
|---|---|---|
| **Syllabus hierarchy** (exam → subject → chapter → topic as data) | ❌ Not implemented | No syllabus/curriculum collection or schema exists. The exam list (SSC/UPSC/JEE/NEET/BPSC/TRE/State PCS…) is **prose** in `config/prompts.ts` (`SCHOLARLY_EXAM_KNOWLEDGE`), consumed by the LLM — not a structured, queryable hierarchy. |
| **Ingestion** | ⚠️ Partial | Real generic ingestion exists in two places: `source.service.processUpload` (USER notebook uploads — fully wired to `POST /notebooks/:id/sources`) and `ingestion.service.ingestDocument` (ADMIN path). **The admin path is NOT wired to any route** — `admin.routes` exposes only `GET /admin/curriculum/jobs`, and `curriculum.controller.getJobs` returns **hardcoded mock jobs** (`job_4829`, `quantum_mechanics_ch1.pdf`; comment: *"we mock the shape to validate the UI"*). The controller instantiates `IngestionService` but never calls it. |
| **Vector indexing** | ✅ Real (exam-agnostic) | `pineconeService.upsertVectors` used by both ingestion paths. Not exam-specific. |
| **Metadata extraction** | ⚠️ Partial | `source.service.extractRichMetadata` (Gemini) extracts `chapters`, `headings`, `definitions`, `formulae`, `people`, `places`, `keywords`, `difficultyLevel` per uploaded document — real. `IngestionService`'s `IngestionMetadata` type also has `exam`, `board`, `class`, `subject`, `syllabusTopic`, `chapter` **fields**, but no flow populates them from a canonical curriculum. |
| **Chapter mapping** | ❌ Not to a canonical curriculum | Extracted "chapters" are free-text strings from the uploaded document; they are **not mapped** to a standard exam syllabus. There is no exam→chapter reference to map against. |

## Per-exam support (SSC CGL, UPSC, TRE, NEET, JEE, BPSC, State PCS)

- **LLM prompt knowledge:** ✅ All are described in `config/prompts.ts` (syllabus/pattern/strategy prose). The chatbot can *talk* about them competently. This is the platform's real strength.
- **Structured curriculum data / seeded content:** ❌ The only seeded data (`seed.ts`) is **BPSC / Bihar TRE-flavored** (RTE/Child-Development questions, a "BPSC TRE 3.0" mock test, Bihar-history discussion) plus a couple of generic items. There is **no** seeded SSC CGL / UPSC / NEET / JEE / State PCS curriculum, question bank, or syllabus tree.
- **Exam-tagged ingestion:** ❌ Not wired — nothing sends `exam`/`syllabusTopic` through the admin ingestion path (which is itself unrouted).

## What this means
"Curriculum ingestion" as a **system** (upload official syllabi/textbooks per exam, map to a hierarchy, track coverage) is **not implemented**. What exists is:
1. A working per-user document RAG (upload → parse → metadata → chunk → embed → Pinecone → KG nodes).
2. An LLM that is prompt-knowledgeable about the exams.
3. A mocked admin curriculum dashboard.

## Recommendations (roadmap, not done here)
1. Wire a real admin ingestion endpoint (`POST /admin/curriculum/ingest`) to `IngestionService.ingestDocument`, and replace `getJobs`' mock with a real jobs collection.
2. Introduce a `curriculum` collection: `exam → subject → chapter → topic`, and map extracted document chapters onto it.
3. Seed canonical syllabi for the target exams (or ingest official PDFs) so retrieval is exam-scoped.
4. Populate the `exam`/`syllabusTopic` metadata on ingestion so `RetrievalService`'s existing exam-relevance weighting (already implemented) actually fires.
