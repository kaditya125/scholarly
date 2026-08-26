/**
 * Blog content.
 *
 * Every technical claim here is true of the code in this repository at the date on the post. That
 * constraint is the whole point: an engineering blog that overstates what a system does is worse
 * than no blog, because it is the page a reader trusts most and checks least. Where something is
 * partial, unfinished or deliberately refused, the post says so — several of these posts are more
 * interesting because of what the system will not do than because of what it will.
 *
 * Numbers that drift (exam counts, vector totals) are written with the date they were true, so a
 * stale figure reads as a dated observation rather than a false present-tense claim.
 */

export interface BlogPost {
  slug: string;
  title: string;
  summary: string;
  /** Reader-facing grouping, used for the filter chips on the index. */
  category: 'Architecture' | 'Retrieval' | 'Voice' | 'Principles';
  date: string;          // ISO
  readingMinutes: number;
  /** GitHub-flavoured markdown. */
  body: string;
}

/* ────────────────────────────────────────────────────────────────────────────────────────── */

const answering: BlogPost = {
  slug: 'how-sadhya-answers-a-syllabus-question',
  title: 'What happens when you ask “what’s in my syllabus?”',
  summary:
    'A step-by-step walk through the retrieval pipeline — from your question to a grounded answer, and why the tutor sometimes says it doesn’t know.',
  category: 'Retrieval',
  date: '2026-08-26',
  readingMinutes: 8,
  body: `
Ask most AI assistants what the SSC CGL quantitative section covers and you will get a fluent,
confident answer assembled from whatever the model absorbed during training. It will usually be
roughly right. "Roughly right" is a poor standard for something a student is planning six months
of study around.

Sadhya answers that question differently. Here is the whole path.

## 1. Your question becomes a vector

Text can't be searched by meaning directly, so the question is converted into a list of 768
numbers — an *embedding* — using Google's \`gemini-embedding\` model. Questions that mean similar
things land near each other in that 768-dimensional space, even when they share no words. "What
maths is on the paper?" and "quantitative aptitude topics" end up close together.

## 2. The search is filtered before it is ranked

This is the part that matters most and gets talked about least.

The vector database holds material for many exams at once. If the search simply looked for
"nearest meaning", a question about SSC CGL could return a UPSC topic that happens to be phrased
similarly — and the answer would be confidently wrong in a way that is very hard to notice.

So the exam is applied as a **hard filter** before any ranking happens. A query tagged
\`SSC_CGL\` can only ever match vectors tagged \`SSC_CGL\`. Nothing from another exam is a
candidate, no matter how similar it reads.

There is a small, unglamorous detail here worth showing, because it caused a real bug:

\`\`\`ts
const canonicalExamId = examId.trim().toUpperCase().replace(/[\\s_-]+/g, '_');
\`\`\`

Exam identifiers arrive in several shapes — \`ssc-cgl\`, \`SSC_CGL\`, \`Ssc Cgl\` — and they must
all collapse to one canonical form before the filter is built. An earlier version of that line
was missing a single backslash. \`ssc-cgl\` and \`SSC_CGL\` still worked, by luck. \`Ssc Cgl\`
silently matched nothing, and the tutor reported that it had no syllabus for an exam it held
perfectly good data for. The regression test for it asserts on the filter Pinecone actually
receives, not on the function's return value, because the return value looked fine the whole time.

## 3. The best matches are re-ranked

Vector similarity is fast and approximate. It is very good at "these are in the right
neighbourhood" and mediocre at "this one is the best".

So the top candidates go through a second, slower model — a **reranker** from Cohere — that reads
the question and each candidate passage together and scores how well they actually answer each
other. Retrieval casts a wide net; reranking picks what to actually use.

## 4. The answer is written only from what was retrieved

The passages that survive are handed to the language model along with your question, and the
instruction is narrow: answer from *these* passages. Each retrieved chunk carries the ancestry it
came from — stage, paper, section, subject, topic — so the model can see that a topic sits under
"Tier-II, Paper-I, Quantitative Abilities" rather than floating free.

## 5. And if nothing comes back?

Then the tutor says so.

\`\`\`json
{
  "found": false,
  "syllabusAvailable": false,
  "reason": "No official syllabus is loaded for this exam. Tell the student you cannot
             confirm the syllabus right now and must not guess.
             Do NOT say the topic is excluded."
}
\`\`\`

That last line is doing real work. There are two very different failure modes, and collapsing
them is dangerous:

- **"This topic is not in your syllabus"** — a claim about the exam.
- **"I don't have your syllabus loaded"** — a claim about us.

A student told the first when the second is true will skip a topic that is genuinely on their
paper. So the response makes the distinction explicit, in the payload, where the model cannot
smooth it over.

## Why the pipeline is shaped this way

Every step above exists to keep one property true: **the answer is traceable to a document a
commission actually published**. Filtering keeps other exams out. Reranking keeps the weakest
matches out. Grounding keeps the model's own memory out. And the "found: false" path keeps
invention out when the honest answer is that we don't know.

A tutor that is right most of the time and quietly wrong the rest is not what anyone needs before
an exam.
`.trim(),
};

