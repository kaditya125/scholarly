/// <reference types="vite/client" />
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  ChevronDown, 
  Sparkles, 
  Paperclip, 
  Mic,
  Bot,
  Check,
  RefreshCw,
  Plus,
  Loader2,
  Clock,
  Trash2,
  Settings,
  Wand2,
  X,
  Lightbulb,
  BookOpen,
  Globe,
  Calculator,
  FileText,
  ArrowRight,
  ArrowUp,
  Image as ImageIcon,
  User,
  Mail,
  MessageSquareText,
  SlidersHorizontal,
  Notebook,
  CornerUpLeft,
  ChevronRight,
  ImagePlus,
  AudioLines,
  Telescope,
  Lock,
  Share2,
  Sun,
  Moon,
  Award,
  Layers,
  CheckSquare,
  BrainCircuit,
  BarChart2,
  Map,
  Square,
  Pencil,
  ArrowDown,
  AlertTriangle
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import AssistantReply, { Rating } from '../components/chat/AssistantReply';
import { ShareModal } from '../components/ShareModal';
import { api } from '../lib/api/client';
import { useAuth } from '../lib/AuthContext';
import { useTheme } from '../lib/ThemeContext';
import { useWorkflowStream } from '../hooks/ai/useWorkflowStream';
import 'katex/dist/katex.min.css';
import { OpenAI, Groq, Nvidia } from '@lobehub/icons';

// Markdown and diagram rendering now live in components/chat/MarkdownMessage,
// which AssistantReply uses. The local copies that used to sit here were removed with
// that refactor — MarkdownMessage's version handles math/mhchem more gracefully.

const TYPE_CONFIG: Record<string, { title: string, subtitle: string, firstMsg: string }> = {
  'chat': { title: 'What are you studying?', subtitle: 'Paste data and ask for analysis, or just start chatting.', firstMsg: 'I can help you study from your notes, PDFs, videos, recordings, flashcards, and pages; explain concepts; quiz you; make study guides, summaries, flashcards, worksheets, slides, or diagrams; and help analyze images of assignments or screenshots.\n\nIf you want, send me a file or just tell me the topic and I\'ll jump in.' },
  'study-guide': { title: 'Create a Study Guide', subtitle: 'Paste your syllabus, notes, or topic to generate a comprehensive study guide.', firstMsg: 'I will help you create a structured, detailed study guide. Please provide the topic, notes, or syllabus you want to cover!' },
  'podcast': { title: 'Generate AI Podcast', subtitle: 'Turn any topic or document into an engaging audio discussion.', firstMsg: 'I can convert your study materials into an engaging podcast script with multiple speakers. What topic or document should we focus on?' },
  'slides': { title: 'Generate AI Slides', subtitle: 'Instantly create presentation slides from your notes.', firstMsg: 'I will generate structured presentation slides with bullet points and speaker notes. Just give me the topic or paste your notes!' },
  'worksheet': { title: 'Create a Worksheet', subtitle: 'Generate custom worksheets, fill-in-the-blanks, and exercises.', firstMsg: 'Let\'s create a custom worksheet. What grade level and subject is this for, and what specific topics should I include? I can generate multiple choice, fill in the blanks, or short answer questions.' },
  'infographic': { title: 'Design an Infographic', subtitle: 'Describe a concept and I\'ll structure it as an infographic layout.', firstMsg: 'I can help you structure information into an infographic framework. What concept or process would you like to visualize?' },
  'mindmap': { title: 'Generate Mind Map', subtitle: 'Break down complex topics into an organized mind map structure.', firstMsg: 'I will generate a structured mind map outline (as a nested Markdown outline) to help you visualize any topic. What should be the central node of our mind map?' },
  'image': { title: 'Generate AI Image', subtitle: 'Describe the educational illustration or diagram you need.', firstMsg: 'Describe the educational diagram, illustration, or visual aid you need, and I\'ll provide a detailed prompt or generate the layout for you.' },
  'page': { title: 'Draft a Page', subtitle: 'Write an essay, report, or document collaboratively.', firstMsg: 'I can help you draft a page, essay, or structured report. Let me know the topic, word count, and any specific outlines you want to follow.' },
  'meeting-notes': { title: 'Process Meeting Notes', subtitle: 'Paste your raw notes or transcript for a clean summary.', firstMsg: 'Paste your raw meeting notes, lecture transcript, or bullet points, and I will organize them into a clean summary with key takeaways and action items.' },
};

/** Hard cap on a single composer message. The counter below the textarea reflects this. */
const MAX_CHARS = 4000;

/**
 * Retrieval scope for the next message.
 *  - 'auto'     → behaviour-preserving. Sends the page's own topicType, so the backend's
 *                 existing heuristic (WorkflowEngine: mode==='RESEARCH' || /news|latest|.../)
 *                 decides whether to hit the web. This is the default on purpose.
 *  - 'web'      → sends topicType 'RESEARCH', which turns on Tavily web retrieval AND
 *                 switches the system prompt to DEEP RESEARCH mode (config/prompts.ts).
 *  - 'notebook' → sends notebookId, so RetrievalService scopes RAG to that one notebook.
 *
 * To make "All Web" the default (matching the reference mock literally), change
 * DEFAULT_SCOPE to { kind: 'web' } — but note that makes every message a research-mode
 * message with a web search attached.
 */
type Scope =
  | { kind: 'auto' }
  | { kind: 'web' }
  | { kind: 'notebook'; id: string; title: string };

const DEFAULT_SCOPE: Scope = { kind: 'auto' };

const scopeLabel = (s: Scope) =>
  s.kind === 'web' ? 'All Web' : s.kind === 'notebook' ? s.title : 'Auto';

/**
 * Pool the four suggestion cards are drawn from. "Refresh Prompts" reshuffles and
 * takes the next four, so the empty state stays varied without a network call.
 */
const PROMPT_POOL: { icon: any; text: string; prompt: string }[] = [
  { icon: User, text: 'Write a to-do list for a personal project or task', prompt: 'Write a to-do list for a personal study project I can finish this week.' },
  { icon: Mail, text: 'Generate an email or reply to a job offer', prompt: 'Generate a polite email replying to a job offer, asking for two more days to decide.' },
  { icon: MessageSquareText, text: 'Summarise this article or text for me in one paragraph', prompt: 'Summarise the text I paste next into one clear paragraph.' },
  { icon: SlidersHorizontal, text: 'How does AI work in a technical capacity', prompt: 'Explain how AI works in a technical capacity, starting from the fundamentals.' },
  { icon: BookOpen, text: 'Create a 7-day study plan for a topic I choose', prompt: 'Create a 7-day study plan for mastering organic chemistry basics.' },
  { icon: Lightbulb, text: 'Quiz me with 5 multiple choice questions', prompt: 'Give me a 5-question multiple choice quiz on World War II, with an answer key.' },
  { icon: Calculator, text: 'Solve a problem step by step with full working', prompt: 'Help me solve a complex calculus integration problem step-by-step.' },
  { icon: Globe, text: 'Explain a difficult concept in simple language', prompt: 'Explain the theory of relativity like I am 10 years old.' },
  { icon: FileText, text: 'Turn my rough notes into clean revision notes', prompt: 'Turn the rough notes I paste next into clean, high-yield revision notes.' },
  { icon: Sparkles, text: 'Compare two ideas and show the key differences', prompt: 'Compare mitosis and meiosis and show the key differences in a table.' },
  { icon: Wand2, text: 'Build a mnemonic to help me memorise something', prompt: 'Build a memorable mnemonic to help me memorise the first 20 elements of the periodic table.' },
  { icon: Clock, text: 'Plan my revision for an exam that is close', prompt: 'Plan my revision for an exam that is two weeks away, three hours a day.' },
];

/**
 * Same pool shape, teacher-framed: preparing to teach rather than preparing to be tested.
 * Reuses the exact icon set above so this doesn't pull in new imports for a second pool.
 */
const TEACHER_PROMPT_POOL: { icon: any; text: string; prompt: string }[] = [
  { icon: BookOpen, text: 'Draft a clear explanation for a concept I need to teach', prompt: 'Draft a clear, classroom-ready explanation of a concept I need to teach next — I\'ll tell you the topic.' },
  { icon: Lightbulb, text: 'Suggest common misconceptions students have about a topic', prompt: 'What are the most common misconceptions students have about a topic I\'m about to teach?' },
  { icon: SlidersHorizontal, text: 'Suggest a simple way to explain a tricky concept', prompt: 'Suggest a simple analogy or way to explain a concept that students usually find confusing.' },
  { icon: Wand2, text: 'Build a mnemonic I can teach my students', prompt: 'Build a memorable mnemonic I can teach my students for a topic I\'ll describe.' },
  { icon: FileText, text: 'Turn my rough notes into a clean lesson outline', prompt: 'Turn the rough notes I paste next into a clean, structured lesson outline.' },
  { icon: Sparkles, text: 'Compare two ways to teach the same topic', prompt: 'Compare two different approaches to teaching the same topic, with the trade-offs of each.' },
  { icon: Mail, text: 'Draft a message to a parent or guardian', prompt: 'Draft a polite, clear message to a parent about their child\'s progress.' },
  { icon: MessageSquareText, text: 'Summarise this article into a lesson brief', prompt: 'Summarise the text I paste next into a short brief I can use to prepare a lesson.' },
  { icon: Calculator, text: 'Work through a problem the way I\'d explain it on the board', prompt: 'Work through a problem step by step, the way I\'d explain it on the board to a class.' },
  { icon: Clock, text: 'Help me structure a class session in the time I have', prompt: 'Help me structure a class session — I\'ll tell you the topic and how much time I have.' },
];

