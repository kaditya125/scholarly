/**
 * Complete, authoritative product knowledge base for Sadhya.
 * Used by the Ask Sadhya public AI guide to answer questions about the platform with high accuracy and depth.
 */

export const SADHYA_MASTER_KNOWLEDGE = `
# SADHYA PLATFORM MASTER KNOWLEDGE BASE

## 1. What is Sadhya?
- **Overview**: Sadhya is an AI-powered, all-in-one educational platform engineered for both students and educators. It combines 24/7 personalized AI tutoring, multimodal document study tools, and a full-featured teacher workspace with interactive live video classes.
- **Mission**: To democratize elite, personalized 1-on-1 tutoring and empower teachers with state-of-the-art classroom tools.
- **Company**: Sadhya Technologies Private Limited, headquartered in Bengaluru, India.
- **Contact & Support**: 
  - General Support: support@sadhya.app
  - Sales & Institutional: sales@sadhya.app
  - Privacy: privacy@sadhya.app

---

## 2. Features for Students & Learners
### A. 24/7 AI Personal Tutor & Chat
- Conversational tutor grounded in students' uploaded documents, notes, textbooks, and NCERT curriculum.
- Explains tough concepts step-by-step, solves homework doubts, and adapts to the student's learning pace.
- Multimodal: Understands typed questions, uploaded PDF documents, handwritten notes, and photos of textbook problems.

### B. Notebooks & Document Ingestion
- Upload textbooks, lecture slides, PDF documents, DOCX, and images.
- High-accuracy OCR extracts text, mathematical formulas, and scientific diagrams.
- Documents are indexed in a private vector database so students can ask questions directly about their notes.

### C. Generative Multi-Format Study Tools
- **Podcast Studio**: Converts study notes into cinematic, two-host audio podcast discussions featuring natural conversational voices, background music, and sound effects.
- **Interactive Flashcards**: Generates spaced-repetition flashcard decks for quick memorization and revision.
- **Concept Mind Maps**: Visual hierarchical concept trees showing relationships between complex topics.
- **Practice Quizzes**: Instant multiple-choice and conceptual quizzes generated directly from uploaded documents.
- **Revision Summaries**: Bulleted executive summaries and cheat sheets for exam cramming.

### D. Test Center & Adaptive Assessment
- **Baseline Assessment Engine**: Diagnoses student strengths, weaknesses, and concept gaps.
- **Mock Tests & Exam Prep**: Timed full-length practice tests with instant scoring, detailed step-by-step solutions, and performance analytics.

### E. Classroom Participation
- Join teacher-led classes using unique class invite codes or links.
- Access teacher-curated syllabus, assignments, study materials, and discussion boards.
- Attend real-time interactive live video sessions.

---

## 3. Features for Teachers & Educators
### A. Class Creation & Management
- Create public or private classrooms for any subject, grade, or competitive exam.
- Design custom structured syllabi with modules, chapters, and topics.
- Set class pricing (Free or Paid) with flexible student enrollment management.

### B. Live Interactive Video Classes
- WebRTC-powered live video streaming (powered by 100ms infrastructure).
- Real-time video/audio broadcasting with student participation, screen sharing, and live chat.

### C. Assignments & Automated Evaluations
- Create and assign homework, chapter tests, and mock exams to enrolled students.
- Automated grading insights, answer key validation, and individual student progress analytics.

### D. Resource Library & Materials
- Upload and distribute class-specific notebooks, lecture slides, reference PDFs, and study materials.

### E. Community Discussions & Announcements
- Dedicated class discussion boards for announcements, student Q&A, and peer collaboration.

### F. Teacher Dashboard & Monetization
- Comprehensive analytics tracking student attendance, assignment completion, and concept mastery.
- **Earnings Ledger**: Transparent revenue tracking from paid class enrollments with automated payout calculations.

---

## 4. Plans, Pricing & Launch Event Offer
### A. Sadhya 1.0 Launch Celebration Offer (Limited Time)
- **Special Early-Adopter Pricing**: Flat 60% discount on Sadhya Pro during the launch celebration.
- **Grandfathered Lifetime Rate**: Early adopters who subscribe during the launch event lock in their promotional rate (₹199/month or ₹1,788/year = ₹149/month) for as long as their subscription remains active, even after public prices revert to regular rates.
- **7-Day Money-Back Guarantee**: 100% full refund within 7 days, no questions asked.

### B. Free Plan (Student Starter — ₹0 / forever)
- **Cost**: 100% Free forever, no credit card required.
- **Included Features**:
  - 25 AI tutoring queries per day with transparent multi-stage reasoning traces.
  - Official syllabus grounding (SSC CGL/CHSL, UPSC CSE, JEE Main/Advanced, NEET-UG, IBPS/SBI, State PSCs).
  - 10 Camera Snap & Solve OCR questions per day with LaTeX mathematical derivations.
  - 3 Smart Notebooks (upload up to 25MB per document with exact source citations).
  - Topic-wise PYQ practice quizzes & adaptive baseline assessments.
  - Community study groups, discussion boards, and national leaderboards.
  - Multilingual support: English, Hindi, and natural Hinglish.

### C. Pro Plan (Launch Event: ₹199/mo or ₹1,788/yr = ₹149/mo)
- **Regular Price**: ₹499/month or ₹5,088/year.
- **Launch Offer Price**:
  - **Monthly**: ₹199 / month (Billed monthly, cancel anytime).
  - **Yearly**: ₹1,788 / year (**₹149 / month**, Save 70% against regular annual price).
- **Included Pro Capabilities**:
  - **Unlimited AI Tutoring & Reasoning**: No daily caps across all covered competitive exams.
  - **Multi-Voice AI Podcast Studio**: Convert any topic, syllabus module, or uploaded PDF into a cinematic 2-speaker conversational podcast with MP3 export for offline listening.
  - **Unlimited Camera Snap & Solve**: Instant OCR and step-by-step solutions for printed and handwritten questions.
  - **Unlimited Smart Notebooks**: Upload documents up to 200MB per file with high-accuracy OCR and page-jump citations.
  - **Full-Length Adaptive Mock Tests**: Timed exam-simulated mocks with real-time National Percentile ranking, accuracy velocity metrics, and diagnostic weak-topic heatmaps.
  - **Generative Media Studio**: AI Video Lesson generator, interactive concept Mind Maps, and presentation slide deck exports.
  - **Automation Studio**: Scheduled daily spaced-repetition revision sets delivered automatically.
  - **Priority Processing**: Fast-lane GPU compute queue with access to flagship Gemini 2.5 Pro and high-throughput Groq models.
  - **Priority Support**: 24/7 dedicated assistance from human specialists.

### D. Institutional & Academy Tier
- **Target Audience**: Coaching institutes, schools, colleges, and batch educators.
- **Cost**: Custom per-seat pricing based on cohort size. Contact sales@sadhya.app.
- **Included Capabilities**:
  - Full Teacher LMS Workspace with live WebRTC video classes (powered by 100ms) and student tracking.
  - Central student seat licensing and administrative dashboard.
  - Custom question banks and canonical institutional syllabus upload.
  - Automated assignment grading and cohort performance matrix.
  - Custom institutional branding on podcasts, notes, and video lessons.
  - Dedicated Account Manager, custom SLAs, invoicing, and PO support.

### E. Payment Methods & Security
- 256-Bit SSL encrypted payments processed securely via Razorpay.
- Supports UPI (Google Pay, PhonePe, Paytm, BHIM), Credit/Debit Cards (Visa, Mastercard, RuPay), and Netbanking.
- Card details never touch Sadhya servers.

---

## 5. Referral & Rewards Program
- **Referral Rewards**: Users can invite friends, classmates, and fellow educators using their personal referral link (accessible from Settings/Referrals).
- **Perks**: Earn free months of Sadhya Pro and platform entitlements for successful invites.

---

## 6. Privacy, Security & Data Safety
- **Data Isolation**: Private student documents and notebooks are encrypted and isolated; they are never leaked or used in public search.
- **Safe Educational AI**: Built-in guardrails prevent hallucinations, inappropriate content, and prompt injection attacks.
`;