/* ────────────────────────────────────────────────────────────────────────────────────────── */

const provenance: BlogPost = {
  slug: 'where-the-syllabus-comes-from',
  title: 'Where the syllabus actually comes from',
  summary:
    'Every syllabus is fetched from the commission’s own website, hashed, archived, and refused publication if any of that is missing. Here is why each of those steps exists.',
  category: 'Retrieval',
  date: '2026-08-26',
  readingMinutes: 9,
  body: `
There are two ways to get an exam syllabus into a product. You can copy one from a coaching site,
or you can fetch the document the commission itself published. The first takes an afternoon. The
second takes weeks and is the only one worth doing, because a syllabus is a claim about someone's
future and it should be checkable.

## Only official domains, checked at every hop

Each exam in the registry carries the domains that are official for it:

\`\`\`
SSC_CGL     officialDomains: ["ssc.gov.in", "ssc.nic.in"]
IBPS_PO     officialDomains: ["ibps.in"]
\`\`\`

The fetcher will not retrieve a document from anywhere else. Redirects are followed **manually**,
one hop at a time, and authority is re-checked at each one — because a redirect that starts on an
official domain and ends somewhere else is exactly how an unofficial document would get in.

## Discovery is different for every authority

There is no standard way Indian examination bodies publish. Each one needed its own approach:

| Authority | How its documents are found |
|---|---|
| SSC | a content API behind the site |
| NTA (JEE, NEET) | link text, because filenames are opaque |
| UPSC | per-exam pages |
| BPSC | a WordPress plugin's \`admin-ajax.php\` endpoint |
| RRB | a unified portal with JS-driven filters |

A recurring trap deserves its own mention. Four separate authorities were written off as
unreachable because of a hostname:

- UPSC — the apex domain works, \`www\` does not
- JEE — \`.ac.in\`, not \`.nic.in\`
- BPSC — \`bpsc.bihar.gov.in\`, not \`bpsc.bih.nic.in\`
- RRB — the apex resolves, \`www.rrbchennai.gov.in\` does not resolve at all

Each time, the conclusion "this commission's site is broken" was wrong and the real answer was one
character of hostname.

## Certificates get fixed, never bypassed

Two official sites serve an incomplete TLS certificate chain — they send their own certificate but
not the intermediate one needed to link it to a trusted root. Browsers paper over this by chasing
an extension in the certificate; Node does not, and simply refuses to connect.

The tempting fix is one line: turn verification off. That would be the wrong line. The entire
value of an official syllabus is that it provably came from the commission that set it, and
disabling verification discards exactly that guarantee to save a download.

So instead the missing intermediate is fetched from the certificate authority named in the site's
own certificate, and added to the trust store *alongside* the system roots. Verification stays
fully on — chain checked, hostname checked, a genuinely bad certificate still rejected. All that
changes is that the path the server should have sent can now be assembled.

## Nothing is published without provenance

Getting a document is not the same as being allowed to serve it. Before any syllabus goes live, a
publish gate checks:

- the source URL is a real http(s) URL on an official domain
- the document was **hashed** — a SHA-256 of the actual bytes
- the document was **archived**, so the claim stays auditable later
- timestamps describe a possible history: retrieved before extracted before verified
- a canonical graph was built and passed structural validation

That gate exists because of a specific failure. Production once held a live syllabus whose source
hash was \`e3b0c442…b855\` — the SHA-256 of the empty string. A syntactically perfect hash of
nothing at all. The record existed, so publishing asserted it was authoritative.

The gate now rejects that exact value by name.

It has since refused things it was right to refuse. A record built by hand carried
\`documentHash\` and \`fetchedAt\` — plausible field names that the gate does not read — and was
turned away with \`sourceDocumentHash:MISSING\`, after the vectors had already been embedded. That
is the gate working: a claim is only as good as the evidence attached to it, and "close enough"
field names are not evidence.

## When a document defeats us, it stays defeated

Two BPSC syllabi and the RRB NTPC notice cannot currently be ingested. The BPSC ones have a
mangled text layer that extracts as \`"PAPEBJ"\` and \`"Electronics icationsE nee"\`. The RRB
notice is a 56-page scan that yields **999 characters, all of them page markers**.

Those exams are not listed as supported. The alternative — filling the gap with a syllabus
assembled from coaching sites and labelling it official — would put a student in a worse position
than an honest blank, because they would have no way to tell it apart from the real ones sitting
next to it.
`.trim(),
};

