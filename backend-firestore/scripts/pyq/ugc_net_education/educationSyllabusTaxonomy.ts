export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_EDUCATION_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_EDUCATIONAL_STUDIES',
    unitName: 'Educational Studies (Philosophical, Sociological & Historical Foundations)',
    topics: [
      'Contribution of Indian and Western Schools of Philosophy to Educational Thought',
      'Sankhya, Yoga, Vedanta, Buddhism, Jainism, Islamic Traditions',
      'Idealism, Realism, Naturalism, Pragmatism, Existentialism, Marxism',
      'Sociology of Education, Social Mobility, Social Stratification, Social Change',
      'Historical perspectives on Education during Colonial and Post-Independence India'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_HISTORY_POLITICS_ECONOMICS',
    unitName: 'History, Politics and Economics of Education',
    topics: [
      'Committees and Commissions on Education in Pre and Post Independence India',
      'National Policy on Education 1968, 1986, NEP 2020, Right to Education Act 2009',
      'Relationship between Policies and Education, Education and Politics, Liberalism, Democratic, Totalitarian',
      'Economics of Education: Cost-Benefit Analysis, Human Capital Theory, Signaling Theory',
      'Financing of Higher Education, Budget Allocations, Public and Private Expenditure'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_LEARNER_LEARNING_PROCESS',
    unitName: 'Learner and Learning Process (Psychology of Education)',
    topics: [
      'Growth and Development: Concept, Principles, Physical, Cognitive, Emotional, Social Development',
      'Theories of Learning: Behaviorism, Cognitivism, Constructivism, Social Constructivism',
      'Theories of Intelligence: Spearman, Thurstone, Guilford, Gardner, Sternberg',
      'Theories of Personality and Assessment: Freud, Allport, Cattell, Big Five',
      'Mental Health and Hygiene, Guidance and Counselling, Motivation'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_TEACHER_EDUCATION',
    unitName: 'Teacher Education',
    topics: [
      'Meaning, Nature and Scope of Teacher Education, Types of Teacher Education Programs',
      'Structure of Teacher Education Curriculum and its Vision in Curriculum Frameworks (NCFTE)',
      'Understanding Knowledge Base of Teacher Education from Viewpoint of Schulman, Deng and Luke',
      'In-service Teacher Education: Orientation, Refresher Courses, Workshops, MOOCs',
      'Agencies of Teacher Education: NCTE, NCERT, SCERT, DIET, UGC-HRDC, RIE'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_CURRICULUM_STUDIES',
    unitName: 'Curriculum Studies',
    topics: [
      'Concept and Principles of Curriculum, Strategies of Curriculum Development',
      'Models of Curriculum Design: Traditional and Contemporary Models (Tyler, Wheeler, Taba, Oliva)',
      'Curriculum Evaluation: Formative and Summative, Models of Curriculum Evaluation (Stufflebeam CIPP, Stake, Scriven)',
      'Instructional Systems, Competency-Based Curriculum, Choice Based Credit System (CBCS)',
      'Curriculum Change and Innovation, Role of Students, Teachers and Educational Administrators'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_RESEARCH_IN_EDUCATION',
    unitName: 'Research in Education',
    topics: [
      'Meaning and Steps of Scientific Method, Characteristics of Scientific Inquiry',
      'Types of Educational Research: Fundamental, Applied and Action Research',
      'Approaches to Educational Research: Quantitative, Qualitative, Mixed Methods',
      'Sampling: Probability and Non-Probability Sampling Techniques, Sample Size',
      'Tools of Research: Rating Scales, Attitude Scales, Questionnaire, Interview, Observation',
      'Descriptive and Inferential Statistics: Mean, SD, Normal Distribution, t-test, ANOVA, Chi-Square'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_PEDAGOGY_ANDRAGOGY_ASSESSMENT',
    unitName: 'Pedagogy, Andragogy and Assessment',
    topics: [
      'Pedagogy, Andragogical Principles of Malcolm Knowles, Heutagogy',
      'Assessment of Learning, Assessment for Learning, Assessment as Learning',
      'Diagnostic, Formative and Summative Evaluation, Criterion-Referenced and Norm-Referenced Tests',
      'Rubrics, Portfolio Assessment, Continuous and Comprehensive Evaluation (CCE)',
      'Feedback Devices, Computer-Assisted Testing and Adaptive Testing'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_TECHNOLOGY_IN_EDUCATION',
    unitName: 'Technology in and for Education',
    topics: [
      'Concept of Educational Technology, Information and Communication Technology (ICT)',
      'Instructional Design Models: ADDIE, ASSURE, Gagne Nine Events of Instruction',
      'E-learning, Blended Learning, Flipped Classroom, Open Educational Resources (OER)',
      'SWAYAM, SWAYAM PRABHA, MOOCs, LMS, Virtual Classrooms, AI in Education',
      'Assistive Technologies for Students with Diverse Learning Needs'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_EDUCATIONAL_MANAGEMENT_LEADERSHIP',
    unitName: 'Educational Management, Administration and Leadership',
    topics: [
      'Principles and Functions of Educational Management, POSDCORB, CPM, PERT',
      'Leadership in Education: Transformational, Transactional, Value-Based, Distributed Leadership',
      'Quality in Education: Deming, TQM, Six Sigma, Quality Indicators in Higher Education',
      'Accreditation and Quality Assurance: NAAC, NBA, NIRF',
      'Institutional Planning, Change Management, Conflict Management'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_INCLUSIVE_EDUCATION',
    unitName: 'Inclusive Education',
    topics: [
      'Concept, Principles and Scope of Inclusive Education, Integration vs Inclusion',
      'Legal and Policy Frameworks: Salamanca Statement, UNCRPD, RPwD Act 2016',
      'Types of Disabilities: Physical, Sensory, Intellectual, Specific Learning Disabilities (Dyslexia, Dyscalculia)',
      'Curricular Adaptations, Accommodations, Universal Design for Learning (UDL)',
      'Assistive and Adaptive Devices, Role of Teachers and Parents in Inclusive Schools'
    ]
  }
];
