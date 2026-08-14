import { SDK as HMSServerSDK } from '@100mslive/server-sdk';
import { env } from '../../config/env';
import { VideoRole } from '../../types/classSession';
import { CreateRoomResult, VideoProvider } from './VideoProvider';
import { logger } from '../../utils/logger';

/**
 * HundredMsProvider — the TESTING implementation of VideoProvider, backed by 100ms
 * (https://100ms.live). Chosen for a fast, self-serve-signup path with a real free tier — see
 * the vendor comparison this phase started from. Nothing outside services/video/ imports
 * `@100mslive/server-sdk` directly; swapping vendors later means a new class here, not a
 * rewrite of classSession.service.ts.
 *
 * ── The one piece of manual setup that can't be automated ───────────────────────────────
 * 100ms Room Codes require a Template with named Roles, configured in the 100ms dashboard
 * (Templates section) — there is no API to create a Template from scratch. `HMS_TEACHER_ROLE`
 * and `HMS_STUDENT_ROLE` (env.ts) must match the role names actually configured there, or
 * `createRoom` fails loudly rather than silently handing a student the teacher's room code.
 */
export class HundredMsProvider implements VideoProvider {
  readonly name = '100ms';
  private client: HMSServerSDK | null = null;

  isConfigured(): boolean {
    return !!(env.HMS_ACCESS_KEY && env.HMS_SECRET);
  }

  private hms(): HMSServerSDK {
    if (!this.isConfigured()) throw new Error('100ms is not configured (HMS_ACCESS_KEY/HMS_SECRET missing).');
    if (!this.client) {
      this.client = new HMSServerSDK(env.HMS_ACCESS_KEY!, env.HMS_SECRET!);
    }
    return this.client;
  }

  /**
   * A deterministic room NAME (not id) from classId+sessionId. 100ms's `rooms.create()`
   * returns the EXISTING room if one with this name already exists rather than erroring, so a
   * retried "go live" call is naturally idempotent — no extra dedupe logic needed here.
   */
  async createRoom(params: { classId: string; sessionId: string; title: string }): Promise<CreateRoomResult> {
    const hms = this.hms();
    const name = `class_${params.classId}_${params.sessionId}`.slice(0, 100);

    const room = await hms.rooms.create({
      name,
      description: params.title.slice(0, 200),
      ...(env.HMS_TEMPLATE_ID ? { template_id: env.HMS_TEMPLATE_ID } : {}),
    });

    // Mints a code for EVERY role in the template at once — one call, not one per role.
    const codes = await hms.roomCodes.create(room.id);
    const roomCodes = this.mapRoomCodes(codes);

    logger.info('[HundredMsProvider] Room created', { classId: params.classId, sessionId: params.sessionId, roomId: room.id });
    return { providerRoomId: room.id, roomCodes };
  }

  /** Disables the room so no new peer can join — 100ms has no hard "delete", and doesn't need one. */
  async endRoom(providerRoomId: string): Promise<void> {
    const hms = this.hms();
    await hms.rooms.enableOrDisable(providerRoomId, false);
  }

  /**
   * `https://<subdomain>.app.100ms.live/meeting/<code>` — a link the frontend can drop straight
   * into an iframe with no client-side SDK. The subdomain is per-Template, configured in the
   * 100ms dashboard (Templates → Room Links), not derivable from the code itself.
   */
  buildJoinUrl(roomCode: string): string {
    if (!env.HMS_SUBDOMAIN) throw new Error('HMS_SUBDOMAIN is not set — find it under Templates → Room Links in the 100ms dashboard.');
    return `https://${env.HMS_SUBDOMAIN}.app.100ms.live/meeting/${roomCode}`;
  }

  /**
   * Maps 100ms's per-role codes onto our two known roles. Throws if the configured template
   * doesn't actually have both expected roles — this must fail at room-creation time, loudly,
   * not hand out an undefined `roomCodes.student` that breaks the join screen later.
   */
  private mapRoomCodes(codes: { role: string; code: string }[]): Record<VideoRole, string> {
    const teacher = codes.find((c) => c.role === env.HMS_TEACHER_ROLE);
    const student = codes.find((c) => c.role === env.HMS_STUDENT_ROLE);
    if (!teacher || !student) {
      const found = codes.map((c) => c.role).join(', ') || 'none';
      logger.error('[HundredMsProvider] Template is missing expected roles', {
        expected: [env.HMS_TEACHER_ROLE, env.HMS_STUDENT_ROLE], found,
      });
      throw new Error(
        `The 100ms template must have roles named "${env.HMS_TEACHER_ROLE}" and "${env.HMS_STUDENT_ROLE}" ` +
        `(configurable via HMS_TEACHER_ROLE/HMS_STUDENT_ROLE in .env). Found: ${found}.`,
      );
    }
    return { teacher: teacher.code, student: student.code };
  }
}

export const hundredMsProvider = new HundredMsProvider();
