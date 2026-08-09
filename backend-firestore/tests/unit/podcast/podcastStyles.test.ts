/**
 * Podcast Style Engine tests.
 *
 * The requirement these guard is behavioural, not cosmetic: if one topic is
 * generated six times with six different styles, a listener must immediately hear
 * six different productions. Changing only the speaker names is an explicit
 * FAILURE condition.
 *
 * So these tests do not merely check that six config objects exist. They assert
 * the properties that actually change the output — cast size, episode structure,
 * question frequency, opening rule, cinematic band — are DISTINCT across styles,
 * and that the prompt block the script writer receives really differs.
 */

import {
  DEFAULT_PODCAST_STYLE,
  PODCAST_STYLES,
  PODCAST_STYLE_IDS,
  PodcastStyleId,
  buildStylePromptBlock,
  cinematicBandFor,
  describeCastForPlanner,
  isPodcastStyleId,
  resolvePodcastStyle,
  styleDirectorParams,
} from '../../../src/core/workflow/podcast/podcastStyles';

describe('PodcastStyleConfig registry', () => {
  it('defines exactly the six styles the studio offers', () => {
    expect(PODCAST_STYLE_IDS).toEqual([
      'teacher_student',
      'storytelling',
      'documentary',
      'interview',
      'debate',
      'solo_narration',
    ]);
    expect(Object.keys(PODCAST_STYLES).sort()).toEqual([...PODCAST_STYLE_IDS].sort());
  });

  it('gives every style a self-consistent id and a cast matching its speakerCount', () => {
    for (const id of PODCAST_STYLE_IDS) {
      const style = PODCAST_STYLES[id];
      expect(style.id).toBe(id);
      // A mismatch here would silently give the producer the wrong voice count.
      expect(style.speakers).toHaveLength(style.speakerCount);
      expect(style.label.length).toBeGreaterThan(0);
      expect(style.structure.length).toBeGreaterThan(2);
      expect(style.dialogueRules.length).toBeGreaterThan(0);
      expect(style.avoid.length).toBeGreaterThan(0);
    }
  });

  it('keeps every director parameter inside 0..1', () => {
    for (const id of PODCAST_STYLE_IDS) {
      const s = PODCAST_STYLES[id];
      for (const value of [
        s.storytellingIntensity,
        s.emotionalVariation,
        s.cinematicIntensity,
        s.educationalInteraction,
      ]) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it('defaults to teacher_student, matching the legacy default', () => {
    expect(DEFAULT_PODCAST_STYLE).toBe('teacher_student');
    expect(resolvePodcastStyle(undefined).id).toBe('teacher_student');
    expect(resolvePodcastStyle(null).id).toBe('teacher_student');
    expect(resolvePodcastStyle('').id).toBe('teacher_student');
  });
});

describe('the six styles are genuinely different productions', () => {
  const styles = PODCAST_STYLE_IDS.map((id) => PODCAST_STYLES[id]);

  it('assigns the documented speaker count per style', () => {
    const counts = Object.fromEntries(styles.map((s) => [s.id, s.speakerCount]));
    expect(counts).toEqual({
      teacher_student: 2,
      storytelling: 1,
      documentary: 2,
      interview: 2,
      debate: 3, // moderator + two opposing speakers
      solo_narration: 1,
    });
  });

  it('gives each style a distinct episode structure', () => {
    const structures = styles.map((s) => s.structure.join('|'));
    expect(new Set(structures).size).toBe(styles.length);
  });

  it('gives each style a distinct opening rule', () => {
    const openings = styles.map((s) => s.openingRule);
    expect(new Set(openings).size).toBe(styles.length);
  });

  it('gives each style a distinct set of dialogue rules', () => {
    const rules = styles.map((s) => s.dialogueRules.join('|'));
    expect(new Set(rules).size).toBe(styles.length);
  });

  it('varies question frequency across formats', () => {
    const byId = Object.fromEntries(styles.map((s) => [s.id, s.questionFrequency]));
    expect(byId).toEqual({
      teacher_student: 'medium',
      storytelling: 'very_low',
      documentary: 'low',
      interview: 'high', // questions drive an interview
      debate: 'medium',
      solo_narration: 'very_low',
    });
  });

  it('uses a distinct speaker model per style, so two-voice formats still differ', () => {
    const models = styles.map((s) => s.speakerModel);
    expect(new Set(models).size).toBe(styles.length);

    // documentary and interview are both 2 speakers but must not behave alike.
    expect(PODCAST_STYLES.documentary.speakerCount).toBe(
      PODCAST_STYLES.interview.speakerCount
    );
    expect(PODCAST_STYLES.documentary.speakerModel).not.toBe(
      PODCAST_STYLES.interview.speakerModel
    );
    expect(PODCAST_STYLES.documentary.conversationMode).not.toBe(
      PODCAST_STYLES.interview.conversationMode
    );
  });

  it('separates storytelling from solo narration despite both being one voice', () => {
    const story = PODCAST_STYLES.storytelling;
    const solo = PODCAST_STYLES.solo_narration;

    expect(story.speakerCount).toBe(solo.speakerCount);
    // These two used to be the SAME production. They must now differ in the
    // dimensions a listener can hear.
    expect(story.conversationMode).not.toBe(solo.conversationMode);
    expect(story.structure).not.toEqual(solo.structure);
    expect(story.openingRule).not.toBe(solo.openingRule);
    expect(story.cinematicIntensity).toBeGreaterThan(solo.cinematicIntensity);
    expect(story.storytellingIntensity).toBeGreaterThan(solo.storytellingIntensity);
  });

  it('casts a debate as a moderator plus two opposing speakers', () => {
    const debate = PODCAST_STYLES.debate;
    expect(debate.speakerCount).toBe(3);
    expect(debate.speakerModel).toBe('two_opposing_speakers');
    expect(debate.conversationMode).toBe('debate');
    // Roles must stay within the known voice keys so TTS lookup keeps working.
    expect(debate.speakers.map((s) => s.role)).toEqual([
      'Host',
      'Subject Expert',
      'Teacher',
    ]);
  });
});

describe('resolvePodcastStyle', () => {
  it('resolves every canonical id to itself', () => {
    for (const id of PODCAST_STYLE_IDS) {
      expect(resolvePodcastStyle(id).id).toBe(id);
    }
  });

  it('maps the LEGACY speakerStyle values onto a coherent format', () => {
    // The three styles 'solo_narrator' used to conflate cannot be recovered;
    // solo_narration is chosen because it promises the least.
    expect(resolvePodcastStyle('solo_narrator').id).toBe('solo_narration');
    expect(resolvePodcastStyle('discussion').id).toBe('debate');
    expect(resolvePodcastStyle('mentor').id).toBe('teacher_student');
    expect(resolvePodcastStyle('teacher_student').id).toBe('teacher_student');
    expect(resolvePodcastStyle('interview').id).toBe('interview');
  });

  it('accepts the UI labels the studio displays', () => {
    expect(resolvePodcastStyle('Teacher & Student').id).toBe('teacher_student');
    expect(resolvePodcastStyle('Storytelling').id).toBe('storytelling');
    expect(resolvePodcastStyle('Documentary').id).toBe('documentary');
    expect(resolvePodcastStyle('Interview').id).toBe('interview');
    expect(resolvePodcastStyle('Debate').id).toBe('debate');
    expect(resolvePodcastStyle('Solo Narration').id).toBe('solo_narration');
  });

  it('is tolerant of case and spacing', () => {
    expect(resolvePodcastStyle('  SOLO NARRATION  ').id).toBe('solo_narration');
    expect(resolvePodcastStyle('Solo-Narration').id).toBe('solo_narration');
  });

  it('falls back to the default rather than throwing on junk', () => {
    expect(resolvePodcastStyle('not_a_style').id).toBe(DEFAULT_PODCAST_STYLE);
  });
});

describe('isPodcastStyleId', () => {
  it('accepts only the canonical ids', () => {
    for (const id of PODCAST_STYLE_IDS) expect(isPodcastStyleId(id)).toBe(true);
  });

  it('rejects legacy values, labels and non-strings', () => {
    // Legacy values are resolvable but are NOT valid request ids — the API should
    // reject them rather than guess.
    expect(isPodcastStyleId('solo_narrator')).toBe(false);
    expect(isPodcastStyleId('discussion')).toBe(false);
    expect(isPodcastStyleId('Teacher & Student')).toBe(false);
    expect(isPodcastStyleId(undefined)).toBe(false);
    expect(isPodcastStyleId(null)).toBe(false);
    expect(isPodcastStyleId(42)).toBe(false);
    expect(isPodcastStyleId({})).toBe(false);
  });
});

describe('cinematicBandFor', () => {
  it('maps each style onto the Director band its audio intent implies', () => {
    const bands = Object.fromEntries(
      PODCAST_STYLE_IDS.map((id) => [id, cinematicBandFor(PODCAST_STYLES[id])])
    );
    expect(bands).toEqual({
      teacher_student: 'subtle',   // 0.30 — clarity over atmosphere
      storytelling: 'dramatic',    // 0.95 — fully scored
      documentary: 'dramatic',     // 0.80 — heavy but disciplined
      interview: 'subtle',         // 0.25 — conversation carries itself
      debate: 'subtle',            // 0.40 — restrained
      solo_narration: 'balanced',  // 0.55 — steady bed
    });
  });

  it('produces more than one band across the six styles', () => {
    // The whole point: a single global CINEMATIC_INTENSITY made every style sound
    // the same underneath.
    const distinct = new Set(
      PODCAST_STYLE_IDS.map((id) => cinematicBandFor(PODCAST_STYLES[id]))
    );
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('respects the band thresholds at the boundaries', () => {
    const at = (cinematicIntensity: number) =>
      cinematicBandFor({ ...PODCAST_STYLES.teacher_student, cinematicIntensity });

    expect(at(0)).toBe('subtle');
    expect(at(0.44)).toBe('subtle');
    expect(at(0.45)).toBe('balanced');
    expect(at(0.74)).toBe('balanced');
    expect(at(0.75)).toBe('dramatic');
    expect(at(1)).toBe('dramatic');
  });
});

describe('buildStylePromptBlock', () => {
  it('produces a different prompt for every style', () => {
    const blocks = PODCAST_STYLE_IDS.map((id) =>
      buildStylePromptBlock(PODCAST_STYLES[id])
    );
    expect(new Set(blocks).size).toBe(PODCAST_STYLE_IDS.length);
  });

  it('states the cast, the arc, the opening and the banned phrases', () => {
    const block = buildStylePromptBlock(PODCAST_STYLES.teacher_student);
    expect(block).toContain('TEACHER & STUDENT');
    expect(block).toContain('CAST (2 speakers)');
    expect(block).toContain('Teacher');
    expect(block).toContain('Student');
    expect(block).toContain('OPENING:');
    expect(block).toContain('FORMAT LAW');
    expect(block).toContain('QUESTIONS:');
    expect(block).toContain('PACING:');
    // The stock phrase that made every episode sound the same.
    expect(block).toContain('"Very good question"');
  });

  it('uses the singular for a one-voice format', () => {
    expect(buildStylePromptBlock(PODCAST_STYLES.storytelling)).toContain(
      'CAST (1 speaker)'
    );
  });

  it('tells a documentary NOT to become an interview', () => {
    const block = buildStylePromptBlock(PODCAST_STYLES.documentary);
    expect(block).toContain('must NOT read as an interview');
  });

  it('tells an interview to react to the previous answer', () => {
    const block = buildStylePromptBlock(PODCAST_STYLES.interview);
    expect(block.toLowerCase()).toContain('react to what the guest just said');
  });

  it('carries a per-style question instruction', () => {
    expect(buildStylePromptBlock(PODCAST_STYLES.interview)).toContain(
      'Questions drive the episode'
    );
    expect(buildStylePromptBlock(PODCAST_STYLES.storytelling)).toContain(
      'Almost no direct questions'
    );
  });
});

describe('describeCastForPlanner', () => {
  it('describes a single-voice format in the singular', () => {
    expect(describeCastForPlanner(PODCAST_STYLES.storytelling)).toBe('a single Narrator');
    expect(describeCastForPlanner(PODCAST_STYLES.solo_narration)).toBe('a single Narrator');
  });

  it('lists a two-voice cast', () => {
    expect(describeCastForPlanner(PODCAST_STYLES.interview)).toBe('Host and Subject Expert');
  });

  it('lists a three-voice cast', () => {
    expect(describeCastForPlanner(PODCAST_STYLES.debate)).toBe(
      'Host, Subject Expert and Teacher'
    );
  });
});

describe('styleDirectorParams', () => {
  it('returns a serialisable snapshot of the style for the Director', () => {
    const params = styleDirectorParams(PODCAST_STYLES.storytelling);
    expect(params).toEqual({
      podcastStyle: 'storytelling',
      speakerModel: 'narrator',
      conversationMode: 'narrative',
      questionFrequency: 'very_low',
      storytellingIntensity: 1.0,
      emotionalVariation: 0.9,
      cinematicIntensity: 0.95,
      educationalInteraction: 0.2,
    });
    // Must survive the trip through Firestore / a job payload.
    expect(JSON.parse(JSON.stringify(params))).toEqual(params);
  });

  it('differs for every style', () => {
    const snapshots = PODCAST_STYLE_IDS.map((id) =>
      JSON.stringify(styleDirectorParams(PODCAST_STYLES[id]))
    );
    expect(new Set(snapshots).size).toBe(PODCAST_STYLE_IDS.length);
  });
});

describe('acceptance: one topic, six styles', () => {
  /**
   * The user-facing acceptance criterion, expressed as a test: for a single
   * topic, the six styles must differ on the dimensions a listener perceives.
   * A regression that collapses two styles back together fails here.
   */
  it('produces six distinct production fingerprints', () => {
    const fingerprint = (id: PodcastStyleId) => {
      const s = PODCAST_STYLES[id];
      return JSON.stringify({
        speakers: s.speakers.map((x) => x.role),
        mode: s.conversationMode,
        questions: s.questionFrequency,
        opening: s.openingRule,
        arc: s.structure,
        band: cinematicBandFor(s),
      });
    };

    const fingerprints = PODCAST_STYLE_IDS.map(fingerprint);
    expect(new Set(fingerprints).size).toBe(6);
  });

  it('never lets two styles share both cast and structure', () => {
    for (const a of PODCAST_STYLE_IDS) {
      for (const b of PODCAST_STYLE_IDS) {
        if (a === b) continue;
        const sameCast =
          JSON.stringify(PODCAST_STYLES[a].speakers.map((s) => s.role)) ===
          JSON.stringify(PODCAST_STYLES[b].speakers.map((s) => s.role));
        const sameArc =
          JSON.stringify(PODCAST_STYLES[a].structure) ===
          JSON.stringify(PODCAST_STYLES[b].structure);
        expect(sameCast && sameArc).toBe(false);
      }
    }
  });
});