/* ────────────────────────────────────────────────────────────────────────────────────────── */

const voice: BlogPost = {
  slug: 'how-voice-mode-works',
  title: 'How voice mode works',
  summary:
    'Real-time speech in both directions, interruption that actually interrupts, and a visual that is one shape rather than two. Plus what it costs and how that is bounded.',
  category: 'Voice',
  date: '2026-08-26',
  readingMinutes: 10,
  body: `
Voice mode lets you talk to the tutor and be answered out loud, interrupt it mid-sentence, and
switch between English and Hindi without announcing it. Underneath, it is meaningfully different
from the text chat.

## Why it needed its own transport

Text chat streams over Server-Sent Events, which are one-directional: the server talks, the
browser listens. Voice needs audio flowing **both ways at once**, so it gets a WebSocket of its
own. Nothing about the existing chat path changed.

## Your browser never sees Google credentials

The browser authenticates to *us* with a Firebase ID token. This server holds the Vertex AI
service account and opens the model session itself, then relays audio frames. A leaked client
token grants a voice session and nothing more — it cannot be turned into direct access to the
model.

## Pacing turned out to matter enormously

During bring-up, sessions were silent. No transcription, no reply, no error. The audio was
arriving correctly and simply produced nothing.

The cause was speed. Roughly four seconds of speech was being delivered in about 0.8 seconds, and
the server's voice-activity detection never saw an end-of-speech — from its point of view the
sentence had not finished yet. Audio has to arrive at roughly wall-clock pace. An AudioWorklet
paces naturally, so the gateway forwards each frame as it arrives and never batches or buffers
ahead.

## Interruption is server-side, not a timer

When you talk over the tutor, the model's own voice-activity detection notices and emits an
interruption event. The client's job is then simple and immediate: throw away every audio chunk it
still has queued. No heuristics, no thresholds of our own — barge-in works because the thing
listening is the thing generating.

## Knowing when you are actually speaking

The visual needs to know whether anyone is talking, which sounds trivial and isn't. A fixed
loudness threshold fails in both directions: too low and a ceiling fan drives it, too high and a
quiet speaker never registers.

So the level is measured against a continuously estimated noise floor:

\`\`\`ts
const MIN_SPEECH_PEAK = 0.035;
const SPEECH_OVER_NOISE = 2.6;
const RELEASE_RATIO = 0.55;
const SPEECH_HOLD_MS = 400;
\`\`\`

The floor rises reluctantly and falls readily, so speech cannot become the floor. Speech has to
stand clear of it by a ratio rather than reach an absolute level. And it releases lower than it
triggers, with a short hold — because the gaps *between words* are silent, and without that hold
the state flips on every syllable. An early version used \`AND\` where it needed \`OR\` in that
hold condition; simulation showed 50 state changes across a sentence where there should have been
one.

## One shape, not two

At rest the visual is a calm orb. While anyone speaks it unrolls into a flowing ribbon.

These are not two graphics cross-fading. They are the **same curve** drawn at two ends of a
morph — every filament is parametrised by \`p ∈ [0,1]\`, which walks a circle at one end and
travels left-to-right at the other, with the positions interpolated between. Cross-fading two
separate visuals reads as a glitch; a single form changing shape reads as a form changing shape.

Two bugs from building it are worth keeping:

**The orb rendered as a "C".** The radius was being modulated by a value indexed along \`p\`, so
the start and end of the circle sat at different radii and left a visible 1.29-pixel gap. The
radius has to be *periodic* in the angle — indexing by \`cos(theta)\` returns the same value at
both ends, and the curve closes exactly.

**It flickered.** The main cause was additive blending, which only makes light on a dark ground
and washed out on the app's white surface. The secondary cause was treating "no analyser
available" — which happens between turns — as genuine silence, collapsing the amplitude to zero
and back on alternating frames. Silence now sags toward the resting shape rather than snapping.

## What it costs, and what bounds it

Native-audio models are the most expensive thing this product calls, so voice carries four
separate limits. Each one stops something the others do not:

| Limit | Default | What it stops |
|---|---|---|
| Voice seconds per day | 1800 | the actual cost |
| Sessions per day | 12 | many short, cheap connections |
| Concurrent sessions | 1 | parallel sessions outrunning the accounting |
| Gap between starts | 3s | connect/drop loops |

Usage is written every 60 seconds *during* a session rather than only at the end, so a crash
cannot earn free minutes. Sessions count at start, so an abandoned connection still costs one.
Billing begins when the model is actually live, not when the socket opened — a slow handshake is
our latency, not your quota.

A more interesting one: nothing originally capped how *fast* audio could be sent. The provider
bills on audio received, so a modified client could have spent a ten-minute budget in seconds by
firing frames in a loop. Inbound audio is now budgeted per session at 1.6× what real speech needs.
`.trim(),
};

