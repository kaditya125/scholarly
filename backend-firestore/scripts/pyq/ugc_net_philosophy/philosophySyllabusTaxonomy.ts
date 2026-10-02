export interface SyllabusUnit {
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
