export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_ENVIRONMENTAL_SCIENCE_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_FUNDAMENTALS_OF_ENVIRONMENTAL_SCIENCES',
    unitName: 'Fundamentals of Environmental Sciences',
    topics: [
      'Definition, principles and scope of Environmental Science',
      'Structure and composition of atmosphere, hydrosphere, lithosphere and biosphere',
      'Laws of thermodynamics, heat transfer processes, mass and energy transfer across various interfaces, material balance',
      'Meteorological parameters: pressure, temperature, precipitation, humidity, mixing ratio, radiation, wind velocity, adiabatic lapse rate, environmental lapse rate, wind roses',
      'Interaction between Earth, Man and Environment; Biogeographic provinces of the world and agro-climatic zones of India',
      'Natural resources: renewable and non-renewable energy and mineral resources, sustainable development and carrying capacity'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_ENVIRONMENTAL_CHEMISTRY',
    unitName: 'Environmental Chemistry',
    topics: [
      'Fundamentals of Environmental Chemistry: Stoichiometry, Gibbs energy, chemical potential, chemical kinetics, chemical equilibria',
      'Atmospheric chemistry: Composition of air, particles, ions, radicals, photochemical smog, acid rain',
      'Hydrological chemistry: Water as universal solvent, DO, BOD, COD, coagulation, flocculation, filtration, pH, Eh',
      'Soil chemistry: Inorganic and organic components of soils, biogeochemical cycles (N, C, P, S)',
      'Toxic chemicals: Pesticides, biochemical aspects of heavy metals (Hg, Cd, Pb, Cr) and metalloids (As, Se), POPs, VOCs',
      'Analytical methods: Titrimetry, Gravimetry, Spectrophotometry, Chromatography (GC, HPLC), Flame Photometry, AAS, ICP-MS'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_ENVIRONMENTAL_BIOLOGY',
    unitName: 'Environmental Biology',
    topics: [
      'Ecology: Definition, sub-disciplines, origin of life and speciation',
      'Ecosystem structure and function: Biotic and abiotic components, food chains, food webs, ecological pyramids, energy flow models',
      'Population ecology: Characteristics, growth curves, r and K selection, carrying capacity',
      'Community ecology: Concept, types, interactions (predation, parasitism, mutualism, allelopathy)',
      'Ecological succession: Primary and secondary succession, climax concepts',
      'Biodiversity and conservation: Genetic, species and ecosystem diversity, hot spots, IUCN categories, in-situ and ex-situ conservation'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_ENVIRONMENTAL_GEOSCIENCES',
    unitName: 'Environmental Geosciences',
    topics: [
      'Origin of Earth: Differentiation into core, mantle, crust, atmosphere and hydrosphere',
      'Minerals and rocks: Igneous, sedimentary and metamorphic rocks, rock cycle',
      'Geomorphology and plate tectonics: Continental drift, plate boundaries, earthquakes, volcanism, tsunamis, landforms',
      'Hydrology and hydrogeology: Ground water, aquifers, Darcy law, water balance, saline intrusion',
      'Natural hazards: Floods, landslides, cyclones, droughts, earthquakes and hazard zonation'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_ENERGY_AND_ENVIRONMENT',
    unitName: 'Energy and Environment',
    topics: [
      'Solar energy: Solar radiation, spectral characteristics, photovoltaic conversion, solar thermal systems',
      'Fossil fuels: Coal, petroleum, natural gas, shale oil, coal bed methane, gas hydrates, calorific value',
      'Nuclear energy: Fission, fusion, nuclear reactors, radioactive waste management',
      'Renewable energy: Wind, hydro, tidal, wave, ocean thermal energy conversion (OTEC), geothermal energy',
      'Bioenergy: Biomass, biogas, bio-fuels (ethanol, biodiesel), pyrolysis, gasification'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_ENVIRONMENTAL_POLLUTION_AND_CONTROL',
    unitName: 'Environmental Pollution and Control',
    topics: [
      'Air pollution: Sources, criteria pollutants (PM2.5, PM10, SOx, NOx, CO, O3), sampling, plume behavior, control equipment (cyclone, ESP, fabric filter, wet scrubber)',
      'Water pollution: Point and non-point sources, wastewater treatment (primary, secondary/biological, tertiary/advanced)',
      'Noise pollution: Sound pressure, decibel scale, noise indices (Leq, L10, L90), noise attenuation and control',
      'Soil pollution: Soil degradation, heavy metal contamination, agricultural pollutants, remediation (bioremediation, phytoremediation)',
      'Thermal and radioactive pollution: Sources, impacts, and mitigation'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_SOLID_AND_HAZARDOUS_WASTE_MANAGEMENT',
    unitName: 'Solid and Hazardous Waste Management',
    topics: [
      'Municipal solid waste: Characteristics, generation, proximate and ultimate analysis, collection routes, transfer stations',
      'Waste processing and disposal: Composting, biomethanation, incineration, pyrolysis, sanitary landfills, leachate management',
      'Hazardous waste: Characteristics (ignitability, corrosivity, reactivity, toxicity), classification, handling, secure landfills',
      'Special wastes: Biomedical waste, e-waste, plastic waste, fly ash, construction and demolition waste, radioactive waste management rules'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_ENVIRONMENTAL_ASSESSMENT_MANAGEMENT_LEGISLATION',
    unitName: 'Environmental Assessment, Management and Legislation',
    topics: [
      'Environmental Impact Assessment (EIA): Aims, scoping, baseline data, impact assessment methodologies, EMP, EIS, public hearing',
      'Environmental auditing: Types, objectives, ISO 14000 series, life cycle assessment (LCA)',
      'Environmental legislation in India: Water Act 1974, Air Act 1981, Environment (Protection) Act 1986, Forest Conservation Act, Wildlife Protection Act',
      'Constitutional provisions: Article 48A and 51A(g), National Green Tribunal (NGT), international treaties (Stockholm, Rio, Kyoto, Paris)'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_STATISTICAL_APPROACHES_AND_MODELLING',
    unitName: 'Statistical Approaches and Modelling in Environmental Sciences',
    topics: [
      'Descriptive statistics: Central tendency, dispersion, skewness, kurtosis, standard error',
      'Probability and distributions: Normal, log-normal, binomial, Poisson, t-distribution, chi-square, F-distribution',
      'Inferential statistics: Hypothesis testing, t-test, ANOVA, correlation, simple and multiple regression',
      'Environmental modelling: Gaussian plume model, dispersion models, box models, dissolved oxygen models (Streeter-Phelps)'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_CONTEMPORARY_ENVIRONMENTAL_ISSUES',
    unitName: 'Contemporary Environmental Issues',
    topics: [
      'Global environmental issues: Climate change, global warming, ozone layer depletion, ocean acidification, sea level rise',
      'National Action Plan on Climate Change (NAPCC): 8 national missions, national clean air programme (NCAP)',
      'Environmental disasters: Bhopal gas tragedy, Chernobyl, Fukushima, Minamata disease, Love Canal',
      'Environmental movements in India: Chipko, Appiko, Narmada Bachao Andolan, Silent Valley movement',
      'Sustainable development goals (SDGs) and global environmental governance'
    ]
  }
];

export function mapQuestionToEnvironmentalScienceUnit(questionText: string, optionsText: string = ''): { unitNumber: number; unitName: string } {
  const text = `${questionText} ${optionsText}`.toLowerCase();

  if (
    text.includes('climate change') || text.includes('napcc') || text.includes('national action plan') ||
    text.includes('kyoto protocol') || text.includes('paris agreement') || text.includes('cop') ||
    text.includes('montreal protocol') || text.includes('ozone depletion') || text.includes('global warming') ||
    text.includes('chipko') || text.includes('narmada bachao') || text.includes('silent valley') ||
    text.includes('bhopal gas') || text.includes('chernobyl') || text.includes('fukushima') ||
    text.includes('sustainable development goal') || text.includes('sdg') || text.includes('sea level rise')
  ) {
    return { unitNumber: 10, unitName: 'Contemporary Environmental Issues' };
  }

  if (
    text.includes('regression') || text.includes('anova') || text.includes('hypothesis') ||
    text.includes('chi-square') || text.includes('poisson') || text.includes('binomial') ||
    text.includes('standard deviation') || text.includes('standard error') || text.includes('kurtosis') ||
    text.includes('skewness') || text.includes('gaussian plume') || text.includes('streeter-phelps') ||
    text.includes('dispersion model') || text.includes('t-test') || text.includes('box model')
  ) {
    return { unitNumber: 9, unitName: 'Statistical Approaches and Modelling in Environmental Sciences' };
  }

  if (
    text.includes('eia') || text.includes('impact assessment') || text.includes('environment protection act') ||
    text.includes('water act') || text.includes('air act') || text.includes('wildlife protection') ||
    text.includes('forest conservation') || text.includes('iso 14000') || text.includes('iso 14001') ||
    text.includes('life cycle assessment') || text.includes('article 48a') || text.includes('article 51a') ||
    text.includes('national green tribunal') || text.includes('ngt') || text.includes('public hearing') ||
    text.includes('environmental audit') || text.includes('coastal regulation zone') || text.includes('crz')
  ) {
    return { unitNumber: 8, unitName: 'Environmental Assessment, Management and Legislation' };
  }

  if (
    text.includes('solid waste') || text.includes('hazardous waste') || text.includes('leachate') ||
    text.includes('landfill') || text.includes('composting') || text.includes('incineration') ||
    text.includes('pyrolysis') || text.includes('biomedical waste') || text.includes('e-waste') ||
    text.includes('plastic waste') || text.includes('fly ash') || text.includes('proximate analysis') ||
    text.includes('ultimate analysis') || text.includes('biomethanation')
  ) {
    return { unitNumber: 7, unitName: 'Solid and Hazardous Waste Management' };
  }

  if (
    text.includes('air pollution') || text.includes('water pollution') || text.includes('noise pollution') ||
    text.includes('electrostatic precipitator') || text.includes('cyclone separator') || text.includes('scrubber') ||
    text.includes('plume') || text.includes('decibel') || text.includes('activated sludge') ||
    text.includes('trickling filter') || text.includes('pm2.5') || text.includes('pm10') ||
    text.includes('bod') || text.includes('cod') || text.includes('dissolved oxygen') ||
    text.includes('phytoremediation') || text.includes('bioremediation') || text.includes('wastewater')
  ) {
    return { unitNumber: 6, unitName: 'Environmental Pollution and Control' };
  }

  if (
    text.includes('solar energy') || text.includes('photovoltaic') || text.includes('wind energy') ||
    text.includes('geothermal') || text.includes('biomass') || text.includes('biogas') ||
    text.includes('fossil fuel') || text.includes('calorific value') || text.includes('coal bed methane') ||
    text.includes('gas hydrate') || text.includes('nuclear reactor') || text.includes('nuclear fission') ||
    text.includes('otec') || text.includes('tidal energy') || text.includes('bio-fuel') ||
    text.includes('shale oil')
  ) {
    return { unitNumber: 5, unitName: 'Energy and Environment' };
  }

  if (
    text.includes('plate tectonics') || text.includes('earthquake') || text.includes('volcano') ||
    text.includes('fault') || text.includes('aquifer') || text.includes('darcy') ||
    text.includes('groundwater') || text.includes('igneous') || text.includes('sedimentary') ||
    text.includes('metamorphic') || text.includes('geomorphology') || text.includes('weathering') ||
    text.includes('crust') || text.includes('mantle') || text.includes('landslide') ||
    text.includes('tsunami')
  ) {
    return { unitNumber: 4, unitName: 'Environmental Geosciences' };
  }

  if (
    text.includes('ecosystem') || text.includes('biodiversity') || text.includes('ecological pyramid') ||
    text.includes('food web') || text.includes('food chain') || text.includes('succession') ||
    text.includes('iucn') || text.includes('carrying capacity') || text.includes('population ecology') ||
    text.includes('r-selected') || text.includes('k-selected') || text.includes('mutualism') ||
    text.includes('parasitism') || text.includes('speciation') || text.includes('endangered') ||
    text.includes('hotspot') || text.includes('biosphere reserve') || text.includes('national park')
  ) {
    return { unitNumber: 3, unitName: 'Environmental Biology' };
  }

  if (
    text.includes('chemical kinetics') || text.includes('thermodynamics') || text.includes('gibbs') ||
    text.includes('photochemical smog') || text.includes('acid rain') || text.includes('ozone layer') ||
    text.includes('aas') || text.includes('chromatography') || text.includes('spectrophotometry') ||
    text.includes('heavy metal') || text.includes('pesticide') || text.includes('biogeochemical cycle') ||
    text.includes('nitrogen cycle') || text.includes('carbon cycle') || text.includes('redox') ||
    text.includes('stoichiometry') || text.includes('flame photometer')
  ) {
    return { unitNumber: 2, unitName: 'Environmental Chemistry' };
  }

  return { unitNumber: 1, unitName: 'Fundamentals of Environmental Sciences' };
}