/* ────────────────────────────────────────────────────────────────────────────────────────── */

const stack: BlogPost = {
  slug: 'whats-inside-the-technology',
  title: 'What’s inside: a tour of the stack',
  summary:
    'Every moving part, what it does, and the constraints that shaped the choices — including the ones that were wrong and got reverted.',
  category: 'Architecture',
  date: '2026-08-26',
  readingMinutes: 11,
  body: `
A plain tour of what Sadhya is made of, and why.

## The shape of it

\`\`\`
Browser ── React 19 + Vite + TypeScript
   │
   ├── /api  ──► Express + TypeScript ──► Firestore        (data)
   │                                 ──► Pinecone          (vectors)
   │                                 ──► Vertex AI         (models)
   │                                 ──► Cohere            (reranking)
   │
   └── /voice ─► WebSocket ──────────► Gemini Live         (speech, both ways)
\`\`\`

Served by nginx on a single Azure VM, with the API under PM2.

## The frontend

React 19 with Vite and TypeScript. Tailwind for styling, \`motion\` for animation, and
\`react-markdown\` for long-form content — including the page you are reading.

The voice visual is a hand-written canvas rather than a library. It needs to read a live audio
spectrum sixty times a second, and pushing sixty spectrum updates a second through React state
would re-render the whole surface for something only a canvas consumes. The analyser is read
through a ref instead, and nothing above the canvas re-renders.

## The backend

Express and TypeScript on Node, with Firestore as the primary database.

It runs under PM2 via **tsx rather than a compiled build**. That is a deliberate compromise and
worth being honest about: the repository carries a number of pre-existing type errors, so a
\`tsc\` build step would exit non-zero and block deployment entirely. Running the TypeScript
directly keeps deploys working while those are cleaned up. It is a debt, recorded as one.

## Retrieval

Pinecone holds the vectors — roughly 24,000 across NCERT material and official syllabi.
Embeddings come from \`gemini-embedding\` at 768 dimensions, and Cohere reranks the shortlist.

Two details are load-bearing:

**Namespaces.** Vectors live in an explicit namespace. Omitting it queries an empty default and
returns nothing, from an index that is demonstrably full — a failure that looks exactly like "we
have no data" while all the data sits safely one parameter away.

**Vector identity is ours.** Vector IDs used to be built from a slug the language model invented
during extraction. Two consequences, both silent: re-ingesting a document whose model phrased the
slug differently orphaned every vector for that topic and wrote a duplicate set, and the retrieval
layer ended up asserting a topic identity nobody had validated. IDs are now derived from the
document's own coordinates, so re-ingesting the same document converges on the same index state
instead of duplicating it.

## Rate limits are a first-class concern

The embedding model is quota-limited per minute, and indexing a large syllabus means hundreds of
sequential calls. Three protections stack up:

1. **Pacing** — a deliberate gap between calls, so a burst never forms.
2. **Quota backoff** — an exhausted quota window is a *wait*, not a failure. It pauses in
   minute-scale steps and resumes. Before this existed, one rate limit ended the entire exam's
   indexing; six exams once failed inside eight minutes and wrote nothing between them.
3. **Transport retry** — a transient network fault to the vector store retries in seconds. It is
   safe to repeat because IDs are canonical, so a re-write converges rather than duplicating.

There is a fourth, less obvious one: **monitoring must not consume the resource it monitors**.
A progress checker that embedded a throwaway string to count vectors was competing with the
indexer for the same per-minute budget — and duly pushed it into a rate limit. Counting now uses a
constant probe vector, which costs nothing, and anything that genuinely needs a real embedding
first checks whether an indexer is running and refuses rather than competing.

## Deployment

A single Azure VM. nginx serves the built frontend and proxies \`/api\` to the Node process; PM2
keeps that process alive and restores it after reboot.

PM2 runs **one instance, in fork mode**. Cluster mode with two instances was tried and reverted
within minutes: instance 0 ran perfectly while instance 1 crash-looped roughly 298 times in under
fifteen minutes with *zero output* in either log — not a normal exception. The likely cause is
cluster-mode port sharing interacting badly with the TypeScript loader hook, but that was never
confirmed, because debugging it blind against live traffic was a worse idea than reverting.

That single instance is now load-bearing in a way worth writing down. Voice concurrency limits
live in process memory, which is correct at one instance and *only* at one instance — raising it
would silently make those limits per-worker. It is documented next to the setting, because the
next person to try cluster mode should not have to rediscover it.

## What is deliberately absent

No microservices, no Kubernetes, no message bus. One VM, one API process, one vector index. The
constraints here are correctness of content and cost per student, and neither is improved by
distributing the system across more machines than it needs.
`.trim(),
};

