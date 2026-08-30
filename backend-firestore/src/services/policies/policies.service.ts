import { db } from '../../config/firebase';
import { logger } from '../../utils/logger';

export const CURRENT_POLICY_SET_VERSION = '2026.08';
export const CURRENT_POLICY_SET_RELEASE_DATE = '2026-08-31T00:00:00.000Z';

export interface PolicySectionMeta {
  id: string;
  title: string;
  shortSummary: string;
  version: string;
  category: 'core' | 'ai' | 'community' | 'education' | 'safety' | 'billing';
}

export interface PolicySet {
  version: string;
  releaseDate: string;
  title: string;
  description: string;
  sections: PolicySectionMeta[];
  changelog?: string;
}

export interface UserConsentRecord {
  userId: string;
  version: string;
  acceptedAt: string;
  ipHash?: string;
  userAgent?: string;
  sectionsAccepted: string[];
}

export interface UserConsentStatus {
  hasAcceptedCurrent: boolean;
  currentVersion: string;
  lastAcceptedVersion: string | null;
  lastAcceptedAt: string | null;
  requiresReview: boolean;
}

export const CANONICAL_POLICY_SECTIONS: PolicySectionMeta[] = [
  {
    id: 'terms',
    title: 'Terms of Service',
    shortSummary: 'The foundational relationship between you and Sadhya, account eligibility, student and teacher workspaces, and platform availability.',
    version: '2026.08',
    category: 'core',
  },
  {
    id: 'privacy',
    title: 'Privacy & Data Use Policy',
    shortSummary: 'Transparent explanation of learning telemetry, authentication data, personal information security, and user data rights.',
    version: '2026.08',
    category: 'core',
  },
  {
    id: 'ai-usage',
    title: 'AI Chat & AI Usage Policy',
    shortSummary: 'How Sadhya AI works as an educational study assistant with 6-step reasoning and syllabus grounding, verification guidance, and responsible non-cheating use.',
    version: '2026.08',
    category: 'ai',
  },
  {
    id: 'ai-questions',
    title: 'AI-Generated Questions & Assessments',
    shortSummary: 'Transparency on dynamically generated questions, cognitive difficulty levels, adaptive test branching, and question error reporting.',
    version: '2026.08',
    category: 'ai',
  },
  {
    id: 'personalization',
    title: 'Personalization & Learner Model',
    shortSummary: 'How study goals, target exams, learning velocity, and mastery heatmaps adapt your curriculum without intrusive surveillance.',
    version: '2026.08',
    category: 'ai',
  },
  {
    id: 'community',
    title: 'Community Guidelines & Posts',
    shortSummary: 'Standards for educational questions, discussions, and study help with zero tolerance for bullying, spam, or harassment.',
    version: '2026.08',
    category: 'community',
  },
  {
    id: 'peer-chat',
    title: 'Peer Communication & Direct Messages',
    shortSummary: 'Rules for 1-on-1 study buddy discussions, safe peer messaging, and built-in user blocking and reporting tools.',
    version: '2026.08',
    category: 'community',
  },
  {
    id: 'student-teacher',
    title: 'Student & Teacher Responsibilities',
    shortSummary: 'Professional boundaries, classroom invite code integrity, homework assignments, and mutual respect between mentors and learners.',
    version: '2026.08',
    category: 'education',
  },
  {
    id: 'academic-integrity',
    title: 'Academic Integrity & Honest Learning',
    shortSummary: 'Authentic baseline assessments, honest exam simulator attempts, and ethical AI assistance during practice.',
    version: '2026.08',
    category: 'education',
  },
  {
    id: 'user-content',
    title: 'User-Generated Content & Uploads',
    shortSummary: 'Ownership rights over your uploaded notes, lecture PDFs, and worksheets, alongside copyright and privacy obligations.',
    version: '2026.08',
    category: 'education',
  },
  {
    id: 'intellectual-property',
    title: 'Intellectual Property & Copyright',
    shortSummary: 'Protection of Sadhya technology and proprietary content, textbook quotation rules, and copyright infringement reporting.',
    version: '2026.08',
    category: 'safety',
  },
  {
    id: 'safety-reporting',
    title: 'Safety, Moderation & Reporting',
    shortSummary: 'Reassuring community safety controls, content flagging, user blocking, and compassionate review workflows.',
    version: '2026.08',
    category: 'safety',
  },
  {
    id: 'payments',
    title: 'Payments, Subscriptions & Refunds',
    shortSummary: 'Razorpay Indian Rupee pricing (Free vs Pro tiers), transparent billing, anytime cancellation, and 7-day refund policy.',
    version: '2026.08',
    category: 'billing',
  },
];

export const POLICY_VERSIONS: Record<string, PolicySet> = {
  '2026.08': {
    version: '2026.08',
    releaseDate: CURRENT_POLICY_SET_RELEASE_DATE,
    title: 'Sadhya Platform Terms & Policies (August 2026 Release)',
    description: 'Comprehensive, feature-accurate terms, AI usage guidelines, community standards, and privacy disclosures tailored specifically for Sadhya learners and educators.',
    sections: CANONICAL_POLICY_SECTIONS,
    changelog: 'Initial unified platform policy release covering AI Chat grounding, adaptive assessments, community feed, peer direct messages, teacher classrooms, and transparent billing.',
  },
};

