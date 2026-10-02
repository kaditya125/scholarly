export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_SANSKRIT_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_VEDIC_LITERATURE_GENERAL',
    unitName: 'Vaidika Sahitya (Samhita, Brahmana, Aranyaka, Upanishad, Vedanga)',
    topics: [
      'Samhita sahitya ka samanya parichaya: Rigveda, Samaveda, Yajurveda, Atharvaveda',
      'Brahmana sahitya: Aitareya, Shatapatha, Taittiriya, Gopatha aadi',
      'Aranyaka sahitya: Pramukh aranyaka grantha evam unke vishaya',
      'Upanishad sahitya: Isha, Kena, Katha, Prashna, Mundaka, Mandukya, Taittiriya, Aitareya, Chandogya, Brihadaranyaka',
      'Vedanga sahitya: Shiksha, Kalpa, Vyakarana, Nirukta, Chhanda, Jyotisha ka samanya parichaya',
      'Vedic sukta evam samvada sukta: Purusha sukta, Nasadiya sukta, Agni sukta, Varuna sukta, Indra sukta, Usas sukta, Yama-Yami, Pururava-Urvashi, Sarama-Pani'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_VEDIC_LITERATURE_SPECIAL',
    unitName: 'Vaidika Sahitya (Vishesh Adhyayana)',
    topics: [
      'Rigveda ke nirdishta sukta: Agni (1.1), Varuna (1.25), Surya (1.115), Indra (2.12), Usas (3.61), Purusha (10.90), Nasadiya (10.129), Vak (10.125)',
      'Shukla Yajurveda: Shiva Sankalpa sukta (Adhyaya 34.1-6), Prajapati sukta (Adhyaya 23)',
      'Atharvaveda: Rashtrabhivardhanam (1.29), Prithvi sukta (12.1)',
      'Brahmana vishishta path: Shunahshepakhyana (Aitareya Brahmana), Vangmanasakhyana (Shatapatha Brahmana)',
      'Upanishad vishishta path: Ishavasya, Kathopanishad (Valli 1-3)',
      'Vedanga vishishta path: Yaska ka Nirukta (Adhyaya 1 evam 2), Rigveda Pratishakhya (Paribhashayein)'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_DARSHANA_SAHITYA_GENERAL',
    unitName: 'Darshana Sahitya (Samanya Parichaya)',
    topics: [
      'Prachin Bharatiya darshana parampara: Astika evam Nastika darshana',
      'Carvaka darshana: Tattva-mimamsa, Pramana-mimamsa, Dehatmavada',
      'Jaina darshana: Anekantavada, Syadvada, Saptabhangi-naya, Triratna',
      'Bauddha darshana: Arya satya, Pratityasamutpada, Kshanabhangavada, Nairatmyavada, Vaibhasika, Sautrantika, Yogacara, Madhyamika',
      'Nyaya darshana: Pramana, Prameya, Samsaya, Hetvabhasa, Asatkaryavada',
      'Vaisesika darshana: Sapta padartha, Paramanuvada, Pilupaka evam Pitharapaka',
      'Samkhya darshana: Satkaryavada, Prakriti-Purusha viveka, Triguna, Srishtikrama, Kaivalya',
      'Yoga darshana: Cittavritti nirodha, Astanga yoga, Klesha, Samadhi, Isvara-swaroop',
      'Purva Mimamsa: Vidhi, Arthavada, Bhedavada, Pramanyavada',
      'Uttara Mimamsa (Vedanta): Advaita, Visistadvaita, Dvaita, Shuddhadvaita'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_DARSHANA_SAHITYA_SPECIAL',
    unitName: 'Darshana Sahitya (Vishesh Adhyayana)',
    topics: [
      'Samkhyakarika (Ishvarakrishna): Satkaryavada, Purusha-Prakriti svarup, Srishti-prakriya, Kaivalya',
      'Tarkasamgraha (Annambhatta) tatha Nyayasiddhantamuktavali: Padartha-lakshana, Pramana-nirupana, Hetvabhasa',
      'Yogasutra (Patanjali): Samadhi pada evam Sadhana pada, Klesha, Ashtanga yoga',
      'Vedantasara (Sadananda): Anubandha-chatushtaya, Adhyaropa, Apavada, Lingasharira, Jivanmukti',
      'Arthasamgraha (Laugakshi Bhaskara): Vidhi-nirupana, Bhavana-bheda, Pramana-lakshana',
      'Sarvadarshanasamgraha (Sayana Madhava): Bauddha evam Jaina mata parikshana'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_VYAKARANA_BHASHAVIGYAN_GENERAL',
    unitName: 'Vyakarana evam Bhashavigyan (Samanya Parichaya)',
    topics: [
      'Vyakarana parampara: Panini, Katyayana, Patanjali (Munitraya), Bhartrihari, Bhattoji Dikshita, Varadaraja',
      'Mahabhashya: Paspashahnika (Shabda-swaroop, Vyakarana-prayojana)',
      'Vakyapadiya (Brahmakanda): Shabda-brahman, Sphota-vada, Shabda aur Artha ka sambandha',
      'Bhashavigyan: Bhasha ki paribhasha, Bhasha ke parivartana ke karana evam dishayen',
      'Dhwani-vigyan: Vag-yantra, Dhwani-utpatti, Dhwani-vargikarana, Dhwani-parivartana ke niyam (Grimm, Verner, Grassmann)',
      'Bhashaon ka parivarik vargikarana: Bharatiya Arya Bhashayein (Prachin, Madhyakalin, Adhunik)'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_VYAKARANA_SPECIAL',
    unitName: 'Vyakarana (Vishesh Adhyayana: Siddhanta Kaumudi)',
    topics: [
      'Sanjna prakarana: Halantyam, Tulyasyaprayatnam savarnam, etc.',
      'Sandhi prakarana: Ach-sandhi, Hal-sandhi, Visarga-sandhi (Siddhanta Kaumudi anusar)',
      'Subanta prakarana: Ajanta-pulinga, Strilinga, Napumsakalinga; Halanta',
      'Samasa prakarana: Avyayibhava, Tatpurusha, Karmadharaya, Dvigu, Bahuvrihi, Dvandva',
      'Tinanta prakarana: Bhvadigana, Adadigana, etc. (Lat, Lot, Lan, Vidhilin, Lit lakara)',
      'Pratyaya prakarana: Krit pratyaya, Taddhita pratyaya, Stri pratyaya',
      'Karaka prakarana: Vibhaktyartha evam karaka (Prathama se Saptami paryanta sutra)'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_SANSKRIT_SAHITYA_GENERAL',
    unitName: 'Sanskrit Sahitya, Kavyashastra evam Chhandashastra (Samanya Parichaya)',
    topics: [
      'Mahakavya parampara: Ashvaghosha, Kalidasa, Bharavi, Bhatti, Kumaradasa, Magha, Sriharsha',
      'Drishyakavya (Natak): Bhasa, Kalidasa, Shudraka, Vishakhadatta, Harsha, Bhavabhuti, Bhattanarayana',
      'Gadyakavya evam Champu: Dandin, Subandhu, Bana Bhatta, Trivikrama Bhatta, Somadeva Suri',
      'Katha evam Akhyayika: Panchatantra, Hitopadesha, Brihatkatha, Kathasaritsagara',
      'Kavyashastra ke sampradaya: Rasa, Alankara, Reeti, Dhwani, Vakrokti, Auchitya',
      'Natyashastra evam Dasharupaka: Natyotpatti, Rupaka ke 10 bhed, Nandi, Bharatavakya',
      'Chhanda: Anushtup, Indravajra, Upendravajra, Upajati, Vasantatilaka, Malini, Shikharini, Mandakranta, Shardulavikridita, Sragdhara'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_SANSKRIT_SAHITYA_SPECIAL',
    unitName: 'Sanskrit Sahitya (Vishesh Adhyayana: Kavya evam Natak)',
    topics: [
      'Mahakavya: Raghuvansha (Canto 1), Kumarasambhava (Canto 5), Kiratarjuniya (Canto 1), Shishupalavadha (Canto 1), Naishadhiyacharita (Canto 1)',
      'Khandakavya: Meghaduta (Purvamegha), Ritusamhara',
      'Natak: Abhijnanashakuntala, Uttararamacharita, Mudrarakshasa, Mrichchhakatika, Swapnavasavadatta',
      'Gadyakavya: Kadambari (Shukanasopadesha), Dashakumaracharita (Uchhvasa 8)',
      'Historical kavya: Harshacharita (Uchhvasa 5), Rajatarangini (Taranga 1)'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_KAVYASHASTRA_NATYASHASTRA_SPECIAL',
    unitName: 'Kavyashastra, Natyashastra evam Chhanda-Alankara (Vishesh Adhyayana)',
    topics: [
      'Kavyaprakasha (Mammata): Kavya-lakshana, Kavya-prayojana, Kavya-hetu, Kavya-bheda, Shabdashakti, Rasa-siddhanta, Dosha, Alankara',
      'Sahityadarpana (Vishwanatha Kaviraja): Kavya-swaroop (Vakyam rasatmakam kavyam), Rasa-nishpatti, Rupaka-nirupana',
      'Dhvanyaloka (Anandavardhana): Prathama Udyota (Dhwani-lakshana, Dhwani-virodhi mata khandana)',
      'Vakroktijivita (Kuntaka): Vakrokti-lakshana evam Prakara',
      'Natyashastra (Bharatamuni): Adhyaya 1 (Natyotpatti), Adhyaya 2 (Prekshagriha), Adhyaya 6 (Rasa-sutra)',
      'Dasharupaka (Dhananjaya): Prakash 1 evam 3',
      'Alankara lakshana evam udaharan: Anuprasa, Yamaka, Shlesha, Upama, Rupaka, Utpreksha, Atishyokti, Sandeha, Bhrantiman, Apahnuti, Samasokti, Aprastutaprashamsa, Arthantaranyasa, Kavyalinga'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_PURANETIHASA_DHARMASHASTRA_LIPI',
    unitName: 'Purana, Itihasa, Dharmashastra evam Abhilekhashastra',
    topics: [
      'Ramayana evam Mahabharata: Rachanakala, Vishayavastu, Samajik-dharmiik-darshanik mahatva, Akhyana',
      'Purana sahitya: Mahapurana evam Upapurana, Panchalakshana, Pauranika srishti evam bhugol',
      'Dharmashastra: Manusmriti (Adhyaya 1, 2, 7 - Rajadharma), Yajnavalkyasmriti (Vyavaharadhyaya)',
      'Arthashastra (Kautilya): Vinayadhikarika (Adhikarana 1), Saptanga rajya siddhanta, Mandala siddhanta, Shadgunya',
      'Palaeography evam Epigraphy: Brahmi lipi ka udbhav evam vikas, Mauryan Brahmi, Gupta Brahmi',
      'Pramukh Abhilekha: Ashoka ke shilalekha (Girnar rock edict 1), Rudradaman ka Junagadh shilalekha, Samudragupta ki Prayaga Prashasti, Pulakeshin II ka Aihole abhilekha'
    ]
  }
];

export function classifySanskritQuestion(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();

  // Unit 1 & 2: Vedic Literature
  if (lower.includes('rigveda') || lower.includes('samaveda') || lower.includes('yajurveda') || lower.includes('atharvaveda') ||
      lower.includes('samhita') || lower.includes('brahmana') || lower.includes('aranyaka') || lower.includes('upanishad') ||
      lower.includes('sukta') || lower.includes('vedanga') || lower.includes('shatapatha') || lower.includes('aitareya') ||
      lower.includes('nirukta') || lower.includes('yaska') || lower.includes('nasadiya') || lower.includes('purusha sukta') ||
      lower.includes('varuna') || lower.includes('indrasukta') || lower.includes('yama-yami')) {
    return { unitNumber: 1, unitCode: UGC_NET_SANSKRIT_TAXONOMY[0].unitCode, unitName: UGC_NET_SANSKRIT_TAXONOMY[0].unitName };
  }

  // Unit 3 & 4: Darshana
  if (lower.includes('darshana') || lower.includes('samkhya') || lower.includes('satkaryavada') || lower.includes('prakriti') ||
      lower.includes('purusha') || lower.includes('nyaya') || lower.includes('vaisesika') || lower.includes('padartha') ||
      lower.includes('tarkasamgraha') || lower.includes('vedantasara') || lower.includes('yogasutra') || lower.includes('patanjali') ||
      lower.includes('hetvabhasa') || lower.includes('arthasamgraha') || lower.includes('carvaka') || lower.includes('syadvada') ||
      lower.includes('bauddha') || lower.includes('pratityasamutpada') || lower.includes('advaita') || lower.includes('shankaracharya')) {
    return { unitNumber: 3, unitCode: UGC_NET_SANSKRIT_TAXONOMY[2].unitCode, unitName: UGC_NET_SANSKRIT_TAXONOMY[2].unitName };
  }

  // Unit 5 & 6: Vyakarana & Bhashavigyan
  if (lower.includes('vyakarana') || lower.includes('panini') || lower.includes('sutra') || lower.includes('sandhi') ||
      lower.includes('samasa') || lower.includes('pratyaya') || lower.includes('karaka') || lower.includes('vibhakti') ||
      lower.includes('siddhanta kaumudi') || lower.includes('mahabhashya') || lower.includes('vakyapadiya') || lower.includes('sphota') ||
      lower.includes('subanta') || lower.includes('tinanta') || lower.includes('dhaturupa') || lower.includes('shabdarupa') ||
      lower.includes('bhashavigyan') || lower.includes('grimm') || lower.includes('verner') || lower.includes('dhwani niyam')) {
    return { unitNumber: 5, unitCode: UGC_NET_SANSKRIT_TAXONOMY[4].unitCode, unitName: UGC_NET_SANSKRIT_TAXONOMY[4].unitName };
  }

  // Unit 9: Kavyashastra & Natyashastra
  if (lower.includes('kavyaprakasha') || lower.includes('mammata') || lower.includes('sahityadarpana') || lower.includes('dhvanyaloka') ||
      lower.includes('anandavardhana') || lower.includes('vakrokti') || lower.includes('kuntaka') || lower.includes('natyashastra') ||
      lower.includes('bharatamuni') || lower.includes('dasharupaka') || lower.includes('rasa-sutra') || lower.includes('alankara') ||
      lower.includes('chhanda') || lower.includes('rupaka') || lower.includes('dhvani')) {
    return { unitNumber: 9, unitCode: UGC_NET_SANSKRIT_TAXONOMY[8].unitCode, unitName: UGC_NET_SANSKRIT_TAXONOMY[8].unitName };
  }

  // Unit 10: Purana, Itihasa, Dharmashastra, Abhilekha
  if (lower.includes('ramayana') || lower.includes('mahabharata') || lower.includes('purana') || lower.includes('manusmriti') ||
      lower.includes('yajnavalkya') || lower.includes('arthashastra') || lower.includes('kautilya') || lower.includes('saptanga') ||
      lower.includes('brahmi') || lower.includes('abhilekha') || lower.includes('ashoka') || lower.includes('rudradaman') ||
      lower.includes('samudragupta') || lower.includes('prayaga prashasti') || lower.includes('aihole')) {
    return { unitNumber: 10, unitCode: UGC_NET_SANSKRIT_TAXONOMY[9].unitCode, unitName: UGC_NET_SANSKRIT_TAXONOMY[9].unitName };
  }

  // Unit 7 & 8: Sanskrit Literature (Kavya, Natak, Gadya)
  if (lower.includes('kalidasa') || lower.includes('abhijnanashakuntala') || lower.includes('raghuvansha') || lower.includes('meghaduta') ||
      lower.includes('kumarasambhava') || lower.includes('kiratarjuniya') || lower.includes('bharavi') || lower.includes('shishupalavadha') ||
      lower.includes('magha') || lower.includes('naishadhiya') || lower.includes('sriharsha') || lower.includes('bhasa') ||
      lower.includes('swapnavasavadatta') || lower.includes('mrichchhakatika') || lower.includes('shudraka') || lower.includes('mudrarakshasa') ||
      lower.includes('uttararamacharita') || lower.includes('bhavabhuti') || lower.includes('kadambari') || lower.includes('banabhatta') ||
      lower.includes('dashakumaracharita') || lower.includes('dandin') || lower.includes('natak') || lower.includes('kavya')) {
    return { unitNumber: 7, unitCode: UGC_NET_SANSKRIT_TAXONOMY[6].unitCode, unitName: UGC_NET_SANSKRIT_TAXONOMY[6].unitName };
  }

  // Default to Unit 7
  return { unitNumber: 7, unitCode: UGC_NET_SANSKRIT_TAXONOMY[6].unitCode, unitName: UGC_NET_SANSKRIT_TAXONOMY[6].unitName };
}
