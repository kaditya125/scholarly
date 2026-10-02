/**
 * UGC NET Economics (Subject Code 01)
 * Official 10-Unit Syllabus Taxonomy:
 * Unit 1: Micro Economics
 * Unit 2: Macro Economics
 * Unit 3: Statistics and Econometrics
 * Unit 4: Mathematical Economics
 * Unit 5: International Economics
 * Unit 6: Public Economics
 * Unit 7: Money and Banking
 * Unit 8: Growth and Development Economics
 * Unit 9: Environmental Economics and Demography
 * Unit 10: Indian Economy
 */

export interface EconomicsUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  keywords: string[];
}

export const UGC_NET_ECONOMICS_TAXONOMY: EconomicsUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_MICRO_ECONOMICS',
    unitName: 'Micro Economics',
    keywords: [
      'theory of consumer behaviour', 'indifference curve', 'revealed preference', 'consumer surplus',
      'theory of production', 'isoquant', 'cobb-douglas', 'ces production', 'returns to scale',
      'perfect competition', 'monopoly', 'monopolistic', 'oligopoly', 'cournot', 'bertrand', 'stackelberg',
      'kinked demand', 'general equilibrium', 'pareto optimality', 'welfare economics', 'arrow impossibility'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_MACRO_ECONOMICS',
    unitName: 'Macro Economics',
    keywords: [
      'national income', 'gdp', 'gnp', 'classical macroeconomics', 'say law', 'keynesian model',
      'consumption function', 'permanent income hypothesis', 'life cycle hypothesis', 'investment multiplier',
      'accelerator', 'is-lm model', 'inflation', 'phillips curve', 'rational expectations', 'lucas critique'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_STATS_ECONOMETRICS',
    unitName: 'Statistics and Econometrics',
    keywords: [
      'probability theory', 'random variables', 'binomial distribution', 'poisson', 'normal distribution',
      'sampling methods', 'hypothesis testing', 't-test', 'f-test', 'chi-square', 'ols', 'ordinary least squares',
      'gauss-markov', 'heteroscedasticity', 'autocorrelation', 'multicollinearity', 'durbin-watson',
      'simultaneous equation', 'identification problem', 'instrumental variable'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_MATHEMATICAL_ECONOMICS',
    unitName: 'Mathematical Economics',
    keywords: [
      'differential calculus', 'maxima and minima', 'lagrangian multiplier', 'integration', 'matrix algebra',
      'determinant', 'cramer rule', 'input-output model', 'leontief', 'linear programming', 'simplex method',
      'game theory', 'nash equilibrium', 'dominant strategy', 'zero sum game', 'prisoner dilemma'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_INTERNATIONAL_ECONOMICS',
    unitName: 'International Economics',
    keywords: [
      'theories of international trade', 'ricardian', 'heckscher-ohlin', 'stolper-samuelson', 'rybczynski',
      'leontief paradox', 'terms of trade', 'tariffs', 'quotas', 'dumping', 'balance of payments',
      'bop adjustment', 'foreign exchange market', 'purchasing power parity', 'wto', 'imf', 'world bank'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_PUBLIC_ECONOMICS',
    unitName: 'Public Economics',
    keywords: [
      'market failure', 'public goods', 'externalities', 'coase theorem', 'taxation', 'canons of taxation',
      'direct and indirect taxes', 'deadweight loss', 'public debt', 'debt sustainability', 'fiscal deficit',
      'budgetary deficit', 'fiscal federalism', 'finance commission'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_MONEY_BANKING',
    unitName: 'Money and Banking',
    keywords: [
      'components of money supply', 'm1', 'm2', 'm3', 'm4', 'high powered money', 'money multiplier',
      'quantity theory of money', 'fisher equation', 'cambridge equation', 'demand for money', 'liquidity preference',
      'central bank', 'rbi', 'monetary policy', 'repo rate', 'reverse repo', 'crr', 'slr', 'commercial banking', 'npa'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_GROWTH_DEVELOPMENT',
    unitName: 'Growth and Development Economics',
    keywords: [
      'economic growth vs development', 'hdi', 'human development index', 'multidimensional poverty', 'gini coefficient',
      'lorenz curve', 'harrod-domar', 'solow model', 'endogenous growth', 'lewis model', 'ranis-fei',
      'big push theory', 'rosenstein-rodan', 'balanced growth', 'unbalanced growth', 'hirschman'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_ENVIRONMENT_DEMOGRAPHY',
    unitName: 'Environmental Economics and Demography',
    keywords: [
      'environmental degradation', 'environmental kuznets curve', 'pigouvian tax', 'tradable permits',
      'hedonic pricing', 'contingent valuation', 'demographic transition theory', 'malthusian theory',
      'fertility', 'mortality', 'infant mortality', 'life expectancy', 'migration', 'census'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_INDIAN_ECONOMY',
    unitName: 'Indian Economy',
    keywords: [
      'economic reforms 1991', 'lpg reforms', 'agriculture in india', 'green revolution', 'msp',
      'industrial policy', 'msme', 'make in india', 'services sector', 'infrastructure',
      'poverty and unemployment in india', 'niti aayog', 'planning commission', 'foreign trade of india'
    ]
  }
];

export function classifyEconomicsText(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  let best = UGC_NET_ECONOMICS_TAXONOMY[0];
  let maxScore = -1;

  for (const u of UGC_NET_ECONOMICS_TAXONOMY) {
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
