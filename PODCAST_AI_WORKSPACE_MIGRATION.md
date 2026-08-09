# AI Workspace Migration Guide

## Overview

This document outlines the migration path from the traditional **PodcastStudio** (form-based) interface to the new **AI Workspace** (conversational) interface for podcast creation.

**Status**: Phase 1 Complete (87.5% - 14/16 tasks done)

**Zero Breaking Changes**: Both systems coexist. Existing PodcastStudio functionality remains 100% intact.

---

## Feature Flag System

### Configuration

Feature flags are managed through `frontend/src/lib/featureFlags.ts` with three-tier priority:

1. **localStorage** (highest priority) - for testing/debugging
2. **Environment variables** - for deployment configuration
3. **Default values** (lowest priority) - production defaults

### Enabling AI Workspace

#### Option 1: Environment Variable (Recommended for Production)

Create or update `.env` file in `frontend/`:

```env
VITE_USE_AI_WORKSPACE=true
```

Then rebuild:
```bash
npm run build
```

#### Option 2: localStorage Override (Recommended for Testing)

Open browser console and run:

```javascript
// Enable AI Workspace
scholarlyFeatureFlags.enable('aiWorkspace');

// Disable AI Workspace
scholarlyFeatureFlags.disable('aiWorkspace');

// Reset to default (environment/production setting)
scholarlyFeatureFlags.reset('aiWorkspace');

// Check current flags
scholarlyFeatureFlags.get();
```

Refresh the page to see changes.

#### Option 3: Programmatic

```typescript
import { enableFeature, disableFeature, isFeatureEnabled } from './lib/featureFlags';

// Check if enabled
const isEnabled = isFeatureEnabled('aiWorkspace');

// Enable
enableFeature('aiWorkspace');

// Disable
disableFeature('aiWorkspace');
```

---

## Architecture

### Components

**Backend** (Zero modifications to existing services):
- `backend-firestore/src/types/planning.types.ts` - New types
- `backend-firestore/src/core/planning/conversationalPlanner.ts` - Adaptive questioning logic
- `backend-firestore/src/core/planning/educationalMentor.ts` - Educational recommendations
- `backend-firestore/src/controllers/planning.controller.ts` - 5 new API endpoints
- `backend-firestore/src/routes/planning.routes.ts` - Planning routes

**Frontend**:
- `frontend/src/pages/AIWorkspace.tsx` - Main conversational interface
- `frontend/src/components/ai-workspace/` - Reusable conversation components
  - `ConversationTimeline.tsx` - Message renderer
  - `MessageBubble.tsx` - Chat messages
  - `ClarificationCard.tsx` - Multiple-choice questions
  - `RecommendationCard.tsx` - Educational suggestions
  - `PlanningCard.tsx` - Generated lesson plans
  - `PlanningSessionCard.tsx` - Saved sessions display
  - `ChatInput.tsx` - User input
  - `ThinkingIndicator.tsx` - Loading states
- `frontend/src/hooks/api/usePlanning.ts` - React Query hooks
- `frontend/src/lib/api/planning.ts` - API client

**Integration Points**:
- `frontend/src/pages/Podcasts.tsx` - Toggles between PodcastStudio and AIWorkspace
- `frontend/src/pages/AIWorkspace.tsx` → `handleApprovePlan()` - Calls existing `useGeneratePodcast().generate()`

### Data Flow

```
User → AIWorkspace → Planning API → ConversationalPlanner → EducationalMentor → LessonPlan
                                                                                    ↓
                                                                            handleApprovePlan()
                                                                                    ↓
                                                                            PodcastEngineService
                                                                              (UNCHANGED)
```

**Critical**: The lesson plan is **mapped** to the existing `GeneratePodcastRequest` format, preserving 100% of the original generation pipeline.

---

## API Endpoints

