import { useState, useEffect } from 'react';
import { PodcastMetadata } from '../../types';
import { api } from '../../lib/api/client';
import { db } from '../../lib/firebase';
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
      await api.post(`/notebooks/${notebookId}/assets/${podcastId}/podcast`);
    } catch (err: any) {
      throw new Error(err.response?.data?.error || err.message);
    }
  };

  return { metadata, loading, error, generateAudio };
}
