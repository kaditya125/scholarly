import { api } from './client';
import { LearningProfile } from '../onboardingOptions';

/** Payload for a profile update; markComplete finalizes onboarding (sets isComplete + onboardedAt). */
export type ProfileUpdate = Partial<LearningProfile> & { markComplete?: boolean };

export const profileApi = {
  /** Returns the persisted learning profile, or an empty object when the student hasn't onboarded. */
  async get(userId: string): Promise<LearningProfile> {
    const { data } = await api.get(`/users/${userId}/profile`);
    return (data || {}) as LearningProfile;
  },

  /** Merge-updates the profile. Body may be partial (wizard autosave) or carry markComplete. */
  async update(userId: string, patch: ProfileUpdate): Promise<LearningProfile> {
    const { data } = await api.put(`/users/${userId}/profile`, patch);
    return (data || {}) as LearningProfile;
  },
};
