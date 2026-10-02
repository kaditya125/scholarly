const fs = require('fs');
const path = require('path');

const srcDir = 'scripts/pyq/ugc_net_public_admin';
const dstDir = 'scripts/pyq/ugc_net_law';

const files = [
  ['download-official-public-admin.py', 'download-official-law.py'],
  ['extract-public-admin-papers.py', 'extract-law-papers.py'],
  ['ingest-public-admin-corpus.ts', 'ingest-law-corpus.ts'],
  ['publicAdminPatternAnalytics.ts', 'lawPatternAnalytics.ts'],
  ['generate-public-admin-mock.ts', 'generate-law-mock.ts'],
  ['index-public-admin-benchmark.ts', 'index-law-benchmark.ts'],
  ['audit-public-admin-corpus.ts', 'audit-law-corpus.ts']
];

for (const [src, dst] of files) {
  let content = fs.readFileSync(path.join(srcDir, src), 'utf-8');
  content = content.split('ugc_net_public_admin').join('ugc_net_law');
  content = content.split('public_admin').join('law');
  content = content.split('Public_Admin').join('Law');
  content = content.split('Public Administration').join('Law');
  content = content.split('public administration').join('law');
  content = content.split('PUBLIC_ADMIN').join('LAW');
  content = content.split('publicAdminSyllabusTaxonomy').join('lawSyllabusTaxonomy');
  content = content.split('UGC_NET_PUBLIC_ADMIN_TAXONOMY').join('UGC_NET_LAW_TAXONOMY');
  content = content.split('mapQuestionToPublicAdminUnit').join('mapQuestionToLawUnit');
  content = content.split("['14', '014']").join("['58', '058']");
  content = content.split("'14'").join("'58'");
  content = content.split(':14:').join(':58:');
  content = content.split('_14').join('_58');
  content = content.split('Code: 14').join('Code: 58');
  content = content.split('Code 14').join('Code 58');
  fs.writeFileSync(path.join(dstDir, dst), content, 'utf-8');
  console.log('Created ' + dst);
}
const homeScienceDstDir = 'scripts/pyq/ugc_net_home_science';

const homeScienceFiles = [
  ['download-official-law.py', 'download-official-home-science.py'],
  ['extract-law-papers.py', 'extract-home-science-papers.py'],
  ['ingest-law-corpus.ts', 'ingest-home-science-corpus.ts'],
  ['lawPatternAnalytics.ts', 'homeSciencePatternAnalytics.ts'],
  ['generate-law-mock.ts', 'generate-home-science-mock.ts'],
  ['index-law-benchmark.ts', 'index-home-science-benchmark.ts'],
  ['audit-law-corpus.ts', 'audit-home-science-corpus.ts']
];

