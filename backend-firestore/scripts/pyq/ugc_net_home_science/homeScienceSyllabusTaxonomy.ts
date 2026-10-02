export interface SyllabusUnit {
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
