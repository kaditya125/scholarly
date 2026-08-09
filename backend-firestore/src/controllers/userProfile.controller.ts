import { Request, Response, NextFunction } from 'express';
import { userProfileService } from '../services/userProfile.service';
import { StudentProfile } from '../types/studentContext.types';

/**
 * UserProfileController — REST surface for the student's onboarding / learning profile.
 * GET  /users/:userId/profile  -> the persisted learning profile (or {} if none yet)
 * PUT  /users/:userId/profile  -> merge-update; body may be partial (wizard autosave). A
 *                                 `markComplete: true` flag finalizes onboarding.
 * Both are guarded by requireAuth + enforceSelf, so a user can only read/write their own profile.
 */
export class UserProfileController {
  public getProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const profile = await userProfileService.getProfile(userId);
      // Return {} (not 404) when unset so the client can treat "no profile yet" as "not onboarded".
      res.json(profile || {});
    } catch (error) {
      next(error);
    }
  };

  public updateProfile = async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { userId } = req.params;
      const body = req.body || {};
      const markComplete = body.markComplete === true;

      // Whitelist + coerce — never persist arbitrary client keys onto the profile document.
      const patch = sanitizeProfilePatch(body);

      // Mirror the primary goal onto targetExam so existing onboarding/context checks (which key on
      // targetExam) keep working when the goal is set via the new wizard.
      if (patch.goal && !patch.targetExam) patch.targetExam = patch.goal;

      const updated = await userProfileService.updateProfile(userId, patch, markComplete);
      res.json(updated || {});
    } catch (error) {
      next(error);
    }
  };
}

const STRING_FIELDS: (keyof StudentProfile)[] = [
  'goal', 'board', 'classLevel', 'stream', 'target',
  'targetExam', 'targetYear', 'preferredLanguage',
];
const STRING_ARRAY_FIELDS: (keyof StudentProfile)[] = ['subjects', 'learningStyles', 'weakAreas'];

function sanitizeProfilePatch(body: any): Partial<StudentProfile> {
  const patch: Partial<StudentProfile> = {};

  for (const key of STRING_FIELDS) {
    const v = body[key];
    if (typeof v === 'string' && v.trim().length > 0) (patch as any)[key] = v.trim();
  }

  for (const key of STRING_ARRAY_FIELDS) {
    const v = body[key];
    if (Array.isArray(v)) {
      const cleaned = v.filter((x) => typeof x === 'string' && x.trim().length > 0).map((x: string) => x.trim());
      if (cleaned.length > 0) (patch as any)[key] = cleaned;
    }
  }

  // preparationLevel is a constrained enum.
  if (['beginner', 'intermediate', 'advanced'].includes(body.preparationLevel)) {
    patch.preparationLevel = body.preparationLevel;
  }

  // dailyStudyHours is numeric (supports 0.5 for the "30 min" option); clamp to a sane range.
  const hrs = Number(body.dailyStudyHours);
  if (Number.isFinite(hrs) && hrs > 0) patch.dailyStudyHours = Math.min(hrs, 24);

  return patch;
}
