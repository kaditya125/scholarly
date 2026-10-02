export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_LAW_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_JURISPRUDENCE',
    unitName: 'Jurisprudence',
    topics: [
      'Nature and Sources of Law, Schools of Jurisprudence (Analytical, Historical, Sociological, Realist, Natural Law)',
      'Law and Morality, Concept of Rights and Duties, Legal Personality',
      'Ownership and Possession, Concept of Justice, Theories of Punishment'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_CONSTITUTIONAL_ADMIN_LAW',
    unitName: 'Constitutional and Administrative Law',
    topics: [
      'Preamble, Fundamental Rights, Directive Principles and Fundamental Duties',
      'Union and State Executive, Legislature and Judiciary (Appointments, Powers and Jurisdiction)',
      'Emergency Provisions, Amendment of Constitution, Basic Structure Doctrine',
      'Administrative Law: Nature and Scope, Rule of Law, Separation of Powers, Delegated Legislation, Principles of Natural Justice, Judicial Review'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_PUBLIC_INTERNATIONAL_LAW',
    unitName: 'Public International Law and IHL',
    topics: [
      'Nature and Sources of International Law, Relationship between International Law and Municipal Law',
      'State Recognition and State Succession, Law of the Sea, Air and Outer Space',
      'Extradition and Asylum, United Nations and its Organs, ICJ',
      'International Humanitarian Law (Geneva Conventions) and Refugee Law'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_LAW_OF_CRIMES',
    unitName: 'Law of Crimes',
    topics: [
      'General Principles of Criminal Liability: Actus Reus, Mens Rea, Strict Liability, General Exceptions',
      'Inchoate Offences: Abetment, Criminal Conspiracy, Attempt',
      'Offences against Human Body: Culpable Homicide, Murder, Kidnapping, Abduction, Rape',
      'Offences against Property: Theft, Extortion, Robbery, Dacoity, Cheating, Criminal Breach of Trust'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_LAW_OF_TORTS_CONSUMER',
    unitName: 'Law of Torts and Consumer Protection',
    topics: [
      'Nature and Definition of Tort, General Defences (Volenti non fit injuria, Act of God, etc.)',
      'Negligence, Nuisance, Defamation, Vicarious Liability, Strict and Absolute Liability',
      'Consumer Protection Act 2019: Consumer Rights, Redressal Mechanisms, Product Liability',
      'Motor Vehicles Act: No Fault Liability, Third Party Insurance'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_COMMERCIAL_LAW',
    unitName: 'Commercial Law',
    topics: [
      'General Principles of Contract (Sections 1-75 Indian Contract Act 1872)',
      'Specific Contracts: Indemnity, Guarantee, Bailment, Pledge, Agency',
      'Sale of Goods Act 1930, Partnership Act 1932, Limited Liability Partnership Act 2008',
      'Negotiable Instruments Act 1881, Company Law 2013 (Incorporation, Directors, Corporate Social Responsibility)'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_FAMILY_LAW',
    unitName: 'Family Law',
    topics: [
      'Sources of Hindu Law and Muslim Law, Marriage and Dissolution of Marriage',
      'Matrimonial Remedies: Restitution of Conjugal Rights, Judicial Separation, Divorce',
      'Maintenance and Alimony, Adoption and Guardianship',
      'Succession and Inheritance, Uniform Civil Code'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_ENVIRONMENT_HUMAN_RIGHTS',
    unitName: 'Environment and Human Rights Law',
    topics: [
      'Concept of Environment, Environmental Pollution, Polluter Pays Principle, Precautionary Principle, Sustainable Development',
      'Environment Protection Act 1986, Air and Water Acts, National Green Tribunal (NGT)',
      'Universal Declaration of Human Rights (UDHR), ICCPR, ICESCR',
      'Protection of Human Rights Act 1993, National and State Human Rights Commissions'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_INTELLECTUAL_PROPERTY_CYBER',
    unitName: 'Intellectual Property and Cyber Law',
    topics: [
      'Concept and Theories of Intellectual Property, TRIPS Agreement',
      'Copyright Act 1957, Patents Act 1970, Trademarks Act 1999, Geographical Indications Act 1999',
      'Information Technology Act 2000: Digital Signatures, Electronic Governance, Cyber Crimes and Penalties'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_COMPARATIVE_CONSTITUTIONAL_LAW',
    unitName: 'Comparative Public Law and Systems of Governance',
    topics: [
      'Comparative Constitutionalism, Forms of Government (Presidential and Parliamentary, Federal and Unitary)',
      'Rule of Law (Dicey and Modern Concept), Separation of Powers (USA, UK, France, India)',
      'Judicial Review and Constitutional Amendments (Comparative Perspective: USA, UK, India)',
      'Ombudsman, Right to Information, Public Interest Litigation (PIL)'
    ]
  }
];

export function mapQuestionToLawUnit(questionText: string): { unitNumber: number; unitCode: string; unitName: string } {
  const text = questionText.toLowerCase();

  if (text.includes('kelsen') || text.includes('austin') || text.includes('hart') || text.includes('jurisprudence') || text.includes('grundnorm') || text.includes('natural law') || text.includes('possession') || text.includes('ownership') || text.includes('savigny') || text.includes('roscoe pound')) {
    return { unitNumber: 1, unitCode: 'UNIT_1_JURISPRUDENCE', unitName: 'Jurisprudence' };
  }
  if (text.includes('article') || text.includes('constitution') || text.includes('fundamental right') || text.includes('writ') || text.includes('habeas corpus') || text.includes('mandamus') || text.includes('natural justice') || text.includes('delegated legislation') || text.includes('governor') || text.includes('president') || text.includes('supreme court')) {
    return { unitNumber: 2, unitCode: 'UNIT_2_CONSTITUTIONAL_ADMIN_LAW', unitName: 'Constitutional and Administrative Law' };
  }
  if (text.includes('treaty') || text.includes('international court') || text.includes('icj') || text.includes('geneva') || text.includes('extradition') || text.includes('asylum') || text.includes('un security council') || text.includes('international law') || text.includes('recognition of state') || text.includes('law of the sea')) {
    return { unitNumber: 3, unitCode: 'UNIT_3_PUBLIC_INTERNATIONAL_LAW', unitName: 'Public International Law and IHL' };
  }
  if (text.includes('murder') || text.includes('culpable homicide') || text.includes('mens rea') || text.includes('actus reus') || text.includes('theft') || text.includes('robbery') || text.includes('dacoity') || text.includes('sedition') || text.includes('ipc') || text.includes('penal code') || text.includes('criminal')) {
    return { unitNumber: 4, unitCode: 'UNIT_4_LAW_OF_CRIMES', unitName: 'Law of Crimes' };
  }
  if (text.includes('tort') || text.includes('negligence') || text.includes('nuisance') || text.includes('defamation') || text.includes('strict liability') || text.includes('absolute liability') || text.includes('consumer protection') || text.includes('motor vehicle') || text.includes('rylands v fletcher') || text.includes('volenti non fit')) {
    return { unitNumber: 5, unitCode: 'UNIT_5_LAW_OF_TORTS_CONSUMER', unitName: 'Law of Torts and Consumer Protection' };
  }
  if (text.includes('contract') || text.includes('consideration') || text.includes('offer and acceptance') || text.includes('indemnity') || text.includes('guarantee') || text.includes('bailment') || text.includes('partnership') || text.includes('company') || text.includes('negotiable instrument') || text.includes('cheque') || text.includes('promissory note')) {
    return { unitNumber: 6, unitCode: 'UNIT_6_COMMERCIAL_LAW', unitName: 'Commercial Law' };
  }
  if (text.includes('hindu marriage') || text.includes('muslim law') || text.includes('divorce') || text.includes('maintenance') || text.includes('adoption') || text.includes('succession') || text.includes('restitution') || text.includes('dower') || text.includes('mahr') || text.includes('talaq')) {
    return { unitNumber: 7, unitCode: 'UNIT_7_FAMILY_LAW', unitName: 'Family Law' };
  }
  if (text.includes('environment') || text.includes('pollution') || text.includes('ngt') || text.includes('sustainable development') || text.includes('human rights') || text.includes('udhr') || text.includes('nhrc') || text.includes('kyoto') || text.includes('precautionary principle')) {
    return { unitNumber: 8, unitCode: 'UNIT_8_ENVIRONMENT_HUMAN_RIGHTS', unitName: 'Environment and Human Rights Law' };
  }
  if (text.includes('patent') || text.includes('copyright') || text.includes('trademark') || text.includes('trips') || text.includes('intellectual property') || text.includes('cyber') || text.includes('information technology act') || text.includes('digital signature') || text.includes('hacking')) {
    return { unitNumber: 9, unitCode: 'UNIT_9_INTELLECTUAL_PROPERTY_CYBER', unitName: 'Intellectual Property and Cyber Law' };
  }
  if (text.includes('ombudsman') || text.includes('comparative constitutional') || text.includes('separation of powers') || text.includes('dicey') || text.includes('rule of law') || text.includes('pil') || text.includes('public interest litigation') || text.includes('lokpal')) {
    return { unitNumber: 10, unitCode: 'UNIT_10_COMPARATIVE_CONSTITUTIONAL_LAW', unitName: 'Comparative Public Law and Systems of Governance' };
  }

  return { unitNumber: 1, unitCode: 'UNIT_1_JURISPRUDENCE', unitName: 'Jurisprudence' };
}