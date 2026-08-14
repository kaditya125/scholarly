import { api } from './client';

/** Mirrors backend-firestore/src/types/classPost.ts. */
export const POST_KINDS = ['announcement', 'discussion'] as const;
export type PostKind = (typeof POST_KINDS)[number];

export interface ClassPost {
  id: string;
  classId: string;
  ownerUid: string;
  authorUid: string;
  authorRole: 'teacher' | 'student';
  kind: PostKind;
  title: string | null;
  body: string;
  parentId: string | null;
  createdAt: unknown;
}

export interface CreatePostInput {
  kind: PostKind;
  title?: string;
  body: string;
  parentId?: string | null;
}

export const classPostsApi = {
  async list(classId: string): Promise<ClassPost[]> {
    const { data } = await api.get(`/classes/${classId}/posts`);
    return data.posts ?? [];
  },

  async create(classId: string, input: CreatePostInput): Promise<ClassPost> {
    const { data } = await api.post(`/classes/${classId}/posts`, input);
    return data;
  },
};
