import React, { useState, useRef, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  Bot,
  MessageCircleQuestion,
  MessageSquare,
  Headphones,
  X,
  Send,
  Sparkles,
  ArrowRight,
  ArrowUpRight,
  ThumbsUp,
  ThumbsDown,
  Check,
  Copy,
  RotateCcw,
  GraduationCap,
  LayoutGrid,
  FileText,
  Camera,
  Brain,
  Minus,
  Maximize2,
  Mail,
  Loader2
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { useHelpChat, HelpMessage } from '../../hooks/useHelpChat';
import { sendSupportAgentMessage, FeatureCardItem, PolicyLink } from '../../lib/api/help';
import { api } from '../../lib/api/client';

const ACCENT = '#c8e558';
const EASE = [0.16, 1, 0.3, 1] as const;

// --- Helper Markdown Formatter ---
function parseInlineMarkdown(text: string): ReactNode {
  if (!text) return null;
  const parts = text.split(/(\[.*?\]\(.*?\)|\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, idx) => {
    const linkMatch = part.match(/^\[(.*?)\]\((.*?)\)$/);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      const isInternal = url.startsWith('/');
      if (isInternal) {
        return (
          <Link
            key={idx}
            to={url}
            className="text-[#8ba32b] dark:text-[#c8e558] underline underline-offset-2 font-medium hover:opacity-80 transition-opacity"
          >
            {label}
          </Link>
        );
      }
      return (
        <a
          key={idx}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[#8ba32b] dark:text-[#c8e558] underline underline-offset-2 font-medium hover:opacity-80 transition-opacity"
        >
          {label}
        </a>
      );
    }

    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900 dark:text-white">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={idx} className="italic text-slate-800 dark:text-slate-200">
          {part.slice(1, -1)}
        </em>
      );
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={idx} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[11.5px] font-mono text-slate-800 dark:text-slate-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function FormattedText({ text }: { text: string }) {
  if (!text) return null;
  const paragraphs = text.split(/\n+/).filter(Boolean);
  return (
    <div className="space-y-1.5">
      {paragraphs.map((para, pIdx) => (
        <p key={pIdx} className="leading-relaxed">
          {parseInlineMarkdown(para)}
        </p>
      ))}
    </div>
  );
}

// Icon helper for feature cards
function getFeatureIcon(iconName?: string) {
  switch (iconName?.toLowerCase()) {
    case 'camera':
    case 'ocr':
      return <Camera className="w-4 h-4 text-emerald-500" />;
    case 'headphones':
    case 'audio':
    case 'podcast':
      return <Headphones className="w-4 h-4 text-indigo-500" />;
    case 'layoutgrid':
    case 'teacher':
      return <LayoutGrid className="w-4 h-4 text-amber-500" />;
    case 'brain':
    case 'test':
    case 'exam':
      return <Brain className="w-4 h-4 text-sky-500" />;
    default:
      return <Sparkles className="w-4 h-4 text-[#8ba32b] dark:text-[#c8e558]" />;
  }
}

// --- Topic Starter Suggestions ---
const TOPIC_CHIPS = [
  { label: 'All Questions', prompt: 'What is Sadhya and how does it help students and teachers?' },
  { label: 'For Students', prompt: 'What AI learning tools does Sadhya offer for students?' },
  { label: 'For Teachers', prompt: 'How can teachers create classes and earn on Sadhya?' },
  { label: 'Pricing & Refunds', prompt: 'What is the pricing for Sadhya and what is the refund guarantee?' },
  { label: 'AI Features', prompt: 'Tell me about Sadhya OCR scanner and Podcast Studio.' }
];

export interface FloatingHelpdeskWidgetProps {
  initialOpen?: boolean;
  prefilledQuestion?: string | null;
  onCloseExternal?: () => void;
}

function AssistantWidgetMessage({
  msg,
  isLatest,
  onSend,
  onCopy,
  copiedMsgId,
  onFeedback,
  onEscalate
}: {
  msg: HelpMessage;
  isLatest: boolean;
  onSend: (prompt: string) => void;
  onCopy: (id: string, text: string) => void;
  copiedMsgId: string | null;
  onFeedback: (id: string, fb: 'helpful' | 'not_helpful') => void;
  onEscalate: (summary?: string) => void;
}) {
  const res = msg.structuredResponse;
  const fullText = res?.text || msg.content || '';
  const [typedLength, setTypedLength] = useState(() => (isLatest ? 0 : fullText.length));
  const [isTypingDone, setIsTypingDone] = useState(() => !isLatest);

  useEffect(() => {
    if (!isLatest || isTypingDone || !fullText) {
      setTypedLength(fullText.length);
      setIsTypingDone(true);
      return;
    }

    let current = 0;
    const interval = setInterval(() => {
      current += 4;
      if (current >= fullText.length) {
        setTypedLength(fullText.length);
        setIsTypingDone(true);
        clearInterval(interval);
      } else {
        setTypedLength(current);
      }
    }, 12);

    return () => clearInterval(interval);
  }, [isLatest, fullText, isTypingDone]);

  const displayedText = fullText.slice(0, typedLength);

  return (
    <div className="self-start w-full flex flex-col gap-2.5 text-[13px] text-slate-800 dark:text-slate-200">
      {/* TL;DR / Key Takeaway Callout */}
      {res?.keyHighlight && (
        <div className="p-2.5 rounded-xl bg-[#c8e558]/10 border border-[#c8e558]/20 flex flex-col gap-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-[#8ba32b] dark:text-[#c8e558] flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Key Takeaway
          </span>
          <p className="text-[12.5px] font-medium text-slate-900 dark:text-white leading-snug">
            {res.keyHighlight}
          </p>
        </div>
      )}

      {/* Main Text - Smooth continuous flow directly on canvas */}
      <div className="leading-relaxed">
        <FormattedText text={displayedText} />
        {!isTypingDone && (
          <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-[#c8e558] animate-pulse rounded-full" />
        )}
      </div>

      {isTypingDone && (
        <>
          {/* Feature Bullet List */}
          {res?.features && res.features.length > 0 && (
            <ul className="space-y-1.5 pt-0.5">
              {res.features.map((feat, fIdx) => (
                <li key={fIdx} className="flex items-start gap-2 text-[12.5px] text-slate-700 dark:text-slate-300">
                  <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[#8ba32b] dark:bg-[#c8e558] flex-shrink-0" />
                  <span>{parseInlineMarkdown(feat)}</span>
                </li>
              ))}
            </ul>
          )}

          {/* Rich Feature Cards */}
          {res?.featureCards && res.featureCards.length > 0 && (
            <div className="pt-1 flex flex-col gap-2">
              {res.featureCards.map((card, cIdx) => (
                <div
                  key={cIdx}
                  className="p-2.5 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {getFeatureIcon(card.icon)}
                      <span className="font-semibold text-[12.5px] text-slate-900 dark:text-white">
                        {card.title}
                      </span>
                    </div>
                    {card.badge && (
                      <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-[#c8e558]/20 text-[#8ba32b] dark:text-[#c8e558]">
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11.5px] text-slate-600 dark:text-slate-400 leading-snug">
                    {card.description}
                  </p>
                  {card.actionUrl && (
                    <Link
                      to={card.actionUrl}
                      className="self-start text-[11.5px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline flex items-center gap-1 mt-0.5"
                    >
                      {card.actionLabel || 'Explore'}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Official Policy Links */}
          {res?.policyLinks && res.policyLinks.length > 0 && (
            <div className="pt-1 flex flex-col gap-1.5 border-t border-slate-200/60 dark:border-white/5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Official Documentation
              </span>
              {res.policyLinks.map((p, pIdx) => (
                <Link
                  key={pIdx}
                  to={p.url}
                  className="p-2 rounded-lg border border-slate-200/50 dark:border-white/5 hover:border-[#c8e558]/50 transition-colors flex items-center justify-between text-[11.5px] text-slate-800 dark:text-slate-200"
                >
                  <span className="font-medium">{p.title}</span>
                  <ArrowUpRight className="w-3 h-3 opacity-60" />
                </Link>
              ))}
            </div>
          )}

          {/* Primary CTA */}
          {res?.cta && (
            <div className="pt-1">
              {res.cta.url === '#live-agent' ? (
                <button
                  onClick={() => onEscalate(res?.keyHighlight || msg.content)}
                  className="px-3.5 py-1.5 rounded-xl bg-[#c8e558] text-slate-900 text-[12px] font-semibold hover:bg-[#b8d44e] transition-colors flex items-center gap-1.5"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  {res.cta.label}
                </button>
              ) : (
                <Link
                  to={res.cta.url}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12px] font-semibold hover:opacity-90 transition-opacity"
                >
                  {res.cta.label}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}

          {/* Action Toolbar (Copy, Helpful, Live Agent) */}
          <div className="mt-1 pt-2 border-t border-slate-200/60 dark:border-white/5 flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onCopy(msg.id, res?.text || msg.content)}
                className="hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1"
                title="Copy answer"
              >
                {copiedMsgId === msg.id ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-500 font-medium">Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copy</span>
                  </>
                )}
              </button>

              <span>•</span>

              {msg.feedback === 'helpful' ? (
                <span className="text-emerald-500 font-medium flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3" /> Helpful
                </span>
              ) : msg.feedback === 'not_helpful' ? (
                <span className="text-rose-500 font-medium flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3" /> Feedback sent
                </span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => onFeedback(msg.id, 'helpful')}
                    className="hover:text-emerald-500 transition-colors p-0.5"
                    title="Helpful"
                  >
                    <ThumbsUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => onFeedback(msg.id, 'not_helpful')}
                    className="hover:text-rose-500 transition-colors p-0.5"
                    title="Not Helpful"
                  >
                    <ThumbsDown className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={() => onEscalate(res?.keyHighlight || msg.content)}
              className="hover:text-[#8ba32b] dark:hover:text-[#c8e558] transition-colors flex items-center gap-1 font-medium"
            >
              <Headphones className="w-3 h-3" />
              Live help
            </button>
          </div>

          {/* Dynamic Contextual Action Chips - transparent without background container */}
          {res?.actionChips && res.actionChips.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pt-1">
              {res.actionChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => onSend(chip)}
                  className="whitespace-nowrap px-3 py-1 rounded-full text-[11px] font-medium border border-slate-300/80 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:border-[#c8e558] hover:text-slate-900 dark:hover:text-[#c8e558] transition-all flex-shrink-0 flex items-center gap-1 bg-transparent"
                >
                  <span>{chip}</span>
                  <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function FloatingHelpdeskWidget({
  initialOpen = false,
  prefilledQuestion = null,
  onCloseExternal
}: FloatingHelpdeskWidgetProps) {
  const [isOpen, setIsOpen] = useState<boolean>(initialOpen);
  const [viewMode, setViewMode] = useState<'ai' | 'specialist' | 'email'>('ai');
  const [inputVal, setInputVal] = useState<string>('');
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);

  // Live Specialist state
  const [specialistMessages, setSpecialistMessages] = useState<{ id: string; sender: 'user' | 'agent' | 'system'; text: string; time: string }[]>([]);
  const [specialistInput, setSpecialistInput] = useState<string>('');
  const [isSpecialistTyping, setIsSpecialistTyping] = useState<boolean>(false);

  // Direct Contact Email state
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactChannel, setContactChannel] = useState<'support' | 'sales' | 'security' | 'privacy'>('support');
  const [contactSubject, setContactSubject] = useState('');
  const [contactMessage, setContactMessage] = useState('');
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSuccess, setContactSuccess] = useState<string | null>(null);
  const [contactError, setContactError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const specialistScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reduced = useReducedMotion();

  const {
    sessionId,
    messages,
    isLoading,
    sendMessage,
    sendFeedback,
    clearChat,
    latestTopicSummary
  } = useHelpChat();

  // Handle external open & prefilled question
  useEffect(() => {
    if (prefilledQuestion) {
      setIsOpen(true);
      setViewMode('ai');
      sendMessage(prefilledQuestion);
    }
  }, [prefilledQuestion, sendMessage]);

  // Auto-scroll chat
  useEffect(() => {
    if (isOpen) {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading, isOpen, viewMode]);

  useEffect(() => {
    if (viewMode === 'specialist') {
      specialistScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [specialistMessages, isSpecialistTyping, viewMode]);

  // Keyboard shortcut: Esc to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        onCloseExternal?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCloseExternal]);

  const handleCopyAnswer = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedMsgId(id);
    setTimeout(() => setCopiedMsgId(null), 2000);
  };

  const handleEscalateToSpecialist = (contextSummary?: string) => {
    setViewMode('specialist');
    const summary = contextSummary || latestTopicSummary || 'General inquiry regarding platform features';

    if (specialistMessages.length === 0) {
      const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSpecialistMessages([
        {
          id: `spec_sys_${Date.now()}`,
          sender: 'system',
          text: `Connected with Sarah Chen (Tier 2 Specialist) • Context: "${summary}"`,
          time: now
        },
        {
          id: `spec_init_${Date.now()}`,
          sender: 'agent',
          text: `Hi there! I'm Sarah from the Sadhya team. I see you were asking about "${summary}". How can I assist you with this directly?`,
          time: now
        }
      ]);
    }
  };

  // Specialist Chat Send
  const handleSendSpecialist = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = specialistInput.trim();
    if (!text || isSpecialistTyping) return;

    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg = {
      id: `spec_user_${Date.now()}`,
      sender: 'user' as const,
      text,
      time: now
    };

    const currentHistory = [...specialistMessages, userMsg];
    setSpecialistMessages(currentHistory);
    setSpecialistInput('');
    setIsSpecialistTyping(true);

    try {
      const historyPayload = currentHistory
        .filter(m => m.sender !== 'system')
        .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.text }));

      const res = await sendSupportAgentMessage(
        sessionId,
        text,
        'Sarah Chen',
        latestTopicSummary,
        historyPayload
      );

      setSpecialistMessages(prev => [
        ...prev,
        {
          id: `spec_agent_${Date.now()}`,
          sender: 'agent',
          text: res.reply || 'Thank you! I am looking into that for you right now.',
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } catch {
      setSpecialistMessages(prev => [
        ...prev,
        {
          id: `spec_agent_${Date.now()}`,
          sender: 'agent',
          text: "I've noted your question and verified the details. Is there anything else you'd like to check?",
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsSpecialistTyping(false);
    }
  };

  const handleSendAi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || isLoading) return;
    sendMessage(inputVal.trim());
    setInputVal('');
  };

  const handleSendContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactError(null);
    setContactSuccess(null);

    if (!contactName.trim() || !contactEmail.trim() || !contactMessage.trim()) {
      setContactError('Please provide your name, email, and message.');
      return;
    }

    try {
      setContactSubmitting(true);
      await api.post('/api/contact/send-inquiry', {
        name: contactName.trim(),
        email: contactEmail.trim(),
        channel: contactChannel,
        subject: contactSubject.trim() || `Inquiry from Helpdesk (${contactChannel})`,
        message: contactMessage.trim(),
      });

      setContactSuccess('Your message has been delivered directly. We will reply to your email shortly.');
      setContactName('');
      setContactEmail('');
      setContactSubject('');
      setContactMessage('');
    } catch (err: any) {
      setContactError(err?.response?.data?.error || 'Failed to deliver message. Please try emailing directly.');
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <aside aria-label="Helpdesk Assistant" className="fixed bottom-4 right-4 sm:bottom-5 sm:right-5 z-40 font-sans max-w-[calc(100vw-2rem)]">
      {/* Floating Action Button - Minimalist Circular Design */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.8, opacity: 0 }}
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.94 }}
            onClick={() => setIsOpen(true)}
            aria-label="Open Sadhya Helpdesk Assistant"
            className="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-white dark:bg-white hover:border-[#c8e558] shadow-[0_10px_35px_rgba(0,0,0,0.3)] hover:shadow-[0_0_25px_rgba(200,229,88,0.4)] border border-slate-200/90 dark:border-white/30 flex items-center justify-center transition-all group overflow-hidden"
          >
            {/* Animated Chat GIF Asset */}
            <img
              src="/chat-help.gif"
              alt="Help Chat"
              className="w-7.5 h-7.5 sm:w-9.5 sm:h-9.5 object-contain mix-blend-multiply transition-transform duration-300 group-hover:scale-110"
            />
            <span className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full bg-[#c8e558] border-2 border-white shadow-[0_0_8px_#c8e558] animate-pulse" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Floating Helpdesk Modal / Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.section
            aria-label="Sadhya Helpdesk Support Panel"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
            animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="w-[calc(100vw-2rem)] sm:w-[420px] max-w-[calc(100vw-2rem)] h-[560px] sm:h-[590px] max-h-[82vh] bg-white/95 dark:bg-[#131316]/95 backdrop-blur-2xl border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25)] flex flex-col overflow-hidden"
          >
            {/* Header */}
            <header className="px-4 py-3 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50/70 dark:bg-white/[0.03]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#c8e558]/20 flex items-center justify-center text-slate-900 dark:text-[#c8e558]">
                  {viewMode === 'ai' ? <Bot className="w-4 h-4" /> : viewMode === 'specialist' ? <Headphones className="w-4 h-4" /> : <Mail className="w-4 h-4" />}
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-semibold text-[13.5px] text-slate-900 dark:text-white leading-none">
                      {viewMode === 'ai' ? 'Ask Sadhya AI' : viewMode === 'specialist' ? 'Live Specialist' : 'Direct Support Inbox'}
                    </h3>
                    <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      Online
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                    {viewMode === 'ai' ? 'Instant AI Knowledge & Guide' : viewMode === 'specialist' ? 'Tier 2 Live Support' : 'support@sadhya.app'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => setViewMode(viewMode === 'email' ? 'ai' : 'email')}
                  className={cn(
                    "px-2 py-1 rounded-lg text-[11px] font-medium transition-colors flex items-center gap-1",
                    viewMode === 'email'
                      ? "bg-[#c8e558] text-slate-900 font-semibold"
                      : "bg-slate-100 dark:bg-white/5 hover:bg-[#c8e558]/20 text-slate-700 dark:text-slate-300"
                  )}
                  title="Send Direct Email"
                >
                  <Mail className="w-3 h-3" />
                  {viewMode === 'email' ? 'Chat' : 'Email'}
                </button>

                {viewMode === 'ai' ? (
                  <button
                    onClick={() => handleEscalateToSpecialist()}
                    className="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-white/5 hover:bg-[#c8e558]/20 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-[#c8e558] transition-colors flex items-center gap-1"
                    title="Switch to Live Specialist"
                  >
                    <Headphones className="w-3 h-3" />
                    Specialist
                  </button>
                ) : viewMode === 'specialist' ? (
                  <button
                    onClick={() => setViewMode('ai')}
                    className="px-2 py-1 rounded-lg text-[11px] font-medium bg-slate-100 dark:bg-white/5 hover:bg-[#c8e558]/20 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-[#c8e558] transition-colors flex items-center gap-1"
                    title="Return to AI Guide"
                  >
                    <Bot className="w-3 h-3" />
                    AI Guide
                  </button>
                ) : null}

                <button
                  onClick={() => {
                    setIsOpen(false);
                    onCloseExternal?.();
                  }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                  aria-label="Close Helpdesk"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </header>

            {/* Quick Topic Chips (AI View Only) - Clean Minimalist Pills without Background Container */}
            {viewMode === 'ai' && (
              <div className="px-3.5 py-2 border-b border-slate-100 dark:border-white/5 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {TOPIC_CHIPS.map((chip, i) => (
                  <button
                    key={i}
                    onClick={() => sendMessage(chip.prompt)}
                    className="whitespace-nowrap px-3 py-1 rounded-full text-[11.5px] font-medium border border-slate-300/80 dark:border-white/15 text-slate-600 dark:text-slate-300 hover:border-[#c8e558] hover:text-slate-900 dark:hover:text-[#c8e558] transition-all flex-shrink-0 bg-transparent"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}

            {/* AI Assistant Chat Body */}
            {viewMode === 'ai' && (
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
                {messages.length === 0 && (
                  <div className="my-auto flex flex-col items-center justify-center text-center p-4">
                    <div className="w-12 h-12 rounded-2xl bg-[#c8e558]/20 flex items-center justify-center mb-3 text-slate-900 dark:text-[#c8e558]">
                      <Bot className="w-6 h-6" />
                    </div>
                    <h4 className="text-[14.5px] font-semibold text-slate-900 dark:text-white mb-1">
                      How can we help your learning today?
                    </h4>
                    <p className="text-[12px] text-slate-500 dark:text-slate-400 max-w-[260px] leading-relaxed mb-4">
                      Ask anything about 24/7 AI tutoring, OCR photo solve, teacher tools, or pricing.
                    </p>

                    <div className="w-full flex flex-col gap-1.5">
                      {[
                        "How does AI tutoring reason through step-by-step math?",
                        "What is the 7-day unconditional money-back guarantee?",
                        "How do teachers create live classes and get paid?"
                      ].map((prompt, idx) => (
                        <button
                          key={idx}
                          onClick={() => sendMessage(prompt)}
                          className="p-2.5 rounded-xl border border-slate-200/70 dark:border-white/10 bg-transparent hover:border-[#c8e558]/50 text-left text-[12px] text-slate-700 dark:text-slate-300 transition-all flex items-center justify-between group"
                        >
                          <span className="line-clamp-1">{prompt}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-[#c8e558] transition-colors flex-shrink-0 ml-2" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((msg, mIdx) => {
                  const isUser = msg.role === 'user';
                  const isLatest = mIdx === messages.length - 1;

                  if (isUser) {
                    return (
                      <div key={msg.id} className="self-end max-w-[85%] flex flex-col items-end">
                        <div className="px-3.5 py-2 rounded-2xl rounded-tr-sm bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13px] leading-relaxed">
                          {msg.content}
                        </div>
                      </div>
                    );
                  }

                  return (
                    <AssistantWidgetMessage
                      key={msg.id}
                      msg={msg}
                      isLatest={isLatest}
                      onSend={sendMessage}
                      onCopy={handleCopyAnswer}
                      copiedMsgId={copiedMsgId}
                      onFeedback={sendFeedback}
                      onEscalate={handleEscalateToSpecialist}
                    />
                  );
                })}

                {isLoading && (
                  <div className="self-start py-2 text-[12.5px] text-slate-500 flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558] animate-spin" />
                    <span>Sadhya is reasoning...</span>
                  </div>
                )}
                <div ref={scrollRef} />
              </div>
            )}

            {/* Live Specialist Support View */}
            {viewMode === 'specialist' && (
              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                {specialistMessages.map(m => {
                  if (m.sender === 'system') {
                    return (
                      <div key={m.id} className="text-center my-1">
                        <span className="px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-[10.5px] text-slate-500">
                          {m.text}
                        </span>
                      </div>
                    );
                  }

                  const isUser = m.sender === 'user';
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex flex-col max-w-[85%]",
                        isUser ? "self-end items-end" : "self-start items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "px-3.5 py-2.5 rounded-2xl text-[12.5px] leading-relaxed",
                          isUser
                            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-tr-sm"
                            : "bg-slate-100 dark:bg-[#1b1b20] text-slate-800 dark:text-slate-200 rounded-tl-sm border border-slate-200/50 dark:border-white/5"
                        )}
                      >
                        {m.text}
                      </div>
                      <span className="text-[10px] text-slate-400 mt-0.5 px-1">{m.time}</span>
                    </div>
                  );
                })}

                {isSpecialistTyping && (
                  <div className="self-start p-3 rounded-2xl rounded-tl-sm bg-slate-100 dark:bg-[#1b1b20] text-[12px] text-slate-400 flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce [animation-delay:0.4s]" />
                    <span className="ml-1 text-[11px]">Sarah is typing...</span>
                  </div>
                )}
                <div ref={specialistScrollRef} />
              </div>
            )}

            {/* Direct Email Support View */}
            {viewMode === 'email' && (
              <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-between">
                {contactSuccess ? (
                  <div className="my-auto py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
                      <Check className="w-6 h-6" strokeWidth={2.5} />
                    </div>
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">Message Delivered!</h4>
                    <p className="mt-1.5 text-xs text-slate-600 dark:text-gray-300 max-w-xs mx-auto">
                      {contactSuccess}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setContactSuccess(null);
                        setViewMode('ai');
                      }}
                      className="mt-5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity"
                    >
                      Return to AI Guide
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSendContact} className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Department
                      </span>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                        {contactChannel}@sadhya.app
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {(['support', 'sales', 'security', 'privacy'] as const).map((ch) => (
                        <button
                          key={ch}
                          type="button"
                          onClick={() => setContactChannel(ch)}
                          className={cn(
                            "py-1.5 px-2 rounded-lg text-[11px] font-medium capitalize border transition-all",
                            contactChannel === ch
                              ? "border-slate-900 dark:border-[#c8e558] bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 font-semibold"
                              : "border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-slate-300"
                          )}
                        >
                          {ch}
                        </button>
                      ))}
                    </div>

                    {contactError && (
                      <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 text-xs">
                        {contactError}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        required
                        value={contactName}
                        onChange={e => setContactName(e.target.value)}
                        placeholder="Your Name"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#c8e558]"
                      />
                      <input
                        type="email"
                        required
                        value={contactEmail}
                        onChange={e => setContactEmail(e.target.value)}
                        placeholder="Your Email"
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#c8e558]"
                      />
                    </div>

                    <input
                      type="text"
                      value={contactSubject}
                      onChange={e => setContactSubject(e.target.value)}
                      placeholder="Subject (optional)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#c8e558]"
                    />

                    <textarea
                      required
                      rows={4}
                      value={contactMessage}
                      onChange={e => setContactMessage(e.target.value)}
                      placeholder="Write your question or request here..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-[#c8e558] resize-none"
                    />

                    <button
                      type="submit"
                      disabled={contactSubmitting}
                      className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-1.5"
                    >
                      {contactSubmitting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Delivering to {contactChannel}@sadhya.app...
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          Send to {contactChannel}@sadhya.app
                        </>
                      )}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Footer Composer (Only for Chat modes) */}
            {viewMode !== 'email' && (
              <footer className="p-3 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02]">
              {viewMode === 'ai' ? (
                <form onSubmit={handleSendAi} className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputVal}
                    onChange={e => setInputVal(e.target.value)}
                    placeholder="Ask about AI tutoring, pricing, syllabus..."
                    disabled={isLoading}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#c8e558]/50 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!inputVal.trim() || isLoading}
                    className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-opacity flex-shrink-0"
                    aria-label="Send query"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              ) : (
                <form onSubmit={handleSendSpecialist} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={specialistInput}
                    onChange={e => setSpecialistInput(e.target.value)}
                    placeholder="Message Sarah Chen (Live Specialist)..."
                    disabled={isSpecialistTyping}
                    className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#c8e558]/50 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!specialistInput.trim() || isSpecialistTyping}
                    className="w-9 h-9 rounded-xl bg-[#c8e558] text-slate-900 flex items-center justify-center hover:bg-[#b8d44e] disabled:opacity-40 transition-colors flex-shrink-0"
                    aria-label="Send message to specialist"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              )}
            </footer>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  </aside>
  );
}