const MODE_PROMPTS: Record<string, { icon: any; text: string; prompt: string }[]> = {
  'study-guide': [
    { icon: BookOpen, text: 'Create high-yield revision notes for Organic Chemistry', prompt: 'Create a structured, high-yield study guide for Organic Chemistry reaction mechanisms with key formulas.' },
    { icon: FileText, text: 'Generate an exam-oriented summary for Newton\'s Laws', prompt: 'Generate a comprehensive study guide covering Newton\'s Laws of Motion with derivations and practice problems.' },
    { icon: Sparkles, text: 'Build a quick reference guide for Macroeconomics', prompt: 'Build a structured study guide summarizing key Macroeconomics formulas, definitions, and graphs.' },
    { icon: Lightbulb, text: 'Summarize key articles of the Indian Constitution', prompt: 'Create a concise study guide covering the most important Fundamental Rights and Articles of the Indian Constitution.' },
  ],
  'slides': [
    { icon: Layers, text: 'Create a 6-slide presentation deck on Photosynthesis', prompt: 'Generate a 6-slide presentation outline on Photosynthesis with title, key bullet points, and speaker notes for each slide.' },
    { icon: Sparkles, text: 'Draft presentation slides on Machine Learning basics', prompt: 'Generate structured presentation slides explaining Supervised vs Unsupervised Machine Learning with examples.' },
    { icon: BookOpen, text: 'Build a slide outline on Climate Change and Solutions', prompt: 'Create a 5-slide educational presentation deck on Climate Change causes, impacts, and sustainable solutions.' },
    { icon: FileText, text: 'Generate presentation slides for Indian Monsoon dynamics', prompt: 'Generate a structured slide deck explaining the mechanism and seasonal cycle of the Indian Monsoon.' },
  ],
  'worksheet': [
    { icon: FileText, text: 'Generate a 10-question worksheet on Quadratic Equations', prompt: 'Create a printable 10-question practice worksheet on Quadratic Equations with a mix of easy, medium, and hard problems, plus complete solutions.' },
    { icon: CheckSquare, text: 'Build fill-in-the-blanks and exercises on Cell Biology', prompt: 'Generate a worksheet on Cell Structure and Function with 5 multiple-choice questions, 5 fill-in-the-blanks, and answer key.' },
    { icon: Lightbulb, text: 'Create a problem-solving drill on Kinematics', prompt: 'Create a physics practice worksheet with 6 numerical problems on 1D/2D Kinematics with step-by-step solutions.' },
    { icon: Sparkles, text: 'Design an English grammar practice exercise sheet', prompt: 'Create a practice worksheet on Active vs Passive voice and Direct/Indirect speech with 10 exercises and answers.' },
  ],
  'mindmap': [
    { icon: Map, text: 'Generate a mind map outline for Plant Kingdom classification', prompt: 'Generate a hierarchical, structured mind map outline in Markdown for Plant Kingdom classification with characteristics of each division.' },
    { icon: BrainCircuit, text: 'Map out Data Structures and Algorithms categories', prompt: 'Create a comprehensive mind map outline breaking down Linear and Non-Linear Data Structures and their common algorithms.' },
    { icon: Sparkles, text: 'Build a visual concept map for Human Digestive System', prompt: 'Generate a structured mind map outline of the Human Digestive System showing organs, enzymes, and digestion stages.' },
    { icon: FileText, text: 'Map the causes and consequences of World War I', prompt: 'Create a mind map outline detailing the immediate causes, alliances, major battles, and aftermath of World War I.' },
  ],
  'infographic': [
    { icon: BarChart2, text: 'Structure an infographic flow for the Water Cycle', prompt: 'Describe an infographic layout for the Water Cycle with 4 visual stages, key facts, and statistical callout boxes.' },
    { icon: Sparkles, text: 'Design a visual comparison of Mitochondria vs Chloroplast', prompt: 'Structure a side-by-side comparison infographic layout for Mitochondria vs Chloroplast with structural differences and functions.' },
    { icon: FileText, text: 'Create a visual process guide for DNA Replication', prompt: 'Outline a step-by-step infographic layout explaining DNA Replication with enzyme callouts and key steps.' },
    { icon: Lightbulb, text: 'Structure a summary infographic on Renewable Energy types', prompt: 'Create an infographic content plan comparing Solar, Wind, and Hydro power with pros, cons, and efficiency stats.' },
  ],
  'image': [
    { icon: ImageIcon, text: 'Describe a labeled diagram of the Human Heart', prompt: 'Provide a detailed descriptive prompt and layout for a medical educational diagram showing the 4 chambers of the Human Heart and blood flow.' },
    { icon: Sparkles, text: 'Concept illustration for Solar vs Lunar Eclipse', prompt: 'Describe an educational visual illustration showing the alignment of Sun, Earth, and Moon during Solar and Lunar eclipses.' },
    { icon: Lightbulb, text: 'Technical visual diagram for Electric Motor principle', prompt: 'Describe a clear physics textbook illustration of an AC Electric Motor with magnetic fields, armature, and commutator labeled.' },
    { icon: FileText, text: 'Educational visual chart for Periodic Trends', prompt: 'Design a visual illustration concept showing Electronegativity, Ionization Energy, and Atomic Radius trends across the Periodic Table.' },
  ],
  'meeting-notes': [
    { icon: FileText, text: 'Organize raw class notes into structured key takeaways', prompt: 'Turn the rough lecture notes I paste next into structured notes with core concepts, formulas, and action items.' },
    { icon: Sparkles, text: 'Summarize a study session into high-yield points', prompt: 'Summarize our study group discussion notes into a high-yield summary with questions to review.' },
    { icon: CheckSquare, text: 'Extract homework, test dates, and priority tasks', prompt: 'Extract all assignments, upcoming quiz dates, and key review topics from the lecture transcript I paste.' },
    { icon: Lightbulb, text: 'Create a clean meeting recap with action items', prompt: 'Structure these raw bullet points into a formal recap with decisions made, open questions, and next steps.' },
  ],
  'page': [
    { icon: FileText, text: 'Draft an academic essay on AI in Healthcare', prompt: 'Draft a well-structured academic essay on the applications and ethical considerations of Artificial Intelligence in modern Healthcare.' },
    { icon: Sparkles, text: 'Write a structured lab experiment report', prompt: 'Help me write a formal science lab report including Hypothesis, Apparatus, Procedure, Observations, and Conclusion.' },
    { icon: Lightbulb, text: 'Compose an argumentative essay with counterarguments', prompt: 'Write a persuasive argumentative essay on Renewable Energy transition with strong evidence and addressed counterpoints.' },
    { icon: BookOpen, text: 'Draft a comprehensive literature review outline', prompt: 'Draft a structured literature review outline with thematic sections, critical analysis, and research gaps.' },
  ],
};

const getPromptPoolForType = (type: string, isTeacher: boolean) => {
  if (MODE_PROMPTS[type]) return MODE_PROMPTS[type];
  return isTeacher ? TEACHER_PROMPT_POOL : PROMPT_POOL;
};

/** Four distinct prompts at random from the given pool, excluding what's currently on screen where possible. */
const pickPrompts = (pool: { icon: any; text: string; prompt: string }[], exclude: string[] = []) => {
  const fresh = pool.filter((p) => !exclude.includes(p.text));
  const source = fresh.length >= 4 ? fresh : pool;
  return [...source].sort(() => Math.random() - 0.5).slice(0, 4);
};

const GeminiIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <defs>
      <linearGradient id="gemini-grad" x1="15%" y1="15%" x2="85%" y2="85%">
        <stop offset="0%" stopColor="#F95454" />
        <stop offset="50%" stopColor="#4285F4" />
        <stop offset="100%" stopColor="#34A853" />
      </linearGradient>
    </defs>
    <path d="M12 2C12 7.523 16.477 12 22 12C16.477 12 12 16.477 12 22C12 16.477 7.523 12 2 12C7.523 12 12 7.523 12 2Z" fill="url(#gemini-grad)" />
  </svg>
);