for (const [src, dst] of homeScienceFiles) {
  let content = fs.readFileSync(path.join(dstDir, src), 'utf-8');
  content = content.split('ugc_net_law').join('ugc_net_home_science');
  content = content.split('verified_law_manifest.json').join('verified_home_science_manifest.json');
  content = content.split('law_embedding_cache.json').join('home_science_embedding_cache.json');
  content = content.split('law').join('home_science');
  content = content.split('Law').join('Home Science');
  content = content.split('LAW').join('HOME_SCIENCE');
  content = content.split('lawSyllabusTaxonomy').join('homeScienceSyllabusTaxonomy');
  content = content.split('UGC_NET_LAW_TAXONOMY').join('UGC_NET_HOME_SCIENCE_TAXONOMY');
  content = content.split('mapQuestionToLawUnit').join('mapQuestionToHomeScienceUnit');
  content = content.split("['58', '058']").join("['12', '012']");
  content = content.split("'58'").join("'12'");
  content = content.split(':58:').join(':12:');
  content = content.split('_58').join('_12');
  content = content.split('Code: 58').join('Code: 12');
  content = content.split('Code 58').join('Code 12');
  fs.writeFileSync(path.join(homeScienceDstDir, dst), content, 'utf-8');
  console.log('Created ' + dst);
}
const taxonomyCode = `export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_HOME_SCIENCE_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_FOOD_SCIENCE_NUTRITION',
    unitName: 'Food Science and Food Service Management',
    topics: [
      'Food groups, balanced diet, food pyramid, macro and micro nutrients',
      'Food processing, preservation, storage, food chemistry and functional foods',
      'Food service management: menu planning, meal planning, quantity food production and service',
      'Food safety, food hygiene, sanitation, HACCP, food adulteration and food laws'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_NUTRITION_DIETETICS',
    unitName: 'Nutrition and Dietetics',
    topics: [
      'Nutritional biochemistry: digestion, absorption, metabolism of nutrients',
      'Nutritional requirements across life stages (infancy, childhood, adolescence, pregnancy, lactation, old age)',
      'Clinical and therapeutic nutrition: diet therapy in obesity, diabetes, cardiovascular, renal and GI diseases',
      'Community nutrition, nutritional assessment, deficiency disorders, national nutrition programs'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_TEXTILES',
    unitName: 'Textiles',
    topics: [
      'Classification of textile fibers: natural and synthetic fibers, physical and chemical properties',
      'Yarn manufacturing, fabric construction: weaving, knitting, non-woven fabrics',
      'Finishes: aesthetic and functional finishes, dyeing and printing techniques',
      'Textile testing, quality control, eco-friendly textiles, traditional Indian textiles and embroideries'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_APPAREL_DESIGNING',
    unitName: 'Apparel Designing and Fashion Merchandising',
    topics: [
      'Principles of design, elements of design, fashion cycles, fashion forecasting',
      'Anthropometry, pattern making, draping, garment construction techniques',
      'Apparel manufacturing processes, quality inspection, apparel marketing and merchandising',
      'Care and storage of garments, laundry science, dry cleaning'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_RESOURCE_MANAGEMENT',
    unitName: 'Resource Management and Consumer Science',
    topics: [
      'Management concepts, management process: planning, organizing, controlling, evaluating',
      'Resources: human and non-human resources, time and energy management, work simplification',
      'Family finance, budgeting, savings, investment, banking, credit management',
      'Consumer education: consumer rights, consumer responsibilities, consumer protection laws and redressal mechanisms'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_HOUSING_INTERIOR_DESIGN',
    unitName: 'Housing and Interior Decoration',
    topics: [
      'Housing needs, selection of site, house planning, building regulations, principles of architecture',
      'Elements and principles of interior design, color schemes, lighting, acoustics, ventilation',
      'Furnishings: furniture selection, window treatments, accessories, landscape design',
      'Ergonomics in interior space and kitchen planning, green buildings, sustainable living'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_HUMAN_DEVELOPMENT_CHILDHOOD',
    unitName: 'Child and Human Development',
    topics: [
      'Principles of human growth and development, developmental stages from conception to adolescence',
      'Physical, motor, cognitive, language, emotional, and social development',
      'Theories of child development: Piaget, Vygotsky, Freud, Erikson, Kohlberg',
      'Children with special needs, inclusive education, early childhood care and education (ECCE)'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_FAMILY_STUDIES_ADULTHOOD',
    unitName: 'Family Studies and Aging',
    topics: [
      'Adulthood, aging, marriage, family dynamics and interpersonal relationships',
      'Family crisis, divorce, single parenting, domestic violence, counseling',
      'Gerontology: physical, psychological and social aspects of aging, elderly care and policies',
      'Legislation and welfare schemes related to women, children, and elderly in India'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_COMMUNICATION_EXTENSION',
    unitName: 'Communication for Development',
    topics: [
      'Communication concepts, theories, models, communication process and barriers',
      'Types and channels of communication: interpersonal, group, mass communication, traditional and modern media',
      'Audio-visual aids, ICT in development, development journalism, social marketing',
      'Extension education: philosophy, principles, methods of extension teaching, community development'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_EXTENSION_PROGRAM_MANAGEMENT',
    unitName: 'Extension Programme Design and Evaluation',
    topics: [
      'Programme planning cycle: situation analysis, objective setting, plan of work, implementation',
      'Participatory rural appraisal (PRA), monitoring and evaluation of extension programmes',
      'Leadership, community organization, voluntary agencies, NGOs and self-help groups (SHGs)',
      'National rural and urban development missions, women empowerment programmes, research methodology in Home Science'
    ]
  }
];

export function mapQuestionToHomeScienceUnit(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  
  if (lower.match(/textile|fiber|yarn|weave|fabric|dyeing|printing|warp|weft|finishing|bleach|sericulture|cotton|wool|silk|synthetic/)) {
    return { unitNumber: 3, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[2].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[2].unitName };
  }
  if (lower.match(/garment|apparel|draping|pattern|sewing|fashion|merchandising|stitching|anthropometry|clothing|silhouette/)) {
    return { unitNumber: 4, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[3].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[3].unitName };
  }
  if (lower.match(/nutrient|vitamin|protein|carbohydrate|fat|lipid|mineral|calcium|iron|rda|diet|kwashiorkor|marasmus|anemia|metabolism|enzyme|digestion|therapeutic|diabetes|obesity/)) {
    return { unitNumber: 2, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[1].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[1].unitName };
  }
  if (lower.match(/food|preservation|spoilage|canning|fermentation|microorganism|haccp|adulteration|menu|catering|cooking|blanching|pasteurization|storage/)) {
    return { unitNumber: 1, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[0].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[0].unitName };
  }
  if (lower.match(/interior|house|housing|lighting|ventilation|kitchen|furniture|color wheel|ergonomics|curtain|acoustics|architect/)) {
    return { unitNumber: 6, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[5].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[5].unitName };
  }
  if (lower.match(/budget|management|resource|consumer|saving|credit|fatigue|time management|work simplification|decision making|gilbreth/)) {
    return { unitNumber: 5, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[4].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[4].unitName };
  }
  if (lower.match(/piaget|erikson|kohlberg|vygotsky|freud|infant|toddler|child|development|motor skills|cognitive|prenatal|intelligence|special need/)) {
    return { unitNumber: 7, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[6].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[6].unitName };
  }
  if (lower.match(/family|marriage|aging|elderly|gerontology|divorce|kinship|domestic violence|counseling|adulthood|parenting/)) {
    return { unitNumber: 8, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[7].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[7].unitName };
  }
  if (lower.match(/communication|media|audio-visual|channel|message|receiver|berlo|shannon|diffusion|innovation|poster|radio|television|extension teaching/)) {
    return { unitNumber: 9, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[8].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[8].unitName };
  }
  if (lower.match(/extension|pra|participatory|evaluation|ngo|self help group|shg|programme|rural development|empowerment|research method/)) {
    return { unitNumber: 10, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[9].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[9].unitName };
  }
  
  return { unitNumber: 1, unitCode: UGC_NET_HOME_SCIENCE_TAXONOMY[0].unitCode, unitName: UGC_NET_HOME_SCIENCE_TAXONOMY[0].unitName };
}
`;

