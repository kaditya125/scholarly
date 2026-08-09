/**
 * Checks which SFX triggers actually fire on realistic Hindi/Hinglish narration.
 *
 * The matcher uses ASCII-letter lookarounds rather than `\b` (JS `\w` is
 * `[A-Za-z0-9_]`, so `\b` never matches beside Devanagari and would silently
 * disable every Hindi trigger). This confirms that holds in practice, and reports
 * any trigger with NO Devanagari pattern — those can only ever fire on English.
 *
 * Usage: node --import tsx src/scripts/check_hindi_triggers.ts
 */

import { SFX_TRIGGERS, matchTriggers } from '../core/director/knowledge/sfxTriggers';

/** Sentences written the way the generator actually writes Hindi. */
const SENTENCES: string[] = [
  'ईगल ने चाँद की सतह पर लैंड किया।',
  'इंजन की गड़गड़ाहट पूरे कमरे में गूँज रही थी।',
  'काउंटडाउन शुरू हुआ — तीन, दो, एक।',
  'अचानक अलार्म बजने लगा।',
  'रेडियो पर सिर्फ़ खरखराहट सुनाई दी।',
  'मशीन धीरे-धीरे चलने लगी।',
  'प्रयोगशाला में एक रासायनिक प्रतिक्रिया हो रही थी।',
  'तभी एक ज़ोरदार भूकंप आया।',
  'अचानक एक विस्फोट हुआ और सब काँप गए।',
  'दरवाज़ा खुला और वह अंदर आया।',
  'उसके क़दमों की आवाज़ गलियारे में गूँजी।',
  'बादल गरजे और बिजली चमकी।',
  'आग की लपटें ऊपर उठ रही थीं।',
  'पानी में छपाक की आवाज़ हुई।',
  'घंटी बजी और सब खड़े हो गए।',
  'तालियाँ बजने लगीं।',
  'उसकी धड़कन तेज़ हो गई।',
  'तलवारें टकराईं।',
  'घोड़े दौड़ पड़े।',
  'ट्रेन प्लेटफ़ॉर्म से गुज़री।',
  // Hinglish, the way this platform mixes scripts
  'ये concept थोड़ा tricky है, लेकिन rocket का engine ignition समझना ज़रूरी है।',
  'तभी spacecraft ने touched down किया।',
  'हैच खुला और वे बाहर निकले।',
];

function main() {
  console.log('\n=== does the trigger fire on Hindi narration? ===\n');
  let fired = 0;
  for (const s of SENTENCES) {
    const m = matchTriggers(s);
    if (m) fired++;
    const tag = m ? `${m.trigger.category.padEnd(10)} via "${m.matchedPattern}"` : 'NO MATCH';
    console.log(`  ${m ? 'HIT ' : 'MISS'}  ${tag.padEnd(34)} ${s}`);
  }
  console.log(`\n  ${fired}/${SENTENCES.length} Hindi/Hinglish sentences produced a cue.`);

  // Which triggers can never fire in Hindi?
  const devanagari = /[\u0900-\u097F]/;
  const englishOnly = SFX_TRIGGERS.filter(
    (t) => !t.patterns.some((p) => devanagari.test(p))
  );
  console.log(`\n=== triggers with NO Devanagari pattern (English-only) ===`);
  if (englishOnly.length === 0) {
    console.log('  (none — every trigger has at least one Hindi pattern)');
  } else {
    for (const t of englishOnly) {
      console.log(`  ${t.category.padEnd(10)} ${t.patterns.join(', ')}`);
    }
  }
  console.log('');
}

main();
