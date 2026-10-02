export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_GEOGRAPHY_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_GEOMORPHOLOGY',
    unitName: 'Geomorphology',
    topics: [
      'Continental Drift, Plate Tectonics, Endogenetic and Exogenetic forces',
      'Denudation and Weathering, Geomorphic Cycle (Davis and Penck)',
      'Theories and Process of Slope Development, Earth Movements (seismicity, folding, faulting and vulcanicity)',
      'Landform Occurrence and Causes of Geomorphic Hazards (earthquakes, volcanoes, landslides and avalanches)'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_CLIMATOLOGY',
    unitName: 'Climatology',
    topics: [
      'Composition and Structure of Atmosphere, Insolation, Heat Budget of Earth, Temperature, Atmospheric Pressure and Winds',
      'Atmospheric Circulation (air-masses, fronts, upper air circulation, cyclones and anticyclones: tropical and temperate)',
      'Climatic Classification of Koppen & Thornthwaite, ENSO Phenomena (El Nino, La Nina and Southern Oscillation)',
      'Meteorological Hazards and Disasters (cyclones, thunderstorms, tornadoes, hailstorms, heat and cold waves, drought and cloudburst), Global Warming'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_OCEANOGRAPHY',
    unitName: 'Oceanography',
    topics: [
      'Relief of Oceans, Ocean Floor Topography, Temperature, Salinity and Density of Ocean Water',
      'Ocean Currents, Waves, Tides and Tsunami, El Nino and La Nina events',
      'Oceanic Deposits, Coral Reefs, Formation and Types of Coral Reefs (theories of Darwin, Daly and Murray)',
      'Marine Resources (biotic, mineral and energy resources), Sea Level Changes, Coastal Hazards'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_GEOGRAPHY_ENVIRONMENT',
    unitName: 'Geography of Environment',
    topics: [
      'Components of Ecosystem, Types of Ecosystem, Functions of Ecosystem (trophic levels, energy flow, cycles)',
      'Environmental Problems, Degradation, Pollution and Global Warming, Greenhouse Effect',
      'National and International Environmental Policies, Treaties and Protocols (Stockholm, Rio, Kyoto, Paris)',
      'Biodiversity, Hotspots, Conservation of Biodiversity, Biosphere Reserves, National Parks and Sanctuaries'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_POPULATION_SETTLEMENT_GEOGRAPHY',
    unitName: 'Population and Settlement Geography',
    topics: [
      'Population Distribution, Density and Growth, Demographic Transition Model, Population Composition',
      'Theories of Population (Malthus, Sadler, Ricardo), Population Policies, Migration Theories (Ravenstein, Lee, Zelinsky)',
      'Rural Settlements: Types, Patterns and Distribution, Contemporary Problems of Rural Settlements',
      'Urban Settlements: Origin and Growth, Central Place Theory (Christaller and Losch), Rank-Size Rule, Primate City, Urban Morphology (Burgess, Hoyt, Harris-Ullman)'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_GEOGRAPHY_ECONOMIC_ACTIVITIES',
    unitName: 'Geography of Economic Activities and Regional Development',
    topics: [
      'Factors affecting Spatial Organization of Economic Activities (primary, secondary, tertiary and quaternary)',
      'Von Thunen Model of Agricultural Location, Agricultural Regions of the World (Whittlesey)',
      'Theories of Industrial Location (Weber, Hoover, Losch, Smith), World Industrial Regions',
      'Regional Development: Theories of Regional Development (Hirschman, Myrdal, Perroux, Friedman), Regional Planning in India'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_CULTURAL_SOCIAL_POLITICAL_GEOGRAPHY',
    unitName: 'Cultural, Social and Political Geography',
    topics: [
      'Concept of Culture, Cultural Realms, Cultural Hearths, Cultural Diffusion',
      'Social Structure and Processes, Social Well-being and Quality of Life, Spatial Patterns of Social Groups',
      'Heartland and Rimland Theories (Mackinder and Spykman), Frontiers and Boundaries, Geopolitics of Oceans',
      'Electoral Geography, Resource Geopolitics, Territoriality and Sovereignty'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_GEOGRAPHIC_THOUGHT',
    unitName: 'Geographical Thought',
    topics: [
      'Contributions of Greek, Roman, Arab, Chinese and Indian Scholars',
      'Contributions of Founders of Modern Geography (Humboldt, Ritter, Ratzel, Vidal de la Blache)',
      'Dichotomies in Geography: Physical vs Human, Determinism vs Possibilism, Regional vs Systematic, Qualitative vs Quantitative',
      'Behavioralism, Humanistic Geography, Radical and Critical Geography, Post-modernism in Geography'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_GEOGRAPHICAL_TECHNIQUES',
    unitName: 'Geographical Techniques',
    topics: [
      'Sources of Geographic Data, Spatial and Attribute Data, Map Making, Scales, Projections',
      'Remote Sensing: Principles, Sensors, Platforms, Digital Image Processing, Microwave and Hyperspectral Remote Sensing',
      'Geographical Information System (GIS): Spatial and Non-Spatial Data Models, Vector and Raster Data, Overlay Analysis',
      'Global Navigation Satellite System (GNSS/GPS), Quantitative and Statistical Techniques in Geography, Measures of Central Tendency, Dispersion, Correlation, Regression'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_GEOGRAPHY_INDIA',
    unitName: 'Geography of India',
    topics: [
      'Physiographic Divisions of India, Drainage Systems (Himalayan and Peninsular)',
      'Climate of India, Mechanism of Indian Monsoon, Western Disturbances, Climatic Regions of India',
      'Soils and Natural Vegetation of India, Water Resources and Irrigation, Agriculture (crops, green revolution, agro-climatic regions)',
      'Mineral and Energy Resources, Major Industries and Industrial Regions, Transport, Trade and Regional Disparities in India'
    ]
  }
];

export function mapQuestionToGeographyUnit(questionText: string): { unitNumber: number; unitCode: string; unitName: string } {
  const text = questionText.toLowerCase();

  if (text.includes('plate tectoni') || text.includes('davis') || text.includes('penck') || text.includes('geomorphic') || text.includes('slope') || text.includes('fault') || text.includes('fold') || text.includes('weathering') || text.includes('earthquake') || text.includes('volcan')) {
    return { unitNumber: 1, unitCode: 'UNIT_1_GEOMORPHOLOGY', unitName: 'Geomorphology' };
  }
  if (text.includes('koppen') || text.includes('thornthwaite') || text.includes('insolation') || text.includes('atmosphere') || text.includes('cyclone') || text.includes('anticyclone') || text.includes('el nino') || text.includes('la nina') || text.includes('monsoon') || text.includes('heat budget')) {
    return { unitNumber: 2, unitCode: 'UNIT_2_CLIMATOLOGY', unitName: 'Climatology' };
  }
  if (text.includes('ocean') || text.includes('coral') || text.includes('salinity') || text.includes('tide') || text.includes('tsunami') || text.includes('continental shelf') || text.includes('marine') || text.includes('sea level')) {
    return { unitNumber: 3, unitCode: 'UNIT_3_OCEANOGRAPHY', unitName: 'Oceanography' };
  }
  if (text.includes('ecosystem') || text.includes('biodiversity') || text.includes('greenhouse') || text.includes('biosphere reserve') || text.includes('kyoto') || text.includes('paris agreement') || text.includes('pollution') || text.includes('hotspot')) {
    return { unitNumber: 4, unitCode: 'UNIT_4_GEOGRAPHY_ENVIRONMENT', unitName: 'Geography of Environment' };
  }
  if (text.includes('demographic transition') || text.includes('malthus') || text.includes('christaller') || text.includes('central place') || text.includes('rank-size') || text.includes('primate city') || text.includes('burgess') || text.includes('migration') || text.includes('settlement')) {
    return { unitNumber: 5, unitCode: 'UNIT_5_POPULATION_SETTLEMENT_GEOGRAPHY', unitName: 'Population and Settlement Geography' };
  }
  if (text.includes('von thunen') || text.includes('weber') || text.includes('industrial location') || text.includes('agricultural region') || text.includes('whittlesey') || text.includes('myrdal') || text.includes('perroux') || text.includes('regional development')) {
    return { unitNumber: 6, unitCode: 'UNIT_6_GEOGRAPHY_ECONOMIC_ACTIVITIES', unitName: 'Geography of Economic Activities and Regional Development' };
  }
  if (text.includes('heartland') || text.includes('rimland') || text.includes('mackinder') || text.includes('spykman') || text.includes('geopolitic') || text.includes('cultural realm') || text.includes('cultural hearth') || text.includes('boundary') || text.includes('frontier')) {
    return { unitNumber: 7, unitCode: 'UNIT_7_CULTURAL_SOCIAL_POLITICAL_GEOGRAPHY', unitName: 'Cultural, Social and Political Geography' };
  }
  if (text.includes('humboldt') || text.includes('ritter') || text.includes('ratzel') || text.includes('vidal') || text.includes('possibilism') || text.includes('determinism') || text.includes('paradigm') || text.includes('quantitative revolution') || text.includes('geographical thought') || text.includes('strabo') || text.includes('ptolemy')) {
    return { unitNumber: 8, unitCode: 'UNIT_8_GEOGRAPHIC_THOUGHT', unitName: 'Geographical Thought' };
  }
  if (text.includes('remote sensing') || text.includes('gis') || text.includes('projection') || text.includes('scale') || text.includes('gps') || text.includes('gnss') || text.includes('raster') || text.includes('vector') || text.includes('cartography') || text.includes('standard deviation') || text.includes('regression')) {
    return { unitNumber: 9, unitCode: 'UNIT_9_GEOGRAPHICAL_TECHNIQUES', unitName: 'Geographical Techniques' };
  }
  if (text.includes('himalaya') || text.includes('peninsular') || text.includes('ganga') || text.includes('brahmaputra') || text.includes('godavari') || text.includes('western ghat') || text.includes('census of india') || text.includes('black soil') || text.includes('alluvial') || text.includes('india')) {
    return { unitNumber: 10, unitCode: 'UNIT_10_GEOGRAPHY_INDIA', unitName: 'Geography of India' };
  }

  return { unitNumber: 1, unitCode: 'UNIT_1_GEOMORPHOLOGY', unitName: 'Geomorphology' };
}