import {
  CURRENT_POLICY_SET_VERSION,
  CANONICAL_POLICY_SECTIONS,
  policiesService,
} from '../../src/services/policies/policies.service';

describe('PoliciesService', () => {
  it('should return current policy set matching active version 2026.08', () => {
    const policySet = policiesService.getCurrentPolicySet();
    expect(policySet).toBeDefined();
    expect(policySet.version).toBe(CURRENT_POLICY_SET_VERSION);
    expect(policySet.version).toBe('2026.08');
    expect(policySet.sections.length).toBe(CANONICAL_POLICY_SECTIONS.length);
    expect(policySet.sections.length).toBeGreaterThanOrEqual(13);
  });

  it('should contain all required Sadhya-specific policy sections', () => {
    const sectionIds = CANONICAL_POLICY_SECTIONS.map((s) => s.id);
    expect(sectionIds).toContain('terms');
    expect(sectionIds).toContain('privacy');
    expect(sectionIds).toContain('ai-usage');
    expect(sectionIds).toContain('ai-questions');
    expect(sectionIds).toContain('personalization');
    expect(sectionIds).toContain('community');
    expect(sectionIds).toContain('peer-chat');
    expect(sectionIds).toContain('student-teacher');
    expect(sectionIds).toContain('academic-integrity');
    expect(sectionIds).toContain('user-content');
    expect(sectionIds).toContain('intellectual-property');
    expect(sectionIds).toContain('safety-reporting');
    expect(sectionIds).toContain('payments');
  });

  it('should return historical snapshot when valid version requested', () => {
    const history = policiesService.getPolicyVersion('2026.08');
    expect(history).not.toBeNull();
    expect(history?.version).toBe('2026.08');
  });

  it('should return null for non-existent policy version', () => {
    const nonExistent = policiesService.getPolicyVersion('1999.01');
    expect(nonExistent).toBeNull();
  });
});
