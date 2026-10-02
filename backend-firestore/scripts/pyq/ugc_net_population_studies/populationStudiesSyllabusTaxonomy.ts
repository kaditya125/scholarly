export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_POPULATION_STUDIES_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_SOURCES_DEMOGRAPHIC_DATA',
    unitName: 'Sources of Demographic Data and Concepts',
    topics: [
      'Population Census: History, features, coverage, content, errors in census data and evaluation',
      'Civil Registration System (CRS) and Vital Statistics',
      'Sample Registration System (SRS) and Model Registration System',
      'National Family Health Surveys (NFHS), DLHS, LASI, and NSSO demographic rounds',
      'Basic demographic concepts: Rates, ratios, proportions, person-years lived, cohort and period measures'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_POPULATION_THEORIES_MODELS',
    unitName: 'Population Theories and Models',
    topics: [
      'Early theories of population: Mercantilist, Physiocrats, Malthusian theory and its critique',
      'Marxian perspective on population and capitalist accumulation',
      'Demographic Transition Theory: Notestein, Blacker, Caldwell wealth flow theory',
      'Social Capillarity Theory (Arsene Dumont), Theory of Optimum Population',
      'Mathematical and demographic models: Exponential, logistic growth, Lotka stable population theory, stationary population'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_FERTILITY_REPRODUCTION_FAMILY',
    unitName: 'Fertility, Reproduction and Family Planning',
    topics: [
      'Measures of fertility: CBR, GFR, ASFR, TFR, Gross Reproduction Rate (GRR), Net Reproduction Rate (NRR)',
      'Intermediate variables and proximate determinants of fertility (Davis-Blake, Bongaarts model)',
      'Nuptiality: Singulate Mean Age at Marriage (SMAM), marriage dissolution, cohabitation',
      'Family planning and contraception: Methods, contraceptive prevalence rate (CPR), unmet need for family planning',
      'Fecundity, infecundity, sterility, abortion, assisted reproductive technologies'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_MORTALITY_MORBIDITY_HEALTH',
    unitName: 'Mortality, Morbidity and Public Health',
    topics: [
      'Measures of mortality: CDR, ASDR, Infant Mortality Rate (IMR), Neonatal and Post-neonatal mortality, Under-5 mortality (U5MR)',
      'Maternal Mortality Ratio (MMR) and maternal health indicators',
      'Life table: Concepts, assumptions, types (complete and abridged), construction of life tables, life expectancy (e0)',
      'Epidemiological Transition (Omran), disease burden (DALYs, QALYs)',
      'Causes of death, mortality differentials by age, sex, residence, and socio-economic status'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_MIGRATION_URBANIZATION',
    unitName: 'Migration, Spatial Distribution and Urbanization',
    topics: [
      'Concepts, definitions, and types of migration: Internal, international, permanent, circular, seasonal',
      'Theories of migration: Ravenstein laws of migration, Lee push-pull theory, Todaro model of rural-urban migration',
      'Measures of migration: In-migration, out-migration, net migration, gross migration rate',
      'Urbanization: Definition, concepts, degree and tempo of urbanization, primate city law, rank-size rule',
      'Urban growth, metropolitan areas, mega-cities, smart cities, urban slums, counter-urbanization'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_POPULATION_STRUCTURE_CHARACTERISTICS',
    unitName: 'Population Structure, Characteristics and Aging',
    topics: [
      'Age and sex structure: Population pyramid, sex ratio, child sex ratio (CSR), dependency ratio',
      'Population aging: Demographic determinants, trends, elderly population, health and social security for older persons',
      'Demographic Dividend: Opportunity window, youth population, workforce participation rate (WPR)',
      'Socio-economic characteristics: Literacy, educational attainment, occupational structure, religion and linguistic composition'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_POPULATION_DEVELOPMENT_ENVIRONMENT',
    unitName: 'Population, Development and Environment',
    topics: [
      'Population and economic development: Interrelationships, poverty, food security, labor absorption',
      'Human Development: Concept, measurement, Human Development Index (HDI), Multidimensional Poverty Index (MPI)',
      'Population and environment: Carrying capacity, resource depletion, deforestation, water stress, climate change',
      'Sustainable Development Goals (SDGs): Targets and indicators related to population and health'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_RESEARCH_METHODOLOGY_POPULATION',
    unitName: 'Research Methodology and Demographic Techniques',
    topics: [
      'Sampling techniques: Simple random, stratified, cluster, systematic sampling, multistage sampling',
      'Demographic data evaluation: Whipple index, Myers blended index, United Nations age-sex accuracy index',
      'Standardization of rates: Direct and indirect standardization',
      'Cohort analysis, period analysis, Lexis diagram representation',
      'Quantitative methods: Correlation, regression, hypothesis testing, demographic estimation methods'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_GENDER_HUMAN_RIGHTS_VULNERABLE',
    unitName: 'Gender Issues, Human Rights and Vulnerable Groups',
    topics: [
      'Gender and development: Gender Inequality Index (GII), Gender Development Index (GDI), Gender Empowerment Measure (GEM)',
      'Son preference, female feticide, adverse child sex ratio, violence against women',
      'Vulnerable populations: Scheduled Castes (SC), Scheduled Tribes (ST), child labor, persons with disabilities, refugees',
      'International conferences on population: Bucharest (1974), Mexico City (1984), ICPD Cairo (1994), Beijing Conference (1995)'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_POPULATION_POLICIES_PROGRAMMES',
    unitName: 'Population Policies and Programmes in India',
    topics: [
      'Evolution of family welfare programme in India: Clinical approach, target-oriented approach, community extension, target-free approach',
      'National Population Policy (NPP 2000): Goals, objectives, strategic themes',
      'Reproductive and Child Health (RCH) Programme, National Health Mission (NRHM/NUHM/NHM)',
      'Ayushman Bharat, Pradhan Mantri Matru Vandana Yojana (PMMVY), Poshan Abhiyaan',
      'Population policies of selected developing and developed countries'
    ]
  }
];

export function mapQuestionToPopulationUnit(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  
  if (lower.match(/census|sample registration|srs|civil registration|crs|nfhs|national family health survey|dlhs|demographic data|person-years/)) {
    return { unitNumber: 1, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[0].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[0].unitName };
  }
  if (lower.match(/malthus|marx|dumont|notestein|blacker|optimum population|demographic transition theory|social capillarity|stable population|stationary population|lotka/)) {
    return { unitNumber: 2, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[1].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[1].unitName };
  }
  if (lower.match(/fertility|cbr|asfr|tfr|gross reproduction rate|grr|nrr|net reproduction rate|bongaarts|contraceptive|cpr|unmet need|fecundity|nuptiality|smam|marriage/)) {
    return { unitNumber: 3, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[2].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[2].unitName };
  }
  if (lower.match(/mortality|cmr|asdr|infant mortality|imr|maternal mortality|mmr|under-five mortality|u5mr|life table|expectation of life|e0|epidemiological transition|morbidity|cause of death/)) {
    return { unitNumber: 4, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[3].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[3].unitName };
  }
  if (lower.match(/migration|in-migration|out-migration|net migration|internal migration|international migration|ravenstein|lee|push-pull|urbanization|urban growth|primate city|mega city|slum|metropolis/)) {
    return { unitNumber: 5, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[4].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[4].unitName };
  }
  if (lower.match(/age-sex|population pyramid|dependency ratio|aging|elderly|sex ratio|child sex ratio|workforce participation|labor force|demographic dividend|literacy|caste/)) {
    return { unitNumber: 6, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[5].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[5].unitName };
  }
  if (lower.match(/sustainable development|sdg|carrying capacity|human development index|hdi|gender development index|gdi|poverty|food security|environment|deforestation|climate change/)) {
    return { unitNumber: 7, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[6].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[6].unitName };
  }
  if (lower.match(/sampling|sample size|standardization|direct standardization|indirect standardization|whipple|myers|un age-sex accuracy index|cohort|period|lexis diagram|regression|hypothesis/)) {
    return { unitNumber: 8, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[7].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[7].unitName };
  }
  if (lower.match(/gender|empowerment|son preference|female foeticide|sex selection|violence against women|tribal population|scheduled castes|disability|cairo conference|icpd|beijing conference/)) {
    return { unitNumber: 9, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[8].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[8].unitName };
  }
  if (lower.match(/national population policy|npp 2000|family planning programme|rch|nrhm|national rural health mission|nhm|ayushman bharat|target-free approach|population policy/)) {
    return { unitNumber: 10, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[9].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[9].unitName };
  }
  
  return { unitNumber: 1, unitCode: UGC_NET_POPULATION_STUDIES_TAXONOMY[0].unitCode, unitName: UGC_NET_POPULATION_STUDIES_TAXONOMY[0].unitName };
}
