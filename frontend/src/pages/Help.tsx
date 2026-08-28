import { useState, useRef, useEffect, ReactNode } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { 
  ArrowRight, MessageCircleQuestion, GraduationCap, 
  Bot, LayoutGrid, Settings, ArrowUp, Loader2, RotateCcw,
  Headphones, CheckCircle2, ThumbsUp, ThumbsDown, X, Send,
  ShieldCheck, CircleDot, Sparkles, FileText, ArrowUpRight,
  Copy, Check, Camera, Brain
} from 'lucide-react';
import SiteHeader from '../components/landing/SiteHeader';
import { cn } from '../lib/utils';
import { Link, useSearchParams } from 'react-router-dom';
import { askHelpQuery, sendSupportAgentMessage, StructuredResponse } from '../lib/api/help';
import { useAuth } from '../lib/AuthContext';
import { StudentHelpHub } from '../components/help/StudentHelpHub';
import { AppLayout } from '../components/Layout';

// --- Constants ---
const ACCENT = '#c8e558';
const EASE = [0.16, 1, 0.3, 1] as const;

// --- Animation Components ---
function Stagger({ children, className, gap = 0.05 }: { children: ReactNode; className?: string; gap?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

function Item({ children, className, y = 10 }: { children: ReactNode; className?: string; y?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
      }}
    >
      {children}
    </motion.div>
  );
}

// --- Types ---
type MessageRole = 'user' | 'assistant';
interface Message {
  id: string;
  role: MessageRole;
  content: string;
  structuredResponse?: StructuredResponse;
  feedback?: 'resolved' | 'escalated';
}

interface SupportChatMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  content: string;
  time: string;
}

// --- Mock Data ---
const SUGGESTED_QUESTIONS = [
  "What is the Launch Celebration offer on Pro?",
  "How does AI tutoring work?",
  "Who is the founder of Sadhya?",
  "What is included in the Free plan vs Pro?",
  "How do I use the Podcast Studio & OCR?"
];

const EXPLORE_TOPICS = [
  {
    title: "Launch Offer & Pricing",
    icon: Sparkles,
    desc: "60% Off Pro & lifetime rate lock",
    prompt: "Tell me about the Sadhya 1.0 Launch Celebration offer, pricing plans, and Pro features."
  },
  {
    title: "For Students",
    icon: GraduationCap,
    desc: "Explore learning tools and features",
    prompt: "What learning features does Sadhya offer for students?"
  },
  {
    title: "AI Features & Studios",
    icon: Bot,
    desc: "RAG, OCR & Podcast Studio",
    prompt: "Tell me about Sadhya's AI features, OCR, and Podcast Studio."
  },
  {
    title: "For Teachers",
    icon: LayoutGrid,
    desc: "Classes, analytics & earnings",
    prompt: "How can teachers create classes and earn on Sadhya?"
  },
  {
    // The assistant can already answer this from its knowledge base; the card is here so
    // someone who never thinks to ask still finds out who is behind the product.
    title: "Who Built Sadhya",
    icon: MessageCircleQuestion,
    desc: "The founder and why it exists",
    prompt: "Who is the founder of Sadhya, and why did they build it?"
  }
];

