# AI Workspace Testing & Verification Guide

## Overview

This document provides comprehensive testing procedures for the AI Workspace (conversational podcast planning) system and regression verification to ensure zero breaking changes to existing functionality.

**Phase 1 Status**: 15/16 tasks complete (93.75%)

---

## Testing Environment Setup

### Prerequisites

1. **Backend Running**:
   ```bash
   cd backend-firestore
   npm install
   npm run dev
   ```

2. **Frontend Running**:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Firebase Emulator** (if testing locally):
   ```bash
   firebase emulators:start
   ```

4. **Feature Flag Enabled**:
   ```bash
   # In browser console
   scholarlyFeatureFlags.enable('aiWorkspace');
   # OR set in .env
   VITE_USE_AI_WORKSPACE=true
   ```

---

## Test Plan

### 1. Feature Flag Testing

#### Test 1.1: Flag Disabled (Default State)
**Expected**: Traditional PodcastStudio appears

- [ ] Navigate to Podcasts page
- [ ] Click "New podcast" button
- [ ] Verify PodcastStudio modal opens (not AIWorkspace)
- [ ] Verify form-based interface is visible
- [ ] Complete a podcast generation (verify existing flow works)

#### Test 1.2: Flag Enabled via Environment
**Expected**: AI Workspace appears

- [ ] Set `VITE_USE_AI_WORKSPACE=true` in `.env`
- [ ] Rebuild frontend: `npm run build`
- [ ] Navigate to Podcasts page
- [ ] Click "New podcast" button
- [ ] Verify AIWorkspace opens (not PodcastStudio)
- [ ] Verify full-screen conversational interface

#### Test 1.3: Flag Enabled via localStorage
**Expected**: AI Workspace appears (overrides environment)

- [ ] Open browser console
- [ ] Run: `scholarlyFeatureFlags.enable('aiWorkspace')`
- [ ] Refresh page
- [ ] Click "New podcast" button
- [ ] Verify AIWorkspace opens
- [ ] Run: `scholarlyFeatureFlags.disable('aiWorkspace')`
- [ ] Refresh page
- [ ] Verify PodcastStudio opens

#### Test 1.4: Flag Management
**Expected**: Console commands work correctly

- [ ] Run: `scholarlyFeatureFlags.get()`
- [ ] Verify current flag states displayed
- [ ] Run: `scholarlyFeatureFlags.enable('aiWorkspace')`
- [ ] Verify console log: "Enabled feature: aiWorkspace"
- [ ] Run: `scholarlyFeatureFlags.reset('aiWorkspace')`
- [ ] Verify localStorage override removed

---

### 2. AI Workspace UI Testing

#### Test 2.1: Welcome Screen
**Expected**: Engaging welcome experience

- [ ] Open AIWorkspace
- [ ] Verify header shows "AI Podcast Studio" with mic icon
- [ ] Verify welcome title and subtitle are visible
- [ ] Verify large prompt textarea is present
- [ ] Verify 4 example prompts are displayed
- [ ] Verify tips section is visible
- [ ] Click example prompt
- [ ] Verify prompt populates textarea
- [ ] Verify "Start Planning" button enabled with prompt
- [ ] Verify "Start Planning" button disabled without prompt

#### Test 2.2: Dark Mode Support
**Expected**: All components work in dark mode

- [ ] Toggle dark mode in app settings
- [ ] Verify AIWorkspace background is dark
- [ ] Verify text is readable (white/light gray)
- [ ] Verify cards have proper dark borders
- [ ] Verify buttons maintain visibility
- [ ] Verify hover states work in dark mode
- [ ] Toggle back to light mode
- [ ] Verify everything still works

#### Test 2.3: Responsive Layout
**Expected**: Works on different screen sizes

- [ ] Resize browser to mobile width (375px)
- [ ] Verify header stacks properly
- [ ] Verify prompt textarea readable
- [ ] Verify example prompts stack vertically
- [ ] Resize to tablet width (768px)
- [ ] Verify 2-column example prompt grid
- [ ] Resize to desktop width (1440px)
- [ ] Verify max-width container applies

---

### 3. Planning Flow Testing

