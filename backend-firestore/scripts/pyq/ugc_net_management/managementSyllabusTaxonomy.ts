/**
 * UGC NET Management (Subject Code 17)
 * Official 10-Unit Syllabus Taxonomy:
 * Unit 1: Management Concepts, Theories & Management Functions
 * Unit 2: Organizational Behaviour, Individual & Group Dynamics
 * Unit 3: Strategic Management & Business Policy
 * Unit 4: Human Resource Management & Industrial Relations
 * Unit 5: Accounting, Financial Analysis & Financial Management
 * Unit 6: Marketing Management, Consumer Behaviour & Strategy
 * Unit 7: Operations Management, Supply Chain & Operations Research
 * Unit 8: Statistics, Research Methodology & Management Information Systems (MIS)
 * Unit 9: International Business, Trade Theories & Global Finance
 * Unit 10: Entrepreneurship, Small Business Management & Corporate Governance
 */

export interface ManagementUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  keywords: string[];
}

export const UGC_NET_MANAGEMENT_TAXONOMY: ManagementUnit[] = [
  {
    unitNumber: 1,
    unitCode: "UNIT_1_MGMT_FUNCTIONS_THEORIES",
    unitName: "Management Concepts, Theories and Functions",
    keywords: [
      "planning", "organizing", "staffing", "directing", "controlling", "decision making",
      "scientific management", "taylor", "fayol", "administrative theory", "bureaucracy", "weber",
      "span of control", "delegation", "centralization", "decentralization", "coordination",
      "managerial roles", "mintzberg", "mbo", "management by objectives", "conflict management"
    ]
  },
  {
    unitNumber: 2,
    unitCode: "UNIT_2_ORGANIZATIONAL_BEHAVIOUR",
    unitName: "Organizational Behaviour and Dynamics",
    keywords: [
      "organizational behaviour", "ob", "personality", "myers briggs", "mbti", "big five",
      "perception", "halo effect", "attribution theory", "attitudes", "job satisfaction",
      "motivation", "maslow", "herzberg", "two-factor", "mcgregor", "theory x", "theory y",
      "vroom", "expectancy theory", "porter lawler", "group dynamics", "team building",
      "leadership", "transformational leadership", "transactional leadership", "managerial grid",
      "fiedler contingency", "situational leadership", "organizational culture", "transactional analysis", "johari window"
    ]
  },
  {
    unitNumber: 3,
    unitCode: "UNIT_3_STRATEGIC_MANAGEMENT",
    unitName: "Strategic Management and Business Policy",
    keywords: [
      "strategic management", "vision", "mission", "swot analysis", "pestel", "porter 5 forces",
      "competitive advantage", "core competence", "prahalad", "hamel", "value chain analysis",
      "bcg matrix", "cash cow", "star", "question mark", "dog", "ge 9 cell", "ge matrix",
      "ansoff matrix", "market penetration", "diversification", "mergers and acquisitions",
      "joint venture", "strategic alliance", "balanced scorecard", "strategy implementation"
    ]
  },
  {
    unitNumber: 4,
    unitCode: "UNIT_4_HUMAN_RESOURCE_MANAGEMENT",
    unitName: "Human Resource Management and Industrial Relations",
    keywords: [
      "human resource management", "hrm", "hr planning", "job analysis", "job description",
      "job specification", "recruitment", "selection", "interview", "assessment centre",
      "training and development", "vestibule training", "performance appraisal", "360 degree appraisal",
      "compensation", "fringe benefits", "career planning", "succession planning",
      "industrial relations", "trade union", "trade union act", "collective bargaining",
      "workers participation in management", "grievance procedure", "industrial disputes act"
    ]
  },
  {
    unitNumber: 5,
    unitCode: "UNIT_5_ACCOUNTING_FINANCIAL_MGMT",
    unitName: "Accounting, Financial Analysis and Financial Management",
    keywords: [
      "financial accounting", "balance sheet", "income statement", "ratio analysis", "liquidity ratio",
      "profitability ratio", "solvency ratio", "funds flow", "cash flow statement", "cost accounting",
      "marginal costing", "break even point", "bep", "c-v-p analysis", "standard costing", "variance analysis",
      "cost of capital", "wacc", "capital structure", "modigliani miller", "pecking order theory",
      "capital budgeting", "npv", "net present value", "irr", "internal rate of return", "payback period",
      "working capital management", "operating cycle", "dividend policy", "gordon model", "walter model"
    ]
  },
  {
    unitNumber: 6,
    unitCode: "UNIT_6_MARKETING_MANAGEMENT",
    unitName: "Marketing Management and Strategy",
    keywords: [
      "marketing concept", "marketing mix", "4 ps", "7 ps", "consumer behaviour", "buyer behavior",
      "decision making process", "market segmentation", "targeting", "positioning", "stp",
      "product life cycle", "plc", "new product development", "brand equity", "branding",
      "pricing strategy", "skimming price", "penetration price", "distribution channel",
      "wholesaling", "retailing", "logistics", "promotion mix", "advertising", "sales promotion",
      "digital marketing", "seo", "services marketing", "servqual", "customer relationship management", "crm"
    ]
  },
  {
    unitNumber: 7,
    unitCode: "UNIT_7_OPERATIONS_SUPPLY_CHAIN_OR",
    unitName: "Operations Management, Supply Chain and Operations Research",
    keywords: [
      "operations management", "production planning", "plant layout", "plant location",
      "inventory management", "eoq", "economic order quantity", "abc analysis", "ved analysis",
      "just in time", "jit", "total quality management", "tqm", "six sigma", "iso 9000", "quality circles",
      "pert", "cpm", "critical path method", "network analysis", "operations research",
      "linear programming", "simplex method", "transportation problem", "assignment problem",
      "queuing theory", "game theory", "supply chain management", "scm", "bullwhip effect"
    ]
  },
  {
    unitNumber: 8,
    unitCode: "UNIT_8_STATS_RESEARCH_MIS",
    unitName: "Statistics, Research Methodology and Information Systems",
    keywords: [
      "measures of central tendency", "mean", "median", "mode", "standard deviation", "variance",
      "correlation", "karl pearson", "regression analysis", "probability", "binomial distribution",
      "poisson distribution", "normal distribution", "sampling techniques", "random sampling",
      "stratified sampling", "hypothesis testing", "type i error", "type ii error", "null hypothesis",
      "t test", "z test", "chi square", "anova", "f test", "research design", "primary data", "secondary data",
      "management information system", "mis", "decision support system", "dss", "erp", "data mining"
    ]
  },
  {
    unitNumber: 9,
    unitCode: "UNIT_9_INTERNATIONAL_BUSINESS",
    unitName: "International Business and Global Finance",
    keywords: [
      "international business", "globalization", "multinational corporation", "mnc",
      "theories of international trade", "comparative advantage", "ricardo", "heckscher ohlin",
      "foreign direct investment", "fdi", "fpi", "balance of payments", "bop", "current account",
      "capital account", "foreign exchange", "forex", "exchange rate", "purchasing power parity",
      "imf", "world bank", "wto", "gatt", "trips", "trims", "regional integration", "nafta", "european union", "asean"
    ]
  },
  {
    unitNumber: 10,
    unitCode: "UNIT_10_ENTREPRENEURSHIP_GOVERNANCE_CSR",
    unitName: "Entrepreneurship, Small Business Management and Corporate Governance",
    keywords: [
      "entrepreneurship", "entrepreneurial traits", "schumpeter", "innovation", "startup",
      "business plan", "venture capital", "angel investor", "incubation", "msme", "micro small medium enterprises",
      "msmed act", "industrial sickness", "corporate governance", "cadbury committee", "kumar mangalam birla committee",
      "board of directors", "audit committee", "corporate social responsibility", "csr", "business ethics",
      "whistle blowing", "stakeholder theory"
    ]
  }
];

export function classifyManagementText(text: string): { unitNumber: number; unitCode: string; unitName: string } {
  const lower = text.toLowerCase();
  let best = UGC_NET_MANAGEMENT_TAXONOMY[0];
  let maxScore = -1;

  for (const u of UGC_NET_MANAGEMENT_TAXONOMY) {
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
