/**
 * Direct-address budget + opener de-duplication.
 *
 * The failure these guard against is not a crash — it is an episode where every
 * teacher line opens "बिल्कुल छात्र" and every student line opens "हाँ सर". The
 * physics stays correct, so nothing downstream complains; it is simply
 * unlistenable. The prompt asks for restraint, but prompt compliance is
 * probabilistic, so the budget is enforced in code and asserted here.
 */

import {
  limitDirectAddress,
  openerOf,
} from '../../../src/core/workflow/podcast/ConversationGenerator';

const T = 'शिक्षक';
const S = 'छात्र';

const line = (speaker: string, text: string) => ({ speaker, text });

/** Convenience: run with the real speaker wiring. */
const limit = (lines: { speaker: string; text: string }[], budget = 0) =>
  limitDirectAddress(lines, { teacherSpeaker: T, studentSpeaker: S, budget });

describe('limitDirectAddress — teacher addressing the student', () => {
  it('strips the acknowledgement + role-label tic', () => {
    const out = limit([line(T, 'बिल्कुल छात्र। यह न्यूटन के पहले नियम से जुड़ा है।')]);
    expect(out[0].text).not.toContain('छात्र');
    // The acknowledgement itself must survive — only the vocative goes.
    expect(out[0].text).toContain('बिल्कुल');
    expect(out[0].text).toContain('न्यूटन');
  });

  it('handles every reported variant', () => {
    const variants = [
      'बिल्कुल छात्र। आगे सुनो।',
      'ठीक है छात्र। अब देखो।',
      'बहुत अच्छे छात्र। यही उत्तर है।',
      'सही कहा छात्र। यही जड़त्व है।',
      'हाँ छात्र, यही बात है।',
      'अच्छा छात्र, अब आगे बढ़ें।',
      'छात्र, अब बताओ क्या होगा?',
      'ध्यान से सुनो छात्र।',
    ];
    for (const v of variants) {
      const out = limit([line(T, v)]);
      expect(out[0].text).not.toContain('छात्र');
      // Something of substance must remain.
      expect(out[0].text.length).toBeGreaterThan(2);
    }
  });

  it('strips the other labels too', () => {
    for (const w of ['विद्यार्थी', 'बच्चों', 'बेटा', 'दोस्तों']) {
      const out = limit([line(T, `बिल्कुल ${w}। आगे चलें।`)]);
      expect(out[0].text).not.toContain(w);
    }
  });

  it('does not leave a dangling space before the danda', () => {
    const out = limit([line(T, 'बिल्कुल छात्र। ठीक।')]);
    expect(out[0].text).not.toMatch(/\s।/);
    expect(out[0].text).not.toMatch(/\s{2,}/);
  });
});

describe('limitDirectAddress — student addressing the teacher', () => {
  it('strips honorifics beyond the budget', () => {
    const out = limit([
      line(S, 'हाँ सर, मैं समझ गया।'),
      line(S, 'नहीं सर, यहाँ दिक्कत है।'),
      line(S, 'अच्छा सर, तो आगे क्या?'),
    ]);
    for (const l of out) expect(l.text).not.toContain('सर');
  });

  it('strips मैडम and गुरुजी as well', () => {
    for (const w of ['मैडम', 'गुरुजी']) {
      const out = limit([line(S, `हाँ ${w}, समझ गया।`)]);
      expect(out[0].text).not.toContain(w);
    }
  });
});

describe('the budget itself', () => {
  it('keeps the first allowed occurrence and strips the rest', () => {
    const lines = [
      line(T, 'छात्र, ध्यान दो।'),
      line(T, 'बिल्कुल छात्र।'),
      line(T, 'ठीक है छात्र।'),
    ];
    const out = limitDirectAddress(lines, {
      teacherSpeaker: T,
      studentSpeaker: S,
      budget: 1,
    });
    // Exactly one line may still carry the address.
    expect(out.filter((l) => l.text.includes('छात्र'))).toHaveLength(1);
    expect(out[0].text).toContain('छात्र');
  });

  it('counts the two directions separately', () => {
    const out = limitDirectAddress(
      [line(T, 'छात्र, सुनो।'), line(S, 'हाँ सर।')],
      { teacherSpeaker: T, studentSpeaker: S, budget: 1 }
    );
    // One each way is within budget, so both survive.
    expect(out[0].text).toContain('छात्र');
    expect(out[1].text).toContain('सर');
  });
});

describe('what must NOT be touched', () => {
  it('leaves ordinary dialogue alone', () => {
    const text = 'यही न्यूटन के पहले नियम की सबसे महत्वपूर्ण बात है। F = ma याद रखो।';
    const out = limit([line(T, text)]);
    expect(out[0].text).toBe(text);
  });

  it('preserves formulas and units', () => {
    const text = 'बिल्कुल छात्र। p = mv होता है, और unit kg·m/s है।';
    const out = limit([line(T, text)]);
    expect(out[0].text).toContain('p = mv');
    expect(out[0].text).toContain('kg·m/s');
    expect(out[0].text).not.toContain('छात्र');
  });

  it('never empties a line completely', () => {
    // A line that is ONLY a vocative would otherwise become a stub.
    const out = limit([line(T, 'छात्र।')]);
    expect(out).toHaveLength(1);
    expect(out[0].text.length).toBeGreaterThan(0);
  });

  it('does not corrupt Latin-script dialogue', () => {
    const out = limit([line(S, 'Yes sir, so momentum is conserved?')]);
    expect(out[0].text).not.toMatch(/\bsir\b/i);
    expect(out[0].text).toContain('momentum');
  });
});

describe('openerOf', () => {
  it('extracts the stock acknowledgement', () => {
    expect(openerOf('बिल्कुल सही। यही बात है।')).toBe('बिल्कुल सही');
    expect(openerOf("That's right, and here is why.")).toBe("That's right");
  });

  it('ignores long unique sentences, which are not stock phrases', () => {
    expect(
      openerOf(
        'जब कोई वस्तु स्थिर अवस्था में होती है और उस पर कोई बाहरी बल नहीं लगता तब वह वैसी ही रहती है'
      )
    ).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(openerOf('')).toBeNull();
    expect(openerOf('   ')).toBeNull();
  });
});
