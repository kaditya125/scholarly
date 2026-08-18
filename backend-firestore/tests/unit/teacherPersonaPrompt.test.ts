import { buildSadhyaSystemPrompt } from '../../src/config/prompts';
import { TeacherContext } from '../../src/types/teacherContext.types';
import { StudentContext } from '../../src/types/studentContext.types';

function teacherCtx(over: Partial<TeacherContext> = {}): TeacherContext {
  return {
    userId: 'teacher-1',
    profile: {
      displayName: 'Ms. Rao',
      subjects: ['Mathematics', 'Physics'],
      boards: ['CBSE'],
      classesTaught: ['Class 9-10'],
      exams: ['Bihar TRE TGT'],
      languages: ['English', 'Hindi'],
      teachingStyle: 'Socratic',
      yearsExperience: 6,
      bio: null,
    },
    isOnboarded: true,
    ...over,
  };
}

function studentCtx(over: Partial<StudentContext> = {}): StudentContext {
  return {
    userId: 'student-1',
    profile: { targetExam: 'SSC CGL' },
    memory: null,
    analytics: null,
    stats: null,
    planner: null,
    notebooks: null,
    isFirstTimeUser: false,
    isOnboarded: true,
    ...over,
  };
}

/** Collapses whitespace so assertions don't depend on where the source template wraps lines. */
function flat(s: string): string {
  return s.replace(/\s+/g, ' ');
}

describe('buildSadhyaSystemPrompt — viewer role branching', () => {
  it('defaults to the student identity and context when viewerRole is omitted', () => {
    const prompt = flat(buildSadhyaSystemPrompt({ studentContext: studentCtx() }));
    expect(prompt).toContain('personal teacher, study coach, career guide');
    expect(prompt).toContain('Student Profile (Personalization Data)');
    expect(prompt).not.toContain('assisting a **teacher**');
  });

  it('uses the teacher identity + profile block, never the student identity, when viewerRole is teacher', () => {
    const prompt = flat(buildSadhyaSystemPrompt({
      viewerRole: 'teacher',
      teacherContext: teacherCtx(),
    }));

    expect(prompt).toContain('assisting a **teacher**');
    expect(prompt).toContain('Teacher Profile (Personalization Data)');
    expect(prompt).toContain('Mathematics, Physics');
    expect(prompt).toContain('Bihar TRE TGT');

    expect(prompt).not.toContain('personal teacher, study coach, career guide');
    expect(prompt).not.toContain('Student Profile (Personalization Data)');
  });

  it('ignores a passed-through studentContext when viewerRole is teacher', () => {
    const prompt = flat(buildSadhyaSystemPrompt({
      viewerRole: 'teacher',
      studentContext: studentCtx(),
      teacherContext: teacherCtx(),
    }));

    expect(prompt).not.toContain('Student Profile (Personalization Data)');
  });

  it('degrades gracefully to the bare teacher identity when no teacherContext is available', () => {
    const prompt = flat(buildSadhyaSystemPrompt({ viewerRole: 'teacher' }));
    expect(prompt).toContain('assisting a **teacher**');
    expect(prompt).not.toContain('Teacher Profile (Personalization Data)');
  });
});
