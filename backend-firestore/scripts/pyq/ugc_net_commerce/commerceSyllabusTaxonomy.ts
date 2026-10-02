/**
 * UGC NET Commerce (Subject Code 08)
 * Official 10-Unit Syllabus Taxonomy:
 * Unit 1: Business Environment and International Business
 * Unit 2: Accounting and Auditing
 * Unit 3: Business Economics
 * Unit 4: Business Finance
 * Unit 5: Business Statistics and Research Methods
 * Unit 6: Business Management and Human Resource Management
 * Unit 7: Banking and Financial Institutions
 * Unit 8: Marketing Management
 * Unit 9: Legal Aspects of Business
 * Unit 10: Income-tax and Corporate Tax Planning
 */

export interface CommerceUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  keywords: string[];
}

export const UGC_NET_COMMERCE_TAXONOMY: CommerceUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_BIZ_ENV_INTL_BIZ',
    unitName: 'Business Environment and International Business',
    keywords: [
      'business environment', 'fdi', 'fpi', 'wto', 'imf', 'world bank', 'uncad', 'bop', 'balance of payments',
      'tariff', 'quota', 'fta', 'customs union', 'globalization', 'monetary policy', 'fiscal policy'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_ACCOUNTING_AUDITING',
    unitName: 'Accounting and Auditing',
    keywords: [
      'accounting standards', 'ind as', 'ifrs', 'partnership', 'goodwill', 'revaluation', 'amalgamation',
      'absorption', 'holding company', 'cost accounting', 'marginal costing', 'standard costing',
      'variance analysis', 'auditing', 'internal control', 'audit report', 'ratio analysis', 'cash flow statement'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_BUSINESS_ECONOMICS',
    unitName: 'Business Economics',
    keywords: [
      'demand analysis', 'elasticity of demand', 'indifference curve', 'law of variable proportions',
      'isoquant', 'cost curves', 'perfect competition', 'monopoly', 'monopolistic', 'oligopoly',
      'kinked demand curve', 'price discrimination', 'national income'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_BUSINESS_FINANCE',
    unitName: 'Business Finance',
    keywords: [
      'cost of capital', 'wacc', 'capital structure', 'modigliani miller', 'net income approach',
      'leverage', 'operating leverage', 'financial leverage', 'capital budgeting', 'npv', 'irr',
      'working capital management', 'dividend policy', 'walter model', 'gordon model'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_STATS_RESEARCH',
    unitName: 'Business Statistics and Research Methods',
    keywords: [
      'measures of central tendency', 'dispersion', 'correlation', 'regression', 'probability',
      'binomial distribution', 'poisson distribution', 'normal distribution', 'sampling errors',
      'hypothesis testing', 't-test', 'z-test', 'f-test', 'chi-square', 'anova'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_BIZ_MGMT_HRM',
    unitName: 'Business Management and Human Resource Management',
    keywords: [
      'principles of management', 'planning', 'organizing', 'span of control', 'delegation',
      'motivation', 'maslow', 'herzberg', 'leadership', 'managerial grid', 'human resource planning',
      'recruitment', 'selection', 'performance appraisal', 'collective bargaining', 'industrial relations'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_BANKING_FIN_INSTITUTIONS',
    unitName: 'Banking and Financial Institutions',
    keywords: [
      'banking sector', 'rbi', 'commercial banks', 'npa', 'basel norms', 'car', 'capital adequacy',
      'sebi', 'nabard', 'exim bank', 'financial inclusion', 'money market', 'capital market',
      'call money', 'treasury bills', 'derivatives', 'mutual funds'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_MARKETING_MGMT',
    unitName: 'Marketing Management',
    keywords: [
      'marketing mix', '4 ps', 'segmentation', 'targeting', 'positioning', 'stp', 'product life cycle',
      'plc', 'pricing strategies', 'skimming', 'penetration', 'channel of distribution',
      'logistics', 'promotion mix', 'advertising', 'brand equity', 'consumer behaviour'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_LEGAL_ASPECTS',
    unitName: 'Legal Aspects of Business',
    keywords: [
      'indian contract act 1872', 'consideration', 'capacity to contract', 'free consent',
      'special contracts', 'indemnity', 'guarantee', 'bailment', 'sale of goods act 1930',
      'negotiable instruments act 1881', 'cheque', 'promissory note', 'companies act 2013',
      'memorandum of association', 'articles of association', 'competition act 2002', 'consumer protection act'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_INCOME_TAX_PLANNING',
    unitName: 'Income-tax and Corporate Tax Planning',
    keywords: [
      'income tax act 1961', 'residential status', 'exempted incomes', 'heads of income',
      'salary', 'house property', 'pgbp', 'capital gains', 'other sources', 'deductions under section 80',
      'corporate tax', 'tax avoidance', 'tax evasion', 'tax planning', 'transfer pricing', 'mat'
    ]
  }
];

export function classifyCommerceText(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  let best = UGC_NET_COMMERCE_TAXONOMY[0];
  let maxScore = -1;

  for (const u of UGC_NET_COMMERCE_TAXONOMY) {
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
