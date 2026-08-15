import { api } from './client';

// ---------------------------------------------------------------------------
// Legacy chat-room / message API (kept for backwards compat with Discussions.tsx)
// ---------------------------------------------------------------------------

export interface Room {
  id: string | number;
  name: string;
  icon: string;
}

export interface DiscussionMessage {
  id: string | number;
  author?: string;
  role?: string;
  avatar?: string;
  time?: string;
  content?: string;
  likes?: number;
  chapter?: string;
  topic?: string;
  aiAssisted?: boolean;
  title?: string;
  description?: string;
  participants?: string[];
  replies?: number;
  views?: number;
  aiSummary?: string;
  similarThreadIds?: string[];
  createdAt?: number;
}

export const discussionsApi = {
  async getRooms(): Promise<Room[]> {
    const response = await api.get('/rooms');
    return response.data;
  },

  async getDiscussions(): Promise<DiscussionMessage[]> {
    const response = await api.get('/discussions');
    return response.data;
  },

  async sendMessage(roomId: string | number, content: string): Promise<void> {
    await api.post(`/discussions/${roomId}/messages`, { content });
  },
};

// ---------------------------------------------------------------------------
// Community discussion API (used by hooks/api/useCommunity.ts and pages/Community.tsx)
// ---------------------------------------------------------------------------

export type DiscussionStatus = 'active' | 'resolved' | 'closed';

export interface DiscussionAuthor {
  uid: string;
  displayName: string;
  photoURL?: string;
}

export interface DiscussionFilters {
  topics: string[];
  mine: boolean;
  status: 'all' | DiscussionStatus;
  q: string;
  sort: 'recent' | 'top';
}

export interface CommunityDiscussion {
  id: string;
  authorId?: string;
  author: DiscussionAuthor;
  status?: DiscussionStatus;
  createdAt: number | string;
  topic: string;
  chapter?: string;
  title: string;
  description?: string;
  tags: string[];
  views: number;
  replies: number;
  liked?: boolean;
  likeCount: number;
  participants?: string[];
  participantProfiles?: DiscussionAuthor[];
  bestResponseId?: string;
}

export interface DiscussionResponse {
  id: string;
  author: DiscussionAuthor;
  createdAt: number | string;
  text: string;
  isBest?: boolean;
}

export interface DiscussionDetail {
  discussion: CommunityDiscussion;
  responses: DiscussionResponse[];
}

export interface CommunityContributor {
  uid: string;
  displayName: string;
  photoURL?: string;
  posts: number;
}

export interface CreateDiscussionInput {
  topic: string;
  title: string;
  description: string;
  tags?: string[];
}

/**
 * Flatten a DiscussionFilters value into query params. Empty / default values
 * are omitted so the backend can treat them as "no filter".
 */
function filtersToParams(filters: DiscussionFilters): Record<string, string> {
  const params: Record<string, string> = {};
  if (filters.topics && filters.topics.length > 0) {
    params.topics = filters.topics.join(',');
  }
  if (filters.mine) params.mine = 'true';
  if (filters.status && filters.status !== 'all') params.status = filters.status;
  if (filters.q) params.q = filters.q;
  if (filters.sort) params.sort = filters.sort;
  return params;
}

/**
 * Safely unwrap responses that may be either a raw array/object or the
 * `{ data: ... }` envelope some backend routes use.
 */
function unwrap<T>(payload: unknown): T {
  if (payload && typeof payload === 'object' && 'data' in (payload as Record<string, unknown>)) {
    const inner = (payload as { data: unknown }).data;
    if (inner !== undefined) return inner as T;
  }
  return payload as T;
}

/**
 * Normalize whatever the backend returns into a shape the UI can render.
 *
 * The current /discussions route is the pre-community rooms API — its items
 * don't carry an `author` object, `tags`, `views`, or the `likeCount`/`liked`
 * fields the Community feed reads. Dereferencing those without normalization
 * blew up as `Cannot read properties of undefined (reading 'uid')` at
 * DiscussionCard render, which blanked the whole page.
 *
 * This function guarantees every required field exists with a sensible
 * default, so a legacy row renders (albeit blandly) instead of crashing.
 */
