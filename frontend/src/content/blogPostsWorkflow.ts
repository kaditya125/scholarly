import type { BlogPost } from './blogPosts';

/**
 * The end-to-end workflow post.
 *
 * Deliberately the longest piece on the blog: it is the one a reader arrives at wanting to know
 * what the product actually does, in order, rather than which technologies it name-drops. Every
 * stage described here corresponds to a route, a service or a prompt that exists in this
 * repository — the onboarding steps are the real step list, the fifteen learning modes are the
 * real enum, and the verification pass is a real second model call, not an aspiration.
 */

export const workflow: BlogPost = {
  slug: 'the-complete-workflow',
  title: 'What actually happens, start to finish',
  summary:
    'From signing up to getting an answer with its confidence score — every stage of the product in order, including the two steps that run after the answer is written.',
  category: 'Architecture',
  date: '2026-08-26',
  readingMinutes: 14,
  body: `
This is the long version: what Sadhya does, in the order it does it, from a student arriving for
the first time to a fully cited answer appearing on screen.

---

# Part one — becoming a student the system understands

## Sign up, and prove the address

Account creation, then email verification. Nothing unusual, with one deliberate consequence:
the tutor is only ever talking to a signed-in student. That assumption is load-bearing later —
it is why the voice tutor is instructed never to ask you who you are.

## Onboarding asks ten things, once

Rather than a blank chat box, onboarding walks through a short wizard:

| Step | What it establishes |
|---|---|
| Goal | what you are actually working towards |
| Board | your academic board, where relevant |
| Stream | science, commerce, arts |
| Subjects | what you are studying |
| Level | beginner, intermediate, advanced |
| Target | the exam and the year |
| Study time | hours per day realistically available |
| Style | how you prefer to learn |
| Language | English, Hindi, or a mix |

None of this is decoration. It becomes your **student context**, and it is injected into every
subsequent prompt — target exam, target year, daily study hours, preferred language, preparation
level, subjects, weak areas. The same tutor answers a beginner and an advanced candidate
differently because it knows which one it is talking to.

## The baseline assessment finds out where you actually are

Self-reported level is a starting guess, not a measurement. A short adaptive assessment produces
a report of what you actually know, and the weak areas it identifies feed back into your context.

This is the difference between a product that asks "what do you want to study?" and one that
knows what you should.

---

# Part two — asking a question

Most of the product's surface area — chat, notebooks, research, flashcards — funnels into the
same retrieval and generation path. Here it is, step by step.

## Step 1: your question is rewritten to stand alone

You have been talking for ten minutes. You ask: *"and is that on the paper too?"*

That sentence is meaningless to a search engine. "That" refers to something four turns ago; there
are no keywords worth matching. So the last few turns are used to rewrite it into a standalone
query, resolving pronouns to their actual subjects and expanding a synonym or two where it helps
retrieval.

The rewritten query is what gets searched. You never see it, and you should not have to phrase
your questions like search terms to be understood.

## Step 2: retrieved text is sanitised before the model sees it

Everything retrieved from a document is untrusted input. A PDF can contain text that looks like an
instruction, and a model reading it has no inherent way to tell a syllabus line from a command.

\`\`\`ts
public sanitizeContext(text: string): string {
  return text
    .replace(/<\\|.*?\\|>/g, '')                          // special tokens
    .replace(/<\\/?(system|user|assistant|instruction)>/gi, '')  // prompt-like tags
    .replace(/Ignore previous instructions/gi, '[REDACTED]')     // the classic
    .trim();
}
\`\`\`

Retrieved content is *data*, never instructions. This runs before it ever reaches a prompt.

## Step 3: the right corpus is chosen

There is more than one body of knowledge here, and they answer different questions:

| Corpus | Answers |
|---|---|
| Official syllabus | "is this on my paper?" |
| Public knowledge | "explain photosynthesis" |
| Curriculum | "what does my board expect this year?" |
| Your own notebooks | "what did I upload about this?" |

A syllabus question routes to the official syllabus corpus, filtered hard by exam, and nothing
else is a candidate. A concept question routes to the public knowledge base. Mixing them is how
you get an answer that is fluent, plausible, and about the wrong exam.

## Step 4: search, then re-rank

Vector similarity finds a shortlist quickly and approximately. A reranker then reads your question
and each candidate together and scores how well they actually answer each other.

Retrieval casts a wide net. Reranking decides what is worth using.

## Step 5: the answer is written in one of fifteen modes

The same question produces genuinely different output depending on what you asked for. The mode is
not a prompt suffix — it changes the system prompt entirely:

\`TEACHER\` · \`REVISION\` · \`EXAM\` · \`QUIZ\` · \`FLASHCARDS\` · \`MINDMAP\` · \`PODCAST\` ·
\`SUMMARY\` · \`BEGINNER\` · \`RESEARCH\` · \`INTERVIEW\` · \`ESSAY\` · \`CURRENT_AFFAIRS\`

A \`BEGINNER\` explanation and an \`EXAM\` answer to the same question should not look alike. One
is building intuition from nothing; the other is showing what would earn marks.

## Step 6: the answer is checked against its own sources

This is the step most products skip, and it is the most interesting one.

After the answer is generated, a **second model call** takes the generated text and the retrieved
documents and does two things:

> Step 1: Extract all factual claims from the "Generated Response".
> Step 2: For each claim, check if it is explicitly supported by the "Documents".

The output is a report: which claims are supported, which are not, and a confidence score. An
answer built from nothing scores zero by construction — with no retrieved context, verification
returns \`isValid: false\` immediately rather than pretending.

The point is not that this catches every hallucination. It is that the system has an *opinion*
about how well-supported its own answer was, derived from evidence rather than from the model's
own confidence, which is famously uncorrelated with being right.

---

# Part three — what surrounds the answer

An answer alone is not preparation. The rest of the product is what turns answers into progress.

## Notebooks

Upload your own material — PDFs, notes, documents. It gets extracted, chunked and indexed the same
way official content does, and becomes retrievable in conversation. "What did that handout say
about oxidation states?" is a question about *your* library.

## Podcast studio

Turns material into audio you can listen to while commuting. This is where text-to-speech earns
its place: revision that fits into time you already have.

## Tests and the exam centre

Mock tests and practice, scored, with the results feeding analytics rather than disappearing.

## Flashcards

Generated from what you are actually studying — one of the fifteen modes, not a separate feature
with its own content pipeline.

## Analytics and reports

What you have covered, what you have not, where the assessment says you are weak. The loop closes
here: the report updates your context, and your context changes how the tutor talks to you.

## Voice mode

Everything above, spoken. It calls the same tools, hits the same corpora, and is subject to the
same refusal to invent — it just does it in real time, and you can interrupt it mid-sentence.

## Classes, for teachers

A teaching profile adds the ability to run classes, set assignments, hold live sessions and see
student progress. Not a separate application — the same product, with additional capabilities
computed per request.

---

# Part four — what happens behind the student

The content students retrieve does not appear by itself.

## Syllabus ingestion

For each exam: locate the commission's own document, verify the domain is official at every
redirect hop, download, hash it, archive it, extract the structure with a language model, merge
the chunks, validate the resulting graph, index each topic as a vector, and only then publish.

Any missing link and it stays unpublished. A syllabus with no verifiable source is not a syllabus,
it is a rumour with good formatting.

## The content pipeline

Study material goes through its own extraction, OCR where a document is scanned, quality
assessment and indexing before it becomes retrievable.

## Background work

Notifications, media processing and long-running jobs run on separate workers so nothing blocks a
student waiting on an answer.

---

# Why the order matters

Read as a list, those stages look like ordinary product features. The order is the argument.

Onboarding happens before the first question so the tutor knows who it is talking to. Sanitisation
happens before the prompt so retrieved text cannot give instructions. Corpus selection happens
before search so the wrong exam is never a candidate. Verification happens after generation so the
answer can be checked against evidence rather than trusted because it sounds right.

Move any one of those and you still have a working chatbot. You just lose the specific property
that makes it worth trusting with six months of someone's preparation.
`.trim(),
};
