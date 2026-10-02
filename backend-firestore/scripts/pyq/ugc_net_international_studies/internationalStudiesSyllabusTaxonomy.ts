export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_INTERNATIONAL_STUDIES_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_CONCEPTS_THEORIES_APPROACHES',
    unitName: 'Concepts, Theories and Approaches in IR and Area Studies',
    topics: [
      'Major concepts, scope and nature of International Relations and Area Studies',
      'Theories: Realist, Liberal, Marxist and Critical Theories of IR and Area Studies',
      'Approaches: Western and Non-Western approaches to IR',
      'Power Politics: Balance of Power, Geopolitics, Bipolarity, Unipolarity, Multipolarity and Polycentrism',
      'State and Non-State Actors in IR and Area Studies'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_EVOLUTION_OF_IR_AND_AREA_STUDIES',
    unitName: 'Evolution of International Relations and Area Studies',
    topics: [
      'Emergence of nation states and nationalism',
      'Pre-World War I International System',
      'Inter-War Period and League of Nations',
      'Post-World War II Period and Cold War origins',
      'Decolonisation, Global South and International Politics (NAM, G-77)',
      'Post-Cold War International Relations and impact of Globalisation'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_CONTEMPORARY_WORLD_ORDER',
    unitName: 'Contemporary World Order',
    topics: [
      'Changing Patterns of World Order: Unipolarity, Bipolarity, Multipolarity and Polycentrism',
      'Role of Major Powers: US, Russia, China, Japan, India and European Union',
      'Globality, Globalism and Globalisation',
      'Democratisation and the World Order',
      'Science, Technology and Global Order'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_CONFLICT_SECURITY_AND_PEACE',
    unitName: 'Conflict, Security and Peace: National and International',
    topics: [
      'Concepts, components and models of National and International Security',
      'Evolution of Strategic Thoughts: Kautilya, Sun Tzu, Machiavelli, Jomini, Clausewitz, Mackinder, Mahan, Douhet, Mitchell, Kissinger',
      'Evolution of Strategic Doctrines: Massive Retaliation, Deterrence, Flexible Response, Mutually Assured Destruction (MAD), SDI, NMD',
      'Evolution of India’s Security Policies, Nuclear Doctrine and Maritime Doctrines',
      'New Modes of Warfare: Conventional, Low Intensity Conflicts, Cyber/Information Warfare, CBRN, RMA',
      'Non-Traditional Security Threats: Food, Health, Energy, Climate, Human Security and Terrorism',
      'Conflict Resolution and Peace, Arms Control and Disarmament (NPT, CTBT, MTCR)'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_INTERNATIONAL_ORGANISATIONS_GLOBAL_GOVERNANCE',
    unitName: 'International Organisations and Global Governance',
    topics: [
      'Role of International Organisations in Peace, Security, Development cooperation and Democratisation',
      'United Nations: Structure, Role, Relevance, Peacekeeping, Security Council Reforms',
      'Global Governance: Issues and Challenges of global commons (Oceans, Space, Polar, Cyber)',
      'Regional and Sub-regional Organisations',
      'International Law as an instrument of global governance (ICJ, ICC, UNCLOS)'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_INDIAS_FOREIGN_POLICY',
    unitName: 'India Foreign Policy',
    topics: [
      'Evolution of Objectives and Principles of India Foreign Policy: Non-Alignment, Panchsheel',
      'India Relations with Neighbourhood (Neighbourhood First policy) and Extended Neighbourhood',
      'India and Major Powers: US, Russia, China, Japan, and EU',
      'India Look East and Act East Policy',
      'India Engagement with International and Regional Organisations (BRICS, SCO, G20, IBSA)',
      'Role of India Soft Power, Diaspora and Cultural Diplomacy in Foreign Policy'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_SOUTH_ASIA_AND_INDO_PACIFIC_REGION',
    unitName: 'South Asia and Indo-Pacific Region',
    topics: [
      'Geopolitical and Geostrategic setting of South Asia and Indo-Pacific',
      'Colonialism, nationalism and independence movements in the region',
      'Nation building, state building and challenges to democratization',
      'Post-Independence developments: Political Regimes in South Asian and Southeast Asian states',
      'Internal and External Threats to State Security and Human Security',
      'Regional Territorial and Maritime Issues (South China Sea, Indian Ocean)',
      'Regional Trade and Strategic Partnerships: IORA, SAARC, ASEAN, ARF, APEC, BIMSTEC, Quad, Mekong-Ganga'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_CENTRAL_ASIA_WEST_ASIA_AFRICA',
    unitName: 'Central Asia, West Asia and Africa',
    topics: [
      'Geopolitical and Geostrategic setting of Central Asia, West Asia (Middle East) and Africa',
      'Colonialism, nationalism and independence movements',
      'Nation building, state building and challenges to democratization (Arab Spring)',
      'Post-Independence developments: Political Regimes, Monarchy, Theocracy, Military Regimes',
      'Internal and External Threats: Ethnic, sectarian conflicts, terrorism (ISIS, Al-Qaeda)',
      'Regional conflicts: Arab-Israeli conflict, Persian Gulf issues, role of extra-regional powers',
      'Regional Trade, Energy Cooperation and Strategic Partnership (OPEC, GCC, African Union)'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_EUROPE_AND_ERSTWHILE_SOVIET_UNION_RUSSIA',
    unitName: 'Europe and Erstwhile Soviet Union / Russia',
    topics: [
      'Geopolitical and Geostrategic setting of Europe and Eurasia',
      'Nationalism, Industrial Revolution and State building',
      'Europe between two World Wars, Rise of Fascism and Nazism',
      'Alliances and Accords in Europe: NATO, Warsaw Pact, CSCE/OSCE, Helsinki Accords, European Union',
      'Disintegration of USSR, Post-Soviet transition, Commonwealth of Independent States (CIS)',
      'Internal and External Threats: Migration, refugees, ethnic conflicts (Balkans, Caucasus, Ukraine)',
      'Trade, Development cooperation, Strategic Partnerships and US role in Europe'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_THE_AMERICAS',
    unitName: 'The Americas (North America and Latin America)',
    topics: [
      'Geopolitical and Geostrategic setting of North and Latin America',
      'Colonialism, Nationalism, Monroe Doctrine and Independence Movements',
      'Nation building, state building and challenges to democratization in Latin America',
      'US Foreign Policy: Containment, Hegemony, Multilateralism and Interventionism',
      'Regional conflicts and issues: Drug trafficking, migration, human security',
      'Regional trade and partnerships: USMCA/NAFTA, Mercosur, OAS, CELAC, Pacific Alliance',
      'Impact of Globalisation on the Americas'
    ]
  }
];

export function mapQuestionToInternationalStudiesUnit(questionText: string, optionsText: string = ''): { unitNumber: number; unitName: string } {
  const text = `${questionText} ${optionsText}`.toLowerCase();

  // Unit 10: The Americas
  if (
    text.includes('latin america') || text.includes('monroe doctrine') || text.includes('nafta') ||
    text.includes('usmca') || text.includes('mercosur') || text.includes('oas') || text.includes('celac') ||
    text.includes('cuba') || text.includes('brazil') || text.includes('mexico') || text.includes('panama') ||
    text.includes('american foreign policy') || text.includes('united states foreign policy')
  ) {
    return { unitNumber: 10, unitName: 'The Americas (North America and Latin America)' };
  }

  // Unit 9: Europe & Russia / USSR
  if (
    text.includes('european union') || text.includes('warsaw pact') || text.includes('nato') ||
    text.includes('soviet union') || text.includes('ussr') || text.includes('balkans') ||
    text.includes('brexit') || text.includes('helsinki accord') || text.includes('gorbachev') ||
    text.includes('glasnost') || text.includes('perestroika') || text.includes('ukraine') ||
    text.includes('cis') || text.includes('osce') || text.includes('russia')
  ) {
    return { unitNumber: 9, unitName: 'Europe and Erstwhile Soviet Union / Russia' };
  }

  // Unit 8: Central Asia, West Asia and Africa
  if (
    text.includes('west asia') || text.includes('middle east') || text.includes('arab spring') ||
    text.includes('african union') || text.includes('central asia') || text.includes('gcc') ||
    text.includes('gulf cooperation') || text.includes('opec') || text.includes('palestine') ||
    text.includes('israel') || text.includes('iran') || text.includes('iraq') || text.includes('syria') ||
    text.includes('suez') || text.includes('saudi arabia') || text.includes('apartheid') || text.includes('africa')
  ) {
    return { unitNumber: 8, unitName: 'Central Asia, West Asia and Africa' };
  }

  // Unit 7: South Asia and Indo-Pacific Region
  if (
    text.includes('indo-pacific') || text.includes('south asia') || text.includes('saarc') ||
    text.includes('asean') || text.includes('bimstec') || text.includes('iora') || text.includes('quad') ||
    text.includes('south china sea') || text.includes('mekong-ganga') || text.includes('apec') ||
    text.includes('pakistan') || text.includes('bangladesh') || text.includes('sri lanka') ||
    text.includes('nepal') || text.includes('bhutan') || text.includes('indian ocean')
  ) {
    return { unitNumber: 7, unitName: 'South Asia and Indo-Pacific Region' };
  }

  // Unit 6: India Foreign Policy
  if (
    text.includes("india's foreign policy") || text.includes('foreign policy of india') ||
    text.includes('panchsheel') || text.includes('non-alignment') || text.includes('nam') ||
    text.includes('look east') || text.includes('act east') || text.includes('gujral doctrine') ||
    text.includes('neighbourhood first') || text.includes('brics') || text.includes('shanghai cooperation') ||
    text.includes('sco') || text.includes('g20') || text.includes('indira doctrine')
  ) {
    return { unitNumber: 6, unitName: 'India Foreign Policy' };
  }

  // Unit 5: International Organisations & Global Governance
  if (
    text.includes('united nations') || text.includes('security council') || text.includes('general assembly') ||
    text.includes('icj') || text.includes('international court') || text.includes('icc') ||
    text.includes('peacekeeping') || text.includes('unclos') || text.includes('global governance') ||
    text.includes('international law') || text.includes('treaty') || text.includes('league of nations') ||
    text.includes('who') || text.includes('wto') || text.includes('imf') || text.includes('world bank')
  ) {
    return { unitNumber: 5, unitName: 'International Organisations and Global Governance' };
  }

  // Unit 4: Conflict, Security and Peace
  if (
    text.includes('deterrence') || text.includes('mutually assured destruction') || text.includes('mad') ||
    text.includes('arms control') || text.includes('disarmament') || text.includes('npt') ||
    text.includes('ctbt') || text.includes('kautilya') || text.includes('sun tzu') ||
    text.includes('clausewitz') || text.includes('mackinder') || text.includes('mahan') ||
    text.includes('kissinger') || text.includes('nuclear doctrine') || text.includes('terrorism') ||
    text.includes('cyber warfare') || text.includes('human security') || text.includes('cbrn')
  ) {
    return { unitNumber: 4, unitName: 'Conflict, Security and Peace: National and International' };
  }

  // Unit 3: Contemporary World Order
  if (
    text.includes('unipolar') || text.includes('multipolar') || text.includes('bipolar') ||
    text.includes('world order') || text.includes('polycentrism') || text.includes('hegemony') ||
    text.includes('globalism') || text.includes('democratisation') || text.includes('major powers')
  ) {
    return { unitNumber: 3, unitName: 'Contemporary World Order' };
  }

  // Unit 2: Evolution of IR & Area Studies
  if (
    text.includes('cold war') || text.includes('decolonisation') || text.includes('first world war') ||
    text.includes('second world war') || text.includes('treaty of westphalia') || text.includes('inter-war') ||
    text.includes('post-cold war') || text.includes('global south') || text.includes('nationalism')
  ) {
    return { unitNumber: 2, unitName: 'Evolution of International Relations and Area Studies' };
  }

  // Unit 1: Concepts, Theories & Approaches (Default)
  return { unitNumber: 1, unitName: 'Concepts, Theories and Approaches in IR and Area Studies' };
}
