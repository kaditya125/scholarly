/**
 * UGC NET History (Subject Code 06)
 * Official 10-Unit Syllabus Taxonomy:
 * Unit 1: Negotiating the Sources, Pre-history, Proto-history & Vedic Period
 * Unit 2: From State to Empire: Mahajanapadas, Mauryas, Post-Mauryan & Sangam Age
 * Unit 3: Emergence of Regional Kingdoms: Guptas, Vakatakas, Harsha & South Indian Dynasties
 * Unit 4: Source Analysis, Delhi Sultanate, Administration & Southern Kingdoms
 * Unit 5: The Mughal Empire, Sur Dynasty, Marathas & Regional Powers
 * Unit 6: Medieval Society, Economy, Bhakti-Sufi Traditions & Culture
 * Unit 7: Sources of Modern History, British Rule & Colonial Expansion
 * Unit 8: Colonial Economy, Land Revenue, De-industrialization & 1857 Revolt
 * Unit 9: Indian National Movement, Gandhian Era, Freedom Struggle & Partition
 * Unit 10: Historical Method, Historiography & Post-Independence Consolidation
 */

export interface HistoryUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  keywords: string[];
}

export const UGC_NET_HISTORY_TAXONOMY: HistoryUnit[] = [
  {
    unitNumber: 1,
    unitCode: "UNIT_1_SOURCES_PREHISTORY_VEDIC",
    unitName: "Negotiating the Sources, Pre-history, Proto-history and Vedic Period",
    keywords: [
      "archaeological", "epigraphy", "numismatics", "indus valley", "harappa", "mohenjodaro",
      "paleolithic", "mesolithic", "neolithic", "chalcolithic", "vedic", "rigveda", "later vedic",
      "varnashrama", "sabha", "samiti", "megalithic", "iron age", "pastoralism"
    ]
  },
  {
    unitNumber: 2,
    unitCode: "UNIT_2_MAHAJANAPADAS_MAURYAS_SANGAM",
    unitName: "From State to Empire: Mahajanapadas, Mauryas and Sangam Age",
    keywords: [
      "mahajanapadas", "magadha", "maurya", "chandragupta", "ashoka", "dhamma", "arthashastra",
      "kautilya", "megasthenes", "post-maurya", "sunga", "kushana", "kanishka", "satavahana",
      "sangam", "chola", "chera", "pandya", "silappadikaram", "manimekalai", "gandhara art", "mathura art"
    ]
  },
  {
    unitNumber: 3,
    unitCode: "UNIT_3_GUPTAS_HARSHA_REGIONAL_KINGDOMS",
    unitName: "Emergence of Regional Kingdoms: Guptas, Harsha and South Indian Dynasties",
    keywords: [
      "gupta", "samudragupta", "chandragupta ii", "fa-hsien", "vakataka", "harsha", "hsuan tsang",
      "chalukya", "pulakeshin", "pallava", "narasimhavarman", "rashtrakuta", "feudalism debate",
      "land grants", "agrahara", "temple architecture", "dravida", "nagara", "vesara", "shankaracharya"
    ]
  },
  {
    unitNumber: 4,
    unitCode: "UNIT_4_DELHI_SULTANATE_ADMIN_SOUTH",
    unitName: "Delhi Sultanate, Administration and Southern Kingdoms",
    keywords: [
      "delhi sultanate", "qutbuddin aibak", "iltutmish", "balban", "alauddin khalji", "market control",
      "muhammad bin tughlaq", "firoz shah tughlaq", "iqta", "barani", "tarikh-i-firoz shahi", "amir khusrau",
      "ibn battuta", "vijayanagara", "krishnadevaraya", "bahmani", "nayankara", "amara-nayaka"
    ]
  },
  {
    unitNumber: 5,
    unitCode: "UNIT_5_MUGHAL_EMPIRE_MARATHAS",
    unitName: "Mughal Empire, Sur Dynasty, Marathas and Regional Powers",
    keywords: [
      "mughal", "babur", "humayun", "akbar", "sulh-i-kul", "mansabdari", "jagirdari", "jahangir",
      "shah jahan", "aurangzeb", "sher shah suri", "maratha", "shivaji", "chhatrapati", "ashtapradhan",
      "chauth", "sardeshmukhi", "peshwa", "sikh guru", "guru gobind singh", "khalsa"
    ]
  },
  {
    unitNumber: 6,
    unitCode: "UNIT_6_MEDIEVAL_SOCIETY_CULTURE_BHAKTI",
    unitName: "Medieval Society, Economy, Bhakti-Sufi Traditions and Culture",
    keywords: [
      "bhakti movement", "sufism", "chishti", "muinuddin chishti", "nizamuddin auliya", "kabir",
      "guru nanak", "chaitanya", "mirabai", "tulsidas", "surdas", "hundi", "dadni", "karkhana",
      "mughal painting", "fatehpur sikri", "taj mahal", "indo-islamic", "vernacular literature"
    ]
  },
  {
    unitNumber: 7,
    unitCode: "UNIT_7_BRITISH_EXPANSION_COLONIAL_RULE",
    unitName: "Sources of Modern History, British Rule and Colonial Expansion",
    keywords: [
      "east india company", "battle of plassey", "battle of buxar", "carnatic wars", "robert clive",
      "warren hastings", "subsidiary alliance", "lord wellesley", "doctrine of lapse", "dalhousie",
      "anglo-mysore", "tipu sultan", "anglo-maratha", "anglo-sikh", "paramountcy", "princely states"
    ]
  },
  {
    unitNumber: 8,
    unitCode: "UNIT_8_COLONIAL_ECONOMY_REVOLT_1857",
    unitName: "Colonial Economy, Land Revenue, De-industrialization and 1857 Revolt",
    keywords: [
      "permanent settlement", "lord cornwallis", "ryotwari", "thomas munro", "mahalwari",
      "commercialization of agriculture", "de-industrialization", "drain of wealth", "dadabhai naoroji",
      "famine", "railways", "peasant movement", "santhal", "tribal revolt", "revolt of 1857", "sepoys",
      "mangla pandey", "bahadur shah zafar", "rani laxmibai"
    ]
  },
  {
    unitNumber: 9,
    unitCode: "UNIT_9_NATIONAL_MOVEMENT_GANDHIAN_ERA",
    unitName: "Indian National Movement, Freedom Struggle and Partition",
    keywords: [
      "indian national congress", "inc", "moderates", "extremists", "surat split", "swadeshi",
      "partition of bengal", "home rule", "tilak", "annie besant", "gandhi", "champaran", "rowlatt act",
      "jallianwala bagh", "non-cooperation", "khilafat", "civil disobedience", "dandi march",
      "quit india", "subhas chandra bose", "ina", "cabinet mission", "mountbatten", "partition"
    ]
  },
  {
    unitNumber: 10,
    unitCode: "UNIT_10_HISTORIOGRAPHY_POST_INDEPENDENCE",
    unitName: "Historical Method, Historiography and Post-Independence Consolidation",
    keywords: [
      "historiography", "historical method", "heuristics", "hermeneutics", "orientalism", "william jones",
      "nationalist historiography", "marxist historiography", "subaltern studies", "ranajit guha",
      "annales school", "post-independence", "integration of states", "sardar patel", "states reorganization",
      "non-alignment", "nam", "five year plans", "constitution of india"
    ]
  }
];

export function classifyHistoryText(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  let best = UGC_NET_HISTORY_TAXONOMY[0];
  let maxScore = -1;

  for (const u of UGC_NET_HISTORY_TAXONOMY) {
    let score = 0;
    for (const kw of u.keywords) {
      if (lower.includes(kw.toLowerCase())) {
        score += 2;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      best = u;
    }
  }

  return {
    unitNumber: best.unitNumber,
    unitCode: best.unitCode,
    unitName: best.unitName
  };
}
