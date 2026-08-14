import { api } from './client';

/** Mirrors backend-firestore/src/types/classResource.ts. */
export const RESOURCE_PROVENANCE_SOURCES = [
  'teacher_authored', 'teacher_uploaded', 'platform_generated', 'licensed',
] as const;
export type ResourceProvenanceSource = (typeof RESOURCE_PROVENANCE_SOURCES)[number];

export interface ClassResource {
  id: string;
  classId: string;
  ownerUid: string;
  notebookId: string;
  title: string;
  /** Self-declared by the teacher at attach time — not verified by the platform. */
  provenance: { source: ResourceProvenanceSource; createdBy: string };
}

export interface AttachResourceInput {
  notebookId: string;
  title?: string;
  source?: ResourceProvenanceSource;
}

export const classResourcesApi = {
  async list(classId: string): Promise<ClassResource[]> {
    const { data } = await api.get(`/classes/${classId}/resources`);
    return data.resources ?? [];
  },

  async attach(classId: string, input: AttachResourceInput): Promise<ClassResource> {
    const { data } = await api.post(`/classes/${classId}/resources`, input);
    return data;
  },

  async detach(classId: string, resourceId: string): Promise<void> {
    await api.delete(`/classes/${classId}/resources/${resourceId}`);
  },
};
