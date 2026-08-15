import { OfficialSourceVerificationService } from '../../src/services/exam/officialSourceVerification.service';
import { ExamMaster } from '../../src/types/exam.types';

describe('OfficialSourceVerificationService', () => {
  let service: OfficialSourceVerificationService;

  const mockSscExam: ExamMaster = {
    examId: 'SSC_CGL',
    name: 'Staff Selection Commission — Combined Graduate Level',
    shortName: 'SSC CGL',
    conductingAuthority: 'Staff Selection Commission',
    category: 'SSC',
    country: 'IN',
    aliases: ['SSC CGL', 'CGL'],
    officialDomains: ['ssc.gov.in', 'ssc.nic.in'],
    currentCycle: '2026',
    verifiedOfficialUrls: {
      authorityHome: 'https://ssc.gov.in',
    },
    status: 'ACTIVE',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    service = new OfficialSourceVerificationService();
  });

  describe('normalizeUrl', () => {
    it('normalizes http to https and lowercases hostnames', () => {
      const res = service.normalizeUrl('http://SSC.GOV.IN/notices/');
      expect(res.ok).toBe(true);
      expect(res.normalized).toBe('https://ssc.gov.in/notices/');
      expect(res.domain).toBe('ssc.gov.in');
    });

    it('strips tracking parameters and hash fragments', () => {
      const res = service.normalizeUrl('https://ssc.gov.in/apply?utm_source=telegram&utm_campaign=ad#section-1');
      expect(res.ok).toBe(true);
      expect(res.normalized).toBe('https://ssc.gov.in/apply');
    });

    it('handles bare origin without trailing slash', () => {
      const res = service.normalizeUrl('https://ssc.gov.in/');
      expect(res.ok).toBe(true);
      expect(res.normalized).toBe('https://ssc.gov.in');
    });

    it('rejects invalid URLs or unsupported protocols', () => {
      const res1 = service.normalizeUrl('ftp://ssc.gov.in/file.pdf');
      expect(res1.ok).toBe(false);

      const res2 = service.normalizeUrl('');
      expect(res2.ok).toBe(false);
    });
  });

  describe('verifyOfficialSource', () => {
    it('verifies exact whitelisted domain', () => {
      const res = service.verifyOfficialSource(mockSscExam, 'https://ssc.gov.in/notices/cgl2026.pdf');
      expect(res.isOfficial).toBe(true);
      expect(res.examId).toBe('SSC_CGL');
      expect(res.authority).toBe('Staff Selection Commission');
      expect(res.domain).toBe('ssc.gov.in');
    });

    it('verifies valid subdomains of whitelisted official domain', () => {
      const res = service.verifyOfficialSource(mockSscExam, 'https://er.ssc.gov.in/admit-card');
      expect(res.isOfficial).toBe(true);
      expect(res.domain).toBe('er.ssc.gov.in');
    });

    it('REJECTS non-official commercial or third-party educational domains', () => {
      const res = service.verifyOfficialSource(mockSscExam, 'https://exam-prep-portal.com/ssc-cgl-apply');
      expect(res.isOfficial).toBe(false);
      expect(res.rejectionReason).toContain('not in the registered official domains');
    });

    it('CRITICAL SECURITY: REJECTS other government domains not belonging to this exam', () => {
      // upsc.gov.in is a government domain, but NOT an official source for SSC CGL
      const res = service.verifyOfficialSource(mockSscExam, 'https://upsc.gov.in/apply');
      expect(res.isOfficial).toBe(false);
      expect(res.rejectionReason).toContain('not in the registered official domains list for SSC CGL');
    });

    it('CRITICAL SECURITY: REJECTS generic .gov.in or .nic.in domain not in whitelist', () => {
      const res = service.verifyOfficialSource(mockSscExam, 'https://railways.gov.in/recruitment');
      expect(res.isOfficial).toBe(false);
      expect(res.rejectionReason).toContain('not in the registered official domains');
    });
  });
});