fs.writeFileSync(path.join(homeScienceDstDir, 'homeScienceSyllabusTaxonomy.ts'), taxonomyCode, 'utf-8');
console.log('Created homeScienceSyllabusTaxonomy.ts');
console.log('All home science scripts successfully written.');

const philosophyDstDir = 'scripts/pyq/ugc_net_philosophy';

const philosophyFiles = [
  ['download-official-law.py', 'download-official-philosophy.py'],
  ['extract-law-papers.py', 'extract-philosophy-papers.py'],
  ['ingest-law-corpus.ts', 'ingest-philosophy-corpus.ts'],
  ['lawPatternAnalytics.ts', 'philosophyPatternAnalytics.ts'],
  ['generate-law-mock.ts', 'generate-philosophy-mock.ts'],
  ['index-law-benchmark.ts', 'index-philosophy-benchmark.ts'],
  ['audit-law-corpus.ts', 'audit-philosophy-corpus.ts']
];

for (const [src, dst] of philosophyFiles) {
  let content = fs.readFileSync(path.join(dstDir, src), 'utf-8');
  content = content.split('ugc_net_law').join('ugc_net_philosophy');
  content = content.split('verified_law_manifest.json').join('verified_philosophy_manifest.json');
  content = content.split('law_embedding_cache.json').join('philosophy_embedding_cache.json');
  content = content.split('law').join('philosophy');
  content = content.split('Law').join('Philosophy');
  content = content.split('LAW').join('PHILOSOPHY');
  content = content.split('lawSyllabusTaxonomy').join('philosophySyllabusTaxonomy');
  content = content.split('UGC_NET_LAW_TAXONOMY').join('UGC_NET_PHILOSOPHY_TAXONOMY');
  content = content.split('mapQuestionToLawUnit').join('mapQuestionToPhilosophyUnit');
  content = content.split("['58', '058']").join("['03', '3', '003']");
  content = content.split("'58'").join("'03'");
  content = content.split(':58:').join(':03:');
  content = content.split('_58').join('_03');
  content = content.split('Code: 58').join('Code: 03');
  content = content.split('Code 58').join('Code 03');
  fs.writeFileSync(path.join(philosophyDstDir, dst), content, 'utf-8');
  console.log('Created ' + dst);
}

