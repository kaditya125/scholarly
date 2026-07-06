import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/AuthContext';
import { BriefingResponse } from '../../../../backend-firestore/src/types/briefing.types';

export function useBriefing() {
  const { user } = useAuth();
  const [briefing, setBriefing] = useState<BriefingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchBriefing() {
      if (!user) return;
      
      try {
        setLoading(true);
        setError(null);
        
        const token = await user.getIdToken();
        const baseURL = import.meta.env.VITE_API_URL || 'http://localhost:8080/api';
        
        // Include a slight intentional minimum delay so the "AI Thinking" animation has time to show
        const start = Date.now();
        const res = await fetch(`${baseURL}/briefing/${user.uid}/today`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        
        if (!res.ok) {
          throw new Error('Failed to fetch daily briefing');
        }
        
        const data = await res.json();
        
        const elapsed = Date.now() - start;
        if (elapsed < 1500) {
          await new Promise(r => setTimeout(r, 1500 - elapsed));
        }
        
        setBriefing(data);
      } catch (err: any) {
        console.error("Briefing error:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    
    fetchBriefing();
  }, [user]);

  return { briefing, loading, error };
}
