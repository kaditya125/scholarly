export interface SyllabusUnit {
  unitNumber: number;
  unitCode: string;
  unitName: string;
  topics: string[];
}

export const UGC_NET_PSYCHOLOGY_TAXONOMY: SyllabusUnit[] = [
  {
    unitNumber: 1,
    unitCode: 'UNIT_1_EMERGENCE_OF_PSYCHOLOGY',
    unitName: 'Emergence of Psychology (Eastern and Western Traditions)',
    topics: [
      'Psychological Thought in Major Indian Systems: Advaita Vedanta, Samkhya, Yoga, Buddhism, Sufism',
      'Western Traditions: Greek Heritage, Renaissance, Post-Renaissance, Positivism',
      'Structuralism, Functionalism, Psychoanalysis, Behaviorism, Gestalt, Humanistic, Existential',
      'Cognitive Revolution, Indigenous Psychology, Multiculturalism'
    ]
  },
  {
    unitNumber: 2,
    unitCode: 'UNIT_2_RESEARCH_METHODOLOGY_STATISTICS',
    unitName: 'Research Methodology and Statistics',
    topics: [
      'Research Designs: Experimental, Quasi-Experimental, Ex-Post Facto, Factorial, Correlational',
      'Sampling: Probability and Non-Probability Sampling Techniques',
      'Qualitative Research: Grounded Theory, Discourse Analysis, Narrative, Phenomenology',
      'Parametric and Non-Parametric Statistics: t-test, ANOVA, ANCOVA, Multiple Regression, Factor Analysis'
    ]
  },
  {
    unitNumber: 3,
    unitCode: 'UNIT_3_PSYCHOLOGICAL_TESTING',
    unitName: 'Psychological Testing',
    topics: [
      'Types of Tests: Test Construction, Item Writing, Item Analysis',
      'Standardization: Reliability, Validity, Norms',
      'Assessment of Intelligence, Aptitude, Interest, Personality and Neuropsychological Functions',
      'Ethical Issues in Psychological Assessment, Computer-Based Testing'
    ]
  },
  {
    unitNumber: 4,
    unitCode: 'UNIT_4_BIOLOGICAL_BASIS_BEHAVIOR',
    unitName: 'Biological Basis of Behavior',
    topics: [
      'Neurons: Action Potential, Synaptic Transmission, Neurotransmitters',
      'Central and Peripheral Nervous System, Structure and Functions of Brain Lobes, Limbic System',
      'Endocrine System and Hormonal Influences on Behavior',
      'Genetics and Behavior: Chromosomal Abnormalities, Twin Studies, Heritability'
    ]
  },
  {
    unitNumber: 5,
    unitCode: 'UNIT_5_ATTENTION_PERCEPTION_LEARNING_MEMORY',
    unitName: 'Attention, Perception, Learning, Memory and Forgetting',
    topics: [
      'Attention: Selective, Divided, Sustained, Models of Attention',
      'Perception: Gestalt Laws, Depth Perception, Perceptual Constancy, Illusions',
      'Learning: Classical Conditioning, Operant Conditioning, Observational Learning, Cognitive Learning',
      'Memory: Sensory, Short-Term, Working Memory, Long-Term Memory, Retrieval Models, Forgetting Theories'
    ]
  },
  {
    unitNumber: 6,
    unitCode: 'UNIT_6_THINKING_INTELLIGENCE_CREATIVITY',
    unitName: 'Thinking, Intelligence and Creativity',
    topics: [
      'Thinking: Concept Formation, Problem Solving, Reasoning, Decision Making, Metacognition',
      'Theories of Intelligence: Spearman, Thurstone, Cattell, Guilford, Gardner, Sternberg, PASS Theory',
      'Emotional Intelligence, Spiritual Intelligence, Artificial Intelligence',
      'Creativity: Nature, Theories, Measurement, Relationship with Intelligence'
    ]
  },
  {
    unitNumber: 7,
    unitCode: 'UNIT_7_PERSONALITY_MOTIVATION_EMOTION_STRESS',
    unitName: 'Personality, Motivation, Emotion, Stress and Coping',
    topics: [
      'Personality Theories: Psychodynamic, Trait and Type, Humanistic, Social-Cognitive, Biological',
      'Motivation: Drive, Incentive, Maslow Need Hierarchy, Achievement, Intrinsic and Extrinsic',
      'Emotion: Physiological Correlates, Theories of Emotion (James-Lange, Cannon-Bard, Schachter-Singer)',
      'Stress: General Adaptation Syndrome, Stressors, Coping Strategies, Health Implications'
    ]
  },
  {
    unitNumber: 8,
    unitCode: 'UNIT_8_SOCIAL_PSYCHOLOGY',
    unitName: 'Social Psychology',
    topics: [
      'Social Cognition, Attribution Theories (Heider, Kelley, Jones-Davis)',
      'Attitudes: Formation, Measurement, Attitude Change, Cognitive Dissonance',
      'Social Influence: Conformity, Compliance, Obedience, Group Dynamics',
      'Interpersonal Attraction, Altruism, Aggression, Prejudice, Discrimination'
    ]
  },
  {
    unitNumber: 9,
    unitCode: 'UNIT_9_HUMAN_DEVELOPMENT_INTERVENTIONS',
    unitName: 'Human Development and Interventions',
    topics: [
      'Developmental Stages: Infancy, Childhood, Adolescence, Adulthood, Old Age',
      'Theories of Development: Piaget, Vygotsky, Erikson, Kohlberg',
      'Psychopathology and Diagnostic Systems (DSM, ICD), Major Disorders',
      'Psychotherapeutic Interventions: Psychoanalysis, CBT, REBT, Humanistic, Mindfulness, Counselling'
    ]
  },
  {
    unitNumber: 10,
    unitCode: 'UNIT_10_EMERGING_AREAS_PSYCHOLOGY',
    unitName: 'Emerging Areas of Psychology',
    topics: [
      'Health Psychology: Lifestyle Diseases, Psychoneuroimmunology, Wellness',
      'Positive Psychology: Well-Being, Happiness, Character Strengths, Flow',
      'Environmental Psychology, Military Psychology, Sports Psychology',
      'Cyberpsychology, Forensic Psychology, Psychology of Gender'
    ]
  }
];