const philTaxonomyCode = `export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_PHILOSOPHY_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_CLASSICAL_INDIAN_EPISTEMOLOGY',
    unitName: 'Classical Indian Epistemology and Metaphysics',
    topics: [
      'Vedic and Upanishadic worldviews: Rta, Rna, Yajna, Atman, Brahman',
      'Carvaka: Pratyaksha as sole pramana, critique of anumana and sabda, Dehatmavada',
      'Jainism: Anekantavada, Syadvada, Nayavada, Dravya, Jiva, Ajiva, Bondage and Moksha',
      'Buddhism: Four Noble Truths, Pratityasamutpada, Kshanabhangavada, Nairatmyavada, Schools of Buddhism (Vaibhasika, Sautrantika, Yogacara, Madhyamika)'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_CLASSICAL_INDIAN_SYSTEMS',
    unitName: 'Classical Indian Philosophical Systems',
    topics: [
      'Nyaya: Pramanas (Pratyaksha, Anumana, Upamana, Sabda), Hetvabhasa, Theory of Causation (Asat-karyavada)',
      'Vaisesika: Padarthas (Dravya, Guna, Karma, Samanya, Visesa, Samavaya, Abhava), Paramanuvada',
      'Samkhya: Satkaryavada, Prakriti and Purusa, Gunas, Theory of Evolution, Kaivalya',
      'Yoga: Cittavrtti, Astanga Yoga, Samadhi, Concept of Isvara',
      'Purva Mimamsa: Pramana-vada, Svatah-pramanyavada, Sabda and Arthapatti, Anupalabdhi',
      'Vedanta: Advaita (Samkara - Brahman, Maya, Adhyasa, Vivartavada), Visistadvaita (Ramanuja - Saguna Brahman, Parinamavada, Bhakti), Dvaita (Madhva - Bheda)'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_CLASSICAL_WESTERN_PHILOSOPHY',
    unitName: 'Classical Western: Ancient, Medieval, and Modern Rationalism',
    topics: [
      'Pre-Socratics, Socrates (Dialectic method, Virtue is knowledge)',
      'Plato: Theory of Forms/Ideas, Allegory of Cave, Knowledge vs Opinion, Justice',
      'Aristotle: Critique of Plato, Form and Matter, Four Causes, Actuality and Potentiality',
      'Medieval Philosophy: Augustine (Faith and Reason, Problem of Evil), Aquinas (Five Ways, Essence and Existence)',
      'Rationalism: Descartes (Methodic Doubt, Cogito Ergo Sum, Mind-Body Dualism), Spinoza (Substance, Pantheism, Intellectual Love of God), Leibniz (Monadology, Pre-established Harmony)'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_WESTERN_EMPIRICISM_KANT',
    unitName: 'Western Empiricism, Kant, and Post-Kantian German Idealism',
    topics: [
      'Empiricism: Locke (Rejection of innate ideas, Simple and complex ideas, Primary and secondary qualities)',
      'Berkeley: Esse est percipi, Rejection of matter, Subjective Idealism',
      'Hume: Impressions and ideas, Relations of ideas and matters of fact, Critique of causality and self, Skepticism',
      'Kant: Critical Philosophy, Synthetic a priori judgments, Space and Time as forms of sensibility, Categories of understanding, Phenomenon and Noumenon',
      'Hegel: Dialectical method, Absolute Idealism, Master-Slave dialectic'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_CONTEMPORARY_WESTERN_PHILOSOPHY',
    unitName: 'Contemporary Western Philosophy (Analytic and Continental)',
    topics: [
      'Moore: Refutation of Idealism, Defense of Common Sense',
      'Russell: Logical Atomism, Theory of Descriptions',
      'Wittgenstein: Tractatus Logico-Philosophicus (Picture Theory), Philosophical Investigations (Language Games, Form of Life)',
      'Logical Positivism: Verification Principle, Elimination of Metaphysics (Ayer, Carnap)',
      'Phenomenology: Husserl (Epoche, Intentionality, Phenomenological reduction)',
      'Existentialism: Kierkegaard, Nietzsche, Heidegger (Dasein), Sartre (Existence precedes essence, Bad faith)'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_RECENT_WESTERN_CURRENTS',
    unitName: 'Postmodernism, Hermeneutics, and Pragmatism',
    topics: [
      'Pragmatism: Peirce, James, Dewey (Instrumentalism)',
      'Hermeneutics: Dilthey, Gadamer, Ricoeur',
      'Post-structuralism and Postmodernism: Foucault (Power/Knowledge, Discourse), Derrida (Deconstruction, Differance), Lyotard (Incredulity towards metanarratives)',
      'Frankfurt School and Critical Theory: Habermas (Communicative Action, Public Sphere)'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_ETHICS_INDIAN_WESTERN',
    unitName: 'Ethics (Indian and Western)',
    topics: [
      'Indian Ethics: Purusarthas (Dharma, Artha, Kama, Moksha), Niskama Karma, Varnashrama Dharma, Buddhist Eightfold Path, Jaina Triratna, Gandhian Ethics (Satya, Ahimsa, Satyagraha)',
      'Western Normative Ethics: Utilitarianism (Bentham, Mill), Deontology (Kant - Categorical Imperative), Virtue Ethics (Aristotle)',
      'Meta-ethics: Cognitivism vs Non-cognitivism, Intuitionism (Moore), Emotivism (Ayer, Stevenson), Prescriptivism (Hare)',
      'Applied Ethics: Bioethics, Environmental Ethics, Animal Ethics'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_APPLIED_PHILOSOPHY_POLITICAL',
    unitName: 'Social and Political Philosophy',
    topics: [
      'Political Ideologies: Liberalism, Socialism, Marxism, Anarchism, Communitarianism, Feminism',
      'Key Political Concepts: Liberty, Equality, Justice (Rawls, Nozick), Sovereignty, Rights and Duties, Democracy',
      'Indian Social Thinkers: Raja Ram Mohan Roy, Swami Vivekananda, Sri Aurobindo, B.R. Ambedkar (Critique of Caste, Navayana Buddhism), M.N. Roy (Radical Humanism), J. Krishnamurti'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_LOGIC',
    unitName: 'Logic (Formal, Symbolic, and Informal)',
    topics: [
      'Traditional Logic: Proposition and Sentence, Categorical Propositions, Square of Opposition, Syllogism, Venn Diagrams',
      'Informal Fallacies: Fallacies of relevance, presumption, and ambiguity',
      'Symbolic Logic: Truth tables, Tautology, Contradiction, Contingency, Rules of Inference and Replacement',
      'Predicate Logic: Quantifiers, Universal and Existential Instantiation and Generalization'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_PHILOSOPHY_OF_RELIGION_MIND',
    unitName: 'Philosophy of Religion and Philosophy of Mind',
    topics: [
      'Philosophy of Religion: Nature of God, Arguments for Existence of God (Ontological, Cosmological, Teleological, Moral), Problem of Evil, Religious Language, Religious Experience',
      'Philosophy of Mind: Mind-Body Problem, Dualism, Materialism/Physicalism, Behaviorism, Functionalism, Consciousness and Qualia'
    ]
  }
];

export function mapQuestionToPhilosophyUnit(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  
  if (lower.match(/pramana|pratyaksha|anumana|upamana|sabda|arthapatti|anupalabdhi|carvaka|jaina|syadvada|anekantavada|kshanabhanga|nairatmya|madhyamika|yogacara|buddhis/)) {
    return { unitNumber: 1, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[0].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[0].unitName };
  }
  if (lower.match(/nyaya|vaisesika|samkhya|prakriti|purusa|satkaryavada|padartha|samavaya|advaita|samkara|ramanuja|visistadvaita|madhva|mimamsa|vedanta|maya|adhyasa/)) {
    return { unitNumber: 2, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[1].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[1].unitName };
  }
  if (lower.match(/descartes|spinoza|leibniz|cogito|monad|plato|aristotle|socrates|cave|substance|forms|ideas|aquinas|augustine/)) {
    return { unitNumber: 3, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[2].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[2].unitName };
  }
  if (lower.match(/locke|berkeley|hume|kant|hegel|noumenon|phenomenon|synthetic a priori|categorical imperative|esse est percipi|causality/)) {
    return { unitNumber: 4, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[3].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[3].unitName };
  }
  if (lower.match(/wittgenstein|russell|moore|logical positivism|husserl|heidegger|sartre|kierkegaard|nietzsche|dasein|bad faith|language game|picture theory/)) {
    return { unitNumber: 5, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[4].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[4].unitName };
  }
  if (lower.match(/pragmatism|peirce|dewey|foucault|derrida|deconstruction|hermeneutics|gadamer|ricoeur|habermas|postmodern/)) {
    return { unitNumber: 6, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[5].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[5].unitName };
  }
  if (lower.match(/utilitarianism|bentham|mill|deontology|virtue ethics|purusartha|dharma|niskama karma|meta-ethics|emotivism|prescriptivism|bioethics/)) {
    return { unitNumber: 7, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[6].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[6].unitName };
  }
  if (lower.match(/rawls|nozick|justice|liberty|equality|ambedkar|gandhi|aurobindo|vivekananda|sovereignty|marxism|feminism|socialism/)) {
    return { unitNumber: 8, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[7].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[7].unitName };
  }
  if (lower.match(/syllogism|tautology|truth table|fallacy|proposition|venn diagram|quantifier|validity|inference|predicate logic/)) {
    return { unitNumber: 9, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[8].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[8].unitName };
  }
  if (lower.match(/ontological|cosmological|teleological|problem of evil|qualia|dualism|mind-body|consciousness|physicalism|functionalism|religious experience/)) {
    return { unitNumber: 10, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[9].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[9].unitName };
  }
  
  return { unitNumber: 1, unitCode: UGC_NET_PHILOSOPHY_TAXONOMY[0].unitCode, unitName: UGC_NET_PHILOSOPHY_TAXONOMY[0].unitName };
}
`;

fs.writeFileSync(path.join(philosophyDstDir, 'philosophySyllabusTaxonomy.ts'), philTaxonomyCode, 'utf-8');
console.log('Created philosophySyllabusTaxonomy.ts');
console.log('All philosophy scripts successfully written.');



