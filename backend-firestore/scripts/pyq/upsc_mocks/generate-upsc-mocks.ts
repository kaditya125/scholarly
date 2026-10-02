/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Sadhya — UPSC CSE Prelims Mock Question Generator  (AI-Driven, Multi-Paper)
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Generates a comprehensive UPSC CSE Prelims GS-1 mock corpus using Gemini AI.
 * All output goes to the dedicated `upsc_mock_questions` Firestore collection.
 * NEVER touches `pyq_questions` — full isolation maintained.
 *
 * Papers generated:
 *   UPSC_FLT_01  — Full-Length GS-1 (100 Qs) — Standard Pattern
 *   UPSC_FLT_02  — Full-Length GS-1 (100 Qs) — Advanced Analytical
 *   UPSC_FLT_03  — Full-Length GS-1 (100 Qs) — Conceptual / Statement-based
 *   UPSC_FLT_04  — Full-Length GS-1 (100 Qs) — Current Affairs & Environment
 *   UPSC_CSAT_01 — Full-Length CSAT Paper-2 (80 Qs)
 *   UPSC_SEC_HISTORY_01  — Sectional History & Culture (50 Qs)
 *   UPSC_SEC_POLITY_01   — Sectional Polity & Governance (50 Qs)
 *   UPSC_SEC_GEO_01      — Sectional Geography (50 Qs)
 *   UPSC_SEC_ENV_01      — Sectional Environment & Ecology (50 Qs)
 *   UPSC_SEC_ECON_01     — Sectional Indian Economy (50 Qs)
 *   UPSC_SEC_SCIENCE_01  — Sectional Science & Technology (50 Qs)
 *
 * Total target: ~780 questions
 *
 * USAGE:
 *   npx tsx scripts/pyq/upsc_mocks/generate-upsc-mocks.ts           # dry-run
 *   npx tsx scripts/pyq/upsc_mocks/generate-upsc-mocks.ts --execute # live
 *
 * Reference platforms whose style/difficulty/coverage has informed prompts:
 *   Vision IAS PT365, Insights IAS Prelims Marathon, GS Score Test Series,
 *   Vajiram & Ravi Test Series, ForumIAS Prelims Marathon, Testbook UPSC Series
 */

import { createHash } from 'crypto';
import { db } from '../../../src/config/firebase';
import { createGoogleGenAIClient } from '../../../src/services/ai/googleGenAIClient';
import { UPSCMockQuestion } from './upscMock.types';

const EXECUTE = process.argv.includes('--execute');
const ai = createGoogleGenAIClient();


// ─────────────────────────────────────────────────────────────────────────────
// ID GENERATION
// ─────────────────────────────────────────────────────────────────────────────