/* ────────────────────────────────────────────────────────────────────────────────────────── */

const principles: BlogPost = {
  slug: 'what-we-refuse-to-do',
  title: 'The rules we hold ourselves to',
  summary:
    'The constraints that shaped this product are mostly about what it will not do. Each one exists because the alternative failed in a specific, recorded way.',
  category: 'Principles',
  date: '2026-08-26',
  readingMinutes: 7,
  body: `
Most of what makes an exam-prep product trustworthy is not a feature. It is a refusal.

## We do not invent syllabus content

If a commission has not published something, we do not have it. Not from a coaching site, not from
the model's own memory, not reconstructed from a pattern.

This is tested, not merely intended. IBPS publishes **no topic-wise syllabus** — the word
"syllabus" appears zero times in 140,008 characters of its official notification. Asked to extract
one, the pipeline correctly refused with \`NO_SYLLABUS_CONTENT_IN_DOCUMENT\` rather than producing
the plausible topic list a language model could easily have written from memory. What is indexed
for that exam instead is the structure of examination IBPS *does* publish — tests, question
counts, marks, medium, timing — labelled as exactly that, and never presented as a syllabus.

## "I don't know" beats a good guess

The tutor is told, in its instructions, not to say it will "check the official website" or "look
into it". It has no browser and no existence after the conversation ends, so those phrases leave a
student waiting for an answer that will never arrive. When a lookup finds nothing, it says so and
points at the conducting authority's own site.

## A claim needs evidence attached

Publication requires a source URL on an official domain, a real hash of the real bytes, an
archived copy, coherent timestamps, and a validated structure. Any one missing and the syllabus
stays unpublished — even if the content is fine, and even after the expensive work of indexing it
is already done.

## Structure is described, not prescribed

An early version enforced a fixed hierarchy: stages contain papers, papers contain subjects,
subjects contain topics. It seemed obviously right.

Every single rule was contradicted by a real official notice. Some exams have no stages. Some put
topics directly under a paper. Some nest subtopics four deep. The validator was rejecting
correctly-extracted syllabi for failing to match an assumption we had invented — 7 of 23 trees
passed.

The type-based hierarchy check was removed, and the remaining checks look for things that are
actually wrong regardless of shape: duplicate identities, cycles, missing parents, empty
identifiers. All 23 then validated. The lesson is narrow and useful: when your model and reality
disagree about the domain, reality is not the one with the bug.

## Aim at the error, not the label

Three consecutive fixes were once aimed at a failure *code* rather than at the underlying errors,
because the code was visible in a summary and the errors were not. The success rate barely moved
each time. The fix was to write a diagnostic that re-validated the stored data locally at zero
cost and printed what was actually wrong — after which the real cause was obvious in one run.

## We say what is not finished

Voice mode carries a "prototype" label. Exams without a loaded syllabus are not listed as
supported. Two syllabi are unavailable because their source PDFs have a broken text layer, and
that is stated plainly rather than filled in.

A product page is exactly where an unverified claim becomes load-bearing, because it is the page a
reader trusts most and checks least. So the rule is the same here as in the code: say only what is
true, and say plainly when something is not ready.
`.trim(),
};

/* ────────────────────────────────────────────────────────────────────────────────────────── */

export const BLOG_POSTS: BlogPost[] = [answering, provenance, voice, stack, principles];

export const getPost = (slug: string): BlogPost | undefined =>
  BLOG_POSTS.find((p) => p.slug === slug);

export const CATEGORIES = ['All', 'Architecture', 'Retrieval', 'Voice', 'Principles'] as const;
