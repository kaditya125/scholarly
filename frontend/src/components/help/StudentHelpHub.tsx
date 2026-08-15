import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  Sparkles,
  Bot,
  Send,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageSquare,
  Shield,
  FileText,
  CreditCard,
  GraduationCap,
  Brain,
  Headphones,
  User,
  Plus,
  X,
  Paperclip,
  ThumbsUp,
  ThumbsDown,
  Mic,
  MicOff,
  ChevronRight,
  ArrowRight,
  HelpCircle,
  PhoneCall,
  Flame,
  LifeBuoy,
  Check,
  RotateCcw,
  ListOrdered
} from 'lucide-react';
import { useAuth } from '../../lib/AuthContext';
import { useProfile } from '../../hooks/api/useProfile';
import {
  supportApi,
  SupportTicket,
  TicketCategory,
  AuthenticatedHelpResponse,
} from '../../lib/api/support';
import { cn } from '../../lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  dataChips?: AuthenticatedHelpResponse['dataChips'];
  suggestedActions?: AuthenticatedHelpResponse['suggestedActions'];
  keyHighlights?: string[];
  solutionSteps?: string[];
  relatedQueries?: string[];
  ticketCreated?: AuthenticatedHelpResponse['ticketCreated'];
  resolvedStatus?: 'resolved' | 'unresolved';
}

const CATEGORY_CARDS = [
  { id: 'COURSE_ACCESS', label: 'My Courses & Batches', icon: GraduationCap, query: 'Which courses and batches am I currently enrolled in?' },
  { id: 'PAYMENT', label: 'Payments & Billing', icon: CreditCard, query: 'Check my recent payments, invoices and order status.' },
  { id: 'TEST', label: 'Tests & Marks Analysis', icon: FileText, query: 'How many tests have I completed and what is my average accuracy?' },
  { id: 'AI_TUTOR', label: 'AI Tutor & Studio Help', icon: Brain, query: 'How do I use the AI Tutor, Podcast Studio, and OCR scanning?' },
  { id: 'TECHNICAL', label: 'Technical Troubleshooting', icon: HelpCircle, query: 'My video lesson or audio stream is not loading properly.' },
  { id: 'GRIEVANCE', label: 'Report a Grievance', icon: Shield, query: 'I want to file a formal complaint or grievance.' },
];