function parseInlineMarkdown(text: string): ReactNode {
  if (!text) return null;
  // Match [Link Text](url), **bold**, *italic*, `code`
  const parts = text.split(/(\[.*?\]\(.*?\)|\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, idx) => {
    // Markdown link [Label](url)
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
        <code key={idx} className="px-1 py-0.5 rounded bg-slate-100 dark:bg-white/10 text-[12px] font-mono text-slate-800 dark:text-slate-200">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

function FormattedText({ text, inline = false }: { text: string; inline?: boolean }) {
  if (!text) return null;

  if (inline) {
    return <>{parseInlineMarkdown(text)}</>;
  }

  // Split into paragraphs by newlines
  const paragraphs = text.split(/\n+/).filter(Boolean);

  return (
    <div className="space-y-2">
      {paragraphs.map((para, pIdx) => (
        <p key={pIdx} className="leading-[1.68]">
          {parseInlineMarkdown(para)}
        </p>
      ))}
    </div>
  );
}

function AssistantMessageView({
  msg,
  isLatest,
  onSend,
  onFeedback,
  onOpenLiveAgent,
  reduced
}: {
  msg: Message;
  isLatest: boolean;
  onSend: (text: string) => void;
  onFeedback: (msgId: string, status: 'resolved' | 'escalated') => void;
  onOpenLiveAgent: () => void;
  reduced: boolean | null;
}) {
  const fullText = msg.structuredResponse?.text || '';
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
      current += 3;
      if (current >= fullText.length) {
        setTypedLength(fullText.length);
        setIsTypingDone(true);
        clearInterval(interval);
      } else {
        setTypedLength(current);
      }
    }, 14);

    return () => clearInterval(interval);
  }, [isLatest, fullText, isTypingDone]);

  const displayedText = fullText.slice(0, typedLength);

  return (
    <div className="flex flex-col gap-4 w-full">
      {fullText && (
        <div className="text-[13.5px] sm:text-[14px] text-slate-700 dark:text-slate-300">
          {msg.structuredResponse?.keyHighlight && (
            <div className="mb-3 p-3 rounded-xl bg-[#c8e558]/15 border border-[#c8e558]/30 flex flex-col gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#8ba32b] dark:text-[#c8e558] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" /> Key Takeaway
              </span>
              <p className="text-[13px] font-medium text-slate-900 dark:text-white leading-snug">
                {msg.structuredResponse.keyHighlight}
              </p>
            </div>
          )}
          <FormattedText text={displayedText} />
          {!isTypingDone && (
            <span className="inline-block w-1.5 h-3.5 ml-1 align-middle bg-[#c8e558] animate-pulse rounded-full" />
          )}
        </div>
      )}

      {isTypingDone && (
        <motion.div
          initial={reduced ? false : { opacity: 0, y: 6 }}
          animate={reduced ? false : { opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="flex flex-col gap-4 w-full"
        >
          {msg.structuredResponse?.features && msg.structuredResponse.features.length > 0 && (
            <ul className="space-y-2">
              {msg.structuredResponse.features.map((feat, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[13px] sm:text-[13.5px] text-slate-600 dark:text-slate-300">
                  <div className="mt-[5px] w-[14px] h-[14px] rounded-full bg-[#c8e558]/20 flex items-center justify-center flex-shrink-0">
                    <div className="w-1 h-1 rounded-full bg-[#8ba32b] dark:bg-[#c8e558]" />
                  </div>
                  <span className="leading-relaxed">
                    <FormattedText text={feat} inline />
                  </span>
                </li>
              ))}
            </ul>
          )}

          {msg.structuredResponse?.featureCards && msg.structuredResponse.featureCards.length > 0 && (
            <div className="pt-2 grid sm:grid-cols-2 gap-2.5">
              {msg.structuredResponse.featureCards.map((card, i) => (
                <div
                  key={i}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-semibold text-[13px] text-slate-900 dark:text-white">
                        {card.title}
                      </span>
                      {card.badge && (
                        <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-[#c8e558]/20 text-[#8ba32b] dark:text-[#c8e558]">
                          {card.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] text-slate-600 dark:text-slate-400 leading-snug">
                      {card.description}
                    </p>
                  </div>
                  {card.actionUrl && (
                    <Link
                      to={card.actionUrl}
                      className="self-start text-[12px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline flex items-center gap-1 mt-1"
                    >
                      {card.actionLabel || 'Explore Feature'}
                      <ArrowRight className="w-3 h-3" />
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          {msg.structuredResponse?.cta && (
            <div className="pt-1">
              {msg.structuredResponse.cta.url === '#live-agent' ? (
                <button
                  onClick={onOpenLiveAgent}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] sm:text-[13px] font-medium tracking-normal bg-[#c8e558] hover:bg-[#b5d341] text-slate-900 shadow-sm transition-all active:scale-[0.98]"
                >
                  <Headphones className="w-3.5 h-3.5" />
                  {msg.structuredResponse.cta.label}
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              ) : msg.structuredResponse.cta.url.startsWith('http') ? (
                <a
                  href={msg.structuredResponse.cta.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] sm:text-[13px] font-medium tracking-normal transition-all active:scale-[0.98]",
                    msg.structuredResponse.cta.type === 'primary' 
                      ? "bg-[#c8e558] hover:bg-[#b5d341] text-slate-900 shadow-sm"
                      : "bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-900 dark:text-white"
                  )}
                >
                  {msg.structuredResponse.cta.label}
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              ) : (
                <Link 
                  to={msg.structuredResponse.cta.url}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[12.5px] sm:text-[13px] font-medium tracking-normal transition-all active:scale-[0.98]",
                    msg.structuredResponse.cta.type === 'primary' 
                      ? "bg-[#c8e558] hover:bg-[#b5d341] text-slate-900 shadow-sm"
                      : "bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/20 text-slate-900 dark:text-white"
                  )}
                >
                  {msg.structuredResponse.cta.label}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
            </div>
          )}

          {msg.structuredResponse?.policyLinks && msg.structuredResponse.policyLinks.length > 0 && (
            <div className="pt-2 flex flex-col gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                <FileText className="w-3 h-3 text-[#8ba32b] dark:text-[#c8e558]" />
                Official Documentation & Policies
              </p>
              <div className="flex flex-col gap-1.5">
                {msg.structuredResponse.policyLinks.map((p, i) => (
                  <Link
                    key={i}
                    to={p.url}
                    className="p-2.5 sm:p-3 rounded-xl border border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.03] hover:bg-slate-100/90 dark:hover:bg-white/[0.07] hover:border-slate-300 dark:hover:border-white/20 transition-all flex items-center justify-between group"
                  >
                    <div className="flex flex-col pr-2">
                      <span className="text-[12.5px] sm:text-[13px] font-semibold text-slate-900 dark:text-white group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors flex items-center gap-1.5">
                        {p.title}
                        <ArrowUpRight className="w-3 h-3 opacity-60 group-hover:opacity-100 transition-opacity" />
                      </span>
                      {p.description && (
                        <span className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                          {p.description}
                        </span>
                      )}
                    </div>
                    <div className="w-6 h-6 rounded-full bg-white dark:bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-[#c8e558]/20 transition-colors">
                      <ArrowRight className="w-3 h-3 text-slate-400 group-hover:text-slate-900 dark:group-hover:text-[#c8e558] transition-colors" />
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Interactive Resolution & Action Toolbar */}
          <div className="mt-1 pt-3 border-t border-slate-100 dark:border-white/10 flex flex-wrap items-center justify-between gap-2.5">
            {msg.feedback === 'resolved' ? (
              <div className="flex items-center gap-1.5 text-[12px] text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Query marked resolved! Happy learning.
              </div>
            ) : msg.feedback === 'escalated' ? (
              <div className="flex items-center gap-1.5 text-[12px] text-indigo-600 dark:text-indigo-400 font-medium">
                <Headphones className="w-3.5 h-3.5" />
                Connecting you to our live helpdesk specialist on the right...
              </div>
            ) : (
              <>
                <span className="text-[12px] text-slate-500 dark:text-slate-400 font-medium">
                  Did this resolve your query?
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(msg.structuredResponse?.text || msg.content);
                      onFeedback(msg.id, 'resolved');
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-slate-100 dark:bg-white/5 hover:bg-slate-200 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-1"
                    title="Copy Answer"
                  >
                    <Copy className="w-3 h-3" />
                    Copy
                  </button>
                  <button
                    onClick={() => onFeedback(msg.id, 'resolved')}
                    className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-slate-100 dark:bg-white/5 hover:bg-emerald-500/10 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-1"
                  >
                    <ThumbsUp className="w-3 h-3" />
                    Yes, resolved
                  </button>
                  <button
                    onClick={() => {
                      onFeedback(msg.id, 'escalated');
                      onOpenLiveAgent();
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11.5px] font-medium bg-slate-100 dark:bg-white/5 hover:bg-[#c8e558]/20 hover:text-slate-900 dark:hover:text-[#c8e558] text-slate-600 dark:text-slate-300 transition-colors flex items-center gap-1"
                  >
                    <Headphones className="w-3 h-3" />
                    No, talk to live agent
                  </button>
                </div>
              </>
            )}
          </div>

          {msg.structuredResponse?.actionChips && msg.structuredResponse.actionChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {msg.structuredResponse.actionChips.map((chip, idx) => (
                <button
                  key={idx}
                  onClick={() => onSend(chip)}
                  className="px-3 py-1.5 rounded-full text-[12px] font-medium border border-slate-300/80 dark:border-white/15 text-slate-700 dark:text-slate-300 hover:border-[#c8e558] hover:text-slate-900 dark:hover:text-[#c8e558] transition-all flex items-center gap-1 bg-transparent"
                >
                  <span>{chip}</span>
                  <ArrowRight className="w-3 h-3 opacity-60" />
                </button>
              ))}
            </div>
          )}

          {msg.structuredResponse?.relatedQuestions && msg.structuredResponse.relatedQuestions.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400 dark:text-slate-500 mb-2">
                Related
              </p>
              <div className="flex flex-col gap-1.5">
                {msg.structuredResponse.relatedQuestions.map((q, i) => (
                  <button 
                    key={i}
                    onClick={() => onSend(q)}
                    className="text-left text-[12.5px] sm:text-[13px] font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white flex items-center gap-2 group w-fit transition-colors py-0.5"
                  >
                    <div className="w-4 h-4 rounded-full bg-slate-100 dark:bg-white/5 flex items-center justify-center flex-shrink-0 group-hover:bg-[#c8e558]/20 transition-colors">
                      <ArrowRight className="w-2.5 h-2.5 opacity-60 group-hover:opacity-100 group-hover:text-slate-900 dark:group-hover:text-[#c8e558] transition-all" />
                    </div>
                    <span>{q}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// --- Live Helpdesk Drawer Component ---
function LiveHelpdeskDrawer({
  isOpen,
  onClose,
  sessionId,
  contextSummary
}: {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  contextSummary: string;
}) {
  const [stage, setStage] = useState<'connecting' | 'active' | 'resolved'>('connecting');
  const [supportMessages, setSupportMessages] = useState<SupportChatMessage[]>([]);
  const [agentInput, setAgentInput] = useState('');
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const agentInfo = {
    name: 'Sarah Chen',
    title: 'Senior Support Specialist',
    department: 'Sadhya Helpdesk Tier 2'
  };

  // Connect flow
  useEffect(() => {
    if (!isOpen) return;

    // Reset when opening
    setStage('connecting');
    setSupportMessages([]);

    const timer = setTimeout(() => {
      setStage('active');
      const welcomeTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      setSupportMessages([
        {
          id: 'sys-1',
          sender: 'system',
          content: 'You are now connected with a live Sadhya support specialist.',
          time: welcomeTime
        },
        {
          id: 'agent-1',
          sender: 'agent',
          content: `Hi there! My name is Sarah from Sadhya Helpdesk. I've reviewed your previous questions on the platform. How can I help resolve your concern today?`,
          time: welcomeTime
        }
      ]);
    }, 2200);

    return () => clearTimeout(timer);
  }, [isOpen]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [supportMessages, isAgentTyping]);

  const handleSendAgentMessage = async () => {
    if (!agentInput.trim() || isAgentTyping) return;

    const userText = agentInput.trim();
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const userMsg: SupportChatMessage = {
      id: Date.now().toString(),
      sender: 'user',
      content: userText,
      time: now
    };

    const currentHistory = [...supportMessages, userMsg];
    setSupportMessages(currentHistory);
    setAgentInput('');
    setIsAgentTyping(true);

    try {
      const historyPayload = currentHistory
        .filter(m => m.sender !== 'system')
        .map(m => ({ role: m.sender === 'user' ? 'user' : 'assistant', content: m.content }));

      const res = await sendSupportAgentMessage(
        sessionId,
        userText,
        agentInfo.name,
        contextSummary,
        historyPayload
      );

      const agentReply: SupportChatMessage = {
        id: (Date.now() + 1).toString(),
        sender: 'agent',
        content: res.reply || `Thank you for the update. I am checking our systems for you right now.`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setSupportMessages(prev => [...prev, agentReply]);
    } catch (e) {
      console.error('Failed to communicate with support agent:', e);
      setSupportMessages(prev => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          sender: 'agent',
          content: `I've noted that down and verified your request. Let me know if you need any additional help!`,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
      ]);
    } finally {
      setIsAgentTyping(false);
    }
  };

  const handleResolveChat = () => {
    setStage('resolved');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="fixed inset-y-0 right-0 z-50 w-full sm:w-[420px] md:w-[440px] bg-white/95 dark:bg-[#121214]/95 backdrop-blur-2xl border-l border-slate-200/90 dark:border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.15)] flex flex-col"
        >
          {/* Header */}
          <div className="px-4.5 py-3.5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-[#161619]/50">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-9 h-9 rounded-full bg-[#c8e558]/20 flex items-center justify-center font-semibold text-[13px] text-slate-900 dark:text-white">
                  SC
                </div>
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#121214]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-semibold text-[13.5px] text-slate-900 dark:text-white leading-none">
                    {agentInfo.name}
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    Live
                  </span>
                </div>
                <p className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {agentInfo.title}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
                title="Close Support Window"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
            {stage === 'connecting' && (
              <div className="my-auto flex flex-col items-center justify-center text-center p-6">
                <div className="relative mb-5">
                  <div className="w-16 h-16 rounded-full bg-[#c8e558]/20 flex items-center justify-center">
                    <Headphones className="w-8 h-8 text-slate-900 dark:text-[#c8e558] animate-bounce" />
                  </div>
                  <span className="absolute inset-0 rounded-full border-2 border-[#c8e558] animate-ping opacity-30" />
                </div>
                <h4 className="text-[15px] font-semibold text-slate-900 dark:text-white mb-1.5">
                  Connecting with Live Helpdesk
                </h4>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400 max-w-[260px] leading-relaxed mb-4">
                  Assigning the next available senior specialist to your session...
                </p>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  <CircleDot className="w-3 h-3 text-[#c8e558] animate-pulse" />
                  Est. wait time: &lt; 30 seconds
                </div>
              </div>
            )}

            {stage === 'active' && (
              <>
                {supportMessages.map(msg => {
                  if (msg.sender === 'system') {
                    return (
                      <div key={msg.id} className="my-1.5 text-center">
                        <span className="inline-block px-3 py-1 rounded-full bg-slate-100 dark:bg-white/5 text-[11px] text-slate-500 dark:text-slate-400">
                          {msg.content}
                        </span>
                      </div>
                    );
                  }

                  const isUser = msg.sender === 'user';
                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex flex-col max-w-[85%]",
                        isUser ? "self-end items-end" : "self-start items-start"
                      )}
                    >
                      <div
                        className={cn(
                          "px-3.5 py-2.5 rounded-[16px] text-[13px] leading-relaxed",
                          isUser
                            ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-tr-[2px]"
                            : "bg-slate-100 dark:bg-[#1e1e24] text-slate-800 dark:text-slate-200 rounded-tl-[2px] border border-slate-200/50 dark:border-white/5"
                        )}
                      >
                        <FormattedText text={msg.content} />
                      </div>
                      <span className="text-[10px] text-slate-400 mt-1 px-1">
                        {msg.time}
                      </span>
                    </div>
                  );
                })}

                {isAgentTyping && (
                  <div className="self-start flex items-center gap-2 px-3 py-2 rounded-[14px] bg-slate-100 dark:bg-[#1e1e24] text-[12px] text-slate-500 dark:text-slate-400">
                    <Loader2 className="w-3 h-3 animate-spin text-[#c8e558]" />
                    {agentInfo.name} is typing...
                  </div>
                )}
                <div ref={scrollRef} className="h-2" />
              </>
            )}

            {stage === 'resolved' && (
              <div className="my-auto flex flex-col items-center justify-center text-center p-6">
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-4">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h4 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-1">
                  Session Marked Resolved
                </h4>
                <p className="text-[12.5px] text-slate-500 dark:text-slate-400 max-w-[260px] leading-relaxed mb-6">
                  Thank you for chatting with Sadhya Helpdesk Support! Your inquiry has been closed.
                </p>
                <button
                  onClick={onClose}
                  className="px-5 py-2 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[12.5px] font-medium hover:opacity-90 transition-opacity"
                >
                  Close Helpdesk Window
                </button>
              </div>
            )}
          </div>

          {/* Footer Input */}
          {stage === 'active' && (
            <div className="p-3 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-[#161619]/50 flex flex-col gap-2">
              <div className="flex items-center justify-between px-1">
                <span className="text-[10.5px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3 text-emerald-500" />
                  Verified Sadhya Helpdesk Session
                </span>
                <button
                  onClick={handleResolveChat}
                  className="text-[11px] font-medium text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
                >
                  Mark as Resolved
                </button>
              </div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  value={agentInput}
                  onChange={(e) => setAgentInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendAgentMessage()}
                  placeholder={`Reply to ${agentInfo.name}...`}
                  className="w-full bg-white dark:bg-[#1a1a1e] border border-slate-200 dark:border-white/10 rounded-full px-4 py-2.5 pr-11 text-[13px] outline-none focus:border-slate-400 dark:focus:border-[#c8e558]/50 text-slate-900 dark:text-white placeholder:text-slate-400"
                />
                <button
                  onClick={handleSendAgentMessage}
                  disabled={!agentInput.trim() || isAgentTyping}
                  className="absolute right-1.5 w-7 h-7 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center disabled:opacity-20 hover:scale-105 active:scale-95 transition-all"
                >
                  <Send className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// --- Public Visitor Page Component ---
function PublicHelpView() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).substring(7));
  const [isLiveDrawerOpen, setIsLiveDrawerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const initialHandled = useRef(false);
  const reduced = useReducedMotion();

  // Auto-grow textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [query]);

  // Scroll to bottom on new message
  useEffect(() => {
    if (messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isTyping]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleSend = async (text: string) => {
    if (!text.trim() || isTyping) return;
    
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text.trim() };
    const currentMessages = [...messages, userMsg];
    setMessages(currentMessages);
    setQuery('');
    setIsTyping(true);

    const historyPayload = messages.map(m => ({
      role: m.role,
      content: m.role === 'user' ? m.content : (m.structuredResponse?.text || m.content)
    }));

    try {
      const response = await askHelpQuery(sessionId, text.trim(), historyPayload);
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        structuredResponse: response.response
      };
      setMessages([...currentMessages, assistantMsg]);
    } catch (e) {
      console.error("Failed to fetch help:", e);
      setMessages([...currentMessages, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '',
        structuredResponse: {
          type: 'error',
          text: 'Something went wrong connecting to Sadhya. Please try again later.'
        }
      }]);
    } finally {
      setIsTyping(false);
    }
  };

  useEffect(() => {
    const qParam = searchParams.get('q');
    if (qParam && !initialHandled.current) {
      initialHandled.current = true;
      handleSend(qParam);
    }
  }, [searchParams]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(query);
    }
  };

  const handleReset = () => {
    setMessages([]);
    setQuery('');
  };

  const handleFeedback = (msgId: string, status: 'resolved' | 'escalated') => {
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, feedback: status } : m));
  };

  const isDiscovery = messages.length === 0;
  const contextSummary = messages.map(m => `${m.role}: ${m.content || m.structuredResponse?.text || ''}`).join('\n');

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0c0c0e] text-slate-900 dark:text-white flex flex-col font-sans transition-colors duration-300">
      <SiteHeader />

      <div className="flex-1 flex flex-col relative w-full overflow-hidden">
        {/* Main Content Area */}
        <main className={cn(
          "flex-1 max-w-[760px] w-full mx-auto px-4 sm:px-6 flex flex-col transition-all duration-300",
          isLiveDrawerOpen ? "lg:mr-[460px] lg:max-w-[660px]" : ""
        )}>
          {/* Top Control Bar */}
          <div className="h-14 flex items-center justify-between shrink-0">
            {!isDiscovery ? (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-[12px] font-medium text-slate-400 dark:text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors group"
              >
                <RotateCcw className="w-3.5 h-3.5 transition-transform group-hover:-rotate-45" />
                <span>Start over</span>
              </button>
            ) : <div />}

            <button
              onClick={() => setIsLiveDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11.5px] font-medium bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm active:scale-95"
            >
              <Headphones className="w-3 h-3 text-[#c8e558]" />
              <span>Live Helpdesk Agent</span>
            </button>
          </div>

          <div className="flex-1 flex flex-col justify-center">
          <AnimatePresence mode="wait">
            {isDiscovery && (
              <motion.div 
                key="discovery"
                initial={reduced ? undefined : { opacity: 0, y: 10 }}
                animate={reduced ? undefined : { opacity: 1, y: 0 }}
                exit={reduced ? undefined : { opacity: 0, y: -10 }}
                transition={{ duration: 0.35, ease: EASE }}
                className="flex flex-col items-center justify-center my-auto py-4 sm:py-8"
              >
                <div className="w-12 h-12 rounded-[14px] bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center mb-4">
                  <MessageCircleQuestion className="w-5 h-5 text-slate-700 dark:text-slate-300" />
                </div>
                <h1 className="text-[30px] sm:text-[36px] font-semibold tracking-[-0.03em] mb-2 text-center leading-[1.12]">
                  Ask Sadhya
                </h1>
                <p className="text-[14px] sm:text-[14.5px] text-slate-500 dark:text-slate-400 text-center max-w-[420px] mb-6 leading-relaxed">
                  Curious about how Sadhya works? Ask anything about the platform, learning, teaching, AI, or connect with our support team.
                </p>

                <div className="w-full">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400 dark:text-slate-500 mb-3 text-center">
                    Try asking
                  </p>
                  <Stagger className="flex flex-wrap justify-center gap-2 mb-7">
                    {SUGGESTED_QUESTIONS.map(q => (
                      <Item key={q}>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSend(q)}
                          className="px-3.5 py-1.5 rounded-full border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] hover:border-slate-300 dark:hover:border-white/20 hover:shadow-sm text-[12.5px] sm:text-[13px] font-medium text-slate-700 dark:text-slate-200 transition-colors"
                        >
                          {q}
                        </motion.button>
                      </Item>
                    ))}
                  </Stagger>
                </div>

                <div className="w-full">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate-400 dark:text-slate-500 mb-3 text-center">
                    Explore Sadhya
                  </p>
                  <Stagger className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-3.5">
                    {EXPLORE_TOPICS.map(topic => (
                      <Item key={topic.title}>
                        <motion.button
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleSend(topic.prompt)}
                          className="w-full p-4 sm:p-4.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#141416] hover:border-slate-300 dark:hover:border-white/20 hover:shadow-sm text-left transition-colors group flex flex-col"
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center mb-3 bg-slate-100 dark:bg-white/5 group-hover:bg-[#c8e558]/20 transition-colors">
                            <topic.icon className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-white transition-colors" />
                          </div>
                          <h4 className="font-semibold text-[13.5px] text-slate-900 dark:text-white mb-1 group-hover:text-[#c8e558] transition-colors">
                            {topic.title}
                          </h4>
                          <span className="text-[12px] text-slate-500 dark:text-slate-400 leading-snug">
                            {topic.desc}
                          </span>
                        </motion.button>
                      </Item>
                    ))}
                  </Stagger>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {!isDiscovery && (
            <div className="flex-1 flex flex-col gap-6 sm:gap-8 pb-8 pt-2">
              {messages.map((msg, index) => {
                const isLatest = index === messages.length - 1;
                return (
                  <motion.div 
                    key={msg.id}
                    initial={reduced ? false : { opacity: 0, y: 6 }}
                    animate={reduced ? false : { opacity: 1, y: 0 }}
                    className={cn(
                      "flex flex-col",
                      msg.role === 'user' ? "self-end items-end max-w-[80%] sm:max-w-[68%]" : "self-start items-start w-full"
                    )}
                  >
                    {msg.role === 'user' && (
                      <div className="w-fit inline-block px-3.5 py-1.5 sm:px-4 sm:py-2 rounded-2xl rounded-tr-[4px] bg-slate-900 dark:bg-[#1a1a1e] text-white dark:text-slate-100 border border-slate-800/80 dark:border-white/[0.08] text-[12.5px] sm:text-[13px] leading-relaxed shadow-[0_2px_8px_rgba(0,0,0,0.05)] dark:shadow-[0_2px_8px_rgba(0,0,0,0.2)] font-normal tracking-normal">
                        {msg.content}
                      </div>
                    )}

                    {msg.role === 'assistant' && msg.structuredResponse && (
                      <AssistantMessageView 
                        msg={msg}
                        isLatest={isLatest}
                        onSend={handleSend}
                        onFeedback={handleFeedback}
                        onOpenLiveAgent={() => setIsLiveDrawerOpen(true)}
                        reduced={reduced}
                      />
                    )}
                  </motion.div>
                );
              })}

              {isTyping && (
                <motion.div 
                  initial={reduced ? false : { opacity: 0 }} 
                  animate={reduced ? false : { opacity: 1 }} 
                  className="self-start flex items-center gap-2.5 text-slate-500 dark:text-slate-400 text-[13px]"
                >
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#c8e558]" />
                  Sadhya is thinking...
                </motion.div>
              )}
              
              <div ref={bottomRef} className="h-4 shrink-0" />
            </div>
          )}
          </div>

          {/* The input box inline inside main, below all content */}
          <div className="w-full shrink-0 pt-3 sm:pt-6 pb-2.5 sm:pb-4">
            <div className="relative rounded-[22px] bg-slate-50/80 dark:bg-[#141416]/80 backdrop-blur-xl border border-slate-200/90 dark:border-white/[0.08] shadow-[0_4px_24px_rgba(0,0,0,0.03)] dark:shadow-[0_4px_24px_rgba(0,0,0,0.25)] focus-within:border-slate-400/80 dark:focus-within:border-[#c8e558]/40 focus-within:shadow-[0_6px_30px_rgba(0,0,0,0.06)] dark:focus-within:shadow-[0_6px_30px_rgba(200,229,88,0.08)] transition-all duration-200 overflow-hidden flex items-end">
              <textarea
                ref={textareaRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isTyping}
                placeholder="Ask anything about Sadhya or ask for live helpdesk..."
                className="w-full bg-transparent resize-none outline-none text-[13px] sm:text-[13.5px] p-3 sm:p-3.5 pl-4 sm:pl-4.5 pr-11 sm:pr-12 max-h-[120px] disabled:opacity-50 placeholder:text-slate-400 dark:placeholder:text-slate-500 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] leading-relaxed text-slate-900 dark:text-white"
                rows={1}
              />
              <button
                onClick={() => handleSend(query)}
                disabled={!query.trim() || isTyping}
                className="absolute right-2 sm:right-2.5 bottom-2 sm:bottom-2 w-7.5 h-7.5 sm:w-8 sm:h-8 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 flex items-center justify-center disabled:opacity-20 disabled:hover:scale-100 hover:scale-105 active:scale-95 transition-all shadow-sm"
              >
                <ArrowUp className="w-3.5 h-3.5" strokeWidth={2.5} />
              </button>
            </div>
            <div className="mt-2 text-center">
              <span className="text-[10px] sm:text-[10.5px] font-medium tracking-[0.06em] text-slate-400/80 dark:text-slate-500 uppercase">
                Sadhya AI can make mistakes. Verify important information.
              </span>
            </div>
          </div>
        </main>
      </div>

      {/* Right Pane Live Helpdesk Drawer */}
      <LiveHelpdeskDrawer 
        isOpen={isLiveDrawerOpen}
        onClose={() => setIsLiveDrawerOpen(false)}
        sessionId={sessionId}
        contextSummary={contextSummary}
      />
    </div>
  );
}

// --- Public Visitor Help Page (Standalone Landing Experience) ---
export default function Help() {
  return <PublicHelpView />;
}