function normalizeDiscussion(raw: any): CommunityDiscussion {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const rawAuthor = src.author && typeof src.author === 'object' ? src.author : {};
  const author: DiscussionAuthor = {
    uid: rawAuthor.uid || src.authorId || src.userId || 'unknown',
    displayName:
      rawAuthor.displayName
      || rawAuthor.name
      || src.authorName
      || src.author
      || 'Unknown',
    photoURL: rawAuthor.photoURL || rawAuthor.avatar || src.authorPhotoURL || undefined,
  };
  const tags = Array.isArray(src.tags) ? src.tags.filter((t: unknown): t is string => typeof t === 'string') : [];
  const status: DiscussionStatus | undefined = ['active', 'resolved', 'closed'].includes(src.status)
    ? (src.status as DiscussionStatus)
    : undefined;

  const rawProfiles = Array.isArray(src.participantProfiles) ? src.participantProfiles : [];
  const participantProfiles: DiscussionAuthor[] = rawProfiles.map((p: any) => ({
    uid: p?.uid || p?.userId || 'unknown',
    displayName: p?.displayName || p?.name || 'Student',
    photoURL: p?.photoURL || p?.avatar || undefined,
  }));

  return {
    id: String(src.id ?? ''),
    authorId: src.authorId ?? rawAuthor.uid ?? undefined,
    author,
    status,
    createdAt: src.createdAt ?? src.time ?? Date.now(),
    topic: src.topic ?? src.chapter ?? 'General',
    chapter: src.chapter ?? undefined,
    title: src.title ?? src.subject ?? '(untitled)',
    description: src.description ?? src.content ?? undefined,
    tags,
    views: Number.isFinite(src.views) ? Number(src.views) : 0,
    replies: Number.isFinite(src.replies) ? Number(src.replies) : 0,
    liked: Boolean(src.liked),
    likeCount: Number.isFinite(src.likeCount)
      ? Number(src.likeCount)
      : Number.isFinite(src.likes) ? Number(src.likes) : 0,
    participants: Array.isArray(src.participants) ? src.participants : undefined,
    participantProfiles: participantProfiles.length > 0 ? participantProfiles : [author],
    bestResponseId: src.bestResponseId ?? undefined,
  };
}

function normalizeResponse(raw: any): DiscussionResponse {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const rawAuthor = src.author && typeof src.author === 'object' ? src.author : {};
  const author: DiscussionAuthor = {
    uid: rawAuthor.uid || src.authorId || 'unknown',
    displayName: rawAuthor.displayName || rawAuthor.name || 'Unknown',
    photoURL: rawAuthor.photoURL || rawAuthor.avatar || undefined,
  };
  return {
    id: String(src.id ?? ''),
    author,
    createdAt: src.createdAt ?? Date.now(),
    text: src.text ?? src.content ?? '',
    isBest: Boolean(src.isBest),
  };
}

export const communityApi = {
  async list(filters: DiscussionFilters): Promise<CommunityDiscussion[]> {
    const response = await api.get('/discussions', { params: filtersToParams(filters) });
    const data = unwrap<unknown>(response.data);
    const arr = Array.isArray(data) ? data : [];
    return arr.map(normalizeDiscussion).filter((d) => d.id);
  },

  async create(input: CreateDiscussionInput): Promise<CommunityDiscussion> {
    const response = await api.post('/discussions', input);
    return normalizeDiscussion(unwrap<any>(response.data));
  },

  async vote(id: string): Promise<void> {
    await api.post(`/discussions/${id}/vote`);
  },

  async get(id: string): Promise<DiscussionDetail> {
    const response = await api.get(`/discussions/${id}`);
    const data = unwrap<any>(response.data) || {};
    const rawDiscussion = data.discussion ?? data;
    const rawResponses = Array.isArray(data.responses) ? data.responses : [];
    return {
      discussion: normalizeDiscussion(rawDiscussion),
      responses: rawResponses.map(normalizeResponse).filter((r: DiscussionResponse) => r.id),
    };
  },

  async respond(id: string, text: string): Promise<void> {
    await api.post(`/discussions/${id}/responses`, { text });
  },

  async setBest(id: string, responseId: string): Promise<void> {
    await api.post(`/discussions/${id}/best`, { responseId });
  },

  async setStatus(id: string, status: DiscussionStatus): Promise<void> {
    await api.patch(`/discussions/${id}/status`, { status });
  },

  async trending(): Promise<CommunityDiscussion[]> {
    try {
      const response = await api.get('/discussions/trending');
      const data = unwrap<unknown>(response.data);
      const arr = Array.isArray(data) ? data : [];
      return arr.map(normalizeDiscussion).filter((d) => d.id);
    } catch {
      return [];
    }
  },

  async contributors(): Promise<CommunityContributor[]> {
    try {
      const response = await api.get('/discussions/contributors');
      const data = unwrap<unknown>(response.data);
      const arr = Array.isArray(data) ? data : [];
      return arr.map((raw: any): CommunityContributor => {
        const src = (raw && typeof raw === 'object') ? raw : {};
        return {
          uid: src.uid || src.userId || src.id || 'unknown',
          displayName: src.displayName || src.name || 'Unknown',
          photoURL: src.photoURL || src.avatar || undefined,
          posts: Number.isFinite(src.posts) ? Number(src.posts) : 0,
        };
      }).filter((c) => c.uid && c.uid !== 'unknown');
    } catch {
      return [];
    }
  },
};
