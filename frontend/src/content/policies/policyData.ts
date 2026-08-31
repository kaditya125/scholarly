export interface PolicySection {
  id: string;
  title: string;
  badge: string;
  category: 'core' | 'ai' | 'community' | 'education' | 'safety' | 'billing';
  summary: string;
  lastUpdated: string;
  paragraphs: {
    heading?: string;
    text: string;
    highlights?: string[];
  }[];
}

export interface PolicyMetadata {
  version: string;
  effectiveDate: string;
  title: string;
  tagline: string;
  changelog: string;
}

export const CURRENT_POLICY_METADATA: PolicyMetadata = {
  version: '2026.08',
  effectiveDate: 'August 31, 2026',
  title: 'Sadhya Platform Terms & Policies',
  tagline: 'Clear, transparent guidelines on how Sadhya works, what you can expect from us, and how our community learns together.',
  changelog: 'Official unified platform release covering AI Chat grounding, adaptive assessments, community discussions, peer messaging, teacher classrooms, user uploads, and transparent billing.',
};

export const SADHYA_POLICIES: PolicySection[] = [
  {
    id: 'terms',
    title: 'Terms of Service',
    badge: 'Core Relationship',
    category: 'core',
    summary: 'The agreement between you and Sadhya, covering student and teacher accounts, platform eligibility, security, and service availability.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. Welcome to Sadhya',
        text: 'Sadhya is an AI-assisted learning platform designed to help students prepare for school and competitive examinations (including NEET, JEE Main & Advanced, UPSC CSE, SSC CGL, State PSCs, and Board Exams) while enabling teachers to mentor and assign structured coursework. By creating an account or using Sadhya, you agree to these guidelines. If you do not agree, please do not use the service.',
      },
      {
        heading: '2. Student & Teacher Workspaces',
        text: 'Sadhya offers tailored experiences based on your chosen role. Student accounts provide access to personalized syllabus tracking, AI tutor assistance, adaptive practice drills, and community discussions. Teacher accounts provide tools to create classrooms, share invite codes, review cohort syllabus progress, and assign curated drills.',
      },
      {
        heading: '3. Eligibility and Young Learners',
        text: 'Sadhya is designed for learners of all ages preparing for academic milestones. If you are under 18, we welcome you to use Sadhya with the permission and supervision of a parent, legal guardian, or teacher. We take student safety and privacy seriously and never sell learner information.',
      },
      {
        heading: '4. Account Security & Verification',
        text: 'You are responsible for keeping your login credentials secure. To maintain community trust and prevent unauthorized access, email verification or Google OAuth authentication is required. If you ever notice unauthorized activity on your account, please notify our support team immediately.',
      },
      {
        heading: '5. Service Availability & Updates',
        text: 'We continually improve Sadhya with updated syllabus mappings, smarter AI explanations, and faster study tools. While we strive for 99.9% uptime, occasional maintenance or upgrades may occur. We commit to keeping you informed of any major platform changes.',
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy & Data Use Policy',
    badge: 'Your Privacy',
    category: 'core',
    summary: 'How your learning activity, questions, and profile data are protected and used solely to empower your education.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. What Information Sadhya Collects',
        text: 'We only collect information necessary to deliver and personalize your learning experience: your basic profile (name, email, target exam, grade level), your learning activity (questions asked, practice drill scores, topic mastery levels, study streak), and content you intentionally post or upload (notebooks, community posts).',
      },
      {
        heading: '2. How We Use Your Data',
        text: 'Your information is used strictly to power educational features: generating relevant practice questions, calculating your learning velocity, recommending focus areas, grounding AI responses in your curriculum, and connecting you with teachers or study peers.',
        highlights: [
          'No advertising or commercial tracking',
          'Zero data broker sales',
          'Strict role-based access controls on servers',
        ],
      },
      {
        heading: '3. You Own Your Data',
        text: 'You can review, export, or delete your Sadhya account and associated learning history at any time from your Account Settings. When you request account deletion, your private notes, chat history, and assessments are permanently erased from our active databases.',
      },
    ],
  },
  {
    id: 'ai-usage',
    title: 'AI Chat & AI Usage Policy',
    badge: 'AI Assistant',
    category: 'ai',
    summary: 'Clear expectations on how Sadhya AI assists your studies, why verification matters, and ethical non-cheating guidelines.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. How Sadhya AI Works',
        text: 'Sadhya AI is powered by state-of-the-art foundation models (such as Gemini 2.5 and Vertex AI) augmented with retrieval-augmented generation (RAG). When you ask a question or upload a photo of a problem, Sadhya references verified curriculum sources (NCERT, official previous years questions, standard reference textbooks) and displays a transparent 6-step reasoning timeline explaining how the solution was derived.',
      },
      {
        heading: '2. AI is a Study Aid — Always Verify Important Facts',
        text: 'While Sadhya AI is calibrated for high accuracy on competitive exam syllabi, artificial intelligence can occasionally make mistakes, misread complex diagrams, or hallucinate edge-case formulas. AI outputs should be treated as an interactive tutor and study companion, not an unquestionable legal authority. When preparing for high-stakes exams, cross-reference critical formulas with standard textbooks.',
      },
      {
        heading: '3. AI Does Not Replace Real Teachers',
        text: 'Sadhya AI is designed to support and amplify human guidance, not replace your school teachers or mentors. We encourage you to discuss challenging concepts with your educators and peers.',
      },
      {
        heading: '4. Responsible Non-Cheating Use',
        text: 'Sadhya AI is built for deep conceptual understanding. Do not use AI features to bypass live school proctored exams, impersonate other students, or generate harmful content. Use the Explain, Revise, and Quiz study modes to master concepts honestly.',
      },
      {
        heading: '5. Sensitive Personal Information',
        text: 'Please never type passwords, bank credentials, government IDs, or another person\'s private contact details into the AI chat box. AI prompts are processed to generate answers and should remain focused on academic and exam subjects.',
      },
    ],
  },
  {
    id: 'ai-questions',
    title: 'AI-Generated Questions & Assessments',
    badge: 'Adaptive Testing',
    category: 'ai',
    summary: 'Transparency regarding dynamic question generation, cognitive difficulty levels, and adaptive CBT test behavior.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. Dynamic and Curated Question Bank',
        text: 'Sadhya provides both human-curated previous years questions (PYQs) from official exam bodies (NTA, UPSC, CBSE) and dynamically generated AI practice questions tailored to your weakest subtopics. We do not pretend AI-generated questions were written by human exam boards; they are clearly identified as adaptive practice drills.',
      },
      {
        heading: '2. Cognitive Leveling & Difficulty Scaling',
        text: 'Practice questions are categorized into four cognitive depths: Recall (definitions & constants), Conceptual (core principles), Application (numerical solving), and Analysis (multi-concept synthesis). The system adjusts question difficulty based on your ongoing accuracy.',
      },
      {
        heading: '3. Adaptive Assessment vs Static CBT Palettes',
        text: 'In adaptive baseline assessments, subsequent questions are selected dynamically based on your previous answers. Because the test adapts to find your exact mastery threshold, certain adaptive modes may not allow revisiting previous questions, differing from traditional static exam palettes.',
      },
      {
        heading: '4. Reporting Question Inaccuracies',
        text: 'If you ever encounter a question with an ambiguous prompt, incorrect answer key, or formatting glitch, use the in-app "Report Question" button. Our content moderation and subject matter specialists review flagged questions promptly.',
      },
    ],
  },
  {
    id: 'personalization',
    title: 'Personalization & Learner Model',
    badge: 'Digital Twin',
    category: 'ai',
    summary: 'How study signals, learning velocity, and mastery heatmaps customize your daily study plan with zero creepy surveillance.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. Purpose of the Learner Model',
        text: 'To prevent study burnout and focus your valuable time where it counts most, Sadhya maintains an educational learner model. This model analyzes your accuracy across syllabus chapters, retention intervals, and preferred study modes to recommend daily high-yield revision topics.',
      },
      {
        heading: '2. What Signals Influence Personalization',
        text: 'Only academic activity influences recommendations: chapters completed, drill accuracy, question response times, self-reported confidence, and your target examination date. We do not track non-academic web browsing or external device behavior.',
      },
      {
        heading: '3. Recommendations are Helpful Suggestions',
        text: 'Your daily study plan and AI recommended drills are suggestions designed to guide your preparation. You remain in complete control of your study schedule and can explore any chapter or exam mode whenever you wish.',
      },
    ],
  },
  {
    id: 'community',
    title: 'Community Guidelines & Posts',
    badge: 'Study Community',
    category: 'community',
    summary: 'Standards for maintaining an encouraging, helpful, and respectful learning environment for all students and educators.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. Purpose of the Community Feed',
        text: 'The Sadhya community exists for students and educators to ask syllabus questions, share intuitive explanations, discuss exam strategies, and support one another through rigorous academic journeys.',
      },
      {
        heading: '2. What We Encourage',
        text: 'Clear, well-formulated questions with formulas/diagrams; constructive, step-by-step answers; helpful study tips; and respectful academic debates where differing perspectives are shared politely.',
      },
      {
        heading: '3. Prohibited Behavior',
        text: 'To protect our members, the following behaviors are strictly prohibited:',
        highlights: [
          'Harassment, bullying, insults, or discriminatory language',
          'Spam, advertising commercial courses, or sharing affiliate links',
          'Posting sexually explicit, violent, or hateful content',
          'Doxxing, sharing private phone numbers, or leaking another person\'s identity',
          'Distributing malicious links or pirated commercial test series',
        ],
      },
    ],
  },
  {
    id: 'peer-chat',
    title: 'Peer Communication & Direct Messages',
    badge: 'Peer Chat',
    category: 'community',
    summary: 'Rules for 1-on-1 study buddy messaging, collaboration safety, and user controls.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. Educational Collaboration',
        text: 'Direct messaging and study connections are provided exclusively for mutual academic support, problem-solving discussions, and peer motivation.',
      },
      {
        heading: '2. Safety Controls & Boundaries',
        text: 'You have full control over your direct communications. You can mute notifications, unmatch a study connection, block any user from contacting you, or report inappropriate messages directly from the chat interface with one click.',
      },
      {
        heading: '3. Zero Tolerance for Unwanted Messaging',
        text: 'Repeated unsolicited messages, intimidation, romantic solicitations, or requests for private credentials will result in communication restrictions or account suspension.',
      },
    ],
  },
  {
    id: 'student-teacher',
    title: 'Student & Teacher Responsibilities',
    badge: 'Classrooms',
    category: 'education',
    summary: 'Clear guidelines for professional teacher-student interactions, classroom invite codes, and assignments.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. Teacher Conduct & Mentorship',
        text: 'Teachers on Sadhya are expected to maintain professional, supportive, and respectful communication with all students. Classroom tools should be used for legitimate educational instruction, assignment reviews, and academic encouragement.',
      },
      {
        heading: '2. Classroom Privacy & Invite Codes',
        text: 'Classroom invite codes should only be shared with enrolled students. Teachers must respect student privacy and not disclose individual student assessment grades publicly without consent.',
      },
      {
        heading: '3. Student Respect for Educators',
        text: 'Students should interact with teachers courteously, submit assigned drills sincerely, and respect educator feedback and time.',
      },
    ],
  },
  {
    id: 'academic-integrity',
    title: 'Academic Integrity & Assessments',
    badge: 'Honesty',
    category: 'education',
    summary: 'Why authentic participation and honest assessment attempts matter for your progress.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. The Value of Authentic Learning',
        text: 'Sadhya\'s adaptive recommendations and mastery tracking only work effectively when your assessment attempts reflect your genuine understanding. Guessing randomly or using automated bots distorts your diagnostic report and prevents Sadhya from identifying your real learning gaps.',
      },
      {
        heading: '2. No Exploitation or Result Tampering',
        text: 'Attempting to manipulate score calculations, exploit system glitches to inflate leaderboards, or impersonate another learner undermines the community and is prohibited.',
      },
    ],
  },
  {
    id: 'user-content',
    title: 'User-Generated Content & Uploads',
    badge: 'Your Content',
    category: 'education',
    summary: 'You retain ownership of your notes and uploads, alongside copyright and quality guidelines.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. Ownership of Your Uploads',
        text: 'You retain full ownership and intellectual property rights over the study notes, handwritten summaries, and personal documents you upload to your private Notebooks. Sadhya does not claim ownership of your personal notes.',
      },
      {
        heading: '2. License to Process for Study Tools',
        text: 'When you upload a document to your Notebook, you grant Sadhya the technical permission necessary to process, OCR, chunk, and index the text into your private search namespace so you can chat with your notes.',
      },
      {
        heading: '3. Respect for Copyrighted Materials',
        text: 'Please only upload notes, worksheets, and documents that you created or have the legal right to use. Do not upload entire copyrighted commercial textbooks or proprietary test materials without permission.',
      },
    ],
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual Property & Copyright',
    badge: 'IP & Legal',
    category: 'safety',
    summary: 'Protection of Sadhya technology, fair-use textbook citations, and copyright infringement reporting.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. Sadhya Proprietary Technology',
        text: 'The Sadhya brand, website, interface designs, reasoning engines, software code, and logo marks are the proprietary property of Sadhya and protected by applicable copyright and intellectual property laws.',
      },
      {
        heading: '2. Educational Fair Use & Citations',
        text: 'Educational syllabus summaries and public exam syllabus references are provided for fair-use academic preparation and revision purposes, with proper citations to curriculum boards.',
      },
      {
        heading: '3. Notice and Takedown',
        text: 'If you believe that any content hosted on Sadhya infringes upon your copyright, please contact our designated grievance officer at legal@sadhya.app with specific details, and we will investigate and take appropriate action promptly.',
      },
    ],
  },
  {
    id: 'safety-reporting',
    title: 'Safety, Moderation & Reporting',
    badge: 'Community Safety',
    category: 'safety',
    summary: 'How to report concerns, block disruptive users, and get compassionate assistance.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. You Don\'t Have to Handle It Alone',
        text: 'If you encounter any behavior, message, or content that makes you feel uncomfortable, unsafe, or harassed, you can report it immediately. Our moderation team reviews reports with care and discretion.',
      },
      {
        heading: '2. Available Safety Actions',
        text: 'Directly in the app, you can:',
        highlights: [
          'Report a post, comment, or question for moderation review',
          'Block any user to immediately prevent them from viewing your profile or messaging you',
          'Mute conversation notifications',
          'Delete your private chat history',
        ],
      },
      {
        heading: '3. Proportional Moderation',
        text: 'Our moderation philosophy focuses on education and de-escalation. Minor first-time infractions receive gentle reminders, while severe violations (such as threats or doxxing) result in immediate restrictions or account termination.',
      },
    ],
  },
  {
    id: 'payments',
    title: 'Payments, Subscriptions & Refunds',
    badge: 'Billing & Plans',
    category: 'billing',
    summary: 'Transparent Indian Rupee pricing, Free vs Pro tiers, anytime cancellation, and 7-Day 100% Refund Policy.',
    lastUpdated: 'August 31, 2026',
    paragraphs: [
      {
        heading: '1. Free Tier & Pro Upgrades',
        text: 'Sadhya provides generous free access to AI tutoring (100 msgs/mo), realtime voice (15 min/mo), document uploads (5/mo), podcast studio preview (1/mo), mock tests (3/mo), and 100% free unlimited official PYQs and community discussions. Learners who need higher capacity (up to 2,000 chat messages, 300 voice minutes, 100 documents, 25 podcasts, and 1,000 mock tests) can upgrade to Sadhya Pro.',
      },
      {
        heading: '2. Transparent INR Pricing via Razorpay',
        text: 'Subscriptions are billed in Indian Rupees (INR) at ₹199/month (Launch Rate) or ₹1,788/year (equivalent to ₹149/month). Payments are securely processed via Razorpay supporting UPI, Cards, and Net Banking.',
      },
      {
        heading: '3. Cancel Anytime & 7-Day 100% Refund Policy',
        text: 'You can cancel your subscription at any time from Settings → Plan & Billing. If you are unsatisfied with your Pro subscription, you can trigger an instant 1-click refund directly in Settings within 7 days of your purchase.',
      },
    ],
  },
];
