/**
 * UGC NET English (Subject Code 30)
 * Official 10-Unit Syllabus Taxonomy:
 * Unit 1: Drama (British, American, Postcolonial, World)
 * Unit 2: Poetry (Chaucer to Modern/Contemporary)
 * Unit 3: Fiction, Short Story (Novel traditions, Narrative forms)
 * Unit 4: Non-Fictional Prose (Essays, Biographies, Autobiographies)
 * Unit 5: Language: Basic concepts, theories & pedagogy (English in Use, ELT, Applied Linguistics)
 * Unit 6: English in India: history, evolution and futures
 * Unit 7: Cultural Studies (Birmingham School, Mass Culture, Subcultures, Media)
 * Unit 8: Literary Criticism (Classical to New Criticism: Aristotle to Eliot, Leavis)
 * Unit 9: Literary Theory post World War II (Structuralism, Deconstruction, Postcolonialism, Feminism, Eco-criticism)
 * Unit 10: Research Methods and Materials in English (MLA Handbook, Methodology, Textual Criticism)
 */

export interface EnglishUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  keywords: string[];
}

export const UGC_NET_ENGLISH_TAXONOMY: EnglishUnit[] = [
  {
    unitNumber: 1,
    unitCode: "UNIT_1_DRAMA",
    unitName: "Drama",
    keywords: [
      "shakespeare", "marlowe", "ben jonson", "tragedy", "comedy", "hamlet", "macbeth",
      "king lear", "othello", "dr faustus", "alchemist", "congreve", "way of the world",
      "restoration comedy", "oliver goldsmith", "sheridan", "george bernard shaw", "pygmalion",
      "oscar wilde", "samuel beckett", "waiting for godot", "harold pinter", "the birthday party",
      "arthur miller", "death of a salesman", "tennessee williams", "wole soyinka", "girish karnad"
    ]
  },
  {
    unitNumber: 2,
    unitCode: "UNIT_2_POETRY",
    unitName: "Poetry",
    keywords: [
      "chaucer", "canterbury tales", "spenser", "faerie queene", "sonnet", "john donne",
      "metaphysical", "john milton", "paradise lost", "john dryden", "alexander pope", "rape of the lock",
      "william blake", "william wordsworth", "lyrical ballads", "samuel taylor coleridge",
      "percy bysshe shelley", "john keats", "lord byron", "alfred tennyson", "robert browning",
      "matthew arnold", "w.b. yeats", "t.s. eliot", "the waste land", "w.h. auden", "philip larkin", "sylvia plath"
    ]
  },
  {
    unitNumber: 3,
    unitCode: "UNIT_3_FICTION_SHORT_STORY",
    unitName: "Fiction, Short Story",
    keywords: [
      "novel", "fiction", "short story", "daniel defoe", "robinson crusoe", "samuel richardson",
      "pamela", "henry fielding", "tom jones", "laurence sterne", "jane austen", "pride and prejudice",
      "charlotte bronte", "jane eyre", "emily bronte", "wuthering heights", "charles dickens", "great expectations",
      "george eliot", "middlemarch", "thomas hardy", "tess", "james joyce", "ulysses", "virginia woolf",
      "mrs dalloway", "george orwell", "1984", "chinua achebe", "things fall apart", "salman rushdie", "midnight's children"
    ]
  },
  {
    unitNumber: 4,
    unitCode: "UNIT_4_NON_FICTIONAL_PROSE",
    unitName: "Non-Fictional Prose",
    keywords: [
      "essay", "prose", "biography", "autobiography", "francis bacon", "addison and steele",
      "spectator", "samuel johnson", "lives of the poets", "charles lamb", "essays of elia",
      "william hazlitt", "thomas carlyle", "john ruskin", "untouchable", "walter pater",
      "lytton strachey", "eminent victorians", "george orwell essays", "mahatma gandhi autobiography",
      "jawaharlal nehru discovery of india", "b.r. ambedkar", "travelogue", "memoir"
    ]
  },
  {
    unitNumber: 5,
    unitCode: "UNIT_5_LANGUAGE_THEORIES_PEDAGOGY",
    unitName: "Language: Basic Concepts, Theories and Pedagogy / English in Use",
    keywords: [
      "linguistics", "phonetics", "phonology", "morphology", "syntax", "semantics", "pragmatics",
      "sociolinguistics", "structural linguistics", "ferdinand de saussure", "langue", "parole",
      "signifier", "signified", "noam chomsky", "universal grammar", "competence and performance",
      "elt", "english language teaching", "esl", "direct method", "grammar translation", "communicative language teaching"
    ]
  },
  {
    unitNumber: 6,
    unitCode: "UNIT_6_ENGLISH_IN_INDIA",
    unitName: "English in India: History, Evolution and Futures",
    keywords: [
      "macaulay's minute", "macaulay", "wood's despatch", "charter act 1813", "english in india",
      "bilingualism", "multilingualism", "three language formula", "raja ram mohan roy",
      "toru dutt", "sri aurobindo", "sarojini naidu", "mulk raj anand", "r.k. narayan",
      "raja rao", "kanthapura", "anita desai", "kamala das", "nissim ezekiel", "a.k. ramanujan", "arun kolatkar"
    ]
  },
  {
    unitNumber: 7,
    unitCode: "UNIT_7_CULTURAL_STUDIES",
    unitName: "Cultural Studies",
    keywords: [
      "cultural studies", "birmingham school", "richard hoggart", "uses of literacy",
      "raymond williams", "culture and society", "long revolution", "e.p. thompson",
      "stuart hall", "encoding decoding", "subculture", "dick hebdige", "popular culture",
      "mass culture", "cultural materialism", "ideology and ideological state apparatuses",
      "althusser", "gramsci hegemony", "hegemony", "media studies", "cyberculture"
    ]
  },
  {
    unitNumber: 8,
    unitCode: "UNIT_8_LITERARY_CRITICISM",
    unitName: "Literary Criticism",
    keywords: [
      "literary criticism", "plato poetics", "aristotle", "poetics", "mimesis", "catharsis", "hamartia",
      "longinus", "on the sublime", "horace", "ars poetica", "philip sidney", "apology for poetry",
      "john dryden", "essay of dramatic poesy", "alexander pope essay on criticism", "samuel johnson preface to shakespeare",
      "wordsworth preface to lyrical ballads", "coleridge biographia literaria", "matthew arnold touchstone method",
      "t.s. eliot tradition and the individual talent", "objective correlative", "dissociation of sensibility", "i.a. richards", "practical criticism"
    ]
  },
  {
    unitNumber: 9,
    unitCode: "UNIT_9_LITERARY_THEORY",
    unitName: "Literary Theory post World War II",
    keywords: [
      "literary theory", "russian formalism", "shklovsky", "defamiliarization", "new criticism",
      "wimsatt and beardsley", "intentional fallacy", "affective fallacy", "structuralism",
      "claude levi-strauss", "roland barthes", "death of the author", "post-structuralism",
      "jacques derrida", "deconstruction", "differance", "michel foucault", "discourse", "panopticon",
      "psychoanalysis", "jacques lacan", "feminist theory", "elaine showalter", "gynocriticism",
      "edward said", "orientalism", "postcolonial theory", "homi bhabha", "hybridity", "gayatri spivak", "subaltern"
    ]
  },
  {
    unitNumber: 10,
    unitCode: "UNIT_10_RESEARCH_METHODS_MATERIALS",
    unitName: "Research Methods and Materials in English",
    keywords: [
      "research methods", "methodology", "mla handbook", "citation style", "bibliography",
      "works cited", "in-text citation", "primary source", "secondary source", "textual criticism",
      "variorum edition", "plagiarism", "literature review", "qualitative research",
      "quantitative research", "archival research", "digital humanities", "peer review", "monograph"
    ]
  }
];

export function classifyEnglishText(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  let best = UGC_NET_ENGLISH_TAXONOMY[0];
  let maxScore = -1;

  for (const u of UGC_NET_ENGLISH_TAXONOMY) {
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
