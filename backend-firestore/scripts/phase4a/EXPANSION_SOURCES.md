# Banking and railway expansion — source discovery

Findings from the 2026-08-26 discovery pass. Every URL here was reached over verified TLS from the
authority's own domain. Nothing was taken from a coaching site.

## The three shapes an authority's material comes in

Discovery so far has produced three distinct cases, and they need different handling:

| Shape | Example | Ingestable? |
|---|---|---|
| Topic-wise syllabus in a text PDF | SSC, UPSC, BPSC, NTA | Yes — standard pipeline |
| Exam **pattern** only, no syllabus published | IBPS | Yes, as `contentKind: EXAM_PATTERN` |
| Scanned PDF, no text layer | RRB NTPC, BPSC DSP Wireless | **No** — needs OCR |

Assuming shape 1 is what caused the earlier wasted effort. Check which shape a source is before
planning ingestion for it.

## Railways — RRB

**Authoritative host:** `rrb.indianrailways.gov.in` (unified site; all 21 regional boards merged).

Two traps, both confirmed:

- The regional hostnames (`rrbchennai.gov.in`, `rrbcdg.gov.in`, …) still resolve, but their TLS
  certificate covers only `indianrailways.gov.in` and `*.indianrailways.gov.in`. HTTPS to them
  fails hostname verification and must not be bypassed. Use the unified host.
- `www.rrbchennai.gov.in` does not resolve at all; the apex does. This is the fourth authority
  where an apex/www mix-up caused a source to be wrongly written off (after UPSC, JEE, BPSC).

**Document URL pattern:** `https://rrb.indianrailways.gov.in/-/image/{unixMillis}{Filename}.pdf/examsDocuments`

Documents are reachable only after the site's own filters run — select an RRB location, then set
`groupfilter=Notification` for pre-exam documents. The CEN listing alone exposes only post-exam
material (schedules, results, objection trackers).

**CEN → exam mapping confirmed:** `07/2025` = NTPC Undergraduate.

### RRB NTPC — BLOCKED on OCR

`Detailed_CEN_07_2025_NTPC_Under_Graduate_English.pdf` — 4,349,456 bytes, HTTP 200, TLS verified.
Extraction yields **999 characters across 56 pages**: page markers only, no text on any page. It is
a scanned document.

Not a discovery failure and not fixable by another extraction pass. Options, in order of
preference:

1. Look for a text-layer variant — the Hindi edition, or a Graduate-level NTPC CEN.
2. OCR the page images. This is a real capability gap that would also unblock BPSC DSP Wireless
   (WT and WO), so it is worth costing once rather than per-exam.
3. Leave RRB NTPC unregistered until content exists.

**RRB NTPC has deliberately NOT been registered.** Registering it now would recreate exactly the
bad product state this work set out to fix on IBPS PO: an exam a student can select, with nothing
behind it.

### Remaining railway exams

Do not start these until NTPC is unblocked — they will almost certainly share the same scanned-PDF
problem, and confirming that on one exam is cheaper than on five.

| Exam | CEN | Status |
|---|---|---|
| RRB Group D | 09/2025 (listed) | not investigated |
| RRB ALP | — | not investigated |
| RRB JE | — | not investigated |
| RPF Constable / SI | RPF 01/2024, RPF 02/2024 | not investigated |

## Banking — IBPS, SBI, RBI, NABARD

**IBPS authoritative host:** `www.ibps.in`. Serves only its leaf certificate; the
`GlobalSign RSA OV SSL CA 2018` intermediate is added under `src/services/exam/trust/`.

**Confirmed: IBPS publishes no topic-wise syllabus.** The word "syllabus" appears zero times in
140,008 characters of the CRP PO/MT-XVI notification, and the standard pipeline independently
rejected it with `NO_SYLLABUS_CONTENT_IN_DOCUMENT` after pruning three topic-free stages. What
IBPS publishes is section D, "STRUCTURE OF EXAMINATION". That is what is indexed, as
`contentKind: EXAM_PATTERN`, and it must never be presented to a student as a syllabus.

Expect the same for the other IBPS products and probably for SBI.

### Priority and next steps

| Priority | Exam | Expected shape | Source to check first |
|---|---|---|---|
| 2 | SBI PO | pattern only | `sbi.co.in/careers` advertisement PDF |
| 2 | SBI Clerk | pattern only | `sbi.co.in/careers` |
| 2 | IBPS Clerk | pattern only | `ibps.in` CRP Clerical notification |
| 3 | IBPS RRB | pattern only | `ibps.in` CRP RRB notification |
| 3 | RBI Grade B | may have a real syllabus | `rbi.org.in` — RBI publishes detailed Phase II syllabi |
| 3 | NABARD | may have a real syllabus | `nabard.org` |

RBI and NABARD are the interesting ones: unlike IBPS they have historically published actual
subject syllabi, so they may go through the standard pipeline rather than the pattern path.

Reuse `ingest-40-ibps-pattern.ts` as the template for any pattern-only authority. Its two
important properties are that it parses deterministically rather than asking a model to recall an
exam it has memorised, and that it verifies every parsed string against the source before writing
anything.
