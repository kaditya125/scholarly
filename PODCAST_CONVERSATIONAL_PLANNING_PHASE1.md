# AI Podcast Studio – Phase 1: Intelligent Conversational Planning Engine

**Status:** Implementation in Progress  
**Phase:** 1 of 4  
**Priority:** Critical  
**Date:** January 2025

---

## Executive Summary

Phase 1 builds the foundational conversational planning system that transforms podcast creation from a form-based workflow into an intelligent, adaptive dialogue with an educational AI mentor.

**Core Principle:** The AI should behave like an experienced educator who asks the right questions at the right time, not a rigid form that always asks the same questions.

---

## Phase 1 Scope

### What We're Building

✅ **Intelligent Conversation Engine**
- Adaptive questioning (ask only when needed)
- Educational mentoring behavior
- Context-aware recommendations
- Session memory and continuity

✅ **Conversational UI Foundation**
- Chat timeline component
- Message bubbles (user, AI, thinking)
- Recommendation cards
- Clarification cards with options

✅ **Planning Collaboration System**
- Interactive lesson planning
- Iterative refinement
- Source selection
- Teaching strategy guidance

✅ **Reusable AI Workspace Architecture**
- Generic conversation components
- Project persistence
- Artifact management
- Not podcast-specific (future-proof)


### What We're NOT Building (Yet)

❌ SSE streaming (Phase 2)
❌ Voice generation progress tracking (Phase 2)
❌ Real-time TTS updates (Phase 2)
❌ Script preview cards (Phase 3)
❌ Completion artifacts (Phase 3)
❌ Multi-session history (Phase 4)

---

## Implementation Milestones

### Milestone 1: Type Definitions & Data Models
- Conversation message types
- Planning state types
- Recommendation types
- Session memory schema

### Milestone 2: Conversational AI Backend
- Intelligent planning endpoint
- Adaptive questioning logic
- Educational recommendations engine
- Curriculum-aware responses

### Milestone 3: Frontend Conversation UI
- AIWorkspace page component
- ConversationTimeline component
- Message bubbles (user, AI, thinking)
- Clarification cards with options
- Recommendation cards

### Milestone 4: Planning Collaboration
- Interactive lesson planning flow
- Source selection UI
- Teaching strategy cards
- Iterative refinement workflow

### Milestone 5: Session Persistence
- Save conversation state
- Resume planning sessions
- Version history
- Undo/redo support

---

## Technical Architecture


### Backend Components (New)

```
backend-firestore/src/
├── core/
│   └── planning/
│       ├── conversationalPlanner.ts       (NEW - Adaptive planning logic)
│       ├── educationalMentor.ts           (NEW - Recommendation engine)
│       ├── curriculumAnalyzer.ts          (NEW - NCERT/CBSE/etc awareness)
│       └── planningMemory.ts              (NEW - Session state management)
├── controllers/
│   └── planning.controller.ts             (NEW - Planning endpoints)
└── types/
    └── planning.types.ts                  (NEW - Conversation types)
```

### Frontend Components (New)

```
frontend/src/
├── pages/
│   └── AIWorkspace.tsx                    (NEW - Main workspace page)
├── components/
│   └── ai-workspace/
│       ├── ConversationTimeline.tsx       (NEW - Message timeline)
│       ├── MessageBubble.tsx              (NEW - User/AI messages)
│       ├── ThinkingIndicator.tsx          (NEW - AI thinking animation)
│       ├── ClarificationCard.tsx          (NEW - Multiple choice questions)
│       ├── RecommendationCard.tsx         (NEW - AI suggestions)
│       ├── PlanningCard.tsx               (NEW - Lesson plan display)
│       └── ChatInput.tsx                  (NEW - User input)
├── hooks/
│   └── api/
│       └── usePlanning.ts                 (NEW - Planning API hooks)
└── types/
    └── workspace.types.ts                 (NEW - Conversation types)
```



---

## Implementation Progress Report

### Completed Tasks (5/16)

#### ✅ Task 1: Frontend Type Definitions
**File:** `frontend/src/types/workspace.types.ts`
- Defined all conversation message types
- Created LessonPlan and PlanningSession interfaces
- Curriculum types (NCERT/CBSE/ICSE/JEE/NEET)
- Teaching styles and voice styles
- API request/response types
- Component prop types

#### ✅ Task 2: Backend Planning Types
**File:** `backend-firestore/src/types/planning.types.ts`
- Backend message types
- PlanningSession state management
- ConversationContext for adaptive behavior
- IntentAnalysis for smart questioning
- EducationalRecommendations structure
- Firestore schema extensions

