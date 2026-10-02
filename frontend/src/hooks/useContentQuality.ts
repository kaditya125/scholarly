/**
 * useContentQuality — quality report for one document on the Content Pipeline page.
 *
 * GET  /notebooks/:id/sources/:sourceId/quality
 * POST /notebooks/:id/sources/:sourceId/revalidate
 * (backend: routes/exploration.routes.ts → ExplorationController, notebook-ownership checked).
 *
 * Uses the shared api client, which attaches the Firebase ID token. It previously sent a
 * `localStorage.token` that the backend never issued, and on ANY failure rendered a hard-coded
 * "Healthy, 92%" report — a fabricated result shown as real. A failure is now reported as one.
 */
import { useState, useEffect, useCallback } from 'react';
import type { ContentQualityReport } from '../types/pipeline.types';
import { api } from '../lib/api/client';

const messageOf = (err: any, fallback: string) => err?.response?.data?.error || err?.message || fallback;

export function useContentQuality(collectionId?: string, documentId?: string) {
  const [report, setReport] = useState<ContentQualityReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchQualityReport = useCallback(async () => {
    if (!collectionId || !documentId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get<ContentQualityReport>(`/notebooks/${collectionId}/sources/${documentId}/quality`);
      setReport(data);
    } catch (err: any) {
      setReport(null);
      setError(messageOf(err, 'Could not load the quality report.'));
    } finally {
      setLoading(false);
    }
  }, [collectionId, documentId]);

  const revalidate = useCallback(async (strictMode = false) => {
    if (!collectionId || !documentId) return;
    setRevalidating(true);
    setError(null);
    try {
      const { data } = await api.post<{ report?: ContentQualityReport }>(
        `/notebooks/${collectionId}/sources/${documentId}/revalidate`,
        { strictMode },
      );
      if (data?.report) setReport(data.report);
    } catch (err: any) {
      setError(messageOf(err, 'Revalidation failed.'));
    } finally {
      setRevalidating(false);
    }
  }, [collectionId, documentId]);

  useEffect(() => {
    fetchQualityReport();
  }, [fetchQualityReport]);

  return { report, loading, revalidating, error, refresh: fetchQualityReport, revalidate };
}