export default function Chat() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const typeParam = searchParams.get('type') || 'chat';
  const examParam = searchParams.get('exam');
  const topicParam = searchParams.get('topic');
  const config = TYPE_CONFIG[typeParam] || TYPE_CONFIG['chat'];
  
  const { user, role } = useAuth();
  const isTeacher = role === 'teacher';
  const promptPool = isTeacher ? TEACHER_PROMPT_POOL : PROMPT_POOL;
  
  const [sessions, setSessions] = useState<any[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  const stream = useWorkflowStream();
  
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('selectedModel') || 'gemini');
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
  const [speakingIndex, setSpeakingIndex] = useState<number | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [isAttachmentDropdownOpen, setIsAttachmentDropdownOpen] = useState(false);
  const [attachmentAccept, setAttachmentAccept] = useState(".txt,.md,.csv,.json,.js,.ts,.tsx,.py,.html,.css,.pdf,.docx,.jpg,.jpeg,.png");
  const [attachments, setAttachments] = useState<{name: string, data: string, mimeType: string}[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  /*
   * Grow the composer to fit what has been typed, up to a cap.
   *
   * The textarea is `rows={1}` with `resize-none` and nothing ever changed its height,
   * so it stayed one line tall no matter how much was typed — everything past the first
   * line was scrolled out of view with no way to see it. The `max-h-[200px]` on the
   * element was inert for the same reason: nothing grew it far enough to matter.
   *
   * Keyed on `input` rather than an onChange handler so programmatic writes resize too —
   * clicking a follow-up suggestion, quoting a reply, or restoring a draft all set state
   * directly and would otherwise leave the box the wrong size.
   *
   * `height = 'auto'` first is required: scrollHeight only reports the content height
   * when the element is not already stretched to the previous value.
   */
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // ─── Empty-state prompt cards ──────────────────────────────────────────────
  const activePromptPool = getPromptPoolForType(typeParam, isTeacher);
  const [visiblePrompts, setVisiblePrompts] = useState(() => pickPrompts(activePromptPool));

  useEffect(() => {
    const pool = getPromptPoolForType(typeParam, isTeacher);
    setVisiblePrompts(pickPrompts(pool));
  }, [typeParam, isTeacher]);

  const refreshPrompts = () =>
    setVisiblePrompts((cur) => pickPrompts(activePromptPool, cur.map((p) => p.text)));

  // ─── Retrieval scope (the "All Web" pill) ──────────────────────────────────
  const [scope, setScope] = useState<Scope>(DEFAULT_SCOPE);
  const [isScopeOpen, setIsScopeOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<{ id: string; title: string }[]>([]);

  // First name for the greeting — same derivation the onboarding wizard uses.
  const firstName = (user?.displayName || '').trim().split(' ')[0] || 'there';

  // ─── Reply feedback (👍/👎) ────────────────────────────────────────────────
  // Keyed by the persisted Firestore message id. Optimistic: we paint the choice
  // immediately and roll it back only if the POST fails.
  const [ratings, setRatings] = useState<Record<string, Rating>>({});
  const handleRate = async (messageId: string, rating: Rating) => {
    if (!currentSessionId) return;
    const previous = ratings[messageId];
    setRatings((r) => ({ ...r, [messageId]: rating }));
    try {
      await api.post(`/chat/${messageId}/feedback`, {
        sessionId: currentSessionId,
        rating,
        modelUsed: selectedModel,
        learningMode: typeParam,
      });
    } catch (e) {
      console.error('Failed to submit feedback', e);
      setRatings((r) => {
        const next = { ...r };
        if (previous) next[messageId] = previous; else delete next[messageId];
        return next;
      });
    }
  };

  // Theme toggle + Share live in this page's own header now that AppLayout drops
  // its top bar on /chat — otherwise both would be unreachable here.
  const { theme, toggleTheme } = useTheme();
  const [isShareOpen, setIsShareOpen] = useState(false);

  /**
   * A finished reply waiting for its smooth reveal to catch up before it joins
   * `messages`. Keeping the live block mounted through the tail of the animation is what
   * stops the answer snapping to full text at the end. The safety timer guarantees the
   * message is never lost if the reveal stalls for any reason.
   */
  const [pendingFinal, setPendingFinal] = useState<any>(null);
  /** Mirrors pendingFinal for code that must know synchronously whether a reply is still
   *  uncommitted — see the message-id backfill in sendAIRequest. */
  const pendingFinalRef = useRef<any>(null);
  useEffect(() => { pendingFinalRef.current = pendingFinal; }, [pendingFinal]);

  const commitPending = React.useCallback(() => {
    setPendingFinal((p: any) => {
      if (p) {
        setMessages((prev) => {
          /*
           * Guard against double-commit (onRevealDone AND the 20s fallback timer can
           * both fire). It must not reject on `undefined === undefined`: when the
           * id backfill fails, the pending reply has no id, and matching it against
           * an earlier reply that also has none deleted the answer outright. Ids are
           * therefore only compared when the pending reply actually has one.
           */
          const isDuplicate = prev.some(
            (m) =>
              m.role === 'ai' &&
              ((p.id != null && m.id === p.id) || (!!p.content && m.content === p.content))
          );
          if (isDuplicate) return prev;
          return [...prev, p];
        });
      }
      return null;
    });
  }, []);
  useEffect(() => {
    if (!pendingFinal) return;
    const t = setTimeout(commitPending, 20000);
    return () => clearTimeout(t);
  }, [pendingFinal, commitPending]);

  // ─── Quoted reply ──────────────────────────────────────────────────────────
  // Selecting text inside a reply and clicking "Reply" parks the quote here; it is
  // prepended to the next message so the model knows what is being referred to.
  const [quotedText, setQuotedText] = useState<string | null>(null);

  // ─── Edit a sent message ────────────────────────────────────────────────────
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');

  // ─── Drag-and-drop attachments ──────────────────────────────────────────────
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const dragCounterRef = useRef(0);

  useEffect(() => {
    localStorage.setItem('selectedModel', selectedModel);
  }, [selectedModel]);

  const endOfMessagesRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  // Whether the view is close enough to the bottom that it's safe to auto-scroll
  // without yanking the reader away from something they scrolled up to reread.
  const [isNearBottom, setIsNearBottom] = useState(true);

  const handleMessagesScroll = () => {
    const el = messagesContainerRef.current;
    if (!el) return;
    setIsNearBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    endOfMessagesRef.current?.scrollIntoView({ behavior });
    setIsNearBottom(true);
  };

  // A new message (the student's own send, or a finished reply joining the list)
  // always scrolls into view — this is the pre-existing behaviour.
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // While a reply is actively streaming, keep following it — but only if the
  // reader hasn't scrolled up to look at something earlier; respect that instead
  // of yanking them back down on every token.
  useEffect(() => {
    if (!isNearBottom) return;
    if (!stream.isStreaming && !pendingFinal) return;
    endOfMessagesRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [stream.content, stream.reasoning, isNearBottom]);

  const handleTalk = () => {
    if (isListening) {
      if (recognitionRef.current) recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const windowAny = window as any;
    const SpeechRecognition = windowAny.SpeechRecognition || windowAny.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Your browser doesn't support Speech Recognition. Try Google Chrome or Edge.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    
    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + ' ';
        }
      }
      if (finalTranscript) {
        setInput(prev => prev + (prev.endsWith(' ') || prev.length === 0 ? '' : ' ') + finalTranscript);
      }
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    
    recognitionRef.current = recognition;
    try {
      recognition.start();
      setIsListening(true);
    } catch (e) {
      console.error("Speech recognition error:", e);
    }
  };

  const processFile = async (file: File) => {
    setIsUploadingFile(true);

    try {
      // Convert file to Base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            // Strip the data:mime/type;base64, prefix
            const b64 = reader.result.split(',')[1];
            resolve(b64);
          } else {
            reject(new Error("Failed to read file"));
          }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setAttachments(prev => [...prev, { name: file.name, mimeType: file.type || 'application/octet-stream', data: base64Data }]);
    } catch (error: any) {
      console.error("File processing error:", error);
      alert(`Error reading file: ${file.name}\nDetails: ${error.message || error}`);
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
    e.target.value = ''; // Reset input
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (!e.dataTransfer.types.includes('Files')) return;
    dragCounterRef.current += 1;
    setIsDraggingFile(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingFile(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
    const files = Array.from(e.dataTransfer.files || []);
    for (const file of files) {
      await processFile(file);
    }
  };

  // Fetch all sessions on load
  const fetchSessions = async () => {
    if (!user?.uid) return;
    try {
      const res = await api.get(`/chat/sessions?userId=${user.uid}`);
      setSessions(res.data);
    } catch (error) {
      console.error("Failed to fetch sessions", error);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [user]);

  // Notebooks power the scope picker. Failure is non-fatal — the picker simply
  // falls back to Auto / All Web without a notebook list.
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get('/notebooks');
        if (cancelled) return;
        const list = Array.isArray(res.data) ? res.data : [];
        setNotebooks(
          list.map((n: any) => ({ id: n.id, title: n.title || n.name || 'Untitled notebook' }))
        );
      } catch {
        if (!cancelled) setNotebooks([]);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.uid]);

  // If type changes from URL (from New menu), reset chat
  useEffect(() => {
    handleNewChat();
  }, [typeParam]);

  useEffect(() => {
    const handleNewChatEvent = (e: Event) => {
      handleNewChat();
    };
    window.addEventListener('new-chat', handleNewChatEvent);
    return () => window.removeEventListener('new-chat', handleNewChatEvent);
  }, []);

  const handleNewChat = () => {
    setCurrentSessionId(null);
    setMessages([]);
    setInput('');
  };

  // Handle incoming global prompt from Dashboard
  useEffect(() => {
    const initialPrompt = searchParams.get('prompt');
    const initialModel = searchParams.get('model');
    
    if (initialPrompt && user?.uid) {
      if (initialModel) {
        setSelectedModel(initialModel);
        localStorage.setItem('selectedModel', initialModel);
      }
      
      const newParams = new URLSearchParams(searchParams);
      newParams.delete('prompt');
      newParams.delete('model');
      setSearchParams(newParams, { replace: true });
      
      setTimeout(() => {
        handleNewChat();
        setMessages([{ role: 'user', content: initialPrompt }]);
        sendAIRequest(initialPrompt, []);
      }, 100);
    }
  }, [user?.uid, searchParams, setSearchParams]);

  // Deep-link into a past conversation: /chat?session=<id>. The global sidebar's
  // "Recent" list links here. Declared AFTER the [typeParam] reset effect so the
  // loaded history isn't cleared by the mount-time handleNewChat().
  const openedSessionRef = useRef<string | null>(null);
  useEffect(() => {
    const sessionParam = searchParams.get('session');
    if (!sessionParam || !user?.uid) return;
    if (openedSessionRef.current === sessionParam) return;
    openedSessionRef.current = sessionParam;

    handleSelectSession(sessionParam);

    const newParams = new URLSearchParams(searchParams);
    newParams.delete('session');
    setSearchParams(newParams, { replace: true });
  }, [user?.uid, searchParams, setSearchParams]);

  useEffect(() => {
    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleCopy = (content: string, index: number) => {
    navigator.clipboard.writeText(content);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const handleSpeak = (content: string, index: number) => {
    if (!window.speechSynthesis) return;
    
    if (speakingIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    
    const cleanContent = content.replace(/[#*_\[\]`]/g, '');
    const utterance = new SpeechSynthesisUtterance(cleanContent);
    utterance.onend = () => setSpeakingIndex(null);
    utterance.onerror = () => setSpeakingIndex(null);
    
    setSpeakingIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  const handleSelectSession = async (sessionId: string) => {
    setCurrentSessionId(sessionId);
    setLoadingHistory(true);
    try {
      const res = await api.get(`/chat/sessions/${sessionId}`);
      setMessages(res.data);
      // Clean up URL query if we had a type
      if (searchParams.has('type')) {
        navigate('/chat', { replace: true });
      }
    } catch (error) {
      console.error("Failed to fetch session history", error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || !user?.uid) return;
    
    // A quoted selection is folded into the outgoing message as a markdown blockquote,
    // so the model sees exactly which passage the follow-up refers to.
    let userMessage = quotedText
      ? `> ${quotedText.replace(/\n+/g, ' ')}\n\n${input.trim()}`
      : input.trim();
    const currentAttachments = [...attachments]; // Capture before clearing
    setQuotedText(null);

    // Push just the text portion to the UI messages immediately so the user sees it
    // Attachment metadata rides along on the local message so the sent bubble can show
    // file cards. NOTE: this is client-side only for the current session — the backend
    // flattens attachments into the message text (chat.controller.ts) and does not persist
    // them structurally, so the cards do not survive a reload.
    setMessages(prev => [...prev, {
      role: 'user',
      content: userMessage || '',
      attachments: currentAttachments.map(a => ({ name: a.name, mimeType: a.mimeType })),
    }]);
    setInput('');
    setAttachments([]);
    
    await sendAIRequest(userMessage, currentAttachments);
  };

  // Reuses the same input->send path as the empty-state prompt cards, so a
  // follow-up chip click behaves exactly like the student typing it themselves.
  const handleSuggestionClick = (text: string) => {
    setInput(text);
    setTimeout(() => handleSend(), 50);
  };

  const handleRegenerate = async (index: number) => {
    let lastUserMessage = '';
    let userMsgIndex = -1;
    for (let j = index - 1; j >= 0; j--) {
      if (messages[j].role === 'user') {
        lastUserMessage = messages[j].content;
        userMsgIndex = j;
        break;
      }
    }
    if (!lastUserMessage || !user?.uid || userMsgIndex === -1) return;

    // Replace in place: drop the stale user bubble + the reply being regenerated
    // (and anything after, since it would have depended on that reply), then
    // re-add exactly one fresh user bubble instead of appending a duplicate.
    setMessages(prev => [...prev.slice(0, userMsgIndex), { role: 'user', content: lastUserMessage }]);
    await sendAIRequest(lastUserMessage, []);
  };

  const handleSuggestionSubmit = async (suggestionText: string) => {
    if (!user?.uid || !suggestionText.trim()) return;
    setMessages(prev => [...prev, { role: 'user', content: suggestionText.trim() }]);
    await sendAIRequest(suggestionText.trim(), []);
  };

  const sendAIRequest = async (userMessage: string, sentAttachments: any[] = []) => {
    // Generate new session ID if it's the first message
    let sessionId = currentSessionId;
    if (!sessionId) {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        sessionId = crypto.randomUUID();
      } else {
        sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }
      setCurrentSessionId(sessionId);
    }
    
    try {
      const selectedModel = localStorage.getItem('selectedModel') || 'gemini';

      // 1. Await the workflow stream
      // Scope drives two existing backend hooks, both already plumbed end-to-end
      // (chat.controller → chat.service → WorkflowEngine):
      //   'web'      → topicType 'RESEARCH' turns on Tavily retrieval + research prompt
      //   'notebook' → notebookId scopes RetrievalService to that notebook's vectors
      // 'auto' sends exactly what this page sent before, so default behaviour is unchanged.
      const { content, data, progress, reasoning, suggestions } = await stream.startStream({
        userId: user.uid,
        sessionId,
        message: userMessage,
        model: selectedModel,
        topicType: scope.kind === 'web' ? 'RESEARCH' : typeParam,
        ...(scope.kind === 'notebook' ? { notebookId: scope.id } : {}),
        attachments: sentAttachments
      });

      // 4. Park the finished reply instead of committing it immediately.
      //
      // Committing here used to unmount the live block and mount a fresh component
      // showing the full text at once — which is what made the answer appear to "burst"
      // at the end, and destroyed the completion animation before it could play. The
      // live block now stays mounted until its smooth reveal has caught up (see
      // onRevealDone below), and only then does the message join the list.
      //
      // `steps` and `reasoning` are kept client-side because the backend persists
      // neither, and without them the finished turn loses its reasoning timeline.
      setPendingFinal({
        role: 'ai',
        content,
        isTyping: false,
        citations: data?.citations,
        confidence: data?.confidence,
        steps: progress || [],
        reasoning: reasoning || '',
        suggestions: suggestions || []
      });

      // Attach the persisted message id so 👍/👎 can POST /chat/:messageId/feedback.
      // saveMessage assigns the id server-side *after* the stream closes and the SSE
      // payload never carries it, so we read it back from history. Failure is
      // non-fatal — the rating buttons simply stay disabled for this turn.
      try {
        const hist = await api.get(`/chat/sessions/${sessionId}`);
        const rows = Array.isArray(hist.data) ? hist.data : [];
        const lastAiId = [...rows].reverse().find((m: any) => m.role === 'ai')?.id;
        if (lastAiId) {
          /*
           * Exactly ONE of these, never both.
           *
           * This previously ran both unconditionally, which stamped the id belonging to
           * the reply still being revealed onto the PREVIOUS reply in the list. The
           * duplicate guard in commitPending then saw a message already carrying that
           * id and dropped the new answer — so from the second turn of a session
           * onwards, replies disappeared after finishing their reveal.
           *
           * Which one is correct depends on whether the reveal has already finished:
           * if the reply is still pending it is not in `messages` yet and the id
           * belongs on the pending object; if it has already committed, the last AI
           * message IS this reply and takes the id.
           */
          if (pendingFinalRef.current) {
            setPendingFinal((p: any) => (p ? { ...p, id: lastAiId } : p));
          } else {
            setMessages(prev => {
              const next = [...prev];
              for (let k = next.length - 1; k >= 0; k--) {
                if (next[k].role === 'ai') { next[k] = { ...next[k], id: lastAiId }; break; }
              }
              return next;
            });
          }
        }
      } catch { /* rating stays unavailable for this turn */ }

      // Refresh the session list so the new chat shows up in the sidebar
      fetchSessions();
      
      // The backend generates a smart title asynchronously. Fetch again after 3 seconds to catch the updated title!
      setTimeout(() => {
        fetchSessions();
      }, 3000);
    } catch (error) {
      console.error("Chat API error:", error);
      const message = error instanceof Error && error.message
        ? error.message
        : 'An error occurred while communicating with the AI.';
      setMessages(prev => [...prev, {
        role: 'error',
        content: message,
        retryQuery: userMessage,
        retryAttachments: sentAttachments,
      }]);
    }
  };

  const handleRetry = (msg: any) => {
    sendAIRequest(msg.retryQuery, msg.retryAttachments || []);
  };

  const handleDeleteSession = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    if (!user?.uid) return;
    if (!window.confirm('Delete this chat? This cannot be undone.')) return;

    // Optimistically remove from UI
    setSessions(prev => prev.filter(s => s.sessionId !== sessionId));
    
    if (currentSessionId === sessionId) {
      handleNewChat();
    }

    try {
      await api.delete(`/chat/sessions/${sessionId}?userId=${user.uid}`);
    } catch (error) {
      console.error("Failed to delete session", error);
      // Re-fetch to restore if it failed
      fetchSessions();
    }
  };

  if (user === null) {
    // dvh, not vh: on mobile `100vh` counts the strip behind the collapsing address bar,
    // so the panel overflows and its lower edge sits under browser chrome.
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100dvh-140px)] w-full">
        <Bot className="w-16 h-16 text-indigo-500 mb-4" />
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">You are not signed in</h2>
        <p className="text-slate-600 dark:text-gray-400 mb-6 text-center max-w-md">
          Please sign in to use the AI Chat. Your chat history and preferences are saved securely to your account.
        </p>
        <Link to="/signin" className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-semibold transition-colors">
          Sign In
        </Link>
      </div>
    );
  }

  const modelOptions = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', icon: <GeminiIcon className="w-4 h-4" /> },
    { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite', icon: <GeminiIcon className="w-4 h-4" /> },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', icon: <GeminiIcon className="w-4 h-4" /> },
    { id: 'gemini-3.0-flash', name: 'Gemini 3 Flash', icon: <GeminiIcon className="w-4 h-4" /> },
    { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', icon: <GeminiIcon className="w-4 h-4" /> },
    { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', icon: <GeminiIcon className="w-4 h-4" /> },
    { id: 'llama-3.1-8b-instant', name: 'Llama 3.1 8B', icon: <Groq className="w-4 h-4 text-[#f55036]" /> },
    { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', icon: <Groq className="w-4 h-4 text-[#f55036]" /> },
    { id: 'meta/llama-3.1-405b-instruct', name: 'Llama 3.1 405B', icon: <Nvidia.Color className="w-4 h-4" /> },
    { id: 'nvidia/nemotron-4-340b-instruct', name: 'Nemotron 340B', icon: <Nvidia.Color className="w-4 h-4" /> },
    { id: 'openai/gpt-oss-120b', name: 'GPT OSS 120B', icon: <OpenAI className="w-4 h-4 text-slate-800 dark:text-gray-200" /> },
    { id: 'openai/gpt-oss-20b', name: 'GPT OSS 20B', icon: <OpenAI className="w-4 h-4 text-slate-800 dark:text-gray-200" /> }
  ];
  const activeModel = modelOptions.find(m => m.id === selectedModel) || modelOptions[0];

  // ─── Model picker ──────────────────────────────────────────────────────────
  // The primary list shows the Gemini family (the provider actually wired as
  // TOKENS.AIProvider); everything else lives behind "More models". A search
  // query flattens both lists so nothing is hidden when you're looking for it.
  const [modelQuery, setModelQuery] = useState('');
  const [showMoreModels, setShowMoreModels] = useState(false);
  const primaryModels = modelOptions.filter((m) => m.id.startsWith('gemini'));
  const secondaryModels = modelOptions.filter((m) => !m.id.startsWith('gemini'));
  const visibleModels = modelQuery.trim()
    ? modelOptions.filter((m) => m.name.toLowerCase().includes(modelQuery.trim().toLowerCase()))
    : primaryModels;

  return (
    // Full-bleed conversation surface: no card wrapper, no page-local history rail.
    // Chat history lives in the AppLayout sidebar's "Recent" section, and AppLayout
    // drops its own top header on /chat so this owns the full viewport.
    <div className="flex h-full w-full relative overflow-hidden">

      {/* Main Chat Area */}
      <div
        className="flex-1 flex flex-col relative bg-transparent transition-all duration-300"
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {isDraggingFile && (
          <div className="absolute inset-2 z-50 rounded-2xl border-2 border-dashed border-indigo-400 bg-indigo-50/90 dark:bg-indigo-500/10 backdrop-blur-sm flex flex-col items-center justify-center gap-2 pointer-events-none">
            <Paperclip className="w-7 h-7 text-indigo-500" strokeWidth={1.75} />
            <span className="text-[14.5px] font-medium text-indigo-700 dark:text-indigo-300">Drop to attach</span>
          </div>
        )}

        {/* Header — only actions that are actually backed by an API: the session title
            (generated server-side after the first exchange), New Chat, and Delete.
            No Share/Private here: there is no chat-session sharing endpoint. */}
        <div className="flex items-center gap-2 px-6 h-12 sm:h-14 shrink-0 border-b border-slate-200/80 dark:border-white/10 bg-white/80 dark:bg-[#141416]/90 backdrop-blur-md">
          <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate">
            {sessions.find((s) => s.sessionId === currentSessionId)?.title || 'New AI chat'}
          </span>

          {/* Every chat session is owner-scoped server-side (chat.service.getSessionHistory
              rejects a requesterId that doesn't own the session), so "Private" is an
              accurate description of the current state rather than decoration. */}
          <span className="inline-flex items-center gap-1 shrink-0 px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-white/[0.06] border border-slate-200/60 dark:border-white/10 text-slate-500 dark:text-slate-400 text-[11px] font-medium">
            <Lock className="w-3 h-3 text-slate-400 dark:text-slate-500" strokeWidth={2} />
            Private
          </span>

          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={() => setIsShareOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12.5px] font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
              title="Share"
            >
              <Share2 className="w-3.5 h-3.5" strokeWidth={1.75} />
              <span className="hidden sm:inline">Share</span>
            </button>

            <button
              onClick={toggleTheme}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.08] dark:text-slate-400 dark:hover:text-white transition-colors"
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle colour theme"
            >
              {theme === 'dark'
                ? <Sun className="w-4 h-4 text-slate-300" strokeWidth={1.75} />
                : <Moon className="w-4 h-4 text-slate-600" strokeWidth={1.75} />}
            </button>

            <button
              onClick={handleNewChat}
              className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/[0.08] dark:text-slate-400 dark:hover:text-white transition-colors"
              title="New chat"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
            </button>
            {currentSessionId && (
              <button
                onClick={(e) => handleDeleteSession(e, currentSessionId)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-colors"
                title="Delete this chat"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.75} />
              </button>
            )}
          </div>
        </div>

        {/* Active Exam Copilot Banner */}
        {examParam && (
          <div className="bg-indigo-50/90 dark:bg-indigo-950/40 border-b border-indigo-200/60 dark:border-indigo-800/30 px-6 py-2 flex items-center justify-between text-xs shrink-0 z-20">
            <div className="flex items-center gap-2">
              <span className="font-bold text-indigo-700 dark:text-indigo-300 flex items-center gap-1.5">
                <Award className="w-4 h-4 text-indigo-500" /> Grounded in {examParam} Official Syllabus
              </span>
              {topicParam && (
                <span className="text-slate-600 dark:text-slate-300">
                  • Focus Topic: <strong className="text-indigo-600 dark:text-indigo-400">{topicParam}</strong>
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/exam-center')}
              className="text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:underline flex items-center gap-1"
            >
              Exam Command Center →
            </button>
          </div>
        )}

        {loadingHistory ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center pb-40 px-6 relative w-full overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className="flex flex-col items-start text-left z-10 w-full max-w-3xl"
            >
              {/* Greeting / Tool Mode Header — responsive to typeParam */}
              {typeParam !== 'chat' ? (
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#c8e558]/15 text-[#8ba32b] dark:text-[#c8e558] text-[12px] font-semibold mb-3 border border-[#c8e558]/30">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{config.title}</span>
                  </div>
                  <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-[-0.025em] leading-[1.18] text-slate-900 dark:text-white">
                    {config.title}
                  </h1>
                  <p className="mt-2 text-slate-500 dark:text-slate-400 text-[14px] leading-relaxed max-w-[520px]">
                    {config.subtitle}
                  </p>
                </div>
              ) : (
                <div>
                  <h1 className="text-[30px] sm:text-[34px] font-semibold tracking-[-0.025em] leading-[1.18] text-slate-900 dark:text-white">
                    Hi there,{' '}
                    <span className="text-[#8ba32b] dark:text-[#c8e558] font-semibold">
                      {firstName}
                    </span>
                    <br />
                    {isTeacher ? (
                      <span>
                        What are you{' '}
                        <span className="text-slate-900 dark:text-white font-semibold">
                          preparing today?
                        </span>
                      </span>
                    ) : (
                      <span>
                        What would{' '}
                        <span className="text-slate-900 dark:text-white font-semibold">
                          you like to know?
                        </span>
                      </span>
                    )}
                  </h1>

                  <p className="mt-2.5 text-slate-500 dark:text-slate-400 text-[14px] leading-relaxed max-w-[420px]">
                    {isTeacher
                      ? 'Use one of the prompts below, or ask your own — I can help you prepare and teach.'
                      : 'Use one of the most common prompts below or use your own to begin'}
                  </p>
                </div>
              )}

              {/* Suggestion cards — sleek 4-column glass grid */}
              <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3 w-full">
                {visiblePrompts.map((item, idx) => (
                  <motion.button
                    key={`${item.text}-${idx}`}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.05 + 0.08, duration: 0.3 }}
                    onClick={() => {
                      setInput(item.prompt);
                      setTimeout(() => handleSend(), 50);
                    }}
                    className="flex flex-col justify-between text-left h-[110px] p-3.5 rounded-2xl bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 hover:border-[#8ba32b]/40 dark:hover:border-[#c8e558]/40 hover:shadow-xs hover:bg-slate-50/70 dark:hover:bg-white/[0.04] transition-all duration-200 group cursor-pointer"
                  >
                    <span className="text-[12.5px] font-medium leading-[1.4] text-slate-700 dark:text-slate-200 group-hover:text-slate-900 dark:group-hover:text-white line-clamp-3">
                      {item.text}
                    </span>
                    <div className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 dark:text-slate-500 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors shrink-0">
                      <item.icon
                        className="w-3.5 h-3.5"
                        strokeWidth={1.75}
                      />
                    </div>
                  </motion.button>
                ))}
              </div>

              <button
                onClick={refreshPrompts}
                className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/[0.03] text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-all shadow-2xs group"
              >
                <RefreshCw className="w-3 h-3 group-hover:rotate-180 transition-transform duration-500 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={2} />
                Refresh Prompts
              </button>
            </motion.div>
          </div>
        ) : (
          <div
            ref={messagesContainerRef}
            onScroll={handleMessagesScroll}
            /* overflow-x-clip is the fix for the conversation drifting sideways on mobile.
               `overflow-y-auto` alone makes the x-axis compute to `auto`, so anything wider
               than the column (a table, an equation, a long token) turned the whole thread
               into a horizontal scroller. `scrollIntoView` runs the moment an answer
               finishes streaming and would then set scrollLeft, which is why the drift
               appeared right at the end of a reply. `clip` — unlike `hidden` — is not a
               scroll container, so it cannot be scrolled by script either. Wide content is
               still reachable: tables, code blocks and .katex-display each scroll inside
               themselves.
               `safe center` keeps the column centred but degrades to start-alignment rather
               than overflowing equally into an unreachable left edge. */
            className="flex-1 min-h-0 overflow-y-auto overflow-x-clip pb-32 px-4 md:px-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] flex [justify-content:safe_center]"
          >
            {/* min-w-0 is load-bearing: as a row-flex item this column would otherwise take
                min-width:auto and refuse to shrink below its widest descendant, so a wide
                table or equation widens the column past the viewport instead of letting
                that descendant's own overflow-x-auto scroll inside it. */}
            <div className="flex flex-col gap-6 py-6 border-none w-full min-w-0 max-w-3xl">
              {messages.map((msg, i) => (
                <div key={i} className={cn("flex w-full", msg.role === 'user' ? "justify-end" : "justify-start")}>
                  {msg.role === 'user' ? (
                    editingIndex === i ? (
                      <div className="flex flex-col items-end gap-1.5 w-full max-w-[80%]">
                        <textarea
                          value={editingText}
                          onChange={(e) => setEditingText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              if (editingText.trim()) {
                                setMessages(prev => [...prev.slice(0, i), { role: 'user', content: editingText.trim() }]);
                                setEditingIndex(null);
                                sendAIRequest(editingText.trim(), []);
                              }
                            } else if (e.key === 'Escape') {
                              setEditingIndex(null);
                            }
                          }}
                          autoFocus
                          rows={2}
                          className="w-full bg-[#1e1e1e] dark:bg-[#1a1a1b] text-slate-100 dark:text-gray-200 px-4 py-2.5 rounded-2xl text-[15px] outline-none ring-2 ring-indigo-500 resize-none"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setEditingIndex(null)}
                            className="px-3 py-1 rounded-lg text-[12.5px] font-medium text-slate-500 hover:bg-slate-100 dark:text-gray-400 dark:hover:bg-white/5 transition-colors"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => {
                              if (!editingText.trim()) return;
                              setMessages(prev => [...prev.slice(0, i), { role: 'user', content: editingText.trim() }]);
                              setEditingIndex(null);
                              sendAIRequest(editingText.trim(), []);
                            }}
                            className="px-3 py-1 rounded-lg text-[12.5px] font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                          >
                            Save &amp; submit
                          </button>
                        </div>
                      </div>
                    ) : (
                    <div className="group/msg flex flex-col items-end gap-2 max-w-[80%]">
                      {/* File cards for anything attached to this turn. */}
                      {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {msg.attachments.map((att: any, ai: number) => (
                            <div
                              key={ai}
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 shadow-sm"
                            >
                              <span className={cn(
                                'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                                att.mimeType?.startsWith('image/')
                                  ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                                  : att.mimeType === 'application/pdf'
                                    ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                                    : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400'
                              )}>
                                {att.mimeType?.startsWith('image/')
                                  ? <ImageIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
                                  : <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />}
                              </span>
                              <span className="flex flex-col min-w-0 text-left">
                                <span className="text-[12.5px] font-medium text-slate-800 dark:text-gray-100 truncate max-w-[150px] leading-tight">
                                  {att.name}
                                </span>
                                <span className="text-[11px] text-slate-400 dark:text-gray-500 leading-tight">
                                  {att.mimeType?.startsWith('image/') ? 'Image' : att.mimeType === 'application/pdf' ? 'PDF' : 'Document'}
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      {msg.content && (
                        <div className="relative flex items-center gap-1.5">
                          <button
                            onClick={() => { setEditingIndex(i); setEditingText(msg.content); }}
                            className="opacity-0 group-hover/msg:opacity-100 shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:text-gray-500 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-all"
                            title="Edit message"
                          >
                            <Pencil className="w-3.5 h-3.5" strokeWidth={1.75} />
                          </button>
                          {/* Bubble keeps the refined dark surface + tighter radius from the
                              UI pass, alongside the edit affordance added on main. */}
                          <div className="bg-slate-900 text-white dark:bg-[#18181b] dark:text-slate-100 border border-transparent dark:border-white/10 px-4.5 py-2.5 rounded-2xl rounded-tr-xs text-[14.5px] whitespace-pre-wrap tracking-wide shadow-xs">
                            {msg.content}
                          </div>
                        </div>
                      )}
                    </div>
                    )
                  ) : msg.role === 'error' ? (
                    <div className="flex items-start gap-2.5 max-w-[80%] px-4 py-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-300">
                      <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" strokeWidth={1.75} />
                      <div className="flex flex-col gap-1.5 min-w-0">
                        <span className="text-[13.5px] leading-snug">{msg.content}</span>
                        {msg.retryQuery && (
                          <button
                            onClick={() => handleRetry(msg)}
                            className="self-start inline-flex items-center gap-1.5 text-[12.5px] font-medium text-red-700 dark:text-red-300 hover:underline"
                          >
                            <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
                            Retry
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-4 w-full min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-slate-900 text-[#c8e558] dark:bg-white dark:text-slate-900 flex items-center justify-center shrink-0 mt-1 shadow-2xs">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col text-slate-800 dark:text-slate-100 w-full min-w-0">
                        {/* Reasoning timeline, sources, answer body and action bar all
                            live in AssistantReply — see components/chat/AssistantReply.tsx. */}
                        <AssistantReply
                          content={msg.content}
                          streaming={!!msg.isTyping}
                          steps={msg.steps || []}
                          reasoning={msg.reasoning}
                          citations={msg.citations || []}
                          suggestions={msg.suggestions || []}
                          onSuggestionClick={handleSuggestionClick}
                          onCopy={() => handleCopy(msg.content, i)}
                          copied={copiedIndex === i}
                          onSpeak={() => handleSpeak(msg.content, i)}
                          speaking={speakingIndex === i}
                          onRegenerate={() => handleRegenerate(i)}
                          onRate={msg.id ? (r) => handleRate(msg.id, r) : undefined}
                          rating={msg.id ? ratings[msg.id] ?? null : null}
                          onQuote={setQuotedText}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
              
              {/* LIVE STREAMING BLOCK */}
              {(stream.isStreaming || pendingFinal) && (
                <div className="flex w-full justify-start">
                  <div className="flex gap-4 w-full min-w-0">
                    {/* Thinking-mode avatar: a slow breathing ring while the pipeline runs */}
                    <div className="relative w-8 h-8 shrink-0 mt-1">
                      <span className="absolute inset-0 rounded-xl bg-[#8ba32b]/25 dark:bg-[#c8e558]/25 animate-ping [animation-duration:2s]" aria-hidden />
                      <span className="relative w-8 h-8 rounded-xl bg-slate-900 text-[#c8e558] dark:bg-white dark:text-slate-900 ring-1 ring-[#8ba32b]/40 dark:ring-[#c8e558]/40 flex items-center justify-center shadow-2xs">
                        <Sparkles className="w-4 h-4" />
                      </span>
                    </div>
                    <div className="flex flex-col text-slate-800 dark:text-slate-100 w-full min-w-0">
                      <AssistantReply
                        content={pendingFinal ? pendingFinal.content : stream.content}
                        streaming={stream.isStreaming}
                        steps={pendingFinal ? pendingFinal.steps : stream.progressEvents}
                        statusMessage={stream.isStreaming ? stream.progressEvents[stream.progressEvents.length - 1]?.message : undefined}
                        reasoning={pendingFinal ? pendingFinal.reasoning : stream.reasoning}
                        citations={pendingFinal ? pendingFinal.citations || [] : stream.citations}
                        suggestions={pendingFinal ? pendingFinal.suggestions || [] : stream.suggestions}
                        onSuggestionClick={handleSuggestionClick}
                        onRevealDone={commitPending}
                      />
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={endOfMessagesRef} className="h-56 shrink-0 w-full" />
            </div>
          </div>
        )}

        {/* Jump to bottom — appears once the reader has scrolled away from the
            latest message, so following the live reply back down is one click. */}
        {!isNearBottom && messages.length > 0 && (
          <button
            onClick={() => scrollToBottom()}
            className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 w-9 h-9 rounded-full bg-white dark:bg-[#1e1e20] border border-slate-200 dark:border-white/10 shadow-md flex items-center justify-center text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors"
            title="Jump to latest message"
          >
            <ArrowDown className="w-4 h-4" strokeWidth={2} />
          </button>
        )}

        {/* Input Box - absolute positioned at bottom */}
        <div className="absolute bottom-3 left-0 right-0 flex flex-col items-center px-4 md:px-8">
          <div className="w-full max-w-3xl bg-white dark:bg-[#141416] border border-slate-200/90 dark:border-white/10 rounded-2xl sm:rounded-3xl flex flex-col shadow-xs focus-within:border-slate-400 dark:focus-within:border-white/25 focus-within:shadow-sm transition-all">

              {/* Scope pill — top-right */}
              <div className="flex items-start justify-end px-3 pt-3 -mb-1">
                <div className="relative">
                  <button
                    onClick={() => setIsScopeOpen(!isScopeOpen)}
                    className="flex items-center gap-1.5 max-w-[190px] text-[11.5px] font-semibold px-2.5 py-1 rounded-full bg-slate-100/90 dark:bg-white/[0.06] border border-slate-200/60 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-white/10 transition-colors"
                    title="Choose what this chat is grounded in"
                  >
                    {scope.kind === 'notebook'
                      ? <Notebook className="w-3.5 h-3.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={1.75} />
                      : <Globe className="w-3.5 h-3.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={1.75} />}
                    <span className="truncate">{scopeLabel(scope)}</span>
                    <ChevronDown className="w-3 h-3 shrink-0" strokeWidth={2.5} />
                  </button>

                  {isScopeOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setIsScopeOpen(false)} />
                      <div className="absolute right-0 top-full mt-2 w-60 max-h-[280px] overflow-y-auto custom-scrollbar bg-white dark:bg-[#1a1a1b] rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden z-50 py-1.5">
                        {([
                          { key: 'auto', icon: Sparkles, label: 'Auto', hint: 'Let Sadhya decide' },
                          { key: 'web', icon: Globe, label: 'All Web', hint: 'Search the web (research mode)' },
                        ] as const).map((opt) => (
                          <button
                            key={opt.key}
                            onClick={() => { setScope({ kind: opt.key } as Scope); setIsScopeOpen(false); }}
                            className={cn(
                              'w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors',
                              scope.kind === opt.key
                                ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white font-semibold'
                                : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                            )}
                          >
                            <opt.icon className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={1.75} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-[13px] font-medium">{opt.label}</span>
                              <span className="block text-[11px] text-slate-400 dark:text-slate-500 truncate">{opt.hint}</span>
                            </span>
                            {scope.kind === opt.key && <Check className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={2.5} />}
                          </button>
                        ))}

                        {notebooks.length > 0 && (
                          <>
                            <div className="px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                              My Notebooks
                            </div>
                            {notebooks.map((nb) => (
                              <button
                                key={nb.id}
                                onClick={() => { setScope({ kind: 'notebook', id: nb.id, title: nb.title }); setIsScopeOpen(false); }}
                                className={cn(
                                  'w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors',
                                  scope.kind === 'notebook' && scope.id === nb.id
                                    ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white font-semibold'
                                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                                )}
                              >
                                <Notebook className="w-3.5 h-3.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={1.75} />
                                <span className="flex-1 text-[13px] truncate">{nb.title}</span>
                                {scope.kind === 'notebook' && scope.id === nb.id && (
                                  <Check className="w-3.5 h-3.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={2.5} />
                                )}
                              </button>
                            ))}
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              
              {/* Quoted reply */}
              {quotedText && (
                <div className="flex items-start gap-2 mx-3 mt-3 px-2.5 py-2 rounded-xl bg-slate-50 dark:bg-white/[0.04] border-l-2 border-[#8ba32b] dark:border-[#c8e558]">
                  <CornerUpLeft className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={1.75} />
                  <span className="flex-1 min-w-0 text-[12.5px] leading-snug text-slate-600 dark:text-slate-300 line-clamp-2">
                    {quotedText}
                  </span>
                  <button
                    onClick={() => setQuotedText(null)}
                    className="shrink-0 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors"
                    title="Remove quote"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {(attachments.length > 0 || isUploadingFile) && (
                <div className="flex flex-wrap gap-2 p-3 pb-0">
                  {attachments.map((att, i) => (
                    <div
                      key={i}
                      className="group relative flex items-center gap-2.5 pl-2.5 pr-8 py-2 rounded-xl bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 shadow-xs animate-in fade-in zoom-in duration-200"
                    >
                      <span className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                        att.mimeType?.startsWith('image/')
                          ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
                          : att.mimeType === 'application/pdf'
                            ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400'
                            : 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300'
                      )}>
                        {att.mimeType?.startsWith('image/')
                          ? <ImageIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
                          : <FileText className="w-3.5 h-3.5" strokeWidth={1.75} />}
                      </span>
                      <span className="flex flex-col min-w-0">
                        <span className="text-[12.5px] font-medium text-slate-800 dark:text-slate-100 truncate max-w-[150px] leading-tight">
                          {att.name}
                        </span>
                        <span className="text-[11px] text-slate-400 dark:text-slate-500 leading-tight">
                          {new Date().toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </span>
                      <button
                        onClick={() => setAttachments(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-colors"
                        title="Remove attachment"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {isUploadingFile && (
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 px-3 py-1.5 rounded-lg text-[13px] font-medium animate-pulse">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-[#8ba32b] dark:text-[#c8e558]" />
                      <span>Reading file...</span>
                    </div>
                  )}
                </div>
              )}

              <div className="relative w-full">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    typeParam === 'study-guide' ? 'Enter a topic or paste notes to generate a study guide...' :
                    typeParam === 'slides' ? 'Describe the presentation slides you want to generate...' :
                    typeParam === 'worksheet' ? 'Describe the worksheet exercises and subject you need...' :
                    typeParam === 'mindmap' ? 'Enter a central topic to build a concept mind map...' :
                    typeParam === 'infographic' ? 'Describe the concept to outline an infographic...' :
                    typeParam === 'image' ? 'Describe the educational diagram or illustration...' :
                    typeParam === 'meeting-notes' ? 'Paste your raw notes or transcript here...' :
                    typeParam === 'page' ? 'Enter a topic or outline to draft your page...' :
                    'Ask whatever you want...'
                  }
                  maxLength={MAX_CHARS}
                  className="w-full bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 px-4 pt-2.5 pb-2 min-h-[46px] max-h-[200px] overflow-y-auto outline-none resize-none text-[14.5px] leading-relaxed break-words"
                  rows={1}
                  disabled={loadingHistory}
                />
              </div>

              <div className="flex items-center justify-between p-3 pt-0">
                <div className="flex items-center gap-1">
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept={attachmentAccept}
                      onChange={handleFileUpload} 
                    />
                    
                    <div className="relative">
                      <button
                        onClick={() => setIsAttachmentDropdownOpen(!isAttachmentDropdownOpen)}
                        className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
                        title="Add attachment — PDF, document, image or text"
                        aria-label="Add attachment"
                      >
                        <Paperclip className="w-[18px] h-[18px]" strokeWidth={1.6} />
                      </button>

                      {isAttachmentDropdownOpen && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setIsAttachmentDropdownOpen(false)}></div>
                          <div className="absolute left-0 bottom-full mb-2 w-48 bg-white dark:bg-[#1a1a1b] rounded-2xl shadow-xl border border-slate-200 dark:border-white/10 overflow-hidden z-50 py-1">
                            <button 
                              onClick={() => { setAttachmentAccept(".pdf"); setIsAttachmentDropdownOpen(false); setTimeout(() => fileInputRef.current?.click(), 0); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 transition-colors"
                            >
                              Upload PDF
                            </button>
                            <button 
                              onClick={() => { setAttachmentAccept(".docx"); setIsAttachmentDropdownOpen(false); setTimeout(() => fileInputRef.current?.click(), 0); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 transition-colors"
                            >
                              Upload Document (.docx)
                            </button>
                            <button 
                              onClick={() => { setAttachmentAccept(".jpg,.jpeg,.png"); setIsAttachmentDropdownOpen(false); setTimeout(() => fileInputRef.current?.click(), 0); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 transition-colors"
                            >
                              Upload Image (OCR)
                            </button>
                            <button 
                              onClick={() => { setAttachmentAccept(".txt,.md,.csv,.json,.js,.ts,.tsx,.py,.html,.css"); setIsAttachmentDropdownOpen(false); setTimeout(() => fileInputRef.current?.click(), 0); }}
                              className="w-full text-left px-4 py-2.5 text-[13px] hover:bg-slate-50 dark:hover:bg-white/5 text-slate-700 dark:text-slate-200 transition-colors"
                            >
                              Upload Text / Code
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        setAttachmentAccept('.jpg,.jpeg,.png');
                        setIsAttachmentDropdownOpen(false);
                        setTimeout(() => fileInputRef.current?.click(), 0);
                      }}
                      className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
                      title="Use image — attach a photo or screenshot (OCR)"
                      aria-label="Use image"
                    >
                      <ImagePlus className="w-[18px] h-[18px]" strokeWidth={1.6} />
                    </button>

                    <button
                      onClick={handleTalk}
                      className={cn(
                        'w-8 h-8 flex items-center justify-center rounded-lg transition-colors',
                        isListening
                          ? 'bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 animate-pulse'
                          : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.08]'
                      )}
                      title={isListening ? 'Listening — click to stop' : 'Talk — dictate your question'}
                      aria-label={isListening ? 'Stop dictation' : 'Start dictation'}
                    >
                      {isListening
                        ? <AudioLines className="w-[18px] h-[18px]" strokeWidth={1.6} />
                        : <Mic className="w-[18px] h-[18px]" strokeWidth={1.6} />}
                    </button>

                    <Link
                      to="/research"
                      className="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
                      title="Deep Research — open the long-form research workspace"
                      aria-label="Deep Research"
                    >
                      <Telescope className="w-[18px] h-[18px]" strokeWidth={1.6} />
                    </Link>
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative">
                      <button
                        onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}
                        className="flex items-center gap-1.5 max-w-[112px] sm:max-w-[190px] text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white text-[12.5px] font-medium px-2 sm:px-2.5 py-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
                        title="Choose model"
                      >
                        {activeModel.icon}
                        <span className="truncate font-semibold">{activeModel.name}</span>
                        <ChevronDown className="w-3 h-3 shrink-0" strokeWidth={2.5}/>
                      </button>

                      {isModelDropdownOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-40"
                            onClick={() => { setIsModelDropdownOpen(false); setModelQuery(''); setShowMoreModels(false); }}
                          />

                          <div className="absolute right-0 bottom-full mb-2 w-[264px] bg-white dark:bg-[#242426] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 z-50 py-1.5">
                            <div className="px-3 pt-1 pb-2">
                              <input
                                autoFocus
                                value={modelQuery}
                                onChange={(e) => setModelQuery(e.target.value)}
                                placeholder="Search models..."
                                className="w-full bg-transparent text-[13.5px] text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none"
                              />
                              <div className="mt-2 h-px bg-slate-200 dark:bg-white/10" />
                            </div>

                            <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                              Models
                            </div>

                            <div className="max-h-[260px] overflow-y-auto custom-scrollbar px-1.5 pb-1">
                              {!modelQuery.trim() && (
                                <div
                                  className="relative"
                                  onMouseEnter={() => setShowMoreModels(true)}
                                  onMouseLeave={() => setShowMoreModels(false)}
                                >
                                  <button
                                    onClick={() => setShowMoreModels((v) => !v)}
                                    className={cn(
                                      'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors',
                                      showMoreModels
                                        ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white font-semibold'
                                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                                    )}
                                  >
                                    <span className="flex-1">More models</span>
                                    <ChevronRight className="w-3.5 h-3.5 shrink-0" strokeWidth={2} />
                                  </button>

                                  {/* Submenu flips to the LEFT on phones: its parent is a
                                      right-aligned 264px dropdown, so opening a further 236px
                                      to the right put this entirely off-screen on any phone. */}
                                  {showMoreModels && secondaryModels.length > 0 && (
                                    <div className="absolute top-0 right-full mr-2 sm:right-auto sm:left-full sm:ml-2 w-[236px] bg-white dark:bg-[#2c2c2e] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 py-1.5 px-1.5 z-50">
                                      {secondaryModels.map((model) => (
                                        <button
                                          key={model.id}
                                          onClick={() => {
                                            setSelectedModel(model.id);
                                            setIsModelDropdownOpen(false);
                                            setModelQuery('');
                                            setShowMoreModels(false);
                                          }}
                                          className={cn(
                                            'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors',
                                            selectedModel === model.id
                                              ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white font-semibold'
                                              : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                                          )}
                                        >
                                          <span className="shrink-0 flex items-center">{model.icon}</span>
                                          <span className="flex-1 truncate">{model.name}</span>
                                          {selectedModel === model.id && (
                                            <Check className="w-3.5 h-3.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={2.5} />
                                          )}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}

                              {visibleModels.map((model) => (
                                <button
                                  key={model.id}
                                  onClick={() => {
                                    setSelectedModel(model.id);
                                    setIsModelDropdownOpen(false);
                                    setModelQuery('');
                                    setShowMoreModels(false);
                                  }}
                                  className={cn(
                                    'w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] text-left transition-colors',
                                    selectedModel === model.id
                                      ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white font-semibold'
                                      : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.06]'
                                  )}
                                >
                                  <span className="shrink-0 flex items-center">{model.icon}</span>
                                  <span className="flex-1 truncate">{model.name}</span>
                                  {selectedModel === model.id && (
                                    <Check className="w-3.5 h-3.5 shrink-0 text-[#8ba32b] dark:text-[#c8e558]" strokeWidth={2.5} />
                                  )}
                                </button>
                              ))}

                              {visibleModels.length === 0 && (
                                <div className="px-2.5 py-3 text-[13px] text-slate-400 dark:text-slate-500">
                                  No models match “{modelQuery}”.
                                </div>
                              )}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                    {/* Character budget. Hidden on phones: the toolbar's left icon group plus
                        the model picker already consume the width, and pushing this in as well
                        squeezed the send button. Reappears from sm: up. */}
                    <span
                      className={cn(
                        'hidden sm:inline text-[11.5px] font-mono tabular-nums transition-colors',
                        input.length >= MAX_CHARS
                          ? 'text-red-500'
                          : input.length > MAX_CHARS * 0.9
                            ? 'text-amber-500'
                            : 'text-slate-400 dark:text-slate-500'
                      )}
                    >
                      {input.length}/{MAX_CHARS}
                    </span>

                    {/* Stop-generating affordance came from main; the send button keeps the
                        accent styling from the UI pass rather than reverting to indigo. */}
                    {stream.isStreaming ? (
                      <button
                        onClick={() => stream.cancelStream()}
                        className="w-8 h-8 rounded-full bg-slate-700 hover:bg-slate-800 dark:bg-white/20 dark:hover:bg-white/30 flex items-center justify-center text-white transition-colors cursor-pointer shrink-0"
                        title="Stop generating"
                      >
                        <Square className="w-3.5 h-3.5" fill="currentColor" strokeWidth={0} />
                      </button>
                    ) : (
                      <button
                        onClick={handleSend}
                        disabled={(!input.trim() && attachments.length === 0) || loadingHistory}
                        className="w-8 h-8 rounded-full bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 disabled:bg-slate-100 dark:disabled:bg-white/5 disabled:text-slate-400 dark:disabled:text-slate-600 disabled:cursor-not-allowed flex items-center justify-center transition-all cursor-pointer shrink-0 shadow-md active:scale-95"
                        title="Send question"
                        aria-label="Send question"
                      >
                        <ArrowUp className="w-4 h-4" strokeWidth={2.5} />
                      </button>
                    )}
                </div>
              </div>

          </div>

          {/* Quick Learning Action Chips (matching landing page UI) */}
          <div className="flex items-center justify-center gap-1.5 mt-2 flex-wrap px-2">
            {[
              { label: 'Explain', prompt: 'Can you explain this concept step-by-step with simple examples and analogies?' },
              { label: 'Revise', prompt: 'Give me a quick 5-bullet high-yield revision summary for this topic.' },
              { label: 'Quiz', prompt: 'Generate 3 exam-level practice questions on this topic with detailed explanations.' },
              { label: 'Essay', prompt: 'Structure a high-scoring answer-writing format and outline for this topic.' },
              { label: 'Research', prompt: 'Provide a deep dive research analysis and official source context for this.' },
            ].map((action) => (
              <button
                key={action.label}
                onClick={() => handleSuggestionSubmit(action.prompt)}
                className="px-3 py-1 rounded-full text-[11px] font-medium bg-white/80 dark:bg-white/[0.04] hover:bg-slate-100 dark:hover:bg-white/[0.08] text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white border border-slate-200/80 dark:border-white/10 shadow-2xs transition-all active:scale-95 cursor-pointer"
              >
                {action.label}
              </button>
            ))}
          </div>

          <p className="mt-1.5 text-[10.5px] text-slate-400 dark:text-gray-500 text-center">
            Sadhya AI can make mistakes. Please verify important exam facts.
          </p>
        </div>
      </div>

      <ShareModal isOpen={isShareOpen} onClose={() => setIsShareOpen(false)} />
    </div>
  );
}
