import { VideoRole } from '../../types/classSession';

/**
 * VideoProvider — the abstraction boundary for live class video (Phase 3M).
 *
 * Same posture as services/payout/PayoutProvider.ts: one interface, swappable
 * implementations, nothing above this layer ever imports a vendor SDK directly.
 * `HundredMsProvider` is the first (and, right now, only) real implementation — chosen for
 * TESTING per the discussion in this phase (self-serve signup, generous free tier, EdTech
 * templates). If a different vendor is chosen for a real launch later, that's a new class
 * implementing this same interface; classSession.service.ts does not change.
 */

export interface CreateRoomResult {
  providerRoomId: string;
  roomCodes: Record<VideoRole, string>;
}

export interface VideoProvider {
  readonly name: string;
  isConfigured(): boolean;
  /** Creates a room AND mints one join code per role — see CreateRoomResult. */
  createRoom(params: { classId: string; sessionId: string; title: string }): Promise<CreateRoomResult>;
  /** Best-effort — a room that's never explicitly ended just becomes inactive on the provider's side. */
  endRoom(providerRoomId: string): Promise<void>;
  /**
   * Turns a bare join code into a URL the frontend can open directly (iframe or new tab) — no
   * client-side SDK needed. Vendor-specific by construction: 100ms's shape is
   * `https://<subdomain>.app.100ms.live/meeting/<code>`; a different provider might return a
   * completely different kind of URL, or none at all if it needs an SDK-based join instead.
   */
  buildJoinUrl(roomCode: string): string;
}

export class VideoProviderNotConfiguredError extends Error {
  constructor() {
    super(
      'Live classes are not configured. Set HMS_ACCESS_KEY, HMS_SECRET and HMS_TEMPLATE_ID — ' +
      'see services/video/HundredMsProvider.ts.',
    );
    this.name = 'VideoProviderNotConfiguredError';
  }
}

/** The provider used when no video vendor is configured — fails loudly, never a fake room. */
export class NotConfiguredVideoProvider implements VideoProvider {
  readonly name = 'not_configured';

  isConfigured(): boolean {
    return false;
  }

  async createRoom(_params: { classId: string; sessionId: string; title: string }): Promise<CreateRoomResult> {
    throw new VideoProviderNotConfiguredError();
  }

  async endRoom(_providerRoomId: string): Promise<void> {
    throw new VideoProviderNotConfiguredError();
  }

  buildJoinUrl(_roomCode: string): string {
    throw new VideoProviderNotConfiguredError();
  }
}
