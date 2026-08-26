import type { BlogPost } from './blogPosts';

/**
 * The longer, more specific posts.
 *
 * Kept in their own module purely for file size — `blogPosts.ts` holds the type, the index and
 * the introductory pieces, and this holds the three that go deep on decisions that are genuinely
 * unusual: document-derived identity, tool calling inside a live conversation, and authorization
 * as a derived function rather than a stored role.
 *
 * Same rule as the rest of the blog: every claim is true of the code in this repository, and the
 * failures are included because they are the part a technical reader learns something from.
 */

export const graph: BlogPost = {
  slug: 'why-a-syllabus-is-a-graph',
  title: 'Why a syllabus is a graph, not a list of topics',
  summary:
    'Most platforms store a syllabus as nested bullet points. Sadhya gives every topic a permanent address derived from the official document — and that one decision changes what the product can honestly claim.',
  category: 'Architecture',
  date: '2026-08-26',
  readingMinutes: 10,
  body: `
Nearly every exam-prep product stores a syllabus the same way: a list of subjects, each with a
list of topics, typed in once by somebody. It works, it renders nicely, and it quietly makes a
whole class of guarantees impossible.

Sadhya stores a syllabus as a **graph of nodes with canonical identity**. That sounds like
over-engineering until you look at what it buys.

## The problem with a list

A list has no stable notion of *this specific topic*. If you re-import the syllabus next year and
somebody phrases a heading slightly differently, you have no way to know whether "Time and Work"
in the new list is the same thing as "Time & Work" in the old one. So you cannot:

- point a vector at a topic and be confident it still refers to that topic later
- attach a student's progress to a topic that survives a re-import
- say "this answer came from *that* line of the official notice"

You end up with content that looks structured but cannot be *addressed*.

## Identity derived from the document, not invented

Every node gets an id computed from where it genuinely sits in the official document — the node's
type, which exam, which cycle, which version of the syllabus, a SHA-256 fingerprint of its
**ordered ancestor path**, and the official name exactly as printed.

Nothing in that list is a judgement call. Re-run the extraction on the same document and you get
the same id, every time.

## The bug that made this non-negotiable

The vector ids were originally built from a slug the language model produced during extraction —
it was asked for a topic id and it obliged.

Two consequences, both completely silent:

1. Re-ingesting the same document with the model phrasing a slug differently **orphaned every
   vector for that topic** and wrote a fresh duplicate set beside them. Nothing errored. The index
   simply grew, and the old vectors sat there answering queries forever.
2. The retrieval layer was asserting a topic identity that nobody had validated. The model had
   invented the primary key of the knowledge base.

The extraction prompt now says it plainly:

> Do NOT output any id, slug, key or identifier field. Identity is assigned by the application.

Asking a model for identifiers at all invites it to believe it owns them.

## One address, three systems

Because the id is derived rather than invented, the same value addresses the same thing
everywhere:

| System | Uses the canonical id as |
|---|---|
| Pinecone | the vector id |
| Firestore graph | the node document id |
| Retrieval | what a cited passage points back to |

So re-ingesting a document is *idempotent* — it converges on the same index state instead of
duplicating or orphaning. That single property is why the pipeline can be re-run safely at all,
and why a partial indexing run that fails halfway can simply be resumed.

During one batch a 1,161-topic syllabus died at topic 390 on a network fault. The re-run picked up
from 400 rather than starting over, because the 400 vectors already written carried exactly the
ids they would have been written with anyway. With model-invented slugs, that same re-run would
have produced 400 duplicates and left the originals stranded.

## Shape is discovered, not assumed

The other half of "graph, not list" is that the hierarchy is **not fixed**.

An early version enforced the obvious structure: stages contain papers, papers contain subjects,
subjects contain topics. Every one of those rules was contradicted by a real official notice.
Some exams have no stages at all. Some list topics directly under a paper. Some nest sub-points
four levels deep. UPSC CSE has 33 root nodes, because its optional subjects sit alongside the main
examination rather than beneath it.

With the fixed hierarchy in place, **7 of 23** extracted syllabi validated. The other sixteen were
correctly extracted and were being rejected for failing to match an assumption we had invented.

Removing the type-based nesting rules took it to **23 of 23**. What remains are checks for things
that are wrong regardless of shape — duplicate identity, cycles, a node whose parent does not
exist, an empty identifier. Those are real defects. "A subject appeared where I expected a paper"
was never a defect; it was the syllabus.

## What this makes possible

Because a topic has a permanent, document-derived address:

- a retrieved passage can name exactly which line of which official notice it came from
- a syllabus can be re-fetched and re-indexed without corrupting what is already there
- a future version of the same exam can be diffed against the current one, node by node
- progress or evidence attached to a topic survives the next ingestion

None of that is possible with nested bullet points, and all of it follows from one refusal: not
letting the model name things.
`.trim(),
};

