/**
 * Frontend calls with NO backend route — each listed deliberately, with the reason.
 *
 * Enforced by backend-firestore/scripts/check-frontend-endpoints.ts, which walks the real Express
 * router and every api.get/post/…/fetch call in frontend/src:
 *   - a call that matches no route and is not listed here fails the check;
 *   - an entry here that now DOES match a route fails the check too (remove it — it's stale).
 * So this list can only shrink by building the backend, never silently grow.
 *
 * Paths use ':param' for path parameters, relative to /api.
 */
export interface UnsupportedEndpoint {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  feature: string;
  reason: string;
}

const STUDY_GROUPS = 'Study Groups (Chats page)';
const GROUPS_REASON = 'The study-groups backend implements only list, create and add-member (routes/studyGroups.routes.ts); group detail, join/invite, membership edits and leave were never built.';
const CHANNELS = 'Group channels (Chats page)';
const CHANNELS_REASON = 'No channel/message backend exists for study groups.';
const CIRCLE = 'Study Circle (Chats page)';
const CIRCLE_REASON = 'No study-circle knowledge/chat/graph backend exists.';

export const UNSUPPORTED_ENDPOINTS: UnsupportedEndpoint[] = [
  { method: 'GET', path: '/study-groups/:id', feature: STUDY_GROUPS, reason: GROUPS_REASON },
  { method: 'PATCH', path: '/study-groups/:id', feature: STUDY_GROUPS, reason: GROUPS_REASON },
  { method: 'DELETE', path: '/study-groups/:id', feature: STUDY_GROUPS, reason: GROUPS_REASON },
  { method: 'POST', path: '/study-groups/join', feature: STUDY_GROUPS, reason: GROUPS_REASON },
  { method: 'POST', path: '/study-groups/:id/invite', feature: STUDY_GROUPS, reason: GROUPS_REASON },
  { method: 'POST', path: '/study-groups/:id/leave', feature: STUDY_GROUPS, reason: GROUPS_REASON },
  { method: 'PATCH', path: '/study-groups/:id/members/:memberId', feature: STUDY_GROUPS, reason: GROUPS_REASON },
  { method: 'DELETE', path: '/study-groups/:id/members/:memberId', feature: STUDY_GROUPS, reason: GROUPS_REASON },

  { method: 'GET', path: '/study-groups/:id/channels', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'POST', path: '/study-groups/:id/channels', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'PATCH', path: '/study-groups/:id/channels/:channelId', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'DELETE', path: '/study-groups/:id/channels/:channelId', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'GET', path: '/study-groups/:id/channels/:channelId/messages', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'POST', path: '/study-groups/:id/channels/:channelId/messages', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'PATCH', path: '/study-groups/:id/channels/:channelId/messages/:messageId', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'DELETE', path: '/study-groups/:id/channels/:channelId/messages/:messageId', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'POST', path: '/study-groups/:id/channels/:channelId/messages/:messageId/pin', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'POST', path: '/study-groups/:id/channels/:channelId/messages/:messageId/react', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'GET', path: '/study-groups/:id/channels/:channelId/pins', feature: CHANNELS, reason: CHANNELS_REASON },
  { method: 'POST', path: '/study-groups/:id/channels/:channelId/read', feature: CHANNELS, reason: CHANNELS_REASON },

  { method: 'GET', path: '/study-groups/:id/circle/knowledge', feature: CIRCLE, reason: CIRCLE_REASON },
  { method: 'POST', path: '/study-groups/:id/circle/knowledge', feature: CIRCLE, reason: CIRCLE_REASON },
  { method: 'DELETE', path: '/study-groups/:id/circle/knowledge/:itemId', feature: CIRCLE, reason: CIRCLE_REASON },
  { method: 'GET', path: '/study-groups/:id/circle/chat', feature: CIRCLE, reason: CIRCLE_REASON },
  { method: 'POST', path: '/study-groups/:id/circle/ask', feature: CIRCLE, reason: CIRCLE_REASON },
  { method: 'GET', path: '/study-groups/:id/circle/graph', feature: CIRCLE, reason: CIRCLE_REASON },
  { method: 'POST', path: '/study-groups/:id/circle/graph/synthesize', feature: CIRCLE, reason: CIRCLE_REASON },

  { method: 'GET', path: '/flashcards', feature: 'Flashcards page', reason: 'No flashcards backend exists; the page cannot load or save decks.' },
  { method: 'POST', path: '/flashcards', feature: 'Flashcards page', reason: 'No flashcards backend exists.' },
  { method: 'DELETE', path: '/flashcards/:id', feature: 'Flashcards page', reason: 'No flashcards backend exists.' },

  { method: 'GET', path: '/notebooks/:id/sources/duplicate-check', feature: 'Content Pipeline upload', reason: 'Duplicate detection was designed for ContentPipelineOrchestrator, which real uploads do not use; the caller treats a failure as "not a duplicate".' },
  { method: 'POST', path: '/notebooks/:id/sources/:sourceId/retry', feature: 'Content Pipeline retry', reason: 'Retry belongs to ContentPipelineOrchestrator, which is not wired to uploads; re-uploading the document is the working path.' },
  { method: 'PUT', path: '/notebooks/:id/sources/:sourceId', feature: 'Content Pipeline retry', reason: 'Fallback of the retry call above; no source-update route exists.' },

  { method: 'GET', path: '/public/stats', feature: 'Landing / For Teachers social proof', reason: 'No public stats endpoint exists; both callers fall back to static copy on failure. Exposing user counts/avatars publicly needs a privacy decision first.' },
];
