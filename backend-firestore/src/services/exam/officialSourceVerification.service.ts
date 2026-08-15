/**
 * Official Source Verification Service
 * Validates, normalizes, and verifies that candidate URLs belong to official examination authorities.
 *
 * CRITICAL PRINCIPLE:
 * A URL is NOT verified simply because it ends in .gov.in or .nic.in.
 * It MUST explicitly match the whitelisted officialDomains registered for the specific examination.
 */

import { ExamMaster } from '../../types/exam.types';

export interface VerificationResult {
  isOfficial: boolean;
  normalizedUrl: string;
  domain: string;
  authority: string;
  examId: string;
  rejectionReason?: string;
}

export class OfficialSourceVerificationService {
  /**
   * Safely normalizes a candidate URL:
   * - Validates standard HTTP/HTTPS protocol
   * - Lowercases protocol and hostname
   * - Removes tracking query parameters (utm_*, ref, etc.)
   * - Removes URL hash fragments
   * - Trims trailing slashes on bare paths
   */
  public normalizeUrl(rawUrl: string): { ok: boolean; normalized?: string; domain?: string; error?: string } {
    if (!rawUrl || typeof rawUrl !== 'string') {
      return { ok: false, error: 'URL must be a non-empty string' };
    }

    const trimmed = rawUrl.trim();
    let parsed: URL;

    try {
      let urlToParse = trimmed;
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) {
        urlToParse = `https://${trimmed}`;
      }
      parsed = new URL(urlToParse);
    } catch (e: any) {
      return { ok: false, error: `Invalid URL format: ${e.message}` };
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: `Unsupported protocol: ${parsed.protocol}. Only http and https are allowed.` };
    }

    // Force https unless localhost/test
    if (parsed.hostname !== 'localhost' && !parsed.hostname.startsWith('127.')) {
      parsed.protocol = 'https:';
    }

    // Lowercase hostname and remove leading/trailing spaces
    const hostname = parsed.hostname.toLowerCase();
    parsed.hostname = hostname;

    // Clean tracking query params
    const trackingParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref'];
    for (const p of trackingParams) {
      parsed.searchParams.delete(p);
    }

    // Strip hash fragments
    parsed.hash = '';

    // Remove trailing slash on bare origin
    let normalized = parsed.toString();
    if (parsed.pathname === '/' && !parsed.search) {
      normalized = parsed.origin;
    }

    return {
      ok: true,
      normalized,
      domain: hostname,
    };
  }

  /**
   * Checks if a given hostname matches or is a valid subdomain of an official domain pattern.
   * e.g. "ssc.gov.in" matches "ssc.gov.in" or "regional.ssc.gov.in"
   * But "fake-ssc.gov.in" does NOT match "ssc.gov.in"
   */
  public isDomainAuthorized(candidateDomain: string, whitelistedDomains: string[]): boolean {
    const normCandidate = candidateDomain.toLowerCase().replace(/^www\./, '');

    return whitelistedDomains.some((rawWhitelisted) => {
      const normWhitelisted = rawWhitelisted.toLowerCase().replace(/^www\./, '');
      if (normCandidate === normWhitelisted) {
        return true;
      }
      // Check subdomain: candidate ends with ".whitelisted"
      if (normCandidate.endsWith(`.${normWhitelisted}`)) {
        return true;
      }
      return false;
    });
  }

  /**
   * Verifies an official source URL against an ExamMaster configuration.
   */
  public verifyOfficialSource(exam: ExamMaster, rawUrl: string): VerificationResult {
    const norm = this.normalizeUrl(rawUrl);
    if (!norm.ok || !norm.normalized || !norm.domain) {
      return {
        isOfficial: false,
        normalizedUrl: rawUrl,
        domain: '',
        authority: exam.conductingAuthority,
        examId: exam.examId,
        rejectionReason: norm.error || 'URL normalization failed',
      };
    }

    // 1. Check if exam has whitelisted official domains
    if (!exam.officialDomains || exam.officialDomains.length === 0) {
      return {
        isOfficial: false,
        normalizedUrl: norm.normalized,
        domain: norm.domain,
        authority: exam.conductingAuthority,
        examId: exam.examId,
        rejectionReason: `Exam '${exam.examId}' has no registered official domains in master registry`,
      };
    }

    // 2. Strict Domain Authorization Check
    const authorized = this.isDomainAuthorized(norm.domain, exam.officialDomains);

    if (!authorized) {
      return {
        isOfficial: false,
        normalizedUrl: norm.normalized,
        domain: norm.domain,
        authority: exam.conductingAuthority,
        examId: exam.examId,
        rejectionReason: `Domain '${norm.domain}' is not in the registered official domains list for ${exam.shortName} (${exam.officialDomains.join(', ')})`,
      };
    }

    return {
      isOfficial: true,
      normalizedUrl: norm.normalized,
      domain: norm.domain,
      authority: exam.conductingAuthority,
      examId: exam.examId,
    };
  }
}

export const officialSourceVerificationService = new OfficialSourceVerificationService();