function makeQuestionId(
  paperCode: string,
  subject: string,
  questionText: string,
  options: string[],
): string {
  const normalizedSubject = subject.toLowerCase().replace(/[^a-z0-9]/g, '_');
  const paperPart = paperCode.toLowerCase();
  const content = `UPSC_MOCK::${questionText}::${[...options].sort().join('|')}`;
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 8);
  return `mock:upsc:${paperPart}:${normalizedSubject}:${hash}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// CHUNK DEFINITION
// ─────────────────────────────────────────────────────────────────────────────

interface GenerationChunk {
  mockPaperId: string;
  testType: 'FULL_LENGTH' | 'SECTIONAL';
  paperType: 'GS_PAPER_1' | 'CSAT_PAPER_2';
  subject: string;
  count: number;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD' | 'MIXED';
  guidelines: string;
}

const GS1_CHUNKS: GenerationChunk[] = [
  // ─── UPSC_FLT_01 — Standard Full-Length GS-1 (100 Qs) ─────────────────────
  { mockPaperId: 'UPSC_FLT_01', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Indian Polity & Governance', count: 20, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Polity & Governance. Topics: Constitutional Framework, Fundamental Rights & DPSPs, Parliament & Legislatures, Executive, Judiciary (SC/HC/Tribunals), Federalism, Local Self-Government (73rd & 74th Amendments), Constitutional & Statutory Bodies (CAG, NHRC, CVC, CIC, UPSC, Finance Commission), Elections & ECI, Governor's role, Emergency Provisions. Mix factual, statement-based (2-3 statements, which are correct/incorrect), and matching questions. UPSC style: concise stems, 4 options A-D, all options plausible. No "None of the above". Difficulty: 8 EASY, 8 MEDIUM, 4 HARD.` },
  { mockPaperId: 'UPSC_FLT_01', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'History & Culture', count: 20, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 History & Culture. Topics: Ancient Civilizations (IVC, Vedic, Mauryan, Gupta), Medieval India (Delhi Sultanate, Mughal, Bhakti-Sufi), Indian Struggle for Independence (1857, INC formation, Gandhi's movements, Quit India), Post-1947 Integration, Art & Architecture (temples, sculptures, cave paintings, classical dance, music), Literature (Sanskrit, Pali, Tamil Sangam). Blend factual (who/what/when) and analytical (why/significance) questions. Prioritize frequently tested UPSC topics and recent shifts in syllabus emphasis. Difficulty: 6 EASY, 10 MEDIUM, 4 HARD.` },
  { mockPaperId: 'UPSC_FLT_01', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Geography', count: 18, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Geography. Topics: Physical Geography (landforms, rivers, mountains, peninsular plateau, Himalayas, coastlines), Climatology (monsoon mechanism, climate types, rainfall distribution), Economic Geography (minerals, agriculture patterns, soils, irrigation), World Geography (continents, oceans, major rivers, passes), Indian Physical Geography (biogeographic zones, watersheds). Mix map-based (without map), identification-based, statement-based questions. Difficulty: 5 EASY, 9 MEDIUM, 4 HARD.` },
  { mockPaperId: 'UPSC_FLT_01', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Environment & Ecology', count: 18, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Environment & Ecology. Topics: Biodiversity (hotspots, endemic species, IUCN Red List, Ramsar wetlands, Biosphere Reserves, World Heritage Sites, Tiger Reserves, National Parks), Climate Change (IPCC, Paris Agreement, Carbon credits, NDCs), Pollution (types, effects, regulations), Environmental Laws & Bodies (EPA, WPA, Forest Rights Act, CPCB, SPCB), International Conventions (CBD, CITES, Nagoya Protocol, Bonn Convention, Montreal Protocol). Highly statement-based. Include recent species/sites news. Difficulty: 4 EASY, 9 MEDIUM, 5 HARD.` },
  { mockPaperId: 'UPSC_FLT_01', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Indian Economy', count: 14, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Indian Economy. Topics: National Income Concepts (GDP, GNP, NNP, GVA, Base Year), Planning (NITI Aayog, Five-Year Plans legacy), Banking & Finance (RBI functions, CRR, SLR, Repo, MSF, Monetary Policy Committee), Capital Markets (SEBI, IPO, Bonds, Mutual Funds), Inflation (CPI, WPI, Core Inflation), Government Budget (fiscal deficit, revenue deficit, CAD, FRBM), International Trade & WTO, Agriculture (Green Revolution, MSP, PM-KISAN, MGNREGS), Flagship Schemes (PM Gati Shakti, PLI, Atmanirbhar Bharat). Prioritize conceptual + current affairs linkage. Difficulty: 4 EASY, 7 MEDIUM, 3 HARD.` },
  { mockPaperId: 'UPSC_FLT_01', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Science & Technology', count: 10, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Science & Technology. Topics: Space Technology (ISRO missions — Chandrayaan-3, Aditya-L1, PSLV, GSLV, One Web, XPoSat), Defence Technology (DRDO, IGMDP, INS Vikrant, Kaveri engine, TEJAS), Biotechnology (GM crops, CRISPR-Cas9, mRNA vaccines), IT & AI (5G rollout, AI governance, Digital India), Nuclear Technology (NSG, CTBT, NPT, three-stage programme), Health & Pharma (COVID vaccines, NTDs, WHO targets). Mix factual and statement-based. Difficulty: 3 EASY, 4 MEDIUM, 3 HARD.` },

  // ─── UPSC_FLT_02 — Advanced Analytical Full-Length GS-1 (100 Qs) ──────────
  { mockPaperId: 'UPSC_FLT_02', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Indian Polity & Governance', count: 20, difficulty: 'HARD', guidelines: `UPSC Prelims GS-1 Polity HARD — Advanced. Focus on nuanced provisions: Schedule 7 (Union, State, Concurrent Lists), Constitutional Amendments (42nd, 44th, 52nd, 73rd, 74th, 86th, 101st), Judicial Pronouncements (Kesavananda Bharati, Minerva Mills, Maneka Gandhi, SR Bommai, Golaknath, Indra Sawhney), Special Provisions (Art 370 historical, Art 371, President's Rule criteria), Inter-State water & council disputes, Speaker's role & anti-defection, Parliamentary Committees, Privilege. All statement-based (3+ statements). Very hard distractors. No easy answers.` },
  { mockPaperId: 'UPSC_FLT_02', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'History & Culture', count: 20, difficulty: 'HARD', guidelines: `UPSC Prelims GS-1 History HARD. Topics: Architectural analysis (Nagara vs Vesara vs Dravida styles, specific temples like Kandariya Mahadeva, Brihadeeswarar, Dilwara Jain temples), Numismatic & inscription evidence, Religious movements (Charvaka, Ajivika, Jainism, Buddhism sects — Hinayana/Mahayana/Vajrayana — spread & doctrine differences), Sufi orders (Chishti, Suhrawardi, Qadiri, Naqshbandi), Bhakti saints (chronology, philosophy), Major revolts before 1857 (Sanyasi, Polygar, Kittur, Wahabi, Faraizi), Freedom movement factions (Moderates vs Extremists, Home Rule, Non-cooperation, Civil Disobedience, Cabinet Mission, Constituent Assembly composition).` },
  { mockPaperId: 'UPSC_FLT_02', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Geography', count: 18, difficulty: 'HARD', guidelines: `UPSC Prelims GS-1 Geography HARD. Topics: Ocean Currents (warm vs cold, their impact on climate and fishing), Atmospheric Circulation (jet streams, Hadley/Ferrel/Polar cells, trade winds, westerlies), Glaciation (fjords, U-valleys, moraines, drumlins), Earthquake & Volcanic activity (Ring of Fire, plate boundaries, types), River regimes & drainage patterns, Soil erosion & degradation, Tropical Cyclone formation & naming convention, Fog formation types. Heavily statement-based with 4-5 options trapping common misconceptions.` },
  { mockPaperId: 'UPSC_FLT_02', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Environment & Ecology', count: 18, difficulty: 'HARD', guidelines: `UPSC Prelims GS-1 Environment HARD. Topics: Ecosystem services & valuation, Food chains & trophic levels (energy flow, ecological pyramids), Carbon & Nitrogen cycles, Biodiversity Convention protocols (Aichi Targets vs Kunming-Montreal framework, 30x30 target), Critically Endangered/Endemic species (Great Indian Bustard, Red Panda, Nilgiri Tahr, Irrawaddy dolphin, Olive Ridley nesting sites), Mangroves distribution, Coral reef bleaching mechanisms, Invasive Species (Lantana, Water Hyacinth, Prosopis Juliflora), Green Finance (Green Bonds, Climate Finance, Loss & Damage fund from COP28).` },
  { mockPaperId: 'UPSC_FLT_02', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Indian Economy', count: 14, difficulty: 'HARD', guidelines: `UPSC Prelims GS-1 Economy HARD. Topics: Monetary Transmission mechanism, External Sector (BoP, FOREX reserves, Current Account, Capital Account, External Debt), Indexation (WPI vs CPI components, base revision), Tax Structure (GST Council, dual GST, IGST mechanism, direct vs indirect), Foreign Investment (FDI routes — automatic vs approval, FPI limits, FEMA), Public Finance (off-budget borrowings, zero-based budgeting, outcome budgeting), Factor markets & labour reforms, Agricultural value chains & price policy complexities, Inflation targeting framework & limitations.` },
  { mockPaperId: 'UPSC_FLT_02', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Science & Technology', count: 10, difficulty: 'HARD', guidelines: `UPSC Prelims GS-1 Science HARD. Topics: Semiconductor policy & chipmaking (photolithography, EUV, fabs), Quantum Computing (qubits, superposition, entanglement — conceptual UPSC level), Nanotechnology applications, Genome editing vs gene therapy distinctions, mRNA platform applications beyond COVID, Dark matter & Dark energy (UPSC conceptual level), Gravitational waves (LIGO, what it measures), Global navigation satellite systems (GPS, GLONASS, Galileo, NavIC — differences), Cybersecurity (zero-day, ransomware, deep-fake regulatory issues).` },

  // ─── UPSC_FLT_03 — Conceptual / Statement-Heavy Full-Length GS-1 (100 Qs) ─
  { mockPaperId: 'UPSC_FLT_03', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Indian Polity & Governance', count: 20, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Polity — Heavy statement-based. Every question must be the "Consider the following statements..." format with 3–4 statements. Topics: Parliamentary procedures (question hour, zero hour, adjournment motion, no-confidence, budget process), Constitutional bodies powers & limitations, Quasi-judicial bodies, RTI Act provisions, Lokpal & Lokayukta Act, POCSO Act, IPC vs BNS comparison, Electoral reforms, Cooperative federalism (Finance Commission recommendations, grants, devolution), Goods & Services Tax Constitutional Amendment provisions.` },
  { mockPaperId: 'UPSC_FLT_03', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'History & Culture', count: 18, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 History — Visual & matching style. Many questions on architectural features, sites, and their locations (without map). Topics: UNESCO World Heritage Sites in India and their period/dynasty, Classical dances (Bharatanatyam, Kathak, Odissi, Kuchipudi, Mohiniyattam, Manipuri, Sattriya — their states/features), Musical traditions (Hindustani vs Carnatic distinctions, instruments categories — chordophone, idiophone, membranophone), Paintings (Mughal, Kangra, Pala, Madhubani, Warli, Pattachitra), Fairs & Festivals cultural significance, Crafts & GI tags for traditional crafts.` },
  { mockPaperId: 'UPSC_FLT_03', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Geography', count: 18, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Geography — assertion-reason and matching dominant. Topics: River-sea relationships (rivers joining seas/gulfs/bays), National parks/wildlife sanctuaries and states (matching), Dam-River-State triplets, Mineral-State associations (iron ore, mica, coal, bauxite, manganese belts), Crop-region-season associations (Kharif/Rabi/Zaid with states), Ocean ridges and trenches, Biomes (tropical rainforest, savanna, Mediterranean, taiga, tundra characteristics), Tidal patterns, International Date Line, Arctic vs Antarctic differences.` },
  { mockPaperId: 'UPSC_FLT_03', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Environment & Ecology', count: 18, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Environment — assertion-reason and matching. Topics: Matching species-habitat-threat, Wildlife Protection Act 1972 schedules and what each covers, Biosphere Reserves in India (list and their states/core zones), Ramsar Sites in India (significant ones and their state), Tiger Project origins (1973), Project Elephant, Conservation breeding programmes (crocodilians, vulture), Pollution norms (CPCB emission standards, BS-VI, LPG subsidies), Solid waste management rules, EIA notification and its amendments, Coastal Regulation Zone.` },
  { mockPaperId: 'UPSC_FLT_03', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Indian Economy', count: 14, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Economy — concept-application heavy. Topics: Banking sector reforms (Bad Bank — NARCL, IBC process, SARFAESI, NPA classification, Basel norms), Startup ecosystem (DPIIT, Fund of Funds, Startup India scheme provisions), Digital Payments (UPI, CBDC — e-Rupee pilot, payment aggregators, NPCI), Social sector schemes (PM-PMJAY, PM-AWAS, PM Poshan, NAMAMI GANGE, Jal Jeevan Mission), Infrastructure financing (NaBFID, Hybrid Annuity Model, VGF, InvITs, REITs), Agri-sector (e-NAM, FPOs, PM-FASAL BIMA, Crop insurance reforms).` },
  { mockPaperId: 'UPSC_FLT_03', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Science & Technology', count: 12, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Sci-Tech — current affairs dominant (2023–2025 events). Topics: ISRO launches and their payloads, Gaganyaan mission updates, India's nuclear submarine programme, AI policy (India AI Mission, National AI Strategy, DeepSeek AI controversy), Health schemes (Mission Indradhanush, Poshan 2.0, new vaccines in UIP), Rare diseases, New drug approvals (NCD therapy, anti-malaria), Climate tech (green hydrogen — SIGHT scheme, PLI for batteries, FAME II for EVs), Semiconductor mission progress.` },

  // ─── UPSC_FLT_04 — Current Affairs & Environment Focused (100 Qs) ──────────
  { mockPaperId: 'UPSC_FLT_04', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Current Affairs', count: 25, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Current Affairs (2024–2025). Topics: India's diplomatic relations (G20 New Delhi Declaration outcomes, India-Canada tension, India-China LAC restoration talks, SCO Summits, Quad developments, India-Middle East corridor), Defence acquisitions (Predator drones, Apache helicopters, P-8I Poseidon, indigenous warships), Constitutional/legal developments (Art 39A free legal aid updates, EWS reservation SC verdict, UAPA amendments), Awards (Bharat Ratna 2024 recipients: Charan Singh, PV Narasimha Rao, MS Swaminathan, LK Advani, Karpoori Thakur; Nobel, Oscars Indian angle), Sports (Paris Olympics 2024 Indian medals — Neeraj Chopra silver, Manu Bhaker bronze×2 etc.), Economic data (GDP growth estimates, inflation trends, forex reserves). Mix factual and analytical.` },
  { mockPaperId: 'UPSC_FLT_04', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Environment & Ecology', count: 22, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Environment Current Angle. Topics: COP28 (UAE, 2023) outcomes — Loss & Damage Fund operationalised, Global Stocktake, Just Transition declaration, fossil fuel phasedown vs phaseout; COP29 (Azerbaijan, 2024) climate finance goal ($300 billion); Kunming-Montreal Biodiversity Framework (30x30, rights of nature); India specific — Cauvery water disputes, Himalayan glacial lake outburst floods, Great Nicobar development controversy, Cheetah reintroduction (Kuno NP) — successes and deaths; Environmental degradation of sacred groves; Blue Economy — India's Blue Economy Policy; Ocean Biodiversity (BBNJ Treaty / High Seas Treaty).` },
  { mockPaperId: 'UPSC_FLT_04', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Indian Polity & Governance', count: 18, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Polity Current Angle. Topics: One Nation One Election (Justice Kovind Committee recommendations), Delimitation Commission updates (North-East states delimitation), New Criminal Laws (BNS, BNSS, BSA) key changes vs IPC/CrPC/Evidence Act, 103rd Constitutional Amendment (EWS reservation), DPDP Act 2023 provisions, Digital Personal Data Protection Bill key features, PMLA amendments & ED powers (SC scrutiny), Electoral Bonds scheme SC judgment (ADR case), CAA-NRC linkage questions, Reservation for SC-STs in promotions (legal position).` },
  { mockPaperId: 'UPSC_FLT_04', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'Indian Economy', count: 18, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 Economy Current Angle. Topics: Union Budget 2024–25 highlights (Viksit Bharat 2047 vision, capital expenditure, new tax slabs, employment-linked incentives), Economic Survey 2023–24 key themes (private investment, financial sector, climate finance), India's FDI trends (which sectors attracted most, IIT-specific), India's UPI global expansion (Bharat-France, Bharat-Singapore real-time linkage), Digital Rupee rollout progress, Production Linked Incentive (PLI) scheme sector outcomes, PM Vishwakarma scheme, GST compensation cess issue, India's first Sovereign Green Bond issuance.` },
  { mockPaperId: 'UPSC_FLT_04', testType: 'FULL_LENGTH', paperType: 'GS_PAPER_1', subject: 'International Relations', count: 17, difficulty: 'MIXED', guidelines: `UPSC Prelims GS-1 International Relations. Topics: Multilateral organisations (UN, IMF, WB, WTO, AIIB, NDB — voting structures, India's role), Regional groupings (ASEAN, SAARC, SCO — India's participation), India's Act East Policy and BIMSTEC, India-Africa relations (voice in global south), AUKUS (what it is and India's position), Israel-Hamas conflict and India's position, Russia-Ukraine war and India's strategic autonomy, Taiwan Strait tensions and India's trade dependency on Taiwan semiconductors, India's G20 presidency legacy, Neighbourhood First policy (Bangladesh, Sri Lanka, Nepal — recent friction points).` },
];

const CSAT_CHUNKS: GenerationChunk[] = [
  // ─── UPSC_CSAT_01 — Full-Length CSAT Paper-2 (80 Qs) ─────────────────────
  { mockPaperId: 'UPSC_CSAT_01', testType: 'FULL_LENGTH', paperType: 'CSAT_PAPER_2', subject: 'Reading Comprehension', count: 30, difficulty: 'MIXED', guidelines: `UPSC CSAT Paper-2 Reading Comprehension. Create 6 passages (3 short ~150 words, 3 medium ~250 words) with 5 questions each. Topics should be governance, science, society, economy — UPSC CSAT style. Questions should test: inference, main idea identification, assumption identification, tone/attitude of author, logical completion of passage. Each question must have 4 options A-D with exactly one correct. The passage must be in the questionText field with a note like "[PASSAGE: ...]" followed by the actual question. Difficulty mix: 10 EASY, 15 MEDIUM, 5 HARD.` },
  { mockPaperId: 'UPSC_CSAT_01', testType: 'FULL_LENGTH', paperType: 'CSAT_PAPER_2', subject: 'Quantitative Aptitude', count: 28, difficulty: 'MIXED', guidelines: `UPSC CSAT Paper-2 Quantitative Aptitude & Numeracy. Topics: Percentages, Profit & Loss, Simple & Compound Interest, Ratio & Proportion, Time-Speed-Distance, Work & Time, Averages, Mixtures & Allegations, Number System (HCF/LCM, divisibility), Simplification (BODMAS), Data Interpretation (table/bar graph data given in question stem), Permutation & Combination (basic), Probability (basic). All questions must be self-contained with all data in the stem. UPSC CSAT difficulty (moderate-hard). 4 options A-D, one correct, no "None of the above". Difficulty mix: 8 EASY, 14 MEDIUM, 6 HARD.` },
  { mockPaperId: 'UPSC_CSAT_01', testType: 'FULL_LENGTH', paperType: 'CSAT_PAPER_2', subject: 'Logical Reasoning', count: 22, difficulty: 'MIXED', guidelines: `UPSC CSAT Paper-2 Logical Reasoning & Mental Ability. Topics: Blood Relations (3-4 step family trees), Direction & Distance, Seating Arrangements (linear, circular), Coding-Decoding (letter/number patterns), Series completion (alphabetic, numeric, mixed), Analogy (word-pairs logic), Odd-one-out (concept grouping), Syllogism (Venn diagram logic), Logical sequences (if-then deductions), Critical Reasoning (assumption identification, strengthening/weakening argument). Self-contained, no external data needed. Mix: 5 EASY, 12 MEDIUM, 5 HARD.` },
];

const SECTIONAL_CHUNKS: GenerationChunk[] = [
  // ─── Sectional Banks (50 Qs each) ─────────────────────────────────────────
  { mockPaperId: 'UPSC_SEC_HISTORY_01', testType: 'SECTIONAL', paperType: 'GS_PAPER_1', subject: 'History & Culture', count: 50, difficulty: 'MIXED', guidelines: `Deep-dive History & Culture sectional for UPSC Prelims. Ancient India (20 Qs): IVC script & trade, Vedic period (Rig, Sama, Yajur, Atharva), Jainism (Tirthankaras, doctrines), Buddhism (8-fold path, councils, spread), Mauryan administration (Arthashastra, Megasthenes, edicts), Post-Mauryan (Satavahana, Kushana, Sangam age), Gupta 'golden age' (Nalanda, Aryabhata, Kalidasa). Medieval India (15 Qs): Delhi Sultanate (Iqta system, Mongol invasions, Ibn Battuta), Vijayanagara & Bahmanis, Mughal administration, Sufism and Bhakti saints (with their works/bhasha). Modern India (15 Qs): 1857 causes/leaders, Early nationalist organisations (INC 1885, Muslim League 1906), Partition of Bengal, Lucknow Pact, Gandhi era movements, INA, Wavell Plan, Mountbatten Plan. Mix EASY/MEDIUM/HARD evenly.` },
  { mockPaperId: 'UPSC_SEC_POLITY_01', testType: 'SECTIONAL', paperType: 'GS_PAPER_1', subject: 'Indian Polity & Governance', count: 50, difficulty: 'MIXED', guidelines: `Deep-dive Polity & Governance sectional for UPSC Prelims. Constitutional Framework (12 Qs): Constituent Assembly composition and functioning, Sources of Constitution, Schedules (1–12) and Articles, Preamble keywords (socialist/secular added by 42nd Amdt), Citizenship acquisition and loss. Fundamental Rights & DPSPs (8 Qs): FR Articles 12–35 key provisions, DPSP categories (socialist/Gandhian/liberal), conflict between FRs and DPSPs (Kesavananda Bharati). Parliament (10 Qs): Joint sitting conditions, Money Bill (Rajya Sabha's limited role), Speaker/Deputy Speaker election, Parliamentary Committees (PAC, Estimates, Joint), Budget process. Executive (8 Qs): President's discretionary powers, PM's accountability, Cabinet system, Attorney General vs Solicitor General. Judiciary (7 Qs): SC jurisdiction types (original/appellate/advisory), Article 32 vs 226 writ jurisdiction, Tribunals (Art 323A/B). States (5 Qs): Governor's pleasure doctrine, State Legislature, State Council. Mix difficulty evenly.` },
  { mockPaperId: 'UPSC_SEC_GEO_01', testType: 'SECTIONAL', paperType: 'GS_PAPER_1', subject: 'Geography', count: 50, difficulty: 'MIXED', guidelines: `Deep-dive Geography sectional for UPSC Prelims. Physical India (15 Qs): Himalayan ranges (Greater, Lesser, Sub-Himalaya — locations and passes), Northern Plains (Bhangar vs Khadar, Terai), Peninsular Plateau (Deccan, Chota Nagpur, Bundelkhand), Eastern & Western Ghats differences, Coastal plains (Konkan, Malabar, Coromandel), Island groups (Andaman & Nicobar vs Lakshadweep origin). Rivers (10 Qs): Himalayan rivers (Indus system, Ganga system tributaries L & R, Brahmaputra drainage), Peninsular rivers (east-flowing: Mahanadi, Godavari, Krishna, Cauvery; west-flowing: Narmada, Tapi, Sabarmati), River linking project, Interlinking controversy, Floods and drought-prone regions. Climate (10 Qs): India's monsoon mechanism (ITCZ, Hadley circulation role), Retreat of monsoon, Western disturbances, Local winds (Loo, Kalbaisakhi, Mango showers). Economic Geography (15 Qs): Coal fields (Jharia, Raniganj, Singrauli), Iron ore (Bailadila, Kudremukh, Singhbhum), Petroleum fields (Mumbai High, Digboi, KG Basin), Agriculture zones (rice bowl, wheat belt), Fisheries (major ports, aquaculture states).` },
  { mockPaperId: 'UPSC_SEC_ENV_01', testType: 'SECTIONAL', paperType: 'GS_PAPER_1', subject: 'Environment & Ecology', count: 50, difficulty: 'MIXED', guidelines: `Deep-dive Environment & Ecology sectional for UPSC Prelims. Ecology Fundamentals (15 Qs): Types of ecosystems, Biotic components (producers, consumers, decomposers), Energy flow (10% law), Biogeochemical cycles (Carbon, Nitrogen, Phosphorus, Water cycle), Ecological Succession (primary vs secondary), Keystone species, Umbrella species. Biodiversity (15 Qs): India's biodiversity hotspots (4 hotspots), IUCN categories with examples (Critically Endangered Indian species), Convention on Biological Diversity (CBD) protocols — Nagoya on ABS, Cartagena on Biosafety, Kunming-Montreal framework, Biosphere Reserves (UNESCO-MAB programme, list and their states), Tiger Reserves (Project Tiger 1973, current count approx. 54, critical ones), Wetlands & Ramsar Sites. Environmental Laws (10 Qs): Environmental Protection Act 1986, Wildlife Protection Act 1972 Schedules, Forest Conservation Act (FCA) 1980 amendments, Forest Rights Act 2006 — provisions for tribals, Coastal Regulation Zone notifications, EIA process and public hearing. Climate & Pollution (10 Qs): GHG emission sources, India's NDC targets, COP outcomes (Paris → Dubai → Baku), Ozone layer depletion (HFCs, Kigali Amendment), Plastic waste management rules, E-waste rules, Biomedical waste, Noise pollution standards.` },
  { mockPaperId: 'UPSC_SEC_ECON_01', testType: 'SECTIONAL', paperType: 'GS_PAPER_1', subject: 'Indian Economy', count: 50, difficulty: 'MIXED', guidelines: `Deep-dive Indian Economy sectional for UPSC Prelims. Macroeconomic Concepts (15 Qs): GDP vs GNP vs NNP calculations, GVA concept, Base year revision, National Income estimation methods (output, expenditure, income), Per capita income, HDI components, GINI coefficient interpretation, Economic growth vs development distinction. Money & Banking (12 Qs): Functions of RBI, Monetary Policy instruments (CRR, SLR, Repo, Reverse Repo, MSF, Open Market Operations), Monetary Policy Committee composition, Types of banks (commercial, cooperative, payments banks, small finance banks), Priority Sector Lending norms, NBFC categories, Financial Inclusion (Jan Dhan Yojana, PMJJBY, PMSBY). Fiscal Policy (10 Qs): Types of taxes, GST structure (CGST/SGST/IGST/UTGST), Fiscal deficit vs Revenue deficit vs Primary deficit, FRBM targets, Public Debt management, Off-budget items, Finance Commission role. External Sector (8 Qs): Current Account vs Capital Account, BOP equilibrium, FOREX reserves composition, FDI vs FPI vs FII, Export promotion schemes (MEIS/RoDTEP), India's trade partners. Schemes (5 Qs): PM Gati Shakti, SVAMITVA, PM MUDRA Yojana, Stand-up India, GeM portal.` },
  { mockPaperId: 'UPSC_SEC_SCIENCE_01', testType: 'SECTIONAL', paperType: 'GS_PAPER_1', subject: 'Science & Technology', count: 50, difficulty: 'MIXED', guidelines: `Deep-dive Science & Technology sectional for UPSC Prelims. Basic Science (10 Qs): Laws of Thermodynamics (applications), Electromagnetic spectrum (visible light, X-rays, gamma rays — uses), Types of radioactivity (alpha, beta, gamma — properties), pH scale applications, Vitamins & deficiency diseases, Antibiotics (mechanism) vs vaccines (mechanism), Blood groups (ABO, Rh), DNA vs RNA distinction, Mitosis vs Meiosis key differences, Photosynthesis & Respiration equations. Space Technology (10 Qs): ISRO launch vehicles (PSLV variants, GSLV MkIII/LVM3, SSLV), Chandrayaan-3 (Vikram lander south pole landing significance), Aditya-L1 (L1 Lagrange point, Coronagraph instrument), Gaganyaan (HLVM3, Vyommitra, astronaut selection), XPoSat (X-ray Polarimetry), India's commercial space policy, One Space (private), NavIC (7-satellite constellation, coverage). Defence & Nuclear (10 Qs): DRDO flagship programmes (Pinaka, Pralay, Agni series range), Tejas Mk1A features, INS Vikrant (first indigenous carrier), Nuclear doctrine (No First Use, minimum credible deterrence), NSG membership bid, NPT & CTBT India's position, Three-stage nuclear programme (PHWRs → FBRs → Thorium breeders). Biotechnology & Health (10 Qs): CRISPR-Cas9 mechanism (Nobel 2020 — Jennifer Doudna & Emmanuelle Charpentier), Gene therapy vs genome editing distinction, mRNA vaccine platform advantages, India's vaccine diplomacy (Vaccine Maitri), WHO prequalification of Covaxin, NTDs (Kala-Azar elimination target), Nipah virus — reservoir, transmission, Kerala outbreaks. ICT & Emerging Tech (10 Qs): AI & Machine Learning (supervised/unsupervised learning basic distinction), Deep Learning (neural networks), Blockchain (immutability, consensus mechanism, uses — land records, supply chain), Quantum Computing (qubit, superposition, entanglement — UPSC level conceptual), 5G bands (sub-6GHz vs mmWave) and India rollout, Cybersecurity threats (ransomware, phishing, zero-day exploits), Digital India pillars, CERT-In role.` },
];

// ─────────────────────────────────────────────────────────────────────────────
// PROMPT BUILDER
// ─────────────────────────────────────────────────────────────────────────────

function buildPrompt(chunk: GenerationChunk): string {
  const isCSAT = chunk.paperType === 'CSAT_PAPER_2';
  const marksPerQ = isCSAT ? 2.5 : 2.0;
  const negMarks = isCSAT ? 0.83 : 0.66;

  return `You are an elite UPSC Civil Services Exam question designer with 15+ years of experience, drawing upon question styles from:
- Vision IAS PT365 Test Series
- Insights IAS Prelims Marathon
- GS Score Test Series
- Vajiram & Ravi IAS Academy modules
- ForumIAS Prelims Marathon (10,000 Questions initiative)
- Testbook UPSC Prelims Series

PAPER: ${chunk.mockPaperId} | SUBJECT: ${chunk.subject} | COUNT: ${chunk.count}

GUIDELINES:
${chunk.guidelines}

UPSC PATTERN RULES (MANDATORY):
1. EXACTLY ${chunk.count} questions — no more, no less.
2. Each question has EXACTLY 4 options labeled A, B, C, D.
3. NO "None of the above", "All of the above", "Both (a) and (b)" options.
4. Marks per question: ${marksPerQ} | Negative marks: ${negMarks}
5. Options must be plausible distractors — not obviously wrong.
6. For statement-based questions: use "Consider the following statements:" format.
7. Explanations must be factually accurate, detailed (2–4 sentences), and cite source/Article/section where relevant.
8. Questions must NOT repeat across the set. All must be unique.
9. Difficulty distribution as specified in guidelines. Label each with EASY/MEDIUM/HARD.
10. For matching questions use format: "1-P, 2-Q, 3-R, 4-S" style options.
11. Do NOT use em-dashes (—) in question or option text. Use hyphens (-) or commas instead.

OUTPUT FORMAT: Return a valid JSON array of exactly ${chunk.count} objects:
[
  {
    "questionText": "string",
    "options": ["string (option A)", "string (option B)", "string (option C)", "string (option D)"],
    "correctAnswer": "A" | "B" | "C" | "D",
    "explanation": "string (2-4 sentences, cite source)",
    "difficulty": "EASY" | "MEDIUM" | "HARD",
    "subtopic": "string (specific topic/chapter)",
    "questionType": "factual" | "conceptual" | "statement_based" | "matching" | "assertion_reason" | "comprehension" | "data_interpretation"
  },
  ...
]

Respond with ONLY the JSON array. No markdown code fences, no preamble, no trailing text.`;
}

// ─────────────────────────────────────────────────────────────────────────────
// AI GENERATION + RETRY
// ─────────────────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function generateWithRetry(
  chunk: GenerationChunk,
  attempt = 1,
): Promise<any[]> {
  try {
    console.log(
      `    🤖 Calling Gemini [${chunk.mockPaperId}/${chunk.subject}] (attempt ${attempt})...`,
    );
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: buildPrompt(chunk),
    });
    const text = result.text ?? '';
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) {
      throw new Error('No JSON array found in response');
    }
    const parsed = JSON.parse(match[0]);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Empty or invalid array');
    }
    console.log(`    ✅ Got ${parsed.length} questions`);
    return parsed;
  } catch (err: any) {
    if (attempt < 3) {
      const delay = 3500 * attempt;
      console.warn(`    ⚠️ Attempt ${attempt} failed: ${err.message}. Retrying in ${delay}ms...`);
      await sleep(delay);
      return generateWithRetry(chunk, attempt + 1);
    }
    throw err;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIRESTORE WRITER
// ─────────────────────────────────────────────────────────────────────────────

async function writeToFirestore(questions: UPSCMockQuestion[]): Promise<void> {
  const COLLECTION = 'upsc_mock_questions';
  const BATCH_SIZE = 50;
  let written = 0;
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batchDocs = questions.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const q of batchDocs) {
      const docRef = db.collection(COLLECTION).doc(q.questionId);
      batch.set(docRef, q, { merge: true });
    }
    await batch.commit();
    written += batchDocs.length;
    console.log(`    💾 Firestore batch committed: ${written}/${questions.length}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS A SINGLE CHUNK
// ─────────────────────────────────────────────────────────────────────────────

async function processChunk(
  chunk: GenerationChunk,
  globalQuestionNum: { value: number },
  allQuestions: UPSCMockQuestion[],
): Promise<UPSCMockQuestion[]> {
  const isCSAT = chunk.paperType === 'CSAT_PAPER_2';
  const marksPerQ: 2.0 | 2.5 = isCSAT ? 2.5 : 2.0;
  const negMarks: 0.66 | 0.83 = isCSAT ? 0.83 : 0.66;

  const raw = await generateWithRetry(chunk);
  const now = Date.now();
  const questions: UPSCMockQuestion[] = [];

  for (const item of raw) {
    if (!item.questionText || !Array.isArray(item.options) || item.options.length !== 4) {
      console.warn('    ⚠️ Skipping malformed question');
      continue;
    }
    if (!['A', 'B', 'C', 'D'].includes(item.correctAnswer)) {
      console.warn('    ⚠️ Skipping question with invalid correctAnswer:', item.correctAnswer);
      continue;
    }

    const questionId = makeQuestionId(
      chunk.mockPaperId,
      chunk.subject,
      item.questionText,
      item.options,
    );

    // Check for duplicate across entire session
    if (allQuestions.some((q) => q.questionId === questionId)) {
      console.warn('    ⚠️ Duplicate hash detected, skipping');
      continue;
    }

    const contentRaw = `UPSC_MOCK::${item.questionText}::${[...item.options].sort().join('|')}`;
    const contentHash = createHash('sha256').update(contentRaw).digest('hex');

    questions.push({
      questionId,
      examId: 'UPSC_CSE',
      examStage: 'prelims',
      paperType: chunk.paperType,
      patternVersion: isCSAT ? 'csat_4_options_two_five_marks' : 'gs1_4_options_two_marks',
      testType: chunk.testType,
      testSeriesName: 'Sadhya UPSC CSE Target Series',
      mockPaperId: chunk.mockPaperId,
      corpusBucket: 'PRACTICE_MOCK',
      sourceTier: 'SYNTHETIC_ORIGINAL',
      sourceName: 'Sadhya Academic Engine (Vision IAS / Insights IAS / GS Score / ForumIAS inspired)',
      sourceType: 'ai_generated_mock',
      isAuthenticPYQ: false,
      isGenerated: true,
      subject: chunk.subject as any,
      subtopic: item.subtopic ?? 'General',
      questionType: item.questionType ?? 'factual',
      questionNumber: globalQuestionNum.value++,
      questionText: item.questionText,
      options: item.options as [string, string, string, string],
      correctAnswer: item.correctAnswer as 'A' | 'B' | 'C' | 'D',
      explanation: item.explanation ?? '',
      difficulty: item.difficulty ?? 'MEDIUM',
      marks: marksPerQ,
      negativeMarks: negMarks,
      language: 'en',
      contentHash,
      createdAt: now,
      updatedAt: now,
    });
  }

  return questions;
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('  Sadhya UPSC CSE Prelims Mock Generator');
  console.log(`  Mode: ${EXECUTE ? '🔴 LIVE EXECUTE' : '🟡 DRY-RUN (pass --execute to write)'}`);
  console.log('═══════════════════════════════════════════════════════════════════\n');

  const ALL_CHUNKS = [...GS1_CHUNKS, ...CSAT_CHUNKS, ...SECTIONAL_CHUNKS];
  const totalTarget = ALL_CHUNKS.reduce((s, c) => s + c.count, 0);
  console.log(`📋 Total chunks: ${ALL_CHUNKS.length} | Target questions: ${totalTarget}\n`);

  const globalQuestionNum = { value: 1 };
  const allQuestions: UPSCMockQuestion[] = [];

  let papersSummary: Record<string, number> = {};

  for (let i = 0; i < ALL_CHUNKS.length; i++) {
    const chunk = ALL_CHUNKS[i];
    console.log(`\n[${i + 1}/${ALL_CHUNKS.length}] ${chunk.mockPaperId} — ${chunk.subject} (${chunk.count} Qs)`);

    try {
      const questions = await processChunk(chunk, globalQuestionNum, allQuestions);
      allQuestions.push(...questions);
      papersSummary[chunk.mockPaperId] = (papersSummary[chunk.mockPaperId] ?? 0) + questions.length;

      if (EXECUTE && questions.length > 0) {
        await writeToFirestore(questions);
      }

      console.log(`    ✅ Chunk done: ${questions.length} questions processed`);
      await sleep(2000); // rate-limit pacing
    } catch (err: any) {
      console.error(`    ❌ Chunk failed after retries: ${err.message}`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log(`  GENERATION COMPLETE — Total questions: ${allQuestions.length}`);
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('\n📊 Per-Paper Breakdown:');
  for (const [paperId, count] of Object.entries(papersSummary)) {
    console.log(`   ${paperId}: ${count} questions`);
  }

  if (!EXECUTE) {
    console.log('\n⚠️  DRY-RUN: No data written to Firestore.');
    console.log('   Run with --execute to write to upsc_mock_questions collection.');
  } else {
    console.log('\n✅ All questions written to Firestore collection: upsc_mock_questions');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