export function StudentHelpHub() {
  const { user } = useAuth();
  const { profile } = useProfile();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'chat' | 'tickets'>('chat');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputQuery, setInputQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  // Tickets state
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(true);
  const [ticketStatusFilter, setTicketStatusFilter] = useState<string>('all');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replying, setReplying] = useState(false);

  // Grievance Form Modal
  const [showGrievanceModal, setShowGrievanceModal] = useState(false);
  const [grievanceCategory, setGrievanceCategory] = useState<TicketCategory>('GRIEVANCE');
  const [grievanceSubject, setGrievanceSubject] = useState('');
  const [grievanceDescription, setGrievanceDescription] = useState('');
  const [grievanceUrgent, setGrievanceUrgent] = useState(false);
  const [submittingGrievance, setSubmittingGrievance] = useState(false);
  const [grievanceSuccess, setGrievanceSuccess] = useState<SupportTicket | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const firstName = (profile as any)?.displayName?.split(' ')[0] || user?.displayName?.split(' ')[0] || 'Student';

  // Initialize Welcome Message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: 'welcome_msg',
          role: 'assistant',
          content: `Hi **${firstName}** 👋 I'm your personal Scholarly Support & Learning Assistant.\n\nI have verified access to your courses, payments, test scores, and account settings. How can I help you today?`,
          timestamp: Date.now(),
          suggestedActions: [
            { label: 'Check My Courses', action: 'VIEW_COURSE' },
            { label: 'Check Recent Payments', action: 'VIEW_ORDER' },
            { label: 'View Test Stats', action: 'VIEW_TEST' },
            { label: 'Report a Grievance', action: 'CREATE_TICKET' },
          ],
          relatedQueries: [
            'Which courses and batches am I enrolled in?',
            'How do I take a chapter-wise adaptive test?',
            'What features are included in Scholarly Pro?',
            'How does the 7-day refund policy work?'
          ]
        },
      ]);
    }
  }, [firstName]);

  // Fetch Tickets
  const fetchTickets = async () => {
    try {
      setTicketsLoading(true);
      const data = await supportApi.getTickets(ticketStatusFilter);
      setTickets(data);
    } catch (err) {
      console.error('Failed to load tickets', err);
    } finally {
      setTicketsLoading(false);
    }
  };

  useEffect(() => {
    fetchTickets();
  }, [ticketStatusFilter]);

  // Scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Send Message Handler
  const handleSendMessage = async (textToSend?: string) => {
    const text = (textToSend || inputQuery).trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = {
      id: `user_${Date.now()}`,
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputQuery('');
    setLoading(true);

    try {
      const history = messages.slice(-6).map((m) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp,
      }));

      const res = await supportApi.askStudentHelp({
        query: text,
        history,
      });

      const aiMsg: ChatMessage = {
        id: `ai_${Date.now()}`,
        role: 'assistant',
        content: res.reply,
        timestamp: Date.now(),
        dataChips: res.dataChips,
        suggestedActions: res.suggestedActions,
        keyHighlights: res.keyHighlights,
        solutionSteps: res.solutionSteps,
        relatedQueries: res.relatedQueries,
        ticketCreated: res.ticketCreated,
      };

      setMessages((prev) => [...prev, aiMsg]);
      if (res.ticketCreated) {
        fetchTickets();
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `ai_err_${Date.now()}`,
          role: 'assistant',
          content: 'I encountered an issue verifying that information right now. Please try again or click **Report a Grievance** to submit a ticket directly.',
          timestamp: Date.now(),
          suggestedActions: [{ label: 'Report a Grievance', action: 'CREATE_TICKET' }],
          relatedQueries: ['File a formal complaint', 'Check platform policies', 'Contact live support']
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  // Mark Query Resolved / Feedback
  const handleMarkResolved = async (messageId: string, isResolved: boolean) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, resolvedStatus: isResolved ? 'resolved' : 'unresolved' } : m
      )
    );

    try {
      await supportApi.submitFeedback({
        messageId,
        rating: isResolved ? 'thumbs_up' : 'thumbs_down',
        comment: isResolved ? 'Student marked query as resolved' : 'Student indicated query not resolved',
      });
    } catch (e) {
      // Non-blocking telemetry
    }

    if (!isResolved) {
      inputRef.current?.focus();
    }
  };

  // Action Button Handler
  const handleActionClick = (actionObj: { label: string; action: string; payload?: Record<string, any> }) => {
    switch (actionObj.action) {
      case 'VIEW_COURSE':
        navigate('/my-classes');
        break;
      case 'VIEW_ORDER':
        navigate('/settings');
        break;
      case 'VIEW_TEST':
        navigate('/tests');
        break;
      case 'VIEW_TICKETS':
        setActiveTab('tickets');
        break;
      case 'CREATE_TICKET':
        if (actionObj.payload?.category) {
          setGrievanceCategory(actionObj.payload.category as TicketCategory);
        }
        setShowGrievanceModal(true);
        break;
      case 'CONTACT_SUPPORT':
        setShowGrievanceModal(true);
        break;
      default:
        handleSendMessage(actionObj.label);
        break;
    }
  };

  // Voice Input (SpeechRecognition)
  const toggleVoice = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-IN';

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          setInputQuery(transcript);
          handleSendMessage(transcript);
        }
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
    }
  };

  // Submit Grievance
  const handleSubmitGrievance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!grievanceSubject.trim() || !grievanceDescription.trim()) return;

    setSubmittingGrievance(true);
    try {
      const ticket = await supportApi.createTicket({
        category: grievanceCategory,
        subject: grievanceSubject.trim(),
        description: grievanceDescription.trim(),
        priority: grievanceUrgent ? 'URGENT' : 'HIGH',
      });
      setGrievanceSuccess(ticket);
      setGrievanceSubject('');
      setGrievanceDescription('');
      fetchTickets();
    } catch (err) {
      console.error('Failed to create ticket', err);
    } finally {
      setSubmittingGrievance(false);
    }
  };

  // Add Reply to Ticket
  const handleAddReply = async () => {
    if (!selectedTicket || !replyText.trim() || replying) return;
    setReplying(true);
    try {
      const updated = await supportApi.addTicketMessage(selectedTicket.id, replyText.trim());
      setSelectedTicket(updated);
      setReplyText('');
      fetchTickets();
    } catch (err) {
      console.error('Failed to send reply', err);
    } finally {
      setReplying(false);
    }
  };

  const openTicketsCount = tickets.filter((t) => t.status === 'OPEN' || t.status === 'IN_PROGRESS').length;

  return (
    <div className="w-full h-full overflow-y-auto custom-scrollbar bg-[#fafbfc] dark:bg-[#131315] text-slate-900 dark:text-slate-100 font-sans transition-colors">
      <div className="max-w-[1240px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Top Header ────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <div className="flex items-center gap-2.5 mb-1.5">
              <div className="w-9 h-9 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20 shrink-0">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <h1 className="text-2xl sm:text-[28px] font-bold text-slate-900 dark:text-white tracking-tight">
                Help &amp; Grievance Center
              </h1>
              {openTicketsCount > 0 && (
                <span className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 text-[11px] font-bold px-2.5 py-0.5 rounded-full">
                  {openTicketsCount} Open {openTicketsCount === 1 ? 'Request' : 'Requests'}
                </span>
              )}
            </div>
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              Personalized AI Support, Account Verification &amp; Official Grievance Redressal for {firstName}
            </p>
          </div>

          {/* Tab Switcher & Report Button */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center bg-white dark:bg-[#141416] p-1 rounded-full border border-slate-200/90 dark:border-white/10 shadow-2xs">
              <button
                onClick={() => setActiveTab('chat')}
                className={cn(
                  "px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all cursor-pointer",
                  activeTab === 'chat'
                    ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                AI Assistant
              </button>
              <button
                onClick={() => setActiveTab('tickets')}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[12px] font-semibold transition-all cursor-pointer",
                  activeTab === 'tickets'
                    ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                )}
              >
                <span>My Requests</span>
                {tickets.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-slate-200 dark:bg-white/20 text-[10px] flex items-center justify-center font-bold">
                    {tickets.length}
                  </span>
                )}
              </button>
            </div>

            <button
              onClick={() => {
                setGrievanceSuccess(null);
                setShowGrievanceModal(true);
              }}
              className="flex items-center gap-1.5 px-4.5 py-2 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 rounded-full font-semibold text-[12px] hover:opacity-90 transition-all shadow-2xs cursor-pointer active:scale-98"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Submit Grievance</span>
            </button>
          </div>
        </div>

        {/* ── Main Tab Content ──────────────────────────────────── */}
        {activeTab === 'chat' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left / Center: Interactive Chat Interface */}
            <div className="lg:col-span-8 flex flex-col h-[720px] bg-white dark:bg-[#141416] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xs overflow-hidden">
              {/* Chat Header */}
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01] flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[#8ba32b]/15 dark:bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center">
                    <Bot className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-[13px] font-bold text-slate-900 dark:text-white leading-tight">
                      Scholarly Verified AI Helpdesk
                    </h3>
                    <p className="text-[11px] text-slate-400">Live verified connection to {firstName}'s student record</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Online
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 custom-scrollbar">
                {messages.map((m) => {
                  const isUser = m.role === 'user';
                  return (
                    <motion.div
                      key={m.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}
                    >
                      <div
                        className={cn(
                          'max-w-[90%] rounded-2xl p-4.5 text-[13px] leading-relaxed font-sans shadow-2xs transition-all',
                          isUser
                            ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 rounded-tr-xs'
                            : 'bg-slate-50 dark:bg-[#1c1c1f] text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-white/5 rounded-tl-xs'
                        )}
                      >
                        {/* Rich Markdown Message Content */}
                        <div className={cn(
                          "prose prose-slate dark:prose-invert max-w-none text-[13px]",
                          isUser && "prose-invert dark:text-slate-950 dark:prose-headings:text-slate-950 font-medium"
                        )}>
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h2: ({ children }) => (
                                <h2 className="text-[15px] font-bold text-slate-900 dark:text-white mt-3.5 mb-1.5 pb-1 border-b border-slate-200/60 dark:border-white/10 flex items-center gap-1.5">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-[14px] font-bold text-slate-900 dark:text-white mt-3 mb-1 flex items-center gap-1.5">
                                  {children}
                                </h3>
                              ),
                              p: ({ children }) => (
                                <p className="text-[13px] leading-[1.68] text-slate-800 dark:text-slate-200 my-1.5 font-normal">
                                  {children}
                                </p>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-bold text-slate-900 dark:text-white">
                                  {children}
                                </strong>
                              ),
                              ul: ({ children }) => (
                                <ul className="list-none space-y-1.5 my-2.5 pl-0.5">
                                  {children}
                                </ul>
                              ),
                              li: ({ children }) => (
                                <li className="relative pl-4 before:content-['•'] before:absolute before:left-0 before:text-[#8ba32b] dark:before:text-[#c8e558] before:font-bold text-[13px] leading-relaxed text-slate-800 dark:text-slate-200">
                                  {children}
                                </li>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal space-y-1.5 my-2.5 pl-5 text-[13px] leading-relaxed text-slate-800 dark:text-slate-200 font-medium">
                                  {children}
                                </ol>
                              ),
                              code: ({ children }) => (
                                <code className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-white/10 text-[12px] font-mono text-slate-900 dark:text-white">
                                  {children}
                                </code>
                              ),
                            }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>

                        {/* Live Context Data Chips */}
                        {m.dataChips && m.dataChips.length > 0 && (
                          <div className="mt-3.5 space-y-2 pt-2.5 border-t border-slate-200/60 dark:border-white/10">
                            <span className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Verified Student Records:
                            </span>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {m.dataChips.map((chip, idx) => (
                                <div
                                  key={idx}
                                  className="p-2.5 rounded-xl bg-white dark:bg-[#141416] border border-slate-200/80 dark:border-white/5 text-[11.5px] space-y-0.5 shadow-xs"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="font-bold text-slate-800 dark:text-white truncate">{chip.title}</span>
                                    {chip.status && (
                                      <span className="text-[9.5px] font-bold px-1.5 py-0.2 rounded-full bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558]">
                                        {chip.status}
                                      </span>
                                    )}
                                  </div>
                                  {chip.subtitle && <p className="text-slate-500 dark:text-slate-400">{chip.subtitle}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Ticket Created Confirmation Badge */}
                        {m.ticketCreated && (
                          <div className="mt-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-300 text-[12px] flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                              <span>Support Ticket Created: <strong>{m.ticketCreated.ticketCode}</strong></span>
                            </div>
                            <button
                              onClick={() => setActiveTab('tickets')}
                              className="text-[11px] font-bold underline hover:opacity-80 cursor-pointer"
                            >
                              Track in Requests
                            </button>
                          </div>
                        )}

                        {/* Suggested Action Buttons */}
                        {m.suggestedActions && m.suggestedActions.length > 0 && (
                          <div className="mt-3.5 flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-200/60 dark:border-white/10">
                            {m.suggestedActions.map((act, idx) => (
                              <button
                                key={idx}
                                onClick={() => handleActionClick(act)}
                                className="px-3 py-1 rounded-full text-[11.5px] font-semibold bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:border-slate-400 dark:hover:border-white/30 transition-all shadow-xs cursor-pointer active:scale-98"
                              >
                                {act.label}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* ── Query Resolution Feedback Bar (Did this resolve your query?) ── */}
                        {!isUser && m.id !== 'welcome_msg' && (
                          <div className="mt-3.5 pt-2.5 border-t border-slate-200/60 dark:border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11.5px]">
                            <span className="text-slate-500 dark:text-slate-400 font-medium">
                              Did this resolve your query?
                            </span>
                            {m.resolvedStatus === 'resolved' ? (
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-full">
                                <Check className="w-3.5 h-3.5" /> Resolved
                              </span>
                            ) : m.resolvedStatus === 'unresolved' ? (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-bold bg-amber-500/10 px-2 py-0.5 rounded-full">
                                Need more help? Type below or open a ticket.
                              </span>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => handleMarkResolved(m.id, true)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 hover:border-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-xs active:scale-98"
                                >
                                  <ThumbsUp className="w-3 h-3 text-emerald-500" />
                                  <span>Yes, resolved</span>
                                </button>
                                <button
                                  onClick={() => handleMarkResolved(m.id, false)}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 hover:border-amber-500 hover:text-amber-600 dark:hover:text-amber-400 text-slate-600 dark:text-slate-300 transition-all cursor-pointer shadow-xs active:scale-98"
                                >
                                  <ThumbsDown className="w-3 h-3 text-amber-500" />
                                  <span>Need more help</span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* ── Related Topics / Next Queries Suggestions ── */}
                      {!isUser && m.relatedQueries && m.relatedQueries.length > 0 && (
                        <div className="mt-2.5 space-y-1.5 max-w-[90%] pl-1">
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-slate-500">
                            <Sparkles className="w-3 h-3 text-[#8ba32b] dark:text-[#c8e558]" />
                            <span>Related questions you can check:</span>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {m.relatedQueries.map((rq, qIdx) => (
                              <button
                                key={qIdx}
                                onClick={() => handleSendMessage(rq)}
                                className="px-3 py-1 rounded-full text-[11.5px] font-medium bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-white/5 transition-all text-left cursor-pointer active:scale-98"
                              >
                                {rq} →
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <span className="text-[10px] text-slate-400 mt-1 px-1">
                        {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </motion.div>
                  );
                })}

                {loading && (
                  <div className="flex items-center gap-2 text-[12px] text-slate-400 dark:text-slate-500 p-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
                    <span>Analyzing your verified account state &amp; platform policies…</span>
                  </div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Chat Composer */}
              <div className="p-3 sm:p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage();
                  }}
                  className="flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={toggleVoice}
                    className={cn(
                      "w-9 h-9 rounded-full flex items-center justify-center border transition-all cursor-pointer shrink-0",
                      isListening
                        ? "bg-rose-500 text-white border-rose-600 animate-pulse"
                        : "bg-white dark:bg-[#1c1c1f] border-slate-200/90 dark:border-white/10 text-slate-500 hover:text-slate-900 dark:hover:text-white"
                    )}
                    title={isListening ? "Listening... Click to stop" : "Ask by voice"}
                  >
                    {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </button>

                  <div className="flex-1 flex items-center bg-white dark:bg-[#1c1c1f] border border-slate-200/90 dark:border-white/10 rounded-full px-4 py-2 focus-within:border-slate-400 dark:focus-within:border-white/30 shadow-xs">
                    <input
                      ref={inputRef}
                      type="text"
                      value={inputQuery}
                      onChange={(e) => setInputQuery(e.target.value)}
                      placeholder="Ask about your courses, payments, test scores, or grievances..."
                      className="w-full bg-transparent text-[13px] text-slate-800 dark:text-slate-200 placeholder:text-slate-400 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!inputQuery.trim() || loading}
                    className="w-9 h-9 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 flex items-center justify-center disabled:opacity-50 transition-all shadow-xs cursor-pointer active:scale-98 shrink-0"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            </div>

            {/* Right: Quick Topic Cards & Support Channels */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white dark:bg-[#141416] rounded-2xl border border-slate-200/90 dark:border-white/10 p-5 shadow-2xs space-y-3">
                <h3 className="text-[14px] font-bold text-slate-900 dark:text-white">Quick Help Categories</h3>
                <p className="text-[12px] text-slate-500 dark:text-slate-400">
                  Select a topic to instantly query your verified student account data:
                </p>

                <div className="grid grid-cols-1 gap-2 pt-1">
                  {CATEGORY_CARDS.map((cat) => {
                    const Icon = cat.icon;
                    return (
                      <button
                        key={cat.id}
                        onClick={() => handleSendMessage(cat.query)}
                        className="flex items-center gap-3 p-2.5 rounded-xl border border-slate-200/70 dark:border-white/5 hover:border-slate-400 dark:hover:border-white/20 bg-slate-50/50 dark:bg-white/[0.02] hover:bg-slate-50 dark:hover:bg-white/5 text-left transition-all cursor-pointer group"
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center shrink-0">
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-bold text-slate-800 dark:text-slate-200 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors truncate">
                            {cat.label}
                          </p>
                        </div>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Grievance & Escalation Banner */}
              <div className="bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent border border-amber-500/20 rounded-2xl p-5 shadow-2xs space-y-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <h4 className="text-[13.5px] font-bold text-slate-900 dark:text-white">Grievance Redressal</h4>
                </div>
                <p className="text-[12px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  Have a complaint regarding teacher misconduct, billing disputes, or platform integrity? All grievances are prioritized with guaranteed human escalation.
                </p>
                <button
                  onClick={() => {
                    setGrievanceCategory('GRIEVANCE');
                    setShowGrievanceModal(true);
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-amber-500 text-white dark:bg-amber-400 dark:text-slate-900 font-semibold text-[12px] hover:opacity-90 transition-all shadow-xs cursor-pointer text-center active:scale-98"
                >
                  File a Formal Grievance
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ── My Requests / Tickets List Tab ─────────────────── */
          <div className="space-y-6">
            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white dark:bg-[#141416] p-4 rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-2xs">
              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {['all', 'OPEN', 'IN_PROGRESS', 'WAITING_FOR_STUDENT', 'RESOLVED', 'CLOSED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setTicketStatusFilter(st)}
                    className={cn(
                      "px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition-all cursor-pointer whitespace-nowrap",
                      ticketStatusFilter === st
                        ? "bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 shadow-2xs"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5"
                    )}
                  >
                    {st === 'all' ? 'All Requests' : st.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>

              <span className="text-[12px] text-slate-400 font-medium self-end sm:self-auto">
                {tickets.length} {tickets.length === 1 ? 'ticket' : 'tickets'}
              </span>
            </div>

            {/* Tickets Grid / List */}
            {ticketsLoading ? (
              <div className="py-20 flex flex-col items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#8ba32b] dark:text-[#c8e558] mb-2" />
                <p className="text-[13px] text-slate-400">Loading your support history…</p>
              </div>
            ) : tickets.length === 0 ? (
              <div className="p-16 text-center bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl shadow-2xs space-y-3">
                <MessageSquare className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto" />
                <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">No Support Requests</h3>
                <p className="text-[13px] text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                  You do not have any open tickets or grievances right now. If you need assistance, submit a new request.
                </p>
                <button
                  onClick={() => setShowGrievanceModal(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 rounded-full text-[12px] font-semibold hover:opacity-90 transition-all shadow-xs cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Submit New Request</span>
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tickets.map((t) => {
                  const isResolved = t.status === 'RESOLVED' || t.status === 'CLOSED';
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTicket(t)}
                      className="bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200">
                              {t.ticketCode}
                            </span>
                            <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#8ba32b]/10 text-[#8ba32b] dark:bg-[#c8e558]/10 dark:text-[#c8e558]">
                              {t.category}
                            </span>
                          </div>

                          <span
                            className={cn(
                              "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                              isResolved
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                            )}
                          >
                            {t.status.replace(/_/g, ' ')}
                          </span>
                        </div>

                        <h3 className="text-[14.5px] font-bold text-slate-900 dark:text-white mb-1.5 line-clamp-1">
                          {t.subject}
                        </h3>
                        <p className="text-[12.5px] text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed mb-4">
                          {t.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-white/5 text-[11.5px] text-slate-400">
                        <span>Updated {formatDistanceToNow(new Date(t.updatedAt), { addSuffix: true })}</span>
                        <span className="flex items-center gap-1 font-semibold text-slate-700 dark:text-slate-300">
                          {t.messages?.length || 0} messages <ChevronRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Grievance / Report Problem Submission Modal ─────────── */}
      <AnimatePresence>
        {showGrievanceModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setShowGrievanceModal(false)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#141416] rounded-2xl p-6 sm:p-7 shadow-2xl border border-slate-200/90 dark:border-white/10 font-sans z-10"
            >
              <button
                onClick={() => setShowGrievanceModal(false)}
                className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>

              {grievanceSuccess ? (
                <div className="text-center py-6 space-y-4">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20">
                    <CheckCircle2 className="w-7 h-7" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-[17px] font-bold text-slate-900 dark:text-white">Request Created Successfully</h3>
                    <p className="text-[13px] text-slate-500 dark:text-slate-400">
                      Your ticket reference code is <strong>{grievanceSuccess.ticketCode}</strong>.
                    </p>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-white/[0.03] rounded-xl text-[12px] text-slate-600 dark:text-slate-300">
                    Our specialized support &amp; academic team has been notified and will respond in your ticket thread.
                  </div>
                  <button
                    onClick={() => {
                      setShowGrievanceModal(false);
                      setActiveTab('tickets');
                    }}
                    className="w-full py-2.5 rounded-full bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 font-semibold text-[13px] shadow-xs hover:opacity-90 transition-all cursor-pointer"
                  >
                    View in My Requests
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmitGrievance} className="space-y-4">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-10 h-10 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 text-[#8ba32b] dark:text-[#c8e558] flex items-center justify-center border border-[#8ba32b]/20 dark:border-[#c8e558]/20">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-[17px] font-bold text-slate-900 dark:text-white">Submit Grievance or Support Request</h2>
                      <p className="text-[12px] text-slate-500 dark:text-slate-400">Guaranteed review by verified support officers</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Category <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={grievanceCategory}
                      onChange={(e) => setGrievanceCategory(e.target.value as TicketCategory)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1c1c1f] border border-slate-200 dark:border-white/10 rounded-xl text-[13px] text-slate-900 dark:text-white outline-none cursor-pointer"
                    >
                      <option value="GRIEVANCE">General Grievance &amp; Complaint</option>
                      <option value="TEACHER">Teacher / Instructor Misconduct</option>
                      <option value="PAYMENT">Payment &amp; Billing Dispute</option>
                      <option value="COURSE_ACCESS">Course &amp; Batch Access Issue</option>
                      <option value="TECHNICAL">Technical Platform Problem</option>
                      <option value="AI_TUTOR">AI Tutor False Information</option>
                      <option value="TEST">Test Score / Assessment Discrepancy</option>
                      <option value="ACCOUNT">Account Security &amp; Data</option>
                      <option value="OTHER">Other Issues</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Subject <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={grievanceSubject}
                      onChange={(e) => setGrievanceSubject(e.target.value)}
                      placeholder="e.g., Payment deducted but batch inactive"
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[13px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/25 transition-all"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-[12px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                      Detailed Description <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      value={grievanceDescription}
                      onChange={(e) => setGrievanceDescription(e.target.value)}
                      placeholder="Please explain the issue in detail, including dates, course names, or order IDs..."
                      rows={4}
                      className="w-full px-3.5 py-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl text-[12.5px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/25 transition-all resize-none"
                      required
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="urgentCheckbox"
                      checked={grievanceUrgent}
                      onChange={(e) => setGrievanceUrgent(e.target.checked)}
                      className="accent-[#8ba32b] dark:accent-[#c8e558] w-4 h-4 rounded cursor-pointer"
                    />
                    <label htmlFor="urgentCheckbox" className="text-[12px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                      Mark as High Priority (Academic deadline / active billing issue)
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100 dark:border-white/5">
                    <button
                      type="button"
                      onClick={() => setShowGrievanceModal(false)}
                      className="px-4 py-2 rounded-full text-[12px] font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submittingGrievance || !grievanceSubject.trim() || !grievanceDescription.trim()}
                      className="flex items-center gap-1.5 px-5 py-2 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 disabled:opacity-50 text-[12px] font-semibold rounded-full shadow-xs hover:opacity-90 transition-all cursor-pointer active:scale-98"
                    >
                      {submittingGrievance ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                      <span>{submittingGrievance ? 'Submitting…' : 'Submit Request'}</span>
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── Ticket Detail & Discussion Thread Drawer / Modal ────── */}
      <AnimatePresence>
        {selectedTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-xs"
              onClick={() => setSelectedTicket(null)}
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ duration: 0.2 }}
              className="relative w-full max-w-2xl bg-white dark:bg-[#141416] rounded-2xl shadow-2xl border border-slate-200/90 dark:border-white/10 font-sans z-10 flex flex-col max-h-[85vh] overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="p-5 border-b border-slate-100 dark:border-white/5 flex items-start justify-between gap-3 bg-slate-50/50 dark:bg-white/[0.01]">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-white/10 text-slate-800 dark:text-slate-200">
                      {selectedTicket.ticketCode}
                    </span>
                    <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#8ba32b]/15 text-[#8ba32b] dark:bg-[#c8e558]/15 dark:text-[#c8e558]">
                      {selectedTicket.category}
                    </span>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                      {selectedTicket.status.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <h2 className="text-[16px] font-bold text-slate-900 dark:text-white leading-snug">
                    {selectedTicket.subject}
                  </h2>
                </div>

                <button
                  onClick={() => setSelectedTicket(null)}
                  className="p-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:hover:text-white transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Message Thread */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 custom-scrollbar">
                {/* AI Summary Banner if available */}
                {selectedTicket.aiSummary && (
                  <div className="p-3 rounded-xl bg-[#8ba32b]/10 dark:bg-[#c8e558]/10 border border-[#8ba32b]/20 dark:border-[#c8e558]/20 text-[12px] text-slate-700 dark:text-slate-200">
                    <div className="flex items-center gap-1.5 font-bold text-[#8ba32b] dark:text-[#c8e558] mb-0.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI Support Triage
                    </div>
                    {selectedTicket.aiSummary}
                  </div>
                )}

                {selectedTicket.messages && selectedTicket.messages.length > 0 ? (
                  selectedTicket.messages.map((msg) => {
                    const isSelf = msg.senderRole === 'student';
                    return (
                      <div
                        key={msg.id}
                        className={cn('flex flex-col', isSelf ? 'items-end' : 'items-start')}
                      >
                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mb-1 px-1">
                          <span className="font-bold text-slate-700 dark:text-slate-300">{msg.senderName}</span>
                          <span>•</span>
                          <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div
                          className={cn(
                            'max-w-[85%] rounded-2xl p-3.5 text-[12.5px] leading-relaxed shadow-xs',
                            isSelf
                              ? 'bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 rounded-tr-xs'
                              : 'bg-slate-50 dark:bg-[#1c1c1f] text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-white/5 rounded-tl-xs'
                          )}
                        >
                          <p className="whitespace-pre-line">{msg.content}</p>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-white/[0.02] text-[12.5px] text-slate-600 dark:text-slate-300">
                    {selectedTicket.description}
                  </div>
                )}
              </div>

              {/* Reply Box */}
              <div className="p-4 border-t border-slate-100 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.01]">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleAddReply();
                      }
                    }}
                    placeholder="Type a message or additional details for support..."
                    className="flex-1 px-3.5 py-2 bg-white dark:bg-[#1c1c1f] border border-slate-200 dark:border-white/10 rounded-full text-[12.5px] text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:border-slate-400 dark:focus:border-white/25"
                  />
                  <button
                    onClick={handleAddReply}
                    disabled={!replyText.trim() || replying}
                    className="px-4 py-2 bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900 disabled:opacity-50 rounded-full text-[12px] font-semibold transition-all shadow-xs cursor-pointer active:scale-98"
                  >
                    {replying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Send'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
