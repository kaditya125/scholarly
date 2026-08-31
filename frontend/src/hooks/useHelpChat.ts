import { useState, useCallback, useEffect, useRef } from 'react';
import { askHelpQuery, StructuredResponse } from '../lib/api/help';

export interface HelpMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  structuredResponse?: StructuredResponse;
  feedback?: 'resolved' | 'escalated' | 'helpful' | 'not_helpful';
  timestamp: number;
}

function getOrCreateSessionId(): string {
  try {
    const existing = sessionStorage.getItem('scholarly_help_session_id');
    if (existing) return existing;
    const created = `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    sessionStorage.setItem('scholarly_help_session_id', created);
    return created;
  } catch {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export function useHelpChat(initialQuery?: string) {
  const [sessionId] = useState<string>(getOrCreateSessionId);
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isEscalated, setIsEscalated] = useState<boolean>(false);
  const [latestTopicSummary, setLatestTopicSummary] = useState<string>('');
  const initialSentRef = useRef<boolean>(false);

  const sendMessage = useCallback(async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed || isLoading) return;

    setError(null);
    const userMsg: HelpMessage = {
      id: `msg_user_${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: Date.now()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    setLatestTopicSummary(trimmed);

    try {
      // Pass previous turns for conversational continuity
      const historyPayload = messages.slice(-8).map(m => ({
        role: m.role,
        content: m.content
      }));

      const res = await askHelpQuery(sessionId, trimmed, historyPayload);

      const assistantMsg: HelpMessage = {
        id: `msg_asst_${Date.now()}`,
        role: 'assistant',
        content: res.response.text || '',
        structuredResponse: res.response,
        timestamp: Date.now()
      };

      setMessages(prev => [...prev, assistantMsg]);
    } catch (err: any) {
      console.error('[useHelpChat] Error sending message:', err);
      const isRateLimit = err?.response?.status === 429;
      const errorMsgText = isRateLimit
        ? 'Too many queries from this network. Please wait a few moments before asking another question.'
        : 'Sadhya is taking longer than usual to prepare that answer. Please check your connection and try again.';

      setError(errorMsgText);
      const fallbackMsg: HelpMessage = {
        id: `msg_err_${Date.now()}`,
        role: 'assistant',
        content: errorMsgText,
        structuredResponse: {
          type: 'error',
          text: errorMsgText,
          cta: { label: 'Retry Question', url: '#retry', type: 'secondary' }
        },
        timestamp: Date.now()
      };
      setMessages(prev => [...prev, fallbackMsg]);
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, messages, isLoading]);

  const sendFeedback = useCallback((msgId: string, status: 'resolved' | 'escalated' | 'helpful' | 'not_helpful') => {
    setMessages(prev =>
      prev.map(m => (m.id === msgId ? { ...m, feedback: status } : m))
    );
    if (status === 'escalated') {
      setIsEscalated(true);
    }
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
    setIsEscalated(false);
  }, []);

  // Send initial query once if provided
  useEffect(() => {
    if (initialQuery && !initialSentRef.current) {
      initialSentRef.current = true;
      sendMessage(initialQuery);
    }
  }, [initialQuery, sendMessage]);

  const retryLastMessage = useCallback(() => {
    // Find the last user query
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser || isLoading) return;

    const queryToRetry = lastUser.content;
    // Remove the error assistant message
    setMessages(prev => {
      const copy = [...prev];
      if (copy.length > 0 && copy[copy.length - 1].role === 'assistant' && copy[copy.length - 1].structuredResponse?.type === 'error') {
        copy.pop();
      }
      if (copy.length > 0 && copy[copy.length - 1].role === 'user') {
        copy.pop();
      }
      return copy;
    });

    sendMessage(queryToRetry);
  }, [messages, isLoading, sendMessage]);

  return {
    sessionId,
    messages,
    isLoading,
    error,
    isEscalated,
    latestTopicSummary,
    sendMessage,
    retryLastMessage,
    sendFeedback,
    clearChat,
    setIsEscalated
  };
}