export const tools: BlogPost = {
  slug: 'the-tutor-looks-things-up-while-you-talk',
  title: 'The tutor looks things up while you’re still talking',
  summary:
    'Most voice assistants answer from memory, because a lookup would break the conversation. Sadhya’s calls three tools mid-sentence — and the student’s identity never passes through the model.',
  category: 'Voice',
  date: '2026-08-26',
  readingMinutes: 8,
  body: `
There is a reason most voice assistants answer from memory: stopping to look something up costs
time, and silence in a spoken conversation feels broken in a way that a spinner in a chat window
does not.

But an exam tutor answering syllabus questions from memory is the exact failure this product
exists to avoid. So voice mode does look things up — during the conversation, while the model is
mid-turn.

## Three tools, reachable by name only

The live model is given three functions it can call:

| Tool | What it does |
|---|---|
| \`searchSyllabus\` | queries the official syllabus corpus for a specific exam |
| \`searchKnowledge\` | queries the indexed study material |
| \`getStudentContext\` | reads who it is talking to — name, target exam, subjects, level |

The model cannot touch the database, the vector index, or any service directly. It can only ask
for these three by name, and this server decides what that means and what comes back.

## The identity does not come from the model

This is the part worth dwelling on.

When the model calls \`getStudentContext\`, it does not pass a user id — and if it tried, the
value would be ignored. The uid comes from the Firebase token that was verified when the socket
opened, held in server-side session state and injected by the gateway:

\`\`\`ts
const result = await executeVoiceTool(
  String(call.name),
  (call.args || {}) as any,
  { userId: state.userId },      // from the verified token, never from the model
);
\`\`\`

A language model with any influence over *whose* data a lookup returns is a data leak waiting for
the right prompt. Here the model can ask "who am I talking to". It cannot ask "tell me about a
different student", because the question has nowhere to put that argument.

## Why the tutor knowing your name mattered

Before this existed, a signed-in student asked the tutor "who am I?" and it answered that it
didn't know. Which was true — and useless, given the platform knew perfectly well.

The fix was not to stuff the profile into every prompt. It was to give the model a way to ask,
plus an instruction about when:

> You are always speaking with a signed-in student, so never ask them who they are or what their
> name is — call getStudentContext and find out. Use their first name naturally once or twice
> early on, not in every reply. If that lookup genuinely returns no name, simply carry on without
> one rather than asking for it.

That last clause matters. Without it, a missing name turns into an assistant interrogating a
student about their own identity.

## The instruction that stops a comfortable lie

There is a related instruction that exists because of how spoken conversation tempts a model:

> You can only look things up through your tools, which search Sadhya's own indexed material. You
> cannot browse the internet and you cannot check anything after this conversation ends. So never
> say you will "check the official website", "look into it", or "keep trying" — you will not, and
> the student will wait for an answer that never comes.

"Let me look into that for you" is a natural, friendly, human thing to say. It is also a promise
this system is structurally incapable of keeping: there is no after-the-call, no background task,
no follow-up. Saying it leaves a student waiting on nothing.

## Latency is the whole design constraint

A tool call inside a spoken turn has a budget of a second or two before the pause becomes
noticeable. Two things keep it inside that.

The **retrieval clients are warmed at boot**. The first embedding call in a process pays for
connection setup and model warm-up, and that cost was landing on the first student to speak. It
measured 4.2 seconds — and the cause was not the vector database, which is where everyone looked
first, but cold start. One warm-up call at startup moves it off the critical path entirely.

The **cache key includes the exam**, not just the query. An earlier version keyed on the question
alone, so asking the same question for two different exams returned the first exam's answer to
both — a caching bug that reads exactly like a retrieval bug.

## What the student experiences

They ask what their paper covers. The tutor pauses for about the length of a natural breath, then
answers from the commission's own notice — and if nothing is loaded for that exam, it says so
rather than filling the gap.

The pause is the sound of it checking. That is a fair trade.
`.trim(),
};

