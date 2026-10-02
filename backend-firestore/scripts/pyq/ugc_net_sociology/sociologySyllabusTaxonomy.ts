/**
 * UGC NET Sociology (Subject Code 05)
 * Official 10-Unit Syllabus Taxonomy:
 * Unit 1: Sociological Theory (Classical: Marx, Durkheim, Weber; Structural-Functional: Parsons, Merton; Hermeneutic/Interpretive: Mead, Schutz, Garfinkel; Post-Structuralism & Contemporary: Foucault, Bourdieu, Giddens, Habermas)
 * Unit 2: Research Methodology and Methods (Epistemological Paradigms, Quantitative & Qualitative Techniques, Ethnography)
 * Unit 3: Basic Concepts and Institutions (Social Structure, Culture, Network, Status, Role, Family, Marriage, Kinship, Economy, Polity, Religion, Education)
 * Unit 4: Rural and Peasant Society (Agrarian Social Structure, Land Reforms, Green Revolution, Peasant Movements, De-peasantization)
 * Unit 5: Social Stratification (Hierarchy, Difference, Caste, Class, Gender, Race, Ethnicity, Social Mobility)
 * Unit 6: Economy and Society (Exchange, Gift, Division of Labour, Capitalism, Industrialization, Informal Sector, Labour Market)
 * Unit 7: Environment and Society (Social Ecology, Indigenous Knowledge, Environmental Movements, Sustainable Development)
 * Unit 8: Family, Marriage and Kinship (Lineage, Descent, Types of Family, Gender Roles, Domestic Violence, Alternative Families)
 * Unit 9: Science, Technology and Society (Historical Perspectives, Virtual Community, Digital Divide, Reproductive Technologies)
 * Unit 10: Culture and Symbolic Transformations (Signs and Symbols, Media, Popular Culture, Identity Politics, Globalization and Culture)
 */

export interface SociologyUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  keywords: string[];
}

export const UGC_NET_SOCIOLOGY_TAXONOMY: SociologyUnit[] = [
  {
    unitNumber: 1,
    unitCode: "UNIT_1_SOCIOLOGICAL_THEORY",
    unitName: "Sociological Theory (Classical, Modern and Contemporary)",
    keywords: [
      "karl marx", "historical materialism", "alienation", "emile durkheim", "division of labour",
      "suicide", "social fact", "max weber", "ideal type", "bureaucracy", "protestant ethic",
      "talcott parsons", "social system", "pattern variables", "robert k. merton", "manifest and latent",
      "anomie", "reference group", "george herbert mead", "symbolic interactionism", "alfred schutz",
      "phenomenology", "harold garfinkel", "ethnomethodology", "michel foucault", "pierre bourdieu",
      "habitus", "anthony giddens", "structuration", "jurgen habermas", "communicative action"
    ]
  },
  {
    unitNumber: 2,
    unitCode: "UNIT_2_RESEARCH_METHODOLOGY",
    unitName: "Research Methodology and Methods",
    keywords: [
      "research methodology", "epistemology", "positivism", "post-positivism", "interpretivism",
      "quantitative research", "qualitative research", "ethnography", "case study", "survey method",
      "sampling", "probability sampling", "non-probability sampling", "hypothesis", "validity",
      "reliability", "questionnaire", "interview schedule", "participant observation", "focus group", "grounded theory"
    ]
  },
  {
    unitNumber: 3,
    unitCode: "UNIT_3_BASIC_CONCEPTS_INSTITUTIONS",
    unitName: "Basic Concepts and Institutions",
    keywords: [
      "social structure", "social system", "culture", "norm", "values", "status", "role",
      "socialization", "social group", "primary group", "secondary group", "community",
      "association", "institution", "social network", "social control", "conformity", "deviance"
    ]
  },
  {
    unitNumber: 4,
    unitCode: "UNIT_4_RURAL_PEASANT_SOCIETY",
    unitName: "Rural and Peasant Society",
    keywords: [
      "rural society", "peasant society", "peasant studies", "agrarian structure", "land tenure",
      "land reforms", "jajmani system", "green revolution", "peasant movements", "tebhaga",
      "telangana", "naxalbari", "farmers suicide", "de-peasantization", "rural development", "panchayati raj"
    ]
  },
  {
    unitNumber: 5,
    unitCode: "UNIT_5_SOCIAL_STRATIFICATION",
    unitName: "Social Stratification (Caste, Class, Gender and Ethnicity)",
    keywords: [
      "social stratification", "caste system", "varna", "jati", "m.n. srinivas", "sanskritization",
      "dominant caste", "louis dumont", "homo hierarchicus", "purity and pollution", "class structure",
      "middle class", "gender stratification", "patriarchy", "intersectionality", "race", "ethnicity",
      "social mobility", "affirmative action", "scheduled castes", "scheduled tribes"
    ]
  },
  {
    unitNumber: 6,
    unitCode: "UNIT_6_ECONOMY_AND_SOCIETY",
    unitName: "Economy and Society",
    keywords: [
      "economic sociology", "substantivism", "formalism", "karl polanyi", "embeddedness",
      "gift exchange", "marcel mauss", "potlatch", "kula ring", "division of labour",
      "industrialization", "fordism", "post-fordism", "informal economy", "labour process",
      "braverman", "globalization and labour", "flexible accumulation"
    ]
  },
  {
    unitNumber: 7,
    unitCode: "UNIT_7_ENVIRONMENT_AND_SOCIETY",
    unitName: "Environment and Society",
    keywords: [
      "environmental sociology", "social ecology", "indigenous knowledge", "chipko movement",
      "narmada bachao andolan", "appiko movement", "environmental degradation", "climate change",
      "sustainable development", "common property resources", "displacement and rehabilitation",
      "ecological modernization", "environmental justice"
    ]
  },
  {
    unitNumber: 8,
    unitCode: "UNIT_8_FAMILY_MARRIAGE_KINSHIP",
    unitName: "Family, Marriage and Kinship",
    keywords: [
      "family", "nuclear family", "joint family", "patrilineal", "matrilineal", "kinship",
      "descent theory", "alliance theory", "levi-strauss", "rules of marriage", "endogamy",
      "exogamy", "incest taboo", "dowry", "domestic violence", "changing family patterns",
      "single-parent family", "same-sex marriage", "iravate karve"
    ]
  },
  {
    unitNumber: 9,
    unitCode: "UNIT_9_SCIENCE_TECHNOLOGY_SOCIETY",
    unitName: "Science, Technology and Society",
    keywords: [
      "sociology of science", "robert merton norms of science", "ethos of science",
      "technological determinism", "social construction of technology", "scot", "digital divide",
      "information society", "virtual community", "social media impact", "biotechnology",
      "reproductive technologies", "surrogacy", "surveillance society", "actor-network theory"
    ]
  },
  {
    unitNumber: 10,
    unitCode: "UNIT_10_CULTURE_SYMBOLIC_TRANSFORMATIONS",
    unitName: "Culture and Symbolic Transformations",
    keywords: [
      "cultural transformation", "signs and symbols", "semiotics", "popular culture",
      "mass culture", "cultural imperialism", "globalization of culture", "glocalization",
      "consumer culture", "body culture", "identity politics", "religious fundamentalism",
      "secularization", "communalism in india", "diaspora", "transnationalism"
    ]
  }
];

export function classifySociologyText(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  let best = UGC_NET_SOCIOLOGY_TAXONOMY[0];
  let maxScore = -1;

  for (const u of UGC_NET_SOCIOLOGY_TAXONOMY) {
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