#### Test 3.1: Session Start
**Expected**: Planning session initiates correctly

- [ ] Enter prompt: "Explain photosynthesis for Class 10 CBSE"
- [ ] Click "Start Planning"
- [ ] Verify loading state ("Starting...")
- [ ] Verify API call to `/api/planning/start`
- [ ] Verify 200 response with sessionId
- [ ] Verify URL updates with `?sessionId=<id>`
- [ ] Verify conversation timeline appears
- [ ] Verify welcome screen is hidden

#### Test 3.2: Intent Analysis
**Expected**: AI analyzes prompt and shows results

- [ ] Wait for AI response
- [ ] Verify AI message bubble appears on left side
- [ ] Verify AI avatar visible (orange gradient)
- [ ] Verify message content shows intent analysis
- [ ] Verify timestamp displayed
- [ ] Verify smooth animation on message appearance

#### Test 3.3: Clarification Questions
**Expected**: AI asks adaptive clarifying questions

- [ ] Verify ClarificationCard appears
- [ ] Verify question text is clear
- [ ] Verify multiple-choice options displayed
- [ ] Verify radio buttons work
- [ ] Verify "Recommended" badge on suggested option
- [ ] Click an option
- [ ] Verify option selected (orange highlight)
- [ ] Verify "Continue" button enabled
- [ ] Click "Continue"
- [ ] Verify loading state
- [ ] Verify next clarification or next step appears

#### Test 3.4: Custom Input in Clarifications
**Expected**: Can provide custom answers

- [ ] When "Other (specify)" option appears
- [ ] Click "Other (specify)"
- [ ] Verify custom input field appears
- [ ] Type custom value: "My custom answer"
- [ ] Verify "Continue" button enabled
- [ ] Click "Continue"
- [ ] Verify custom value sent to backend

#### Test 3.5: Educational Recommendations
**Expected**: AI provides curriculum-aware suggestions

