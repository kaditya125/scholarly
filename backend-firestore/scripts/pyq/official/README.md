# Official PYQ acquisition

Fetches previous year papers **from the examining body**, proves the bytes, and
emits candidate records for review. Nothing here writes to Firestore or Pinecone.

## Why this exists

Every PYQ currently in `pyq_questions` was typed into a corpus file or emitted by
a template generator. A large share carry `TIER_A_OFFICIAL` with a `sourceUrl`
that was built by string interpolation and never fetched. This directory is the
opposite discipline: start from the URL, hash what comes back, and refuse to
claim official status for anything that cannot be tied to a downloaded file.

## Run it

```
npx tsx scripts/pyq/official/fetch-verify-upsc-prelims.ts          # every configured year
npx tsx scripts/pyq/official/fetch-verify-upsc-prelims.ts 2024     # one year
npx tsx scripts/pyq/official/fetch-verify-upsc-prelims.ts --no-text # PDFs + receipts only
```

Output goes to `out/<paperKey>/` (git-ignored):

| file | what it is |
| --- | --- |
| `*.pdf` | the official question paper, as downloaded |
| `*-answer-key.pdf` | the official final answer key |
| `receipt.json` | URLs, byte counts, SHA-256, timestamp |
| `questions.txt` | question text as fetched from the OCR mirror |
| `candidates.json` | canonical records, ready for review |

## The two gates

**Key hash.** Answer keys are transcribed by hand into `keys/*.json` and pinned
to the SHA-256 of the PDF they were read from — UPSC publishes them as 1-bit
TIFFs with no text layer, and there is no OCR dependency in this repo. If UPSC
republishes the file, the hash stops matching and every answer is withheld.

**Numbering alignment.** The key maps question number to answer, so a parser that
drops a question would attach every subsequent answer to the wrong stem. If the
parsed numbering is not exactly `1..expectedQuestions`, the run keeps the text
and discards all answers. This is not theoretical: the first version of the
parser silently mis-keyed everything after Q73 of the 2024 paper.

Only records that clear **both** gates and parse without defects are marked
`OFFICIAL_CONFIRMED`. Everything else is written `QUARANTINED`.

## Coverage, 6 September 2026

| Year | Paper | Official key | Status |
| --- | --- | --- | --- |
| 2024 | published | published | **100 parsed, 93 confirmed, 3 dropped by UPSC** |
| 2025 | published | not yet | blocked — text keeps, answers withheld |
| 2026 | published | not yet | blocked — no OCR mirror either |

UPSC publishes final keys roughly a year after the cycle closes, and delists
older papers: its previous-papers index currently lists 2024–2026 only. The 2024
key is still served at its original URL despite being delisted, which is why it
is pinned here by hash rather than rediscovered each run.

## Adding a year

1. Add a `PaperSpec` entry with the official paper and key URLs.
2. Run with `--no-text` to download the key and record its SHA-256.
3. Transcribe the key into `keys/`, including that hash.
4. Re-run. Self-checks confirm the `X` count matches the sheet's declared
   dropped count before any answer is used.