export class PoliciesService {
  /**
   * Returns current active policy set.
   */
  getCurrentPolicySet(): PolicySet {
    return (
      POLICY_VERSIONS[CURRENT_POLICY_SET_VERSION] || {
        version: CURRENT_POLICY_SET_VERSION,
        releaseDate: CURRENT_POLICY_SET_RELEASE_DATE,
        title: 'Sadhya Platform Terms & Policies',
        description: 'Current Sadhya terms and policies.',
        sections: CANONICAL_POLICY_SECTIONS,
      }
    );
  }

  /**
   * Returns historical policy set by exact version string.
   */
  getPolicyVersion(version: string): PolicySet | null {
    return POLICY_VERSIONS[version] || null;
  }

  /**
   * Fetches user consent status for a specific user ID.
   */
  async getUserConsentStatus(uid: string): Promise<UserConsentStatus> {
    try {
      const userDoc = await db.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return {
          hasAcceptedCurrent: false,
          currentVersion: CURRENT_POLICY_SET_VERSION,
          lastAcceptedVersion: null,
          lastAcceptedAt: null,
          requiresReview: true,
        };
      }

      const data = userDoc.data() || {};
      const policyConsent = data.policyConsent || data.acceptedPolicies;
      const lastVersion = policyConsent?.version || null;
      const lastAcceptedAt = policyConsent?.acceptedAt || null;

      const hasAcceptedCurrent = lastVersion === CURRENT_POLICY_SET_VERSION;

      return {
        hasAcceptedCurrent,
        currentVersion: CURRENT_POLICY_SET_VERSION,
        lastAcceptedVersion: lastVersion,
        lastAcceptedAt,
        requiresReview: !hasAcceptedCurrent,
      };
    } catch (err: any) {
      logger.error('[PoliciesService] Failed to get user consent status:', { uid, error: err?.message });
      return {
        hasAcceptedCurrent: false,
        currentVersion: CURRENT_POLICY_SET_VERSION,
        lastAcceptedVersion: null,
        lastAcceptedAt: null,
        requiresReview: true,
      };
    }
  }

  /**
   * Records user consent to the current policy version.
   */
  async recordUserConsent(
    uid: string,
    version: string,
    metadata?: { ip?: string; userAgent?: string }
  ): Promise<UserConsentRecord> {
    if (version !== CURRENT_POLICY_SET_VERSION) {
      throw new Error(`Invalid policy version: ${version}. Expected active version: ${CURRENT_POLICY_SET_VERSION}`);
    }

    const acceptedAt = new Date().toISOString();
    const sectionsAccepted = CANONICAL_POLICY_SECTIONS.map((s) => s.id);

    const record: UserConsentRecord = {
      userId: uid,
      version,
      acceptedAt,
      userAgent: metadata?.userAgent?.slice(0, 500),
      sectionsAccepted,
    };

    try {
      const batch = db.batch();

      // 1. Update user profile document summary
      const userRef = db.collection('users').doc(uid);
      batch.set(
        userRef,
        {
          policyConsent: {
            version,
            acceptedAt,
            sectionsAcceptedCount: sectionsAccepted.length,
          },
          updatedAt: acceptedAt,
        },
        { merge: true }
      );

      // 2. Append to immutable consent audit history subcollection
      const historyRef = userRef.collection('policy_consent_history').doc(`${version}_${Date.now()}`);
      batch.set(historyRef, record);

      await batch.commit();

      logger.info('[PoliciesService] User consent successfully recorded', { uid, version, acceptedAt });
      return record;
    } catch (err: any) {
      logger.error('[PoliciesService] Failed to record user consent in Firestore:', { uid, version, error: err?.message });
      throw err;
    }
  }

  /**
   * Fetches full audit history of all policy acceptances by the user.
   */
  async getUserConsentHistory(uid: string): Promise<UserConsentRecord[]> {
    try {
      const snap = await db
        .collection('users')
        .doc(uid)
        .collection('policy_consent_history')
        .orderBy('acceptedAt', 'desc')
        .get();

      if (snap.empty) {
        // Check if there is an accepted summary on the parent doc
        const userDoc = await db.collection('users').doc(uid).get();
        const data = userDoc.data() || {};
        const policyConsent = data.policyConsent || data.acceptedPolicies;
        if (policyConsent?.version) {
          return [
            {
              userId: uid,
              version: policyConsent.version,
              acceptedAt: policyConsent.acceptedAt || new Date().toISOString(),
              sectionsAccepted: CANONICAL_POLICY_SECTIONS.map((s) => s.id),
            },
          ];
        }
        return [];
      }

      return snap.docs.map((doc) => doc.data() as UserConsentRecord);
    } catch (err: any) {
      logger.error('[PoliciesService] Failed to fetch consent history:', { uid, error: err?.message });
      return [];
    }
  }
}

export const policiesService = new PoliciesService();