export const capabilities: BlogPost = {
  slug: 'capabilities-not-roles',
  title: 'There is no “teacher version” of Sadhya',
  summary:
    'Most platforms ship two products behind one login. Sadhya has one, and recomputes what you may do on every request — which is why a suspension takes effect in seconds rather than at next sign-in.',
  category: 'Product',
  date: '2026-08-26',
  readingMinutes: 9,
  body: `
The usual way to build an education platform with teachers in it is to fork the product. There is
a student app and a teacher app, and your account type decides which one you get. It is easy to
reason about and easy to sell.

Sadhya does not do that, and the reason is not aesthetic.

## Roles describe who you are; capabilities describe what you may do

Instead of a role deciding which application you see, every account gets the same product, and a
**capability set** decides what is available inside it. A teaching profile changes how the AI
drafts for you — it does not unlock a separate app.

The capabilities are explicit and named, rather than implied by a role: using the AI, creating
private content, connecting with peers, editing a teacher profile, and so on up to the things that
affect other people.

## It is a function, not a stored field

This is the decision that carries the most weight. The capability set is **never persisted**. It
is computed, from scratch, on every request.

The reasoning, from the code itself:

> Authorization here is a function of three things that live in three different places:
> \`productRole\` (a custom claim on the token), \`teacherStatus\` (a field in the database, mutable
> by admins at any moment), and eventually relationship edges. Storing the answer would mean a
> teacher suspended thirty seconds ago still holds a document saying they may create classes, and
> a claim-based answer would serve stale permissions until the user signed out.

A stored permission is a snapshot of a decision someone made in the past. If the thing it depends
on changes — and a teacher's status can change the moment an admin clicks something — that
snapshot becomes a lie the system will keep honouring. Deriving it per request costs a little
computation and removes an entire category of stale-authorization bug.

## Two shapes of rule, deliberately different

Not every permission is withdrawn the same way, and collapsing them would be wrong:

**Restriction-gated** — allowed by default, withdrawn on suspension. A suspended teacher keeps AI
access but loses write access. The internal wording is the useful part: *suspension is a pause,
not an eviction*. Someone under review does not stop being a person who was midway through
learning something.

**Approval-gated** — denied until explicitly approved. Everything that touches another person or
money sits here, and \`draft\`, \`pending\` and \`under_review\` are all **equally unapproved**.
Only a completed review opens these. There is no partial credit for having started an application.

## The client may read it; the server never trusts it

The browser is allowed to fetch the derived capability set and use it to decide what to render —
hiding a button nobody may press is better than showing one that errors.

But every protected route re-derives the set server-side, and a capability object arriving from a
browser is never consulted. The client's copy is a rendering hint. The server's copy is the
decision.

## Why this is the right shape for what Sadhya is

The product's premise is that it is AI-first, and that teachers **augment** the system rather than
being bolted onto the side of it. A role fork contradicts that premise directly: it says there are
two products, and a teacher is a different kind of user having a different kind of experience.

Capabilities say something else. There is one product, everyone gets the tutor, and some accounts
may additionally do things that affect other people. A teacher is a student who can also run a
class.

That is both a truer description of how people actually use it and a much smaller thing to
maintain: one set of screens, one set of behaviours, one place where a permission question gets
answered.

## The cost, stated honestly

Deriving authorization per request means that logic runs on every protected call. That is real
work the role-fork approach avoids.

What it buys is a system where revoking access actually revokes access — immediately, everywhere,
without anyone having to remember which stored documents need updating.
`.trim(),
};
