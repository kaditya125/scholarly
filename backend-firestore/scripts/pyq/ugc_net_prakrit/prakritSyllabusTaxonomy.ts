export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_PRAKRIT_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_HISTORY_ORIGIN_DEVELOPMENT',
    unitName: 'History of the Prakrit Language: Origin and Development',
    topics: [
      'Elements of the Prakrit language in Vedic literature',
      'Earliest source of Prakrit',
      'Primary Prakrit: Inscriptional, Niya Prakrit, Prakrit Dhammapada, Anga Canonical texts, Kasayapahuda, Satkhandagama, Kundakunda texts',
      'Secondary Prakrit: Upanga canonical texts, Mulasutras, Mulacara, Bhagavati Aradhana, Tiloyapannatti, Gathasaptasati, Paumacariyam, Vasudevahindi',
      'Tertiary Prakrit: Commentary literature, Dhavala, Jayadhavala, Sukhabodha, Silanka on Sutrakrtanga, Setubandha, Gaudavaho, Lilavaikaha, Haribhadrasuri, Kuvalayamalakaha',
      'Origin of Apabhramsa: Joindu, Svayambhu, Puspadanta, Hemacandra grammar',
      'Contribution of Prakrit to the development of modern Indian languages'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_ORIGIN_AND_FEATURES_OF_PRAKRITS',
    unitName: 'Origin and Characteristic Features of Different Prakrits',
    topics: [
      'Maharastri Prakrit features and literature',
      'Sauraseni Prakrit features and literature',
      'Ardhamagadhi Prakrit features and literature',
      'Magadhi Prakrit features and literature',
      'Paisaci Prakrit features and literature',
      'Apabhramsa features and dialectal variations'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_CANONS_AND_COMMENTARY',
    unitName: 'Prakrit Canons and Commentary Literature',
    topics: [
      'History of Ardhamagadhi canonical literature (Svetambara Agama)',
      'History of Sauraseni canonical literature (Digambara Agama)',
      'History of commentary literature (Curni, Niryukti, Bhasya, Tika)',
      'General introduction to Samanasuttam'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_KAVYA_LITERATURE',
    unitName: 'History of Prakrit Kavya Literature',
    topics: [
      'Mahakavya in Prakrit',
      'Khandakavya in Prakrit',
      'Caritakavya in Prakrit',
      'Kathakavya in Prakrit',
      'Campukavya in Prakrit',
      'Muktakakavya in Prakrit'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_DRAMATIC_AND_SATTAKA_LITERATURE',
    unitName: 'Prakrit in Ancient Dramatic Literature and Sattaka Literature',
    topics: [
      'Prakrits in the dramas of Asvaghosa and Bhasa',
      'Prakrits in Mrcchakatika, Mudraraksasa, and dramas of Kalidasa',
      'Characteristic features of Sattaka literature (Karpūramañjarī, Rambhāmañjarī, etc.)'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_INSCRIPTIONAL_LITERATURE',
    unitName: 'Prakrit Inscriptional Literature',
    topics: [
      'Study of the 14 Rock-edicts of the Girnar version of Emperor Asoka',
      'Study of Hathigumpha Inscription of Emperor Kharavela',
      'Study of Ghatiyala Inscription of Kakkuka'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_SCIENTIFIC_LITERATURE',
    unitName: 'Prakrit Scientific Literature',
    topics: [
      'Rhetorics (Alankara) in Prakrit',
      'Kosa (Lexicography) in Prakrit: Paiyalacchi, Desinamamala',
      'Prakrit texts on Astrology and Mathematics',
      'Prakrit grammarians and grammatical treatises (Vararuci, Hemacandra, Trivikrama)',
      'Metrics (Chhandas) in Prakrit: Gaha, Pattha, Viula, Uggaha, Gahini, Khandhaa',
      'Metrics in Apabhramsa: Duvai, Kadavaa, Ghatta, Pajjhadia, Hela, Caupaiya'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_GRAMMAR_AND_PHILOLOGY',
    unitName: 'Prakrit Grammar and Prakrit Philology',
    topics: [
      'Prakrit Grammar: Noun, Adjective, Pronoun, Verb, Indeclinables, Case endings, Sandhi, Samasa',
      'Prakrit Philology: Phonetic changes (vowels, consonants, ya-sruti, anusvara, visarga)',
      'Phonetic behaviors: Assimilation, Dissimilation, Anaptyxis, Metathesis, Elision, Agama'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_ORIGINAL_PRAKRIT_TEXTS',
    unitName: 'Study of the Original Prakrit Texts',
    topics: [
      'Acaranga (First srutaskandha: Satthaparinna, Logavijaya)',
      'Uttaradhyayana (Vinayasuya, Namipavajja)',
      'Dasavaikalika (Chapters I, II, III, IV)',
      'Pravacanasara of Kundakunda (Jnanadhikara)',
      'Sammaisuttam of Siddhasena',
      'Dravyasamgraha of Nemicandra',
      'Bhagavati Aradhana of Sivarya',
      'Vasunandi-sravakacara'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_ORIGINAL_PRAKRIT_KAVYA',
    unitName: 'Study of the Original Prakrit Kavya Literature',
    topics: [
      'Mrcchakatika of Sudraka (Prakrit portions)',
      'Setubandha of Pravarasena',
      'Vajjalaggam of Jayavallabha',
      'Gahasattasai of Hala',
      'Samaraiccahaha of Haribhadrasuri',
      'Kuvalayamalakaha of Uddyotanasuri',
      'Karpuramanjari of Rajasekhara',
      'Paumacariu of Svayambhu',
      'Nayakumaracariu of Puspadanta',
      'Modern Prakrit literature (Rayanavalakaha, Bhavanāsāro, Viragasetu, Titthayara-bhavana)'
    ]
  }
];

export function mapQuestionToPrakritUnit(questionText: string): { unitNumber: number; unitName: string } {
  const text = questionText.toLowerCase();

  // Unit 6: Inscriptional Literature
  if (
    text.includes('asoka') || text.includes('ashoka') || text.includes('girnar') ||
    text.includes('rock-edict') || text.includes('rock edict') || text.includes('inscription') ||
    text.includes('inscriptional') || text.includes('kharavela') || text.includes('hathigumpha') ||
    text.includes('ghatiyala') || text.includes('kakkuka') || text.includes('edicts')
  ) {
    return { unitNumber: 6, unitName: 'Prakrit Inscriptional Literature' };
  }

  // Unit 5: Dramatic and Sattaka Literature
  if (
    text.includes('sattaka') || text.includes('bhasa') || text.includes('asvaghosa') ||
    text.includes('mudraraksasa') || text.includes('kalidasa') || text.includes('drama') ||
    text.includes('dramatic') || text.includes('vidusaka') || text.includes('cetr') ||
    text.includes('sutradhara') || text.includes('prakrit in drama')
  ) {
    return { unitNumber: 5, unitName: 'Prakrit in Ancient Dramatic Literature and Sattaka Literature' };
  }

  // Unit 7: Scientific Literature (Grammarians, Metrics, Lexicons)
  if (
    text.includes('vararuci') || text.includes('trivikrama') || text.includes('desinamamala') ||
    text.includes('paiyalacchi') || text.includes('kosa') || text.includes('metre') ||
    text.includes('metric') || text.includes('gaha') || text.includes('chhandas') ||
    text.includes('alankara') || text.includes('rhetoric') || text.includes('astrology') ||
    text.includes('duvai') || text.includes('pajjhadia') || text.includes('ghatta') ||
    text.includes('candaprabha') || text.includes('grammarian')
  ) {
    return { unitNumber: 7, unitName: 'Prakrit Scientific Literature' };
  }

  // Unit 8: Grammar and Philology
  if (
    text.includes('sandhi') || text.includes('samasa') || text.includes('noun') ||
    text.includes('verb') || text.includes('vibhakti') || text.includes('case-ending') ||
    text.includes('case ending') || text.includes('ya-sruti') || text.includes('anusvara') ||
    text.includes('visarga') || text.includes('assimilation') || text.includes('anaptyxis') ||
    text.includes('metathesis') || text.includes('elision') || text.includes('agama') ||
    text.includes('phonetic') || text.includes('pratyaya') || text.includes('dhatu') ||
    text.includes('nominative') || text.includes('accusative') || text.includes('locative') ||
    text.includes('intervocalic') || text.includes('conjunct') || text.includes('changed into')
  ) {
    return { unitNumber: 8, unitName: 'Prakrit Grammar and Prakrit Philology' };
  }

  // Unit 10: Original Prakrit Kavya Literature
  if (
    text.includes('setubandha') || text.includes('pravarasena') || text.includes('vajjalaggam') ||
    text.includes('jayavallabha') || text.includes('gahasattasai') || text.includes('gathasaptasati') ||
    text.includes('hala') || text.includes('samaraiccahaha') || text.includes('kuvalayamala') ||
    text.includes('uddyotanasuri') || text.includes('karpuramanjari') || text.includes('rajasekhara') ||
    text.includes('paumacariu') || text.includes('nayakumaracariu') || text.includes('kavya')
  ) {
    return { unitNumber: 10, unitName: 'Study of the Original Prakrit Kavya Literature' };
  }

  // Unit 9: Original Prakrit Texts (Canonical and Philosophical)
  if (
    text.includes('acaranga') || text.includes('uttaradhyayana') || text.includes('dasavaikalika') ||
    text.includes('pravacanasara') || text.includes('kundakunda') || text.includes('sammaisuttam') ||
    text.includes('siddhasena') || text.includes('dravyasamgraha') || text.includes('nemicandra') ||
    text.includes('bhagavati aradhana') || text.includes('sivarya') || text.includes('vasunandi') ||
    text.includes('sravakacara') || text.includes('satthaparinna') || text.includes('logavijaya')
  ) {
    return { unitNumber: 9, unitName: 'Study of the Original Prakrit Texts' };
  }

  // Unit 2: Origin and Characteristic Features of Different Prakrits
  if (
    text.includes('maharastri') || text.includes('sauraseni') || text.includes('ardhamagadhi') ||
    text.includes('magadhi') || text.includes('paisaci') || text.includes('apabhramsa') ||
    text.includes('characteristic features') || text.includes('dialect')
  ) {
    return { unitNumber: 2, unitName: 'Origin and Characteristic Features of Different Prakrits' };
  }

  // Unit 3: Prakrit Canons and Commentary Literature
  if (
    text.includes('canon') || text.includes('agama') || text.includes('anga') ||
    text.includes('upanga') || text.includes('mulasutra') || text.includes('chedayasutta') ||
    text.includes('curni') || text.includes('niryukti') || text.includes('bhasya') ||
    text.includes('tika') || text.includes('dhavala') || text.includes('jayadhavala') ||
    text.includes('samanasuttam') || text.includes('commentary')
  ) {
    return { unitNumber: 3, unitName: 'Prakrit Canons and Commentary Literature' };
  }

  // Unit 4: History of Prakrit Kavya Literature
  if (
    text.includes('mahakavya') || text.includes('khandakavya') || text.includes('caritakavya') ||
    text.includes('kathakavya') || text.includes('campukavya') || text.includes('muktaka')
  ) {
    return { unitNumber: 4, unitName: 'History of Prakrit Kavya Literature' };
  }

  // Unit 1: History of the Prakrit Language (Default)
  return { unitNumber: 1, unitName: 'History of the Prakrit Language: Origin and Development' };
}
