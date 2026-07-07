<div align="center">
  <img width="100%" alt="Scholarly AI Banner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
  <h1>🎓 Scholarly AI</h1>
  <p><strong>A Next-Generation AI-Powered EdTech Platform</strong></p>
</div>

---

Scholarly AI is a comprehensive, full-stack educational platform designed to empower students and educators through Artificial Intelligence. It features interactive AI-driven study sessions, intelligent document parsing (RAG), dynamic knowledge graphs, personalized study planners, and adaptive testing. 

## 🌟 Key Features

*   **🤖 Advanced AI Chat & RAG:** Context-aware AI interactions using Groq (LLM), Gemini (Embeddings), and Pinecone (Vector DB) for Retrieval-Augmented Generation.
*   **📓 Intelligent Notebooks:** Upload study materials (PDFs, images) which are automatically parsed using OCR (Tesseract.js) and converted into actionable learning assets.
*   **🕸️ Knowledge Graphs:** Visualize connections between concepts using interactive force-directed graphs (`@xyflow/react` & `react-force-graph-2d`).
*   **📅 Personalized Study Planner:** Automatically adapt study schedules based on user progress and performance.
*   **📝 Adaptive Testing:** Dynamically generated tests tailored to the student's current proficiency level.
*   **👥 Social & Collaborative:** Study groups, community exploration, and leaderboards to foster collaborative learning.
*   **🎛️ Admin Dashboard:** Comprehensive administration portal for monitoring system health, managing users, and overseeing AI metrics.

## 🏗️ Architecture & Tech Stack

Scholarly AI is organized as a monorepo containing multiple specialized packages:

### 🖥️ Frontend (`/frontend`)
*   **Framework:** React 19 + Vite (TypeScript)
*   **Styling:** Tailwind CSS + Motion for micro-animations
*   **Key Libraries:** `@google/genai`, `react-markdown`, `@xyflow/react`, `recharts`, `tesseract.js`, `pdfjs-dist`
*   **State Management:** `@tanstack/react-query`

### ⚙️ Backend (`/backend-firestore`)
*   **Framework:** Node.js, Express (TypeScript)
*   **Database:** Firebase (Firestore + Auth)
*   **AI & ML:** 
    *   **LLM:** Groq SDK
    *   **Embeddings:** Google GenAI (Gemini)
    *   **Vector Database:** Pinecone (`edtech-ai-rag` index)
    *   **Reranking:** Cohere
*   **Document Processing:** `pdf-parse`, `tesseract.js`, `mammoth`, `ffmpeg-static`
*   **Infrastructure:** Rate limiting (Redis), Morgan logger, Winston

### 🛠️ Admin Dashboard (`/admin-dashboard`)
*   **Framework:** React 19 + Vite (TypeScript)
*   **Features:** Recharts for data visualization, Firebase integration, secure routing.

### 🧩 Shared UI (`/shared-ui`)
*   A local package providing reusable UI components across the frontend and admin dashboard to ensure design consistency.

## 🚀 Getting Started

### Prerequisites
*   **Node.js** (v22.x) & **npm** (v10.x)
*   **Firebase Project** (Firestore & Authentication enabled)
*   **Pinecone Account** (Dimension 768, cosine metric)
*   API Keys: Gemini, Groq, Cohere

### 1. Environment Setup

Create a `.env` file in the `/backend-firestore` directory (refer to `.env.example` if available):
```env
NODE_ENV=development
PORT=8080
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_CLIENT_EMAIL=your_client_email
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GEMINI_API_KEY=your_gemini_key
GROQ_API_KEY=your_groq_key
COHERE_API_KEY=your_cohere_key
PINECONE_API_KEY=your_pinecone_key
PINECONE_INDEX_NAME=edtech-ai-rag
PINECONE_NAMESPACE=development
```

### 2. Run the Backend

```bash
cd backend-firestore
npm install
npm run dev
```
*The backend will start on `http://localhost:8080`*

### 3. Run the Frontend

In a new terminal:
```bash
cd frontend
npm install
# Ensure you set VITE_API_URL=http://localhost:8080/api locally
npm run dev
```

### 4. Run the Admin Dashboard

In a new terminal:
```bash
cd admin-dashboard
npm install
npm run dev
```

## 📚 Documentation

For more detailed information, please refer to the specific documentation files included in this repository:
*   [API_REFERENCE.md](./API_REFERENCE.md) - Detailed backend API endpoints and authentication requirements.
*   [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - Instructions for deploying the platform to production using Docker and Firebase.
*   [SECURITY_AUDIT.md](./SECURITY_AUDIT.md) - Overview of security measures, Firestore rules, and vulnerability mitigation.
*   [PERFORMANCE_REPORT.md](./PERFORMANCE_REPORT.md) - Lighthouse scores, bundle analysis, and performance optimization details.

## 🤝 Contributing
Please follow the standard Git Flow. Ensure that you run `npm run lint` and `npm run build` locally before submitting any pull requests.

## 📄 License
This project is proprietary and confidential.