- [ ] After clarifications complete
- [ ] Verify RecommendationCard appears
- [ ] Verify "Educational Recommendations" header
- [ ] Verify "AI Generated" badge
- [ ] Verify 4 collapsible sections:
  - [ ] Learning Objectives (with Bloom's taxonomy)
  - [ ] Common Misconceptions (with corrections)
  - [ ] Exam-Focused Tips
  - [ ] Memory Tricks & Mnemonics
- [ ] Click section headers to expand/collapse
- [ ] Verify smooth animations
- [ ] Verify color coding per section type
- [ ] Verify "Accept & Continue" button present
- [ ] Verify "Modify" button (if implemented)

#### Test 3.6: Lesson Plan Generation
**Expected**: AI generates detailed lesson plan

- [ ] Click "Accept & Continue" on recommendations
- [ ] Verify loading state
- [ ] Verify PlanningCard appears
- [ ] Verify plan title and subtitle
- [ ] Verify metadata pills (duration, audience, curriculum, difficulty)
- [ ] Verify "Lesson Outline" section
- [ ] Verify numbered sections with:
  - [ ] Section titles
  - [ ] Duration estimates
  - [ ] Key points (bulleted)
- [ ] Expand/collapse outline
- [ ] Verify "Sources & References" section (if present)
- [ ] Verify clickable external links
- [ ] Verify "Teaching Notes" section (if present)
- [ ] Verify 3 action buttons:
  - [ ] "Approve & Generate Podcast" (primary)
  - [ ] "Modify Plan"
  - [ ] "Regenerate"

#### Test 3.7: Text Message Interaction
**Expected**: Can chat with AI during planning

- [ ] In ChatInput at bottom, type: "Can you add more examples?"
- [ ] Press Enter
- [ ] Verify user message appears on right (orange background)
- [ ] Verify optimistic update (message appears immediately)
- [ ] Verify AI responds with updated information
- [ ] Try Shift+Enter for multi-line message
- [ ] Verify newline inserted (not sent)

---

### 4. Integration Testing

#### Test 4.1: Plan Approval → Podcast Generation
**Expected**: Approved plan triggers existing generation pipeline

- [ ] Click "Approve & Generate Podcast"
- [ ] Verify loading state ("Starting...")
- [ ] Verify API call to `/api/podcasts/generate`
- [ ] Verify request payload contains:
  - [ ] `type: 'custom'`
  - [ ] `source.kind: 'prompt'`
  - [ ] `source.prompt` (formatted lesson plan)
  - [ ] `durationMinutes` (from plan)
  - [ ] `speakerStyle` (mapped from teachingStyle)
- [ ] Verify 200 response with podcastId
- [ ] Verify navigation back to Podcasts page
- [ ] Verify new podcast appears in grid with "Generating..." status

#### Test 4.2: Generation Status Updates
**Expected**: Podcast status updates in real-time

- [ ] After generation starts, stay on Podcasts page
- [ ] Verify podcast card shows "Generating..." badge
- [ ] Wait 5 seconds
- [ ] Verify status updates (polling every 5s)
- [ ] Verify status changes: PENDING → PLANNING → GENERATING_SCRIPT → GENERATING_AUDIO → READY
- [ ] Verify badge color changes with status
- [ ] Click podcast card when READY
- [ ] Verify podcast episode page opens
- [ ] Verify audio player works
- [ ] Verify transcript displays

---

### 5. Session Persistence Testing

#### Test 5.1: Save and Resume
**Expected**: Can resume planning sessions later

- [ ] Start new planning session
- [ ] Complete 1-2 clarifications
- [ ] Click back button (← arrow in header)
- [ ] Verify navigation to Podcasts page
- [ ] Verify "Planning Sessions" section appears
- [ ] Verify session card shows:
  - [ ] "Planning Session" title
  - [ ] Status badge ("Clarifying")
  - [ ] Preview text (last user message)
  - [ ] Time ago ("Just now")
  - [ ] Message count
- [ ] Click session card
- [ ] Verify navigation to AIWorkspace with sessionId
- [ ] Verify conversation history loaded
- [ ] Verify can continue from where left off

#### Test 5.2: Multiple Sessions
**Expected**: Can manage multiple draft sessions

- [ ] Start planning session 1 ("Topic A")
- [ ] Complete 1 clarification, navigate back
- [ ] Start planning session 2 ("Topic B")
- [ ] Complete 2 clarifications, navigate back
- [ ] Verify both sessions appear on Podcasts page
- [ ] Verify sessions sorted by updatedAt (newest first)
- [ ] Verify each has unique status badge
- [ ] Resume session 1
- [ ] Verify correct conversation loaded
- [ ] Navigate back, resume session 2
- [ ] Verify correct conversation loaded

#### Test 5.3: Delete Session
**Expected**: Can delete saved sessions

- [ ] From Podcasts page with saved sessions
- [ ] Hover over session card
- [ ] Verify delete button (trash icon) appears
- [ ] Click delete button
- [ ] Verify confirmation prompt
- [ ] Click "OK"
- [ ] Verify session removed from list
- [ ] Verify API call to `/api/planning/:sessionId` DELETE
- [ ] Verify 200 response
- [ ] Verify session not in Firestore

---

### 6. Error Handling Testing

#### Test 6.1: Network Errors
**Expected**: Graceful error handling

- [ ] Disconnect network (offline mode)
- [ ] Try to start planning session
- [ ] Verify error message displayed
- [ ] Verify UI doesn't break
- [ ] Reconnect network
- [ ] Verify can retry

#### Test 6.2: API Errors
**Expected**: Shows meaningful error messages

- [ ] Mock API to return 500 error
- [ ] Try to respond to clarification
- [ ] Verify error displayed to user
- [ ] Verify rollback to previous state (optimistic update reverted)

#### Test 6.3: Invalid Session
**Expected**: Handles missing/invalid sessions

- [ ] Navigate to `/ai-workspace?sessionId=invalid123`
- [ ] Verify error handling
- [ ] Verify redirects or shows error message

---

### 7. Regression Testing (CRITICAL)

#### Test 7.1: Existing PodcastStudio Flow
**Expected**: Old flow completely unaffected

With feature flag DISABLED:

- [ ] Navigate to Podcasts page
- [ ] Click "New podcast" button
- [ ] Verify PodcastStudio modal opens
- [ ] Select podcast type: "Chapter Summary"
- [ ] Enter prompt: "Summarize Chapter 5 Physics"
- [ ] Select duration: 10 minutes
- [ ] Select conversation style: "Teacher & Student"
- [ ] Select voice: "Warm Teacher"
- [ ] Click "Generate Podcast"
- [ ] Verify API call to `/api/podcasts/generate`
- [ ] Verify request format matches original
- [ ] Verify podcast generation succeeds
- [ ] Verify podcast appears in list
- [ ] Verify status updates work
- [ ] Verify can play completed podcast
- [ ] Verify transcript syncing works
- [ ] Verify all existing features work

#### Test 7.2: Existing Podcast Playback
**Expected**: No changes to podcast player

- [ ] Click existing podcast (created before AI Workspace)
- [ ] Verify episode page opens
- [ ] Verify audio player loads
- [ ] Verify play/pause works
- [ ] Verify seek works
- [ ] Verify transcript displays
- [ ] Verify transcript highlights current segment
- [ ] Verify click transcript jumps to time
- [ ] Verify bookmarking works (if implemented)
- [ ] Verify ask question feature works (if implemented)

#### Test 7.3: Backend Services Unchanged
**Expected**: Core generation logic untouched

- [ ] Check `backend-firestore/src/core/podcast/PodcastEngineService.ts`
- [ ] Verify no modifications to existing methods
- [ ] Check `backend-firestore/src/core/podcast/PodcastPlanner.ts`
- [ ] Verify no modifications
- [ ] Check `backend-firestore/src/core/podcast/ConversationGenerator.ts`
- [ ] Verify no modifications
- [ ] Check `backend-firestore/src/core/podcast/AudioComposer.ts`
- [ ] Verify no modifications
- [ ] Verify all existing tests still pass

#### Test 7.4: Database Schema Compatibility
**Expected**: New schema extensions don't break existing data

- [ ] Query existing podcast documents
- [ ] Verify all fields intact
- [ ] Verify optional `planningSessionId` field doesn't break queries
- [ ] Query planning_sessions collection
- [ ] Verify new documents structure correct
- [ ] Verify security rules allow access
- [ ] Verify indexes work (if any created)

---

### 8. Performance Testing

#### Test 8.1: Response Times
**Expected**: Reasonable performance

- [ ] Start planning session
- [ ] Measure time to first AI response
- [ ] **Target**: < 3 seconds
- [ ] Respond to clarification
- [ ] Measure time to next question
- [ ] **Target**: < 2 seconds
- [ ] Accept recommendations
- [ ] Measure time to lesson plan
- [ ] **Target**: < 5 seconds

#### Test 8.2: Large Conversations
**Expected**: Handles long conversations

- [ ] Create planning session with 20+ messages
- [ ] Verify conversation timeline scrolls smoothly
- [ ] Verify no memory leaks
- [ ] Verify no performance degradation

#### Test 8.3: Multiple Sessions Load Time
**Expected**: Quick load even with many sessions

- [ ] Create 10+ planning sessions
- [ ] Navigate to Podcasts page
- [ ] Measure load time for sessions
- [ ] **Target**: < 1 second
- [ ] Verify pagination if needed

---

### 9. Accessibility Testing

#### Test 9.1: Keyboard Navigation
**Expected**: Fully keyboard accessible

- [ ] Tab through all interactive elements
- [ ] Verify focus indicators visible
- [ ] Verify can submit with Enter key
- [ ] Verify can navigate with arrow keys where appropriate
- [ ] Verify ESC closes modals/dialogs

#### Test 9.2: Screen Reader Compatibility
**Expected**: Works with screen readers

- [ ] Use screen reader (NVDA, JAWS, or VoiceOver)
- [ ] Verify aria-labels present
- [ ] Verify form fields announced correctly
- [ ] Verify buttons have descriptive labels
- [ ] Verify status messages announced

#### Test 9.3: Color Contrast
**Expected**: Meets WCAG AA standards

- [ ] Check contrast ratios for all text
- [ ] Verify buttons have sufficient contrast
- [ ] Verify badges readable
- [ ] Use browser DevTools accessibility audit

---

### 10. Browser Compatibility

#### Test 10.1: Chrome
- [ ] All flows work
- [ ] Animations smooth
- [ ] No console errors

#### Test 10.2: Firefox
- [ ] All flows work
- [ ] Animations smooth
- [ ] No console errors

#### Test 10.3: Safari
- [ ] All flows work
- [ ] Animations smooth
- [ ] No console errors

#### Test 10.4: Edge
- [ ] All flows work
- [ ] Animations smooth
- [ ] No console errors

---

## Verification Checklist

### Zero Regression Verification

- [ ] ✅ Existing PodcastStudio still accessible with flag disabled
- [ ] ✅ Existing podcast generation works (all types)
- [ ] ✅ Existing podcast playback unchanged
- [ ] ✅ Backend core services unmodified (PodcastEngineService, etc.)
- [ ] ✅ Database schema backward compatible
- [ ] ✅ All existing API endpoints work
- [ ] ✅ All existing tests pass
- [ ] ✅ No breaking changes to types/interfaces

### AI Workspace Functionality

- [ ] ✅ Feature flag system works (env + localStorage)
- [ ] ✅ Welcome screen renders correctly
- [ ] ✅ Planning session initiates
- [ ] ✅ Intent analysis displayed
- [ ] ✅ Clarification questions work
- [ ] ✅ Custom input handled
- [ ] ✅ Educational recommendations displayed
- [ ] ✅ Lesson plan generated
- [ ] ✅ Plan approval triggers generation
- [ ] ✅ Session persistence works
- [ ] ✅ Session resumption works
- [ ] ✅ Session deletion works
- [ ] ✅ Dark mode supported
- [ ] ✅ Responsive design works
- [ ] ✅ Error handling graceful
- [ ] ✅ Performance acceptable

---

## Known Issues / Limitations

### Expected Limitations (Phase 1)

1. **No SSE Streaming**: AI responses not streamed in real-time (planned for Phase 2)
2. **No Plan Editing**: Can't edit lesson plan inline (planned for Phase 2)
3. **English Only**: Curriculum recommendations tailored for Indian education system
4. **Limited Voice Options**: Uses mapped voice styles from original system
5. **No Collaboration**: Single-user sessions only (planned for Phase 3)

### Potential Issues

1. **Mock Data**: Backend intent analysis may use simplified logic without actual AI integration
2. **Firestore Limits**: May hit rate limits with many concurrent sessions
3. **Session Expiry**: No automatic cleanup of old sessions yet
4. **Plan Validation**: Minimal validation on generated plans

---

## Bug Reporting Template

When reporting issues:

```markdown
**Environment**:
- Browser: Chrome 120
- OS: Windows 11
- Feature Flag: Enabled via localStorage

**Steps to Reproduce**:
1. Open AIWorkspace
2. Enter prompt "..."
3. Click "Start Planning"
4. ...

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happened]

**Screenshots**:
[If applicable]

**Console Errors**:
[Copy any errors from browser console]

**Network Logs**:
[Copy relevant API calls from Network tab]
```

---

## Test Results Summary

| Category | Tests | Passed | Failed | Notes |
|----------|-------|--------|--------|-------|
| Feature Flags | 4 | - | - | |
| UI Components | 3 | - | - | |
| Planning Flow | 7 | - | - | |
| Integration | 2 | - | - | |
| Session Persistence | 3 | - | - | |
| Error Handling | 3 | - | - | |
| Regression | 4 | - | - | |
| Performance | 3 | - | - | |
| Accessibility | 3 | - | - | |
| Browser Compat | 4 | - | - | |
| **TOTAL** | **36** | **-** | **-** | |

---

## Sign-off

**Phase 1 Testing Complete**: ☐

**Tested By**: _______________  
**Date**: _______________  
**Approved By**: _______________  
**Date**: _______________  

**Ready for Beta Rollout**: ☐ Yes ☐ No

**Comments**:
_____________________________________________
_____________________________________________
_____________________________________________

---

**Last Updated**: Phase 1 Complete (15/16 tasks)