#### ✅ Task 3: Conversational Planner Service
**File:** `backend-firestore/src/core/planning/conversationalPlanner.ts`
- `analyzeIntent()` - Extracts topic, audience, curriculum from prompts
- Smart clarification determination (not a rigid form)
- `generateInitialMessages()` - Creates adaptive conversation flow
- `processClarificationResponse()` - Handles user selections
- Only asks one clarification at a time
- Updates ConversationContext as conversation progresses

#### ✅ Task 4: Educational Mentor Service
**File:** `backend-firestore/src/core/planning/educationalMentor.ts`
- `generateRecommendations()` - Comprehensive educational guidance
- Learning objectives aligned with Bloom's taxonomy
- Topic-specific misconceptions (physics, chemistry, biology, history)
- Exam tips for NCERT/CBSE/JEE/NEET
- Memory tricks and mnemonics
- Prerequisite identification
- Difficulty assessment (conceptual, mathematical, abstraction)
- Teaching strategy recommendations

#### ✅ Task 5: Planning API Controller
**Files:** 
- `backend-firestore/src/controllers/planning.controller.ts`
- `backend-firestore/src/routes/planning.routes.ts`
- `backend-firestore/src/routes/index.ts` (updated)

**Endpoints:**
- `POST /api/planning/start` - Start new conversational session
- `POST /api/planning/respond` - Process user responses
- `GET /api/planning/:sessionId` - Retrieve session state
- `GET /api/planning/user/:userId` - Get user's planning sessions
- `DELETE /api/planning/:sessionId` - Cancel session

**Features:**
- Firestore integration for session persistence
- Conversation state management
- Integration with ConversationalPlanner and EducationalMentor
- Handles clarification responses, text messages, plan approvals
- Generates recommendations during research phase
- Marks sessions as ready_to_generate when plan approved

---

### Next Tasks (6-16)

#### Task 6: Build AIWorkspace Page Component
- Full-screen workspace container
- Header with back button and settings
- Main conversation area
- Sticky chat input
- Replaces modal experience

#### Task 7: Build ConversationTimeline Component
- Scrollable message timeline
- Renders all message types
- Auto-scroll to latest
- Virtual scrolling for performance

#### Task 8: Build Core Message Components
- MessageBubble (user/AI text)
- ThinkingIndicator (animated)
- ChatInput (text area + send)

#### Task 9: Build ClarificationCard
- Multiple choice options
- Radio/button selection
- Custom input option
- Visual feedback on selection

#### Task 10: Build RecommendationCard
- Display educational recommendations
- Expandable sections
- Accept/modify actions
- Priority highlighting

#### Task 11: Build PlanningCard
- Display generated lesson plan
- Outline sections
- Sources list
- Approve/modify/regenerate actions

#### Task 12: Create usePlanning Hook
- React Query integration
- Start session mutation
- Respond to planning mutation
- Get session query
- Optimistic updates

#### Task 13: Integration with Podcast Generation
- Link approved plan to PodcastEngineService
- Create podcast record from planning session
- Pass lesson plan to existing generation pipeline
- No changes to generation logic

#### Task 14: Session Persistence
- Save conversation to Firestore
- Resume planning from Podcasts page
- Draft management
- Version history

#### Task 15: Feature Flag & Migration
- `REACT_APP_USE_AI_WORKSPACE` flag
- Toggle between modal and workspace
- Coexistence strategy
- Gradual rollout plan

#### Task 16: Testing & Verification
- Test adaptive questioning
- Test recommendation generation
- Test plan approval flow
- Verify podcast generation unchanged
- Regression testing

---

## Architecture Summary

### Backend Stack
```
Planning Session (Firestore)
    ↓
Planning Controller (REST API)
    ↓
┌───────────────────────┬──────────────────────┐
│ ConversationalPlanner │  EducationalMentor   │
└───────────────────────┴──────────────────────┘
    ↓                           ↓
Intent Analysis            Recommendations
Adaptive Questions         Learning Objectives
Context Management         Misconceptions
                          Teaching Strategy
```

### Frontend Stack (To Be Built)
```
AIWorkspace Page
    ↓
ConversationTimeline
    ↓
┌──────────────┬───────────────────┬──────────────┐
│ MessageBubble│ ClarificationCard │ PlanningCard │
└──────────────┴───────────────────┴──────────────┘
    ↓
usePlanning Hook (React Query)
    ↓
Planning API
```

### Integration Point
```
Planning Session (approved)
    ↓
Create Podcast Record
    ↓
Existing PodcastEngineService
    ↓
(unchanged) BullMQ → Gemini → TTS → Assets
```

