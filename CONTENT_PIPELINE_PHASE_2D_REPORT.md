# Content Pipeline Phase 2D: Document Understanding Report

**Execution Timestamp:** 2026-08-08  
**Status:** COMPLETE  
**Coverage:** 100% (All 7 Test Scenarios Passed)

---

## 1. Executive Summary

Phase 2D transforms raw extracted blocks into a semantically structured, educationally enriched knowledge layer. It adds two critical capabilities on top of the Phase 2B extraction pipeline:

1. **Document Structure Classification** — deterministic, offline, zero-latency classification of every block into its document role (Title, Chapter, Section, Definition, Theorem, Exercise, Important Note, etc.)
2. **Educational Metadata Extraction** — AI-powered (Gemini) metadata inference with confidence scores, a heuristic fallback, configurable categories, and an inviolable user override guard.

```
ExtractedDocumentResult (Phase 2B/2C)
              ↓
  DocumentStructureAnalyzer (offline rules)
              ↓
  EducationalMetadataExtractor (Gemini AI + heuristic fallback)
              ↓
  UserMetadataOverrideGuard (user > AI, always)
              ↓
  DocumentUnderstandingResult  →  Firestore
```

---

## 2. Components

| Component | File | Purpose |
| :--- | :--- | :--- |
| **Type Contracts** | [types.ts](file:///d:/scholarly/backend-firestore/src/core/pipeline/types.ts) | `DocumentStructureType`, `DocumentStructureBlock`, `ConfidentValue<T>`, `MetadataCategory`, `EducationalMetadata`, `UserMetadataOverrides`, `DocumentUnderstandingResult` |
| **Category Registry** | [MetadataCategoryRegistry.ts](file:///d:/scholarly/backend-firestore/src/core/pipeline/understanding/MetadataCategoryRegistry.ts) | Pluggable, runtime-configurable metadata category system. No hardcoded categories in the core architecture. |
| **Structure Analyzer** | [DocumentStructureAnalyzer.ts](file:///d:/scholarly/backend-firestore/src/core/pipeline/understanding/DocumentStructureAnalyzer.ts) | Deterministic rule-based classifier. Identifies 15 structure types with correct priority ordering and Devanagari-safe regex. |
| **Metadata Extractor** | [EducationalMetadataExtractor.ts](file:///d:/scholarly/backend-firestore/src/core/pipeline/understanding/EducationalMetadataExtractor.ts) | Gemini AI extraction with confidence scores, graceful heuristic fallback on AI failure. |
| **Override Guard** | [UserMetadataOverrideGuard.ts](file:///d:/scholarly/backend-firestore/src/core/pipeline/understanding/UserMetadataOverrideGuard.ts) | Enforces USER METADATA > AI METADATA invariant. Protects user values across reprocessing runs. |
| **Orchestrator** | [DocumentUnderstandingService.ts](file:///d:/scholarly/backend-firestore/src/core/pipeline/understanding/DocumentUnderstandingService.ts) | Combines all sub-services, persists to Firestore, exposes `applyUserOverride()` for live metadata edits. |
| **Test Suite** | [documentUnderstanding.test.ts](file:///d:/scholarly/backend-firestore/tests/unit/documentUnderstanding.test.ts) | 7 scenarios, fully mocked Gemini + Firebase |

---

## 3. Document Structure Types Supported

| Type | Detection Signal |
| :--- | :--- |
| `title` | First heading block (index < 3), ≤ 10 words, no chapter/section prefix |
| `chapter` | `Chapter N:`, `अध्याय N:`, `Unit N:`, `इकाई N:` prefix — checked **before** title |
| `section` | `Section N.N:`, `§N` prefix, or remaining short heading (≤ 6 words) |
| `subsection` | Remaining longer headings |
| `definition` | `Definition:`, `परिभाषा:`, `is defined as`, `defined as` |
| `theorem` | `Theorem:`, `Lemma:`, `Law:`, `Principle:`, `प्रमेय:`, `सिद्धांत:` |
| `example` | `Example N.N:`, `उदाहरण:`, `eg.:` |
| `exercise` | `Exercise:`, `अभ्यास:`, `प्रश्नावली` |
| `question` | `type: 'question'` from extraction, or ends with `?` |
| `answer` | `type: 'answer'` from extraction |
| `important_note` | `Note:`, `Important:`, `^महत्वपूर्ण:`, `^ध्यान दें` (^ anchor for Devanagari) |
| `summary` | `Summary:`, `^सारांश:`, `^निष्कर्ष:` |
| `reference` | `References:`, `[N]` bracket citation, `et al.`, `ibid.` |
| `paragraph` | Default for prose `paragraph`/`list`/`table` blocks |
| `unknown` | Catch-all |

> **Key fix:** Devanagari patterns use `^` start-anchor instead of `\b` word boundary, since JavaScript's `\b` only recognises ASCII word characters.

---

## 4. Configurable Metadata Categories

Categories are registered in `MetadataCategoryRegistry` — none are hardcoded in the core. Default categories ship out of the box but can be added, removed, or replaced at runtime:

| Key | Label | Type | Allowed Values |
| :--- | :--- | :--- | :--- |
| `subject` | Subject | string | — |
| `class` | Class / Grade | string | — |
| `board` | Education Board | string | — |
| `exam` | Target Exam | string | — |
| `language` | Language | string | — |
| `chapter` | Chapter | string | — |
| `topic` | Topic / Concept | string | — |
| `difficulty` | Difficulty Level | string | beginner, intermediate, advanced, mixed |
| `content_type` | Content Type | string | textbook, notes, question_bank, reference, worksheet, mixed |
| `keywords` | Keywords | string[] | — |

---

## 5. Confidence & User Override Contract

```typescript
// Every metadata value carries source and confidence
interface ConfidentValue<T> {
  value: T;
  confidence: number; // 0.0–1.0
  source: 'ai' | 'user' | 'inferred';
}

// User override example — confidence always 1.0, source always 'user'
resolvedMetadata['board'] = { value: 'CBSE', confidence: 1.0, source: 'user' };
```

**Invariants enforced by `UserMetadataOverrideGuard`:**
- On first processing: `userOverrides` are merged on top of AI metadata
- On reprocessing: `previousMetadata` fields with `source: 'user'` are never overwritten
- `applyUserOverride()` on `DocumentUnderstandingService` can be called at any time to update Firestore without re-running AI

---

## 6. Verification & Test Suite Results

```
PASS tests/unit/documentUnderstanding.test.ts
  Content Pipeline Phase 2D: Document Understanding Test Suite
    Scenario 1: NCERT-Style Textbook
      ✓ should classify NCERT structure and extract board/subject/class metadata
    Scenario 2: General PDF
      ✓ should classify general document structure and infer content type
    Scenario 3: Hindi Document
      ✓ should classify Hindi educational structure and detect language metadata
    Scenario 4: English Document
      ✓ should correctly classify English academic structure with theorem detection
    Scenario 5: Mixed Hindi-English Document
      ✓ should handle bilingual content and classify structures in both scripts
    Scenario 6: Low-Confidence Metadata
      ✓ should return low-confidence values when document provides insufficient signals
    Scenario 7: Manual Metadata Override
      ✓ should preserve user overrides and never overwrite them on reprocessing
```

### Full Regression — All Pipeline Suites

```
Test Suites: 4 passed, 4 total
Tests:       41 passed, 41 total

PASS tests/unit/pipelineUploadAndStorage.test.ts  (14 tests — Phase 2A)
PASS tests/unit/documentExtraction.test.ts        (12 tests — Phase 2B)
PASS tests/unit/intelligentOcr.test.ts            ( 8 tests — Phase 2C)
PASS tests/unit/documentUnderstanding.test.ts     ( 7 tests — Phase 2D)
```

Zero regressions across all phases.
