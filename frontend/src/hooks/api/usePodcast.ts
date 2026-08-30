import { useState, useEffect } from 'react';
import { PodcastMetadata } from '../../types';
import { api } from '../../lib/api/client';
import { db } from '../../lib/firestore';
import { doc, onSnapshot } from 'firebase/firestore';

export function usePodcast(notebookId: string, podcastId: string) {
  const [metadata, setMetadata] = useState<PodcastMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!podcastId) return;

    // Listen to real-time updates from Firestore
    const unsub = onSnapshot(
      doc(db, 'podcasts', podcastId),
      (docSnap) => {
        if (docSnap.exists()) {
          setMetadata(docSnap.data() as PodcastMetadata);
        } else {
          setMetadata(null);
        }
        setLoading(false);
      },
      (err) => {
        console.error("Firestore listen error", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsub();
  }, [podcastId]);

  const generateAudio = async () => {
    try {
      // Prefer the notebook-scoped legacy route when a notebook is available.
      // For topic / prompt / weak-topic podcasts there is no notebook, so the
      // legacy URL becomes `/notebooks//assets/:id/podcast` and 404s. In that
      // case fall back to /podcasts/generate with the same params the source
      // episode was created from — that path handles every source kind.
      if (notebookId && notebookId.trim().length > 0) {
        await api.post(`/notebooks/${notebookId}/assets/${podcastId}/podcast`);
        return;
      }
      const source = (metadata as any)?.sourceKind === 'topic' || (metadata as any)?.sourceKind === 'prompt'
        ? { kind: (metadata as any).sourceKind, prompt: metadata?.title || metadata?.description || '' }
        : { kind: 'topic' as const, topic: metadata?.title || metadata?.description || '' };
      await api.post('/podcasts/generate', {
        source,
        type: (metadata as any)?.type || 'custom',
        durationMinutes: (metadata as any)?.duration
          ? Math.max(1, Math.round(((metadata as any).duration) / 60))
          : 5,
        speakerStyle: (metadata as any)?.speakerStyle || 'teacher_student',
        language: metadata?.language || 'English',
        ...((metadata as any)?.podcastStyle ? { podcastStyle: (metadata as any).podcastStyle } : {}),
      });
    } catch (err: any) {
      throw new Error(err.response?.data?.error || err.message);
    }
  };

  return { metadata, loading, error, generateAudio };
}