### Planning API

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/planning/start` | Start new planning session with initial prompt |
| POST | `/api/planning/respond` | Respond to clarifications or approve plan |
| GET | `/api/planning/:sessionId` | Retrieve session state |
| GET | `/api/planning/user/:userId` | List user's planning sessions |
| DELETE | `/api/planning/:sessionId` | Cancel/delete session |

All endpoints require Firebase authentication (existing middleware).

### Request Examples

#### Start Planning
```json
POST /api/planning/start
{
  "projectType": "podcast",
  "initialPrompt": "Explain quantum physics for Class 12 CBSE"
}
```

#### Respond to Clarification
```json
POST /api/planning/respond
{
  "sessionId": "abc123",
  "responseType": "clarification_response",
  "data": {
    "questionId": "msg_123",
    "optionId": "ncert"
  }
}
```

#### Approve Plan
```json
POST /api/planning/respond
{
  "sessionId": "abc123",
  "responseType": "approve_plan",
  "data": {}
}
```

---

## Firestore Schema

### Collection: `planning_sessions`

```typescript
{
  id: string;
  userId: string;
  projectType: 'podcast' | 'video' | 'article';
  status: 'active' | 'clarifying' | 'planning' | 'ready_to_generate' | 'completed';
  messages: ConversationMessage[];
  conversationContext: {
    topic?: string;
    targetAudience?: string;
    curriculum?: string;
    duration?: number;
    teachingStyle?: string;
  };
  lessonPlan?: LessonPlan;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

### Extended Podcast Metadata

```typescript
interface PodcastMetadata {
  // ... existing fields
  planningSessionId?: string; // Link to planning session
}
```

---

## Rollout Strategy

### Phase 1: Internal Testing (Current)
- **Flag**: `VITE_USE_AI_WORKSPACE=false` (default)
- **Access**: localStorage override for developers
- **Duration**: 2-4 weeks
- **Goal**: Bug fixes, UX refinement

### Phase 2: Beta Rollout
- **Flag**: Enable for 10% of users (implement user-based targeting)
- **Access**: Invite-only or admin panel toggle
- **Duration**: 2-3 weeks
- **Goal**: Gather feedback, measure engagement

### Phase 3: Gradual Rollout
- **Flag**: 25% → 50% → 75% → 100% over 4 weeks
- **Access**: Percentage-based rollout
- **Monitoring**: Track completion rates, error rates, generation success

### Phase 4: Full Migration
- **Flag**: `VITE_USE_AI_WORKSPACE=true` (default)
- **Access**: All users
- **Timeline**: After 90% positive feedback
- **Fallback**: Keep PodcastStudio as "Classic Mode" for 1 month

### Phase 5: Deprecation (Optional)
- **Remove PodcastStudio** if AI Workspace proves superior
- **Timeline**: 3 months after Phase 4
- **Decision**: Based on metrics and user feedback

---

## User Experience Comparison

| Feature | PodcastStudio (Old) | AI Workspace (New) |
|---------|---------------------|-------------------|
| **Interface** | Modal form | Full-screen workspace |
| **Input** | Fixed fields | Natural conversation |
| **Questioning** | All fields required | Adaptive (only asks if needed) |
| **Recommendations** | None | Bloom's taxonomy, misconceptions, exam tips |
| **Plan Preview** | None | Full lesson outline with sources |
| **Session Persistence** | None | Save and resume anytime |
| **Curriculum Support** | Generic | NCERT/CBSE/ICSE/JEE/NEET specific |
| **Teaching Styles** | Limited options | Storytelling, teacher-student, documentary |
| **Difficulty** | Fixed | Auto-assessed with rationale |

---

## Testing Checklist

### Before Enabling Flag

- [ ] Backend: Planning API endpoints responding correctly
- [ ] Backend: Firestore security rules allow planning_sessions access
- [ ] Frontend: AIWorkspace page renders without errors
- [ ] Frontend: Can start a planning session
- [ ] Frontend: Can respond to clarification questions
- [ ] Frontend: Can view educational recommendations
- [ ] Frontend: Can see generated lesson plan
- [ ] Frontend: Can approve plan and generate podcast
- [ ] Frontend: Saved sessions appear in Podcasts page
- [ ] Frontend: Can resume saved sessions
- [ ] Integration: Approved plan successfully triggers podcast generation
- [ ] Integration: Generated podcast appears in podcasts list

### After Enabling Flag

- [ ] "New podcast" button opens AIWorkspace (not PodcastStudio)
- [ ] Planning sessions section visible on Podcasts page
- [ ] Can complete full flow: prompt → clarifications → recommendations → plan → generation
- [ ] Existing podcasts still work (player, transcript, etc.)
- [ ] PodcastStudio still accessible if flag disabled
- [ ] No console errors or network failures
- [ ] Dark mode works throughout AIWorkspace

---

## Regression Prevention

### Protected Services (DO NOT MODIFY)

These services power the existing podcast generation and MUST remain unchanged:

- `backend-firestore/src/core/podcast/PodcastEngineService.ts`
- `backend-firestore/src/core/podcast/PodcastPlanner.ts`
- `backend-firestore/src/core/podcast/ConversationGenerator.ts`
- `backend-firestore/src/core/podcast/AudioComposer.ts`
- Any TTS or audio processing services

### Integration Contract

The `handleApprovePlan()` function in `AIWorkspace.tsx` is the ONLY bridge between planning and generation. It must:

1. Accept a `LessonPlan` object
2. Map it to `GeneratePodcastRequest` format
3. Call the existing `generate()` function
4. Handle success/failure appropriately

**Current mapping**:
```typescript
{
  type: 'custom',
  source: { kind: 'prompt', prompt: <formatted lesson plan> },
  durationMinutes: plan.estimatedDuration || 10,
  speakerStyle: <mapped from teachingStyle>,
  voiceStyle: 'warm_teacher',
  language: 'English',
}
```

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Adoption Rate**: % of users trying AI Workspace vs PodcastStudio
2. **Completion Rate**: % of sessions that result in podcast generation
3. **Time to Generate**: Average time from start to plan approval
4. **Error Rate**: Failed planning sessions or API errors
5. **User Feedback**: In-app surveys or feedback forms
6. **Generation Success**: % of approved plans that generate successfully
7. **Session Resumption**: % of saved sessions that are resumed

### Analytics Events

Implement tracking for:
- `planning_session_started`
- `clarification_answered`
- `recommendations_viewed`
- `plan_generated`
- `plan_approved`
- `plan_regenerated`
- `session_saved`
- `session_resumed`
- `podcast_generation_triggered`

---

## Troubleshooting

### AI Workspace Not Showing

1. Check environment variable: `echo $VITE_USE_AI_WORKSPACE`
2. Check localStorage: `scholarlyFeatureFlags.get()`
3. Clear cache and rebuild: `rm -rf dist && npm run build`
4. Check console for feature flag logs

### Planning API Errors

1. Check Firebase auth token is valid
2. Verify planning routes are registered in `backend-firestore/src/routes/index.ts`
3. Check Firestore security rules allow `planning_sessions` access
4. Review backend logs for errors

### Generation Not Triggering

1. Verify `handleApprovePlan()` is called with correct plan data
2. Check `useGeneratePodcast()` hook is properly initialized
3. Ensure podcast generation endpoints are responding
4. Check browser console for errors

### Sessions Not Persisting

1. Verify Firestore write permissions
2. Check `planning.controller.ts` is saving sessions correctly
3. Ensure `useUserPlanningSessions()` hook is fetching data
4. Check userId is correct in session documents

---

## Future Enhancements (Post-Phase 1)

- [ ] **Real-time streaming**: SSE for AI responses (EventEmitter pattern prepared)
- [ ] **Video generation**: Extend AIWorkspace for video planning
- [ ] **Article generation**: Extend AIWorkspace for article planning
- [ ] **Collaboration**: Multi-user planning sessions
- [ ] **Templates**: Pre-built lesson plan templates
- [ ] **Export**: Download lesson plans as PDF/DOCX
- [ ] **Analytics**: In-depth user behavior tracking
- [ ] **A/B Testing**: Automated comparison of old vs new flow
- [ ] **Voice Input**: Speech-to-text for prompts
- [ ] **Plan Editing**: Rich text editor for plan modifications

---

## Support

For questions or issues:
- **Development**: Check this document and feature flag system
- **Production Issues**: Contact backend team for API/Firestore issues
- **Feature Requests**: Create issue in project tracker

**Last Updated**: Phase 1 Complete (14/16 tasks)
