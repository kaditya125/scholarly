/**
 * UGC NET Political Science (Subject Code 02)
 * Official 10-Unit Syllabus Taxonomy:
 * Unit 1: Political Theory (Concepts & Political Traditions)
 * Unit 2: Political Thought (Western: Plato to Rawls, Habermas)
 * Unit 3: Indian Political Thought (Kautilya to Lohia, Ambedkar)
 * Unit 4: Comparative Political Analysis
 * Unit 5: International Relations
 * Unit 6: India's Foreign Policy
 * Unit 7: Political Institutions in India
 * Unit 8: Political Processes in India
 * Unit 9: Public Administration
 * Unit 10: Governance and Public Policy in India
 */

export interface PoliticalScienceUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  keywords: string[];
}

export const UGC_NET_POLITICAL_SCIENCE_TAXONOMY: PoliticalScienceUnit[] = [
  {
    unitNumber: 1,
    unitCode: "UNIT_1_POLITICAL_THEORY",
    unitName: "Political Theory (Concepts and Traditions)",
    keywords: [
      "liberty", "equality", "justice", "rights", "democracy", "power", "citizenship",
      "liberalism", "conservatism", "socialism", "marxism", "feminism", "ecologism",
      "multiculturalism", "postmodernism", "sovereignty", "legitimacy", "rawls", "nozick",
      "habermas", "berlin", "positive liberty", "negative liberty", "distributive justice"
    ]
  },
  {
    unitNumber: 2,
    unitCode: "UNIT_2_WESTERN_POLITICAL_THOUGHT",
    unitName: "Western Political Thought",
    keywords: [
      "plato", "aristotle", "machiavelli", "thomas hobbes", "john locke", "rousseau",
      "hegel", "mary wollstonecraft", "john stuart mill", "karl marx", "antonio gramsci",
      "hannah arendt", "frantz fanon", "mao zedong", "confucius", "leviathan", "social contract",
      "general will", "hegemony", "prince", "republic", "dialectic", "alienation"
    ]
  },
  {
    unitNumber: 3,
    unitCode: "UNIT_3_INDIAN_POLITICAL_THOUGHT",
    unitName: "Indian Political Thought",
    keywords: [
      "dharmashastra", "kautilya", "arthashastra", "barani", "kabir", "pandita ramabai",
      "bal gangadhar tilak", "swami vivekananda", "rabindranath tagore", "mahatma gandhi",
      "sri aurobindo", "b.r. ambedkar", "m.n. roy", "rammanohar lohia", "jaya prakash narayan",
      "deendayal upadhyaya", "satyagraha", "swaraj", "sarvodaya", "annihilation of caste"
    ]
  },
  {
    unitNumber: 4,
    unitCode: "UNIT_4_COMPARATIVE_POLITICAL_ANALYSIS",
    unitName: "Comparative Political Analysis",
    keywords: [
      "comparative politics", "constitutionalism", "regime types", "authoritarian", "democratic",
      "electoral systems", "party systems", "duverger", "political development", "political modernization",
      "lucian pye", "huntington", "almond and verba", "political culture", "dependency theory",
      "frank", "wallerstein", "state in capitalist society", "new institutionalism", "federalism"
    ]
  },
  {
    unitNumber: 5,
    unitCode: "UNIT_5_INTERNATIONAL_RELATIONS",
    unitName: "International Relations",
    keywords: [
      "realism", "morgenthau", "neorealism", "waltz", "liberalism", "neoliberal institutionalism",
      "keohane", "constructivism", "wendt", "balance of power", "collective security", "un charter",
      "united nations", "security council", "disarmament", "arms control", "npt", "ctbt",
      "cold war", "post-cold war", "globalization", "bretton woods", "wto", "imf", "regional organizations"
    ]
  },
  {
    unitNumber: 6,
    unitCode: "UNIT_6_INDIAS_FOREIGN_POLICY",
    unitName: "India's Foreign Policy",
    keywords: [
      "non-alignment", "nam", "panchsheel", "look east", "act east", "gujral doctrine",
      "india-usa relations", "india-russia", "india-china", "india-pakistan", "saarc",
      "bims-tec", "shanghai cooperation", "sco", "brics", "g20", "nuclear doctrine",
      "no first use", "maritime security", "indo-pacific", "quad", "foreign policy determinants"
    ]
  },
  {
    unitNumber: 7,
    unitCode: "UNIT_7_POLITICAL_INSTITUTIONS_INDIA",
    unitName: "Political Institutions in India",
    keywords: [
      "constituent assembly", "preamble", "fundamental rights", "directive principles", "dpsp",
      "parliament", "lok sabha", "rajya sabha", "president of india", "prime minister",
      "supreme court", "judicial review", "basic structure", "high court", "governor",
      "chief minister", "election commission", "comptroller and auditor general", "cag",
      "finance commission", "upsc", "national commissions", "federalism in india"
    ]
  },
  {
    unitNumber: 8,
    unitCode: "UNIT_8_POLITICAL_PROCESSES_INDIA",
    unitName: "Political Processes in India",
    keywords: [
      "caste in indian politics", "religion and politics", "communalism", "secularism",
      "regionalism", "linguistic reorganization", "gender and politics", "social movements",
      "peasant movements", "tribal movements", "civil society", "interest groups",
      "coalition politics", "voting behavior", "electoral reforms", "identity politics"
    ]
  },
  {
    unitNumber: 9,
    unitCode: "UNIT_9_PUBLIC_ADMINISTRATION",
    unitName: "Public Administration",
    keywords: [
      "public administration", "woodrow wilson", "scientific management", "taylor",
      "administrative management", "fayol", "gulick", "urwick", "bureaucracy", "max weber",
      "human relations", "elton mayo", "decision making", "herbert simon", "ecological approach",
      "riggs", "prismatic model", "new public administration", "minnowbrook", "new public management",
      "npm", "accountability and control", "good governance"
    ]
  },
  {
    unitNumber: 10,
    unitCode: "UNIT_10_GOVERNANCE_PUBLIC_POLICY_INDIA",
    unitName: "Governance and Public Policy in India",
    keywords: [
      "governance", "good governance", "e-governance", "citizens charter", "rti", "right to information",
      "lokpal", "lokayukta", "cpc", "administrative reforms", "niti aayog", "planning commission",
      "public policy", "policy formulation", "policy implementation", "policy evaluation",
      "grassroots governance", "panchayati raj", "73rd amendment", "74th amendment", "municipalities"
    ]
  }
];

export function classifyPoliticalScienceText(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  let best = UGC_NET_POLITICAL_SCIENCE_TAXONOMY[0];
  let maxScore = -1;

  for (const u of UGC_NET_POLITICAL_SCIENCE_TAXONOMY) {
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
