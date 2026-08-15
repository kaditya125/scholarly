/**
 * Studio Content — Podcast AI Workspace
 *
 * Conversational information collection → Magic Chat SSE streaming.
 *
 * Flow:
 *   1. Welcome: user types their topic prompt.
 *   2. AI asks three questions in sequence via inline chip pills:
 *        Duration → Language → Podcast Style
 *   3. After all three answers are collected, a short summary line is
 *      pushed and the real Magic Chat SSE stream begins with a message
 *      that bakes in the collected parameters.
 *   4. ReasoningTimeline renders live events with human-readable narration.
 *   5. When the answer arrives, "Generate podcast" hands the plan off to
 *      the existing GeneratePodcastRequest pipeline using the collected
 *      duration / language / style / topic.
 */

import { KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  AlignJustify,
  ArrowUpRight,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  FileText,
  Layers,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/AuthContext';
import {
  useWorkflowStream,
  WorkflowProgress,
} from '../../hooks/ai/useWorkflowStream';
import { useGeneratePodcast } from '../../hooks/api/usePodcasts';
import { podcastsApi } from '../../lib/api/podcasts';
import type { PodcastStatus, PodcastMetadata } from '../../types';
import {
  createProject,
  projectStatusFromPodcast,
  saveProjectSession,
  updateProject,
  type PodcastProjectDetail,
} from '../../lib/podcastProjects';
import ReasoningTimeline, {
  RStep,
  StepDefX,
} from '../chat/ReasoningTimeline';
import MarkdownMessage from '../chat/MarkdownMessage';
import PodcastResultCard from './PodcastResultCard';
import CinematicStatusBadge from './CinematicStatusBadge';
import ProductionProgress from './ProductionProgress';
import type {
  GeneratePodcastRequest,
  PodcastStyleId,
  SpeakerStyle,
} from '../../lib/api/podcasts';

interface StudioContentProps {
  isGenerating: boolean;
  onStartGeneration: () => void;
  onClose?: () => void;
  onToggleTranscript?: () => void;
  isTranscriptExpanded?: boolean;
  /**
   * Called whenever the podcast production job transitions status. The
   * parent uses this to keep the right-pane transcript and the sidebar
   * project list in sync with the live generation state.
   */
  onPodcastProgress?: (podcast: PodcastMetadata) => void;
  /** Called once when the podcast reaches READY. */
  onPodcastReady?: (podcast: PodcastMetadata) => void;
  /**
   * A stored project to restore into the workspace. Changing the project id
   * rehydrates the full conversation — turns, reasoning trail, and the
   * collected duration/language/style.
   */
  loadProject?: PodcastProjectDetail | null;
  /**
   * Incremented by the parent when "New Podcast" is clicked. Any change
   * resets the workspace to a blank welcome state.
   */
  newProjectSignal?: number;
  /** Raised after the project store is mutated so the sidebar can refresh. */
  onProjectChanged?: () => void;
  /** Raised when a new project is auto-created, so the parent can select it. */
  onActiveProjectIdChange?: (projectId: string | null) => void;
  /**
   * The podcast belonging to the open project, as loaded by the parent. Lets
   * the result card (with its player) render for restored projects, not just
   * for one that finished generating in this session.
   */
  activePodcast?: PodcastMetadata | null;
  /** Opens the full episode dashboard from the result card. */
  onOpenEpisode?: (podcast: PodcastMetadata) => void;
  /** Deletes the open project — surfaced on the result card. */
  onDeleteProject?: () => void;
}

// ---------------------------------------------------------------------------
// Collection options (chips)
// ---------------------------------------------------------------------------

interface DurationOption {
  label: string;
  minutes: number;
}

interface LanguageOption {
  label: string;
  value: string;
}

interface StyleOption {
  label: string;
  /** The production format actually sent to the backend. Distinct per option. */
  podcastStyle: PodcastStyleId;
  /**
   * Closest LEGACY value, sent alongside so a backend running with
   * ENHANCED_PODCAST_STYLES off still behaves as it did before. This is the lossy
   * mapping — three labels share 'solo_narrator' — which is exactly why
   * `podcastStyle` exists.
   */
  speakerStyle: SpeakerStyle;
}

const DURATION_OPTIONS: DurationOption[] = [
  { label: '5 Minutes', minutes: 5 },
  { label: '10 Minutes', minutes: 10 },
  { label: '15 Minutes', minutes: 15 },
  { label: '20 Minutes', minutes: 20 },
  { label: '30 Minutes', minutes: 30 },
];

const LANGUAGE_OPTIONS: LanguageOption[] = [
  { label: 'English', value: 'English' },
  { label: 'Hindi', value: 'Hindi' },
  { label: 'Hinglish', value: 'Hinglish' },
  { label: 'Sanskrit', value: 'Sanskrit' },
];

const STYLE_OPTIONS: StyleOption[] = [
  { label: 'Teacher & Student', podcastStyle: 'teacher_student', speakerStyle: 'teacher_student' },
  { label: 'Storytelling', podcastStyle: 'storytelling', speakerStyle: 'solo_narrator' },
  { label: 'Documentary', podcastStyle: 'documentary', speakerStyle: 'solo_narrator' },
  { label: 'Interview', podcastStyle: 'interview', speakerStyle: 'interview' },
  { label: 'Debate', podcastStyle: 'debate', speakerStyle: 'discussion' },
  { label: 'Solo Narration', podcastStyle: 'solo_narration', speakerStyle: 'solo_narrator' },
];

// ---------------------------------------------------------------------------
// Studio-specific reasoning step definitions
// ---------------------------------------------------------------------------

const STUDIO_STEP_DEFS: StepDefX[] = [
  {
    key: 'understand',
    title: 'Understanding your request',
    stages: ['INTENT_DETECTION', 'CONTEXT_ENRICHMENT'],
    hints: ['Reading your prompt'],
    detail:
      'Understanding the topic, target audience, and teaching approach for this podcast.',
  },
  {
    key: 'memory',
    title: 'Loading your profile',
    stages: ['MEMORY_RETRIEVAL'],
    hints: ['Recalling your context'],
    detail:
      'Loading your learning profile so the podcast is tailored to your background.',
  },
  {
    key: 'graph',
    title: 'Searching the knowledge graph',
    stages: ['GRAPH_RETRIEVAL'],
    hints: ['Mapping related concepts'],
    detail:
      'Traversing related concepts, prerequisites, and dependencies to structure the material.',
  },
  {
    key: 'search',
    title: 'Retrieving educational resources',
    stages: ['RAG_RETRIEVAL'],
    hints: ['Finding sources'],
    detail:
      'Searching your notebooks and indexed curriculum for the most relevant passages.',
  },
  {
    key: 'reason',
    title: 'Building lesson strategy',
    stages: [],
    hints: ['Planning the podcast'],
    detail:
      'Structuring the outline and ordering topics so the podcast flows naturally.',
  },
  {
    key: 'generate',
    title: 'Composing the plan',
    stages: [
      'AGENT_EXECUTION',
      'VERIFICATION',
      'ASSET_GENERATION',
      'ANALYTICS',
      'MEMORY_UPDATE',
    ],
    hints: ['Writing the outline'],
    detail:
      'Composing the podcast plan you can approve, refine, or hand off to voice generation.',
  },
];

// ---------------------------------------------------------------------------
// Human-like production narration (client-side; real events pick the stage)
// ---------------------------------------------------------------------------

const PODCAST_NARRATION: Record<string, string[]> = {
  INTENT_DETECTION: [
    'Reading your request and identifying the educational objective',
    'Determining the target audience and expected learning outcome',
    'Understanding the difficulty level appropriate for this podcast',
    'Identifying the most suitable teaching methodology',
  ],
  CONTEXT_ENRICHMENT: [
    'Extracting the core concept and key entities',
    'Enriching the request with additional context signals',
  ],
  MEMORY_RETRIEVAL: [
    'Loading your learning profile and exam context',
    'Recalling topics you have already covered recently',
    'Adjusting the depth of explanation to your background',
  ],
  GRAPH_RETRIEVAL: [
    'Retrieving semantically related concepts from the knowledge graph',
    'Traversing prerequisite and dependency edges',
    'Ranking the most relevant educational nodes',
    'Selecting the strongest contextual information for the podcast',
  ],
  RAG_RETRIEVAL: [
    'Searching your uploaded notebooks for relevant chapters',
    'Looking for previous learning materials related to this topic',
    'Matching passages that will improve the quality of the explanation',
    'Collecting supporting educational references',
  ],
  AGENT_EXECUTION: [
    'Designing the overall learning journey for the listener',
    'Breaking the topic into logical teaching sections',
    'Planning concept progression from basic to advanced',
    'Balancing engagement with educational accuracy',
    'Drafting dialogue that flows naturally between speakers',
    'Adding relatable real-world analogies',
  ],
  VERIFICATION: [
    'Cross-checking factual accuracy against retrieved sources',
    'Ensuring the explanation is coherent and complete',
  ],
  ASSET_GENERATION: ['Preparing supplementary learning materials'],
  ANALYTICS: ['Logging telemetry for your learning journey'],
  MEMORY_UPDATE: ['Saving what we learned about this session'],
};

function useLiveNarration(
  rawEvents: WorkflowProgress[],
  isStreaming: boolean
): RStep[] {
  const [narration, setNarration] = useState<RStep[]>([]);
  const timerRef = useRef<number | null>(null);

  const currentStage = useMemo(() => {
    for (let i = rawEvents.length - 1; i >= 0; i--) {
      const ev = rawEvents[i];
      if (!(ev as any).detail && ev.stage) return ev.stage;
    }
    return null;
  }, [rawEvents]);

  useEffect(() => {
    if (isStreaming) setNarration([]);
  }, [isStreaming]);

  useEffect(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!isStreaming || !currentStage) return;

    const lines = PODCAST_NARRATION[currentStage];
    if (!lines || lines.length === 0) return;

    let idx = 0;
    const emit = () => {
      if (idx >= lines.length) {
        if (timerRef.current) {
          window.clearInterval(timerRef.current);
          timerRef.current = null;
        }
        return;
      }
      const line = lines[idx];
      idx++;
      setNarration((prev) => {
        if (prev.some((n) => n.stage === currentStage && n.message === line)) {
          return prev;
        }
        return [...prev, { stage: currentStage, message: line, detail: true }];
      });
    };

    emit();
    timerRef.current = window.setInterval(emit, 950);
    return () => {
      if (timerRef.current) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentStage, isStreaming]);

  return useMemo(() => {
    const merged: RStep[] = rawEvents.map((e) => ({
      stage: e.stage,
      message: e.message,
      detail: (e as any).detail,
    }));
    merged.push(...narration);
    return merged;
  }, [rawEvents, narration]);
}

// ---------------------------------------------------------------------------
// Podcast job stage → live chat message
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// "Just make it" intent
// ---------------------------------------------------------------------------

/**
 * Does this message ask us to produce the episode, rather than to change the plan?
 *
 * Deliberately CONSERVATIVE. A false positive starts a job that costs money and
 * takes minutes, so this only fires on short, unambiguous instructions. Anything
 * longer is treated as a refinement request and goes to the planner — "generate
 * it but make part 3 shorter" is a plan change, not a go-ahead.
 */
function isGenerateRequest(message: string): boolean {
  const text = message.trim().toLowerCase();

  // Long messages carry qualifications; treat them as refinements.
  if (text.split(/\s+/).length > 6) return false;

  const patterns: RegExp[] = [
    // English
    /^(?:yes[,\s]*)?(?:please\s+)?(?:go\s+ahead|generate|create|make|produce|build|start)(?:\s+(?:it|this|the)?\s*(?:podcast|episode|audio)?)?[.!\s]*$/,
    /^(?:podcast|episode)\s+(?:banao|generate|create)[.!\s]*$/,
    /^(?:let'?s|lets)\s+(?:go|do\s+it|generate|create)[.!\s]*$/,
    /^(?:sounds?\s+good|looks?\s+good|perfect|ok(?:ay)?)[,\s]*(?:generate|create|make|go\s+ahead)[.!\s]*$/,
    // Hinglish (Roman)
    /^(?:ab\s+)?(?:ise\s+|ise\s+|ye\s+|yeh\s+)?bana\s*(?:do|de|dijiye)[.!\s]*$/,
    /^(?:podcast\s+)?banao[.!\s]*$/,
    /^(?:haan|han|ha)[,\s]*(?:bana\s*(?:do|de)|banao)[.!\s]*$/,
    // Hindi (Devanagari). No \b — it does not match next to Devanagari.
    /^(?:अब\s+)?(?:इसे\s+|ये\s+|यह\s+)?बना\s*(?:दो|दीजिए|दें)[।!\s]*$/u,
    /^(?:पॉडकास्ट\s+)?(?:बनाओ|बनाइए)[।!\s]*$/u,
    /^(?:हाँ|हां)[,\s]*(?:बना\s*(?:दो|दीजिए)|बनाओ)[।!\s]*$/u,
    /^शुरू\s*(?:करो|करें|कीजिए)[।!\s]*$/u,
  ];

  return patterns.some((p) => p.test(text));
}

// ---------------------------------------------------------------------------
// Prose reveal cadence
// ---------------------------------------------------------------------------

/**
 * Characters revealed per second.
 *
 * The previous implementation stepped by `ceil(remaining / 20)` every 22ms,
 * which is a DECELERATING BURST — it dumped most of a line instantly and
 * finished anything in under a second, so it read as a flash rather than as
 * writing. A constant rate driven by elapsed time reads the way streamed text
 * should, and is framerate-independent rather than tied to a timer interval.
 */
const PROSE_CHARS_PER_SECOND = 68;

/** Extra dwell after a sentence ends, so the cadence breathes. */
const PROSE_SENTENCE_PAUSE_MS = 140;

/** Sentence terminators, including the Devanagari danda. */
const SENTENCE_ENDS = '.!?।॥';

/*
 * The hardcoded PODCAST_STAGE_NARRATION table used to live here: ~30 canned
 * sentences that a timer pushed into the chat, two seconds apart, to simulate
 * progress. They described work the client had no knowledge of and kept
 * scrolling past even when a stage had failed.
 *
 * ProductionProgress now renders the real status plus the backend's own
 * `stageDetails` entries, so the invented copy is gone rather than merely
 * relocated.
 */

// Statuses that mean the job is still in flight — we keep polling for these.
const STAGE_IN_PROGRESS: string[] = [
  'PENDING',
  'PLANNING',
  'GENERATING_SCRIPT',
  'GENERATING_AUDIO',
  'STITCHING_AUDIO',
  'UPLOADING',
  'GENERATING_ASSETS',
];

// ---------------------------------------------------------------------------
// Turn model
// ---------------------------------------------------------------------------

type Turn =
  | { kind: 'user'; id: string; content: string }
  | { kind: 'ai_prose'; id: string; content: string; typing?: boolean; size?: 'sm' | 'md' | 'lg' }
  | {
      kind: 'stream';
      id: string;
      reasoningSteps: RStep[];
      reasoningText: string;
      answer: string;
      reasoningMs?: number;
      error?: string;
    };

type CollectionPhase =
  | 'welcome'
  | 'ask_duration'
  | 'ask_language'
  | 'ask_style'
  | 'streaming'
  | 'ready'
  | 'producing'    // podcast generation job is running in the background
  | 'completed';   // podcast is READY or FAILED — no more polling

interface Collected {
  topic: string;
  duration?: { label: string; minutes: number };
  language?: { label: string; value: string };
  /** Mirrors StyleOption — carries both the format id and the legacy value. */
  style?: { label: string; podcastStyle: PodcastStyleId; speakerStyle: SpeakerStyle };
}

// ---------------------------------------------------------------------------
// Root component
// ---------------------------------------------------------------------------

const EXAMPLE_PROMPTS = [
  'Explain quantum physics for Class 12',
  'Teach me organic chemistry reactions for JEE',
  'Create a crash course on World War 2',
  'Help me understand calculus derivatives',
];

export default function StudioContent({
  onStartGeneration,
  onClose,
  onPodcastProgress,
  onPodcastReady,
  loadProject,
  newProjectSignal = 0,
  onProjectChanged,
  onActiveProjectIdChange,
  activePodcast,
  onOpenEpisode,
  onDeleteProject,
}: StudioContentProps) {
  const [prompt, setPrompt] = useState('');
  const [phase, setPhase] = useState<CollectionPhase>('welcome');
  const [collected, setCollected] = useState<Collected>({ topic: '' });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [currentStreamTurnId, setCurrentStreamTurnId] = useState<string | null>(
    null
  );
  // Podcast production polling — set after `Generate podcast` fires. We keep
  // the studio open and watch the status transitions live in the chat.
  const [producingPodcastId, setProducingPodcastId] = useState<string | null>(null);
  const [lastPodcastStatus, setLastPodcastStatus] = useState<PodcastStatus | null>(null);
  /**
   * Latest polled snapshot of the episode being produced. Held so the progress
   * panel can read the backend's own `progressPct` and `stageDetails` rather than
   * the client inventing its own narration.
   */
  const [producingPodcast, setProducingPodcast] = useState<PodcastMetadata | null>(null);
  const [readyPodcast, setReadyPodcast] = useState<PodcastMetadata | null>(null);
  // History mode = the current view was hydrated from a saved project rather
  // than being a live/in-progress session. Drives compact styling (smaller
  // font for every turn except the last, which stays emphasised).
  const [historyMode, setHistoryMode] = useState<boolean>(false);
  /**
   * Whether the restored conversation is expanded.
   *
   * Opening a saved podcast used to dump the entire original chat — every
   * question, every reasoning trail — above the player, so the thing you came
   * for was pushed off screen. The history is now behind a toggle and starts
   * collapsed; a LIVE session is always expanded, since that is the conversation
   * you are currently having.
   */
  const [showHistory, setShowHistory] = useState<boolean>(false);
  /**
   * The project this conversation belongs to. Created lazily on the user's
   * first message so a draft is durable from turn one, then carried through
   * generation so all assets stay attached to it.
   */
  const [projectId, setProjectId] = useState<string | null>(null);

  // Refs prevent the stale-closure duplicate-message bug: the poll effect
  // runs every tick, but React state updates are async — comparing against
  // a captured-at-effect-creation `lastPodcastStatus` would keep firing the
  // same "Structuring the episode plan..." line every 3 seconds.
  const lastStatusRef = useRef<PodcastStatus | null>(null);
  const narrationTimerRef = useRef<number | null>(null);
  const narrationStageRef = useRef<PodcastStatus | null>(null);

  const sessionId = useMemo(() => {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
    return `studio-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }, []);

  const { user } = useAuth();
  const stream = useWorkflowStream();
  const { generate, isGenerating: isPodcastGenerating } = useGeneratePodcast();

  const liveEvents = useLiveNarration(stream.progressEvents, stream.isStreaming);
  const liveEventsRef = useRef<RStep[]>([]);
  useEffect(() => {
    liveEventsRef.current = liveEvents;
  }, [liveEvents]);

  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns.length, stream.content, liveEvents.length, stream.reasoning, phase]);

  /** Stop any in-flight stream and stage-narration timers. */
  const haltLiveActivity = () => {
    stream.cancelStream?.();
    if (narrationTimerRef.current != null) {
      window.clearInterval(narrationTimerRef.current);
      narrationTimerRef.current = null;
    }
    narrationStageRef.current = null;
  };

  // Restore a saved project. This is the real conversation the user had —
  // user turns, AI prose, and the full reasoning trail — not a summary.
  const lastLoadedIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!loadProject) return;
    if (lastLoadedIdRef.current === loadProject.id) return;
    lastLoadedIdRef.current = loadProject.id;

    haltLiveActivity();

    setProjectId(loadProject.id);
    setTurns((loadProject.turns as Turn[]) ?? []);
    setCollected((loadProject.collected as Collected) ?? { topic: loadProject.title });
    setProducingPodcastId(null);
    setLastPodcastStatus(loadProject.podcastStatus ?? null);
    lastStatusRef.current = loadProject.podcastStatus ?? null;
    setReadyPodcast(null);
    setErrorMessage(null);
    setPrompt('');

    /**
     * A project that never started generating is still a DRAFT, and reopening it
     * must land back in the same state it was left in.
     *
     * This used to set 'completed' unconditionally, which silently threw away the
     * draft: `showGenerateCta` requires phase === 'ready', so switching to another
     * chat and coming back made the "Generate podcast" action disappear with no
     * way to get it back. `podcastId` is null until generation is kicked off, so
     * it is the reliable signal for "this was never generated".
     */
    const restoredCollected = (loadProject.collected as Collected) ?? null;
    const neverGenerated = !loadProject.podcastId;
    const planReady =
      !!restoredCollected?.duration &&
      !!restoredCollected?.language &&
      !!restoredCollected?.style &&
      ((loadProject.turns as Turn[]) ?? []).some(
        (t) => t.kind === 'stream' && !!t.answer
      );

    if (neverGenerated && planReady) {
      // Back to the actionable draft state, with the plan and the CTA intact.
      setPhase('ready');
      setHistoryMode(false);
      setShowHistory(true);
    } else {
      // The workspace stays editable: `completed` keeps the reply box active so
      // the user can continue the conversation, regenerate, or change params.
      setPhase('completed');
      setHistoryMode(true);
      // Start collapsed so the player and production trail are what you land on.
      setShowHistory(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadProject?.id]);

  // "New Podcast" — reset to a blank welcome state. The previous project is
  // already persisted, so nothing is lost.
  const lastNewSignalRef = useRef(newProjectSignal);
  useEffect(() => {
    if (newProjectSignal === lastNewSignalRef.current) return;
    lastNewSignalRef.current = newProjectSignal;

    haltLiveActivity();
    lastLoadedIdRef.current = null;
    lastStatusRef.current = null;

    setProjectId(null);
    setTurns([]);
    setCollected({ topic: '' });
    setProducingPodcastId(null);
    setLastPodcastStatus(null);
    setReadyPodcast(null);
    setErrorMessage(null);
    setPrompt('');
    setPhase('welcome');
    setHistoryMode(false);
    setShowHistory(false);
    setProducingPodcast(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProjectSignal]);

  // Persist the conversation on every change so a reload, crash, or project
  // switch mid-generation never loses the trail.
  useEffect(() => {
    if (!projectId) return;
    if (turns.length === 0) return;
    saveProjectSession(projectId, turns, collected);
    onProjectChanged?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, turns, collected]);

  // Denormalize the collected params onto the project so sidebar cards can
  // show "10 min • English • Storytelling" without loading the conversation.
  useEffect(() => {
    if (!projectId) return;
    if (!collected.duration && !collected.language && !collected.style) return;
    updateProject(projectId, {
      durationMinutes: collected.duration?.minutes,
      language: collected.language?.label,
      styleLabel: collected.style?.label,
      subject: collected.topic || undefined,
    });
    onProjectChanged?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    projectId,
    collected.duration?.minutes,
    collected.language?.label,
    collected.style?.label,
  ]);

  // Live phases exit history mode so continued conversation renders at full
  // size rather than the compact recap styling.
  useEffect(() => {
    if (
      phase === 'welcome' ||
      phase === 'ask_duration' ||
      phase === 'ask_language' ||
      phase === 'ask_style' ||
      phase === 'streaming' ||
      phase === 'producing'
    ) {
      if (historyMode) setHistoryMode(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const describeError = (err: unknown): string => {
    const e = err as any;
    return (
      e?.response?.data?.error ||
      e?.response?.data?.details ||
      e?.message ||
      'Something went wrong. Please try again.'
    );
  };

  const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // --- Collection handlers ------------------------------------------------

  const handleInitialSubmit = () => {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    setErrorMessage(null);
    onStartGeneration();

    const initialCollected: Collected = { topic: trimmed };
    const initialTurns: Turn[] = [
      { kind: 'user', id: makeId('u'), content: trimmed },
      {
        kind: 'ai_prose',
        id: makeId('a'),
        content: `Got it — ${trimmed}. About how long should the podcast be?`,
      },
    ];

    // Create the project immediately. Everything from here on — reasoning,
    // generation, assets — is attached to it, so the work is never lost even
    // if the user navigates away before generating.
    const project = createProject({
      firstMessage: trimmed,
      turns: initialTurns,
      collected: initialCollected,
    });
    setProjectId(project.id);
    onActiveProjectIdChange?.(project.id);
    onProjectChanged?.();

    setCollected(initialCollected);
    setTurns(initialTurns);
    setPrompt('');
    setPhase('ask_duration');
  };

  const pushUserPill = (content: string) =>
    setTurns((prev) => [...prev, { kind: 'user', id: makeId('u'), content }]);
  const pushAiProse = (content: string, typing = false) =>
    setTurns((prev) => [
      ...prev,
      { kind: 'ai_prose', id: makeId('a'), content, typing },
    ]);

  const handlePickDuration = (opt: DurationOption) => {
    pushUserPill(opt.label);
    pushAiProse('Sounds good. Which language should the podcast be in?');
    setCollected((c) => ({ ...c, duration: { label: opt.label, minutes: opt.minutes } }));
    setPhase('ask_language');
  };

  const handleCustomDuration = (raw: string) => {
    const minutes = parseInt(raw, 10);
    if (!minutes || minutes <= 0 || minutes > 180) {
      setErrorMessage('Please enter a duration between 1 and 180 minutes.');
      return;
    }
    handlePickDuration({ label: `${minutes} Minutes`, minutes });
  };

  const handlePickLanguage = (opt: LanguageOption) => {
    pushUserPill(opt.label);
    pushAiProse('Perfect. Last one — what podcast style should I use?');
    setCollected((c) => ({ ...c, language: { label: opt.label, value: opt.value } }));
    setPhase('ask_style');
  };

  const handleCustomLanguage = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    handlePickLanguage({ label: trimmed, value: trimmed });
  };

  const handlePickStyle = (opt: StyleOption) => {
    pushUserPill(opt.label);
    const picked = {
      label: opt.label,
      podcastStyle: opt.podcastStyle,
      speakerStyle: opt.speakerStyle,
    };
    setCollected((c) => ({ ...c, style: picked }));
    // Begin real SSE streaming with the fully collected params.
    const finalCollected: Collected = { ...collected, style: picked };
    startPlanningStream(finalCollected);
  };

  // --- Streaming ----------------------------------------------------------

  const startPlanningStream = async (params: Collected) => {
    if (!user?.uid) {
      setErrorMessage('You must be signed in to use the studio.');
      return;
    }
    if (!params.topic || !params.duration || !params.language || !params.style) {
      // Safety guard. It must still SAY something: returning silently here
      // leaves the phase on `ask_style`, so the chips stay up and every
      // further click looks like a dead button.
      const missing = [
        !params.topic && 'topic',
        !params.duration && 'duration',
        !params.language && 'language',
        !params.style && 'style',
      ]
        .filter(Boolean)
        .join(', ');
      setErrorMessage(`Missing ${missing}. Start a new podcast and pick again.`);
      return;
    }

    const summary = `Great. Let me put together a ${params.duration.label.toLowerCase()} ${
      params.style.label.toLowerCase()
    } podcast in ${params.language.label} about "${params.topic}". Give me a moment...`;

    // Push summary as AI prose, then create the empty stream turn placeholder.
    const streamTurnId = makeId('s');
    setTurns((prev) => [
      ...prev,
      { kind: 'ai_prose', id: makeId('a'), content: summary },
      {
        kind: 'stream',
        id: streamTurnId,
        reasoningSteps: [],
        reasoningText: '',
        answer: '',
      },
    ]);
    setCurrentStreamTurnId(streamTurnId);
    setPhase('streaming');

    const message = buildPlanningPrompt(params);

    try {
      const result = await stream.startStream({
        userId: user.uid,
        sessionId,
        message,
        model: 'gemini',
        topicType: 'podcast',
      });

      const enrichedFinal =
        liveEventsRef.current.length >= result.progress.length
          ? liveEventsRef.current
          : (result.progress as RStep[]);

      setTurns((prev) =>
        prev.map((t) =>
          t.kind === 'stream' && t.id === streamTurnId
            ? {
                ...t,
                reasoningSteps: enrichedFinal,
                reasoningText: result.reasoning,
                answer: result.content,
                reasoningMs: result.reasoningMs,
              }
            : t
        )
      );
      setPhase('ready');
    } catch (err) {
      const message = describeError(err);
      setErrorMessage(message);
      setTurns((prev) =>
        prev.map((t) =>
          t.kind === 'stream' && t.id === streamTurnId
            ? { ...t, error: message }
            : t
        )
      );
      setPhase('ready');
    } finally {
      setCurrentStreamTurnId(null);
    }
  };

  // Reply input (only available in the `ready` phase) — fires a follow-up
  // stream turn without re-asking the collection questions.
  const handleReply = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || stream.isStreaming || phase !== 'ready') return;
    if (!user?.uid) {
      setErrorMessage('You must be signed in to use the studio.');
      return;
    }

    // Asking for it in the chat is the natural way to start production; the
    // button is a shortcut, not the only route. A plain "generate" or "बना दो"
    // would otherwise be sent off as a refinement request to the planner, which
    // just re-plans the same episode and never produces anything.
    if (isGenerateRequest(trimmed) && collected.duration && collected.language && collected.style) {
      setErrorMessage(null);
      setPrompt('');
      pushUserPill(trimmed);
      await handleGeneratePodcast();
      return;
    }

    setErrorMessage(null);
    setPrompt('');

    const streamTurnId = makeId('s');
    setTurns((prev) => [
      ...prev,
      { kind: 'user', id: makeId('u'), content: trimmed },
      {
        kind: 'stream',
        id: streamTurnId,
        reasoningSteps: [],
        reasoningText: '',
        answer: '',
      },
    ]);
    setCurrentStreamTurnId(streamTurnId);
    setPhase('streaming');

    try {
      const result = await stream.startStream({
        userId: user.uid,
        sessionId,
        message: trimmed,
        model: 'gemini',
        topicType: 'podcast',
      });

      const enrichedFinal =
        liveEventsRef.current.length >= result.progress.length
          ? liveEventsRef.current
          : (result.progress as RStep[]);

      setTurns((prev) =>
        prev.map((t) =>
          t.kind === 'stream' && t.id === streamTurnId
            ? {
                ...t,
                reasoningSteps: enrichedFinal,
                reasoningText: result.reasoning,
                answer: result.content,
                reasoningMs: result.reasoningMs,
              }
            : t
        )
      );
      setPhase('ready');
    } catch (err) {
      const message = describeError(err);
      setErrorMessage(message);
      setTurns((prev) =>
        prev.map((t) =>
          t.kind === 'stream' && t.id === streamTurnId
            ? { ...t, error: message }
            : t
        )
      );
      setPhase('ready');
    } finally {
      setCurrentStreamTurnId(null);
    }
  };

  // --- Podcast generation -------------------------------------------------

  const handleGeneratePodcast = async () => {
    if (isPodcastGenerating) return;
    if (!collected.duration || !collected.language || !collected.style) {
      setErrorMessage('Missing duration, language, or style — please restart.');
      return;
    }

    // Use the most recent stream answer as the podcast source.
    const lastStreamAnswer = [...turns]
      .reverse()
      .find((t): t is Extract<Turn, { kind: 'stream' }> => t.kind === 'stream' && !!t.answer);

    if (!lastStreamAnswer) return;

    setErrorMessage(null);
    try {
      const request: GeneratePodcastRequest = {
        type: 'custom',
        source: {
          kind: 'prompt',
          prompt: `${collected.topic}\n\n${lastStreamAnswer.answer}`.trim(),
        },
        durationMinutes: collected.duration.minutes,
        // Both are sent: podcastStyle is the real format, speakerStyle is the
        // legacy fallback for a backend with ENHANCED_PODCAST_STYLES off.
        podcastStyle: collected.style.podcastStyle,
        speakerStyle: collected.style.speakerStyle,
        voiceStyle: 'warm_teacher',
        language: collected.language.value,
      };
      const response = await generate(request);

      // Link the podcast to this project so its audio, transcript, quiz,
      // flashcards and mind map remain reachable from the project forever.
      if (projectId) {
        updateProject(projectId, {
          podcastId: response.podcastId,
          status: 'planning',
          durationMinutes: collected.duration.minutes,
          language: collected.language.label,
          styleLabel: collected.style.label,
        });
        onProjectChanged?.();
      }

      // Do NOT close the studio. Instead, stay on the page and watch the
      // production job progress live in the chat via polling.
      setProducingPodcastId(response.podcastId);
      setLastPodcastStatus(null);
      lastStatusRef.current = null;
      setPhase('producing');
      pushAiProse('Kicking off podcast production...');
    } catch (err) {
      setErrorMessage(describeError(err));
    }
  };

  // Poll the podcast job while producing, push a chat narration every time
  // the status transitions, and stop when the job reaches READY, FAILED or
  // CANCELLED.
  useEffect(() => {
    if (!producingPodcastId || phase !== 'producing') return;

    let cancelled = false;
    let timeoutId: number | null = null;

    const tick = async () => {
      try {
        const podcast = await podcastsApi.get(producingPodcastId);
        if (cancelled) return;

        // Keep the whole snapshot: the progress panel needs progressPct and the
        // backend's stageDetails trail, not just the coarse status.
        setProducingPodcast(podcast);

        // Notify the parent every poll so the sidebar/right-pane can update.
        onPodcastProgress?.(podcast);

        // Stage transition: kick off the rotating narration for the new
        // stage. Ref-based check prevents stale-closure duplicates.
        if (podcast.status !== lastStatusRef.current) {
          lastStatusRef.current = podcast.status;
          setLastPodcastStatus(podcast.status);
          // Mirror the live status onto the project so the sidebar card shows
          // an accurate progress state even while the user is elsewhere.
          if (projectId) {
            updateProject(projectId, {
              podcastStatus: podcast.status,
              status: projectStatusFromPodcast(podcast.status),
            });
            onProjectChanged?.();
          }
          // Deliberately no client-side narration here any more.
          //
          // This used to start a timer that pushed a canned sentence into the
          // chat every two seconds ("Applying natural pauses between sentences
          // for comprehension…"). Those lines were pure fiction — they were not
          // reports of anything the backend did, and they kept appearing even
          // when a stage had failed. ProductionProgress now shows the real
          // status plus the backend's own `stageDetails`.
        }

        if (podcast.status === 'READY') {
          setReadyPodcast(podcast);
          const title = podcast.title || 'Your podcast';
          // Promote the AI-generated title onto the project — much more
          // recognisable in the sidebar than the raw first message.
          if (projectId) {
            updateProject(projectId, {
              title,
              podcastStatus: 'READY',
              status: 'ready',
              durationMinutes:
                podcast.duration && podcast.duration > 0
                  ? Math.max(1, Math.round(podcast.duration / 60))
                  : collected.duration?.minutes,
            });
            onProjectChanged?.();
          }
          pushAiProse(
            `🎉 Congratulations! "${title}" is now ready to listen. It's saved under Podcast Projects in the sidebar, and the full transcript is loading in the right panel. You can keep refining it from here anytime.`,
            true
          );
          onPodcastReady?.(podcast);
          setPhase('completed');
          return;
        }
        if (podcast.status === 'FAILED' || (podcast.status as string) === 'CANCELLED') {
          if (projectId) {
            updateProject(projectId, {
              podcastStatus: podcast.status,
              status: 'failed',
            });
            onProjectChanged?.();
          }
          setPhase('completed');
          return;
        }

        if (STAGE_IN_PROGRESS.includes(podcast.status)) {
          timeoutId = window.setTimeout(tick, 3000);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('[Studio] Failed to poll podcast status:', err);
        timeoutId = window.setTimeout(tick, 5000);
      }
    };

    tick();

    return () => {
      cancelled = true;
      if (timeoutId != null) window.clearTimeout(timeoutId);
      if (narrationTimerRef.current != null) {
        window.clearInterval(narrationTimerRef.current);
        narrationTimerRef.current = null;
      }
      narrationStageRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [producingPodcastId, phase, projectId]);

  // --- Render -------------------------------------------------------------

  if (phase === 'welcome') {
    return (
      <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-[#1a1d21] relative">
        {/* Cinematic Status Badge — floating top-right */}
        <div className="absolute top-3 right-6 z-20">
          <CinematicStatusBadge />
        </div>
        <EmptyPromptState
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleInitialSubmit}
          isStarting={false}
          errorMessage={errorMessage}
        />
      </div>
    );
  }

  const showReplyInput = phase === 'ready' || phase === 'completed';
  const showGenerateCta = phase === 'ready' && collected.duration && collected.language && collected.style;
  const showProducingIndicator = phase === 'producing';
  // The card renders for a podcast finished in this session (`readyPodcast`)
  // and for one restored with a project (`activePodcast`), so reopening a
  // project always gives you the player back.
  const cardPodcast = readyPodcast ?? activePodcast ?? null;
  const showResultCard = phase === 'completed' && !!cardPodcast;
  // Celebrate only for a podcast that just finished, not a restored one.
  const celebrateCard = !!readyPodcast && readyPodcast.status === 'READY';

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white dark:bg-[#1a1d21] relative">
      {/* Cinematic Status Badge — floating top-right */}
      <div className="absolute top-3 right-6 z-20">
        <CinematicStatusBadge />
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {/*
            Conversation history toggle.
            Only offered for a RESTORED project — during a live session the turns
            are the conversation in progress and hiding them would be absurd.
          */}
          {historyMode && turns.length > 0 && (
            <button
              type="button"
              onClick={() => setShowHistory((v) => !v)}
              aria-expanded={showHistory}
              className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-gray-200 dark:border-white/10 bg-white dark:bg-[#23262b] px-3 py-1.5 text-[12.5px] font-medium text-gray-600 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-indigo-500/50 transition-colors"
            >
              {showHistory ? (
                <ChevronDown className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              <MessageSquare className="h-3.5 w-3.5" />
              {showHistory
                ? 'Hide conversation'
                : `Show conversation (${turns.length} message${turns.length === 1 ? '' : 's'})`}
            </button>
          )}

          {(!historyMode || showHistory) && (
            <AnimatePresence initial={false}>
              {turns.map((turn, idx) => (
                <TurnRenderer
                  key={turn.id}
                  turn={turn}
                  isLiveStream={
                    turn.kind === 'stream' &&
                    turn.id === currentStreamTurnId &&
                    stream.isStreaming
                  }
                  liveSteps={liveEvents}
                  liveReasoning={stream.reasoning}
                  liveAnswer={stream.content}
                  historyMode={historyMode}
                  isLast={idx === turns.length - 1}
                />
              ))}
            </AnimatePresence>
          )}

          {/*
            Live production panel — progress bar, a green tick per completed
            step, and the backend's own activity lines under each step. Stays
            visible (collapsed) after completion so the trail can be reviewed.
          */}
          {(showProducingIndicator || (phase === 'completed' && producingPodcast)) && (
            <ProductionProgress
              status={lastPodcastStatus}
              progressPct={(producingPodcast as any)?.progressPct}
              stageDetails={(producingPodcast as any)?.stageDetails}
              defaultCollapsed={phase === 'completed'}
            />
          )}

          {/* Result card — compact summary + inline playback */}
          {showResultCard && cardPodcast && (
            <PodcastResultCard
              podcast={cardPodcast}
              celebrate={celebrateCard}
              onOpenEpisode={onOpenEpisode}
              onDelete={onDeleteProject}
              // Regenerate reuses the same plan, so it's only offered while a
              // stream answer is still in the conversation to generate from.
              onRegenerate={
                turns.some((t) => t.kind === 'stream' && !!t.answer)
                  ? handleGeneratePodcast
                  : undefined
              }
            />
          )}

          {/* Active question chips */}
          {phase === 'ask_duration' && (
            <ChipQuestion
              options={DURATION_OPTIONS.map((o) => ({ label: o.label, key: o.label, payload: o }))}
              onPick={(payload) => handlePickDuration(payload as DurationOption)}
              customPlaceholder="e.g. 12"
              onCustom={handleCustomDuration}
            />
          )}
          {phase === 'ask_language' && (
            <ChipQuestion
              options={LANGUAGE_OPTIONS.map((o) => ({ label: o.label, key: o.label, payload: o }))}
              onPick={(payload) => handlePickLanguage(payload as LanguageOption)}
              customPlaceholder="Enter a language"
              onCustom={handleCustomLanguage}
            />
          )}
          {phase === 'ask_style' && (
            <ChipQuestion
              options={STYLE_OPTIONS.map((o) => ({ label: o.label, key: o.label, payload: o }))}
              onPick={(payload) => handlePickStyle(payload as StyleOption)}
            />
          )}

          {/*
            Errors during the collection phases (ask_duration / ask_language /
            ask_style) previously had nowhere to render: the only banners lived
            in the welcome state and the generate CTA. A failure mid-collection
            was therefore completely silent — the chips just stopped working.
          */}
          {errorMessage && !showGenerateCta && (
            <div
              role="alert"
              className="mt-3 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[13.5px] text-red-700 dark:text-red-300"
            >
              {errorMessage}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Generate CTA + error banner */}
      {showGenerateCta && (
        <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1d21] flex-shrink-0">
          <div className="max-w-3xl mx-auto px-6 pt-3">
            {errorMessage && (
              <div className="mb-2 rounded-md border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-[13.5px] text-red-700 dark:text-red-300">
                {errorMessage}
              </div>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-[13px] text-gray-500 dark:text-gray-400">
                Ready to generate the podcast from this plan?
              </span>
              <button
                onClick={handleGeneratePodcast}
                disabled={isPodcastGenerating}
                className={cn(
                  'inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-[14px] font-medium transition-all',
                  isPodcastGenerating
                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 hover:bg-blue-700 text-white'
                )}
              >
                {isPodcastGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate podcast
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reply input only in `ready` phase */}
      {showReplyInput && (
        <StudioReplyInput
          value={prompt}
          onChange={setPrompt}
          onSend={handleReply}
          disabled={stream.isStreaming || isPodcastGenerating}
          placeholder={
            showGenerateCta
              ? 'Say "generate" to produce it, or ask for a change…'
              : 'Ask a follow-up or refine the plan…'
          }
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Turn renderer
// ---------------------------------------------------------------------------

function TurnRenderer({
  turn,
  isLiveStream,
  liveSteps,
  liveReasoning,
  liveAnswer,
  historyMode,
  isLast,
}: {
  turn: Turn;
  isLiveStream: boolean;
  liveSteps: RStep[];
  liveReasoning: string;
  liveAnswer: string;
  historyMode: boolean;
  isLast: boolean;
}) {
  // In history mode every turn except the last is rendered smaller so the
  // reasoning/intermediate content reads as a compact recap and the final
  // completion line gets emphasis.
  const compact = historyMode && !isLast;
  const emphasise = historyMode && isLast;

  if (turn.kind === 'user') {
    return (
      <motion.div
        key={turn.id}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        className={cn('flex justify-end', compact ? 'mb-2' : 'mb-4')}
      >
        <div
          className={cn(
            'max-w-[75%] rounded-2xl rounded-br-md bg-gray-100 dark:bg-[#2a2d32] text-gray-800 dark:text-gray-100',
            compact
              ? 'px-3.5 py-2 text-[14.5px] leading-snug'
              : 'px-3.5 py-2 text-[15px] leading-relaxed'
          )}
        >
          <p className="whitespace-pre-wrap">{turn.content}</p>
        </div>
      </motion.div>
    );
  }

  if (turn.kind === 'ai_prose') {
    return (
      <AiProseLine
        turn={turn}
        compact={compact}
        emphasise={emphasise}
      />
    );
  }

  // stream
  const steps = isLiveStream ? liveSteps : turn.reasoningSteps;
  const reasoning = isLiveStream ? liveReasoning : turn.reasoningText;
  const rawAnswer = isLiveStream ? liveAnswer : turn.answer;
  // While streaming, apply the same steady-rate reveal we use for prose so a
  // burst of chunks from the SDK doesn't paint the plan in visible jumps. Once
  // the turn is finalized (not live), render the full text immediately.
  const answer = useSmoothStreamReveal(rawAnswer, isLiveStream);

  return (
    <motion.div
      key={turn.id}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={compact ? 'mb-6' : 'mb-8'}
    >
      {(reasoning || steps.length > 0) && (
        <ReasoningTimeline
          steps={steps}
          reasoningText={reasoning}
          streaming={isLiveStream}
          hasAnswer={!!answer}
          durationMs={isLiveStream ? undefined : turn.reasoningMs}
          stepDefs={STUDIO_STEP_DEFS}
        />
      )}

      {isLiveStream && !answer && !reasoning && steps.length === 0 && (
        <StartingPulse />
      )}

      {answer && (
        <div
          className={cn(
            'font-answer prose prose-slate dark:prose-invert max-w-none text-gray-800 dark:text-gray-200',
            // A generated plan is a long, deeply-nested outline. `prose` sizes
            // headings relative to its OWN 1rem base rather than the container's
            // font size, so setting only a base size left the headings large and
            // the nested lists airy — a 5-minute script filled several screens.
            // Headings and list spacing are pinned explicitly to keep it scannable.
            'prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1',
            'prose-h1:text-[13.5px] prose-h2:text-[13.5px] prose-h3:text-[13px] prose-h4:text-[13px]',
            'prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5',
            'prose-li:leading-[1.55] prose-strong:font-semibold',
            'prose-blockquote:my-2 prose-blockquote:py-0 prose-hr:my-3',
            compact
              ? 'text-[12.5px] leading-[1.6]'
              : 'text-[13px] leading-[1.62]'
          )}
        >
          <MarkdownMessage content={answer} />
          {isLiveStream && (
            <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-indigo-400/70 animate-pulse align-middle" />
          )}
        </div>
      )}

      {turn.error && (
        <div className="mt-2 text-[13.5px] text-red-600 dark:text-red-400">
          {turn.error}
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Chip question (inline pills; optional Custom input)
// ---------------------------------------------------------------------------

interface ChipQuestionProps<T> {
  options: { label: string; key: string; payload: T }[];
  onPick: (payload: T) => void;
  /** Show a "Custom" chip that expands into an inline input. */
  customPlaceholder?: string;
  onCustom?: (value: string) => void;
}

function ChipQuestion<T>({
  options,
  onPick,
  customPlaceholder,
  onCustom,
}: ChipQuestionProps<T>) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 flex flex-wrap gap-1.5 items-center"
    >
      {options.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={() => onPick(opt.payload)}
          className="px-3 py-1 rounded-full text-[13.5px] border border-gray-200 dark:border-white/15 bg-white dark:bg-transparent text-gray-700 dark:text-gray-300 hover:border-indigo-400 dark:hover:border-indigo-500/60 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors"
        >
          {opt.label}
        </button>
      ))}

      {customPlaceholder && onCustom && !customOpen && (
        <button
          type="button"
          onClick={() => setCustomOpen(true)}
          className="px-3 py-1 rounded-full text-[13.5px] border border-dashed border-gray-300 dark:border-white/15 bg-transparent text-gray-500 dark:text-gray-400 hover:border-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors"
        >
          Custom
        </button>
      )}

      {customPlaceholder && onCustom && customOpen && (
        <div className="inline-flex items-center gap-1 rounded-full border border-indigo-300 dark:border-indigo-500/50 bg-white dark:bg-[#2a2d32] pl-3 pr-1 py-0.5">
          <input
            autoFocus
            value={customValue}
            onChange={(e) => setCustomValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (customValue.trim()) {
                  onCustom(customValue.trim());
                  setCustomValue('');
                  setCustomOpen(false);
                }
              } else if (e.key === 'Escape') {
                setCustomOpen(false);
                setCustomValue('');
              }
            }}
            placeholder={customPlaceholder}
            className="bg-transparent outline-none text-[13.5px] text-gray-800 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 w-28"
          />
          <button
            type="button"
            onClick={() => {
              if (customValue.trim()) {
                onCustom(customValue.trim());
                setCustomValue('');
                setCustomOpen(false);
              }
            }}
            className="p-1 rounded-full text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
            aria-label="Confirm custom value"
          >
            <Send className="w-3 h-3" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Empty (welcome) state — "Create Content"
// ---------------------------------------------------------------------------

/** Starter templates surfaced under the Templates tab. */
const PODCAST_TEMPLATES: {
  name: string;
  blurb: string;
  prompt: string;
  accent: string;
}[] = [
  {
    name: 'Exam crash course',
    blurb: 'Fast, high-yield revision for a single chapter',
    prompt: 'Create a crash course revision podcast for Class 12 Physics — Electrostatics, focused on exam-important formulas and common mistakes.',
    accent: 'from-indigo-500 to-violet-500',
  },
  {
    name: 'Concept explainer',
    blurb: 'Build intuition from first principles',
    prompt: 'Explain how photosynthesis works from first principles, using everyday analogies a beginner can follow.',
    accent: 'from-teal-500 to-emerald-500',
  },
  {
    name: 'Story-led lesson',
    blurb: 'Teach through narrative and characters',
    prompt: 'Teach the French Revolution as a gripping story with characters, turning points and cause-and-effect.',
    accent: 'from-amber-500 to-orange-500',
  },
  {
    name: 'Doubt-solving session',
    blurb: 'Teacher answers a student’s real questions',
    prompt: 'Create a doubt-solving podcast where a student asks tricky questions about calculus derivatives and a teacher answers step by step.',
    accent: 'from-rose-500 to-pink-500',
  },
];

interface EmptyPromptStateProps {
  prompt: string;
  onPromptChange: (v: string) => void;
  onSubmit: () => void;
  isStarting: boolean;
  errorMessage?: string | null;
}

function EmptyPromptState({
  prompt,
  onPromptChange,
  onSubmit,
  isStarting,
  errorMessage,
}: EmptyPromptStateProps) {
  const [tab, setTab] = useState<'create' | 'templates'>('create');

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0 bg-[#fafbfc] dark:bg-[#0b0b0c]">
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        <div className="max-w-2xl mx-auto px-6 pt-6 pb-8">
          {/* Quick actions */}
          <QuickActions />

          {/* Title */}
          <h2 className="mt-5 text-[22px] sm:text-[24px] font-semibold text-slate-900 dark:text-white tracking-[-0.025em]">
            Create Content
          </h2>

          {/* Create / Templates segmented control */}
          <SegmentedTabs
            tab={tab}
            onChange={setTab}
            templateCount={PODCAST_TEMPLATES.length}
          />

          {tab === 'create' ? (
            <CreatePane
              onPick={onPromptChange}
              disabled={isStarting}
              onViewTemplates={() => setTab('templates')}
            />
          ) : (
            <TemplatesPane
              onPick={(p) => {
                onPromptChange(p);
                setTab('create');
              }}
              disabled={isStarting}
            />
          )}
        </div>
      </div>

      {/* Prompt composer */}
      <div className="border-t border-slate-200/80 dark:border-white/10 bg-white/60 dark:bg-[#111113]/80 backdrop-blur-md flex-shrink-0">
        <div className="max-w-2xl mx-auto px-6 py-4">
          {errorMessage && (
            <div className="mb-3 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-[13px] text-red-700 dark:text-red-300">
              {errorMessage}
            </div>
          )}
          <div className="bg-white dark:bg-[#141416] rounded-2xl border border-slate-200/90 dark:border-white/10 shadow-xs focus-within:border-slate-400 dark:focus-within:border-white/25 focus-within:shadow-sm transition-all">
            <textarea
              value={prompt}
              onChange={(e) => onPromptChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="What podcast would you like to create today?"
              rows={1}
              disabled={isStarting}
              className="w-full px-4 py-3.5 bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none text-[14px] leading-relaxed disabled:opacity-60 scrollbar-hide"
              style={{ minHeight: '44px', maxHeight: '200px' }}
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = Math.min(target.scrollHeight, 200) + 'px';
              }}
            />

            <div className="flex items-center justify-between px-4 pb-3 pt-1.5 border-t border-slate-100 dark:border-white/[0.04]">
              <div className="text-[11.5px] font-mono text-slate-400 dark:text-slate-500">
                {prompt.length} characters
              </div>
              <button
                onClick={onSubmit}
                disabled={!prompt.trim() || isStarting}
                className={cn(
                  'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-[13.5px] font-semibold transition-all shadow-xs',
                  prompt.trim() && !isStarting
                    ? 'bg-slate-900 hover:bg-slate-800 text-white dark:bg-[#c8e558] dark:hover:bg-[#bcd94c] dark:text-slate-900 active:scale-95'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                )}
              >
                <Sparkles className="w-3.5 h-3.5" /> Continue
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** "Quick Actions:" row of outlined pills with external-link arrows. */
function QuickActions() {
  const actions = [
    { label: 'Pipeline', icon: Layers },
    { label: 'Magic Chat', icon: MessageSquare },
    { label: 'Studio', icon: Clapperboard },
  ];
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[12px] font-medium text-slate-400 dark:text-slate-500">Quick Actions:</span>
      {actions.map(({ label, icon: Icon }) => (
        <button
          key={label}
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/[0.03] text-[12px] font-medium text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-white/20 hover:bg-slate-50 dark:hover:bg-white/[0.06] transition-colors shadow-2xs"
        >
          <Icon className="w-3.5 h-3.5 text-[#8ba32b] dark:text-[#c8e558]" />
          {label}
          <ArrowUpRight className="w-3 h-3 text-slate-400 dark:text-slate-500" />
        </button>
      ))}
    </div>
  );
}

/** Pill-track toggle between the Create and Templates panes. */
function SegmentedTabs({
  tab,
  onChange,
  templateCount,
}: {
  tab: 'create' | 'templates';
  onChange: (t: 'create' | 'templates') => void;
  templateCount: number;
}) {
  return (
    <div className="mt-4 rounded-full bg-slate-100/90 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 p-1 flex items-center max-w-[340px]">
      <button
        type="button"
        onClick={() => onChange('create')}
        className={cn(
          'flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-[12.5px] font-semibold transition-all',
          tab === 'create'
            ? 'bg-white dark:bg-[#1f1f23] text-slate-900 dark:text-white shadow-xs'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        )}
      >
        <Sparkles
          className={cn(
            'w-3.5 h-3.5',
            tab === 'create' ? 'text-[#8ba32b] dark:text-[#c8e558]' : 'text-slate-400'
          )}
        />
        Create
      </button>
      <button
        type="button"
        onClick={() => onChange('templates')}
        className={cn(
          'flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-full text-[12.5px] font-semibold transition-all',
          tab === 'templates'
            ? 'bg-white dark:bg-[#1f1f23] text-slate-900 dark:text-white shadow-xs'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
        )}
      >
        <FileText className="w-3.5 h-3.5 text-slate-400" />
        Templates
        <span className="ml-0.5 px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-white/10 text-[10px] font-semibold text-slate-600 dark:text-slate-300 tabular-nums">
          {templateCount}
        </span>
      </button>
    </div>
  );
}

/**
 * The Create pane: three starter prompt rows and the recurring-prompts explainer.
 */
function CreatePane({
  onPick,
  disabled,
  onViewTemplates,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
  onViewTemplates: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pt-5"
    >
      {/* Starter prompt rows */}
      <div className="space-y-2 max-w-[500px]">
        {EXAMPLE_PROMPTS.slice(0, 3).map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => onPick(example)}
            disabled={disabled}
            className="group w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-xs hover:border-[#8ba32b]/40 dark:hover:border-[#c8e558]/40 hover:bg-slate-50/80 dark:hover:bg-white/[0.06] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-white/5 flex items-center justify-center text-slate-400 group-hover:text-[#8ba32b] dark:group-hover:text-[#c8e558] transition-colors shrink-0">
              <Sparkles className="w-3 h-3" />
            </div>
            <span className="flex-1 text-left text-[13px] font-medium text-slate-700 dark:text-slate-200 truncate group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
              {example}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 group-hover:translate-x-0.5 transition-transform" />
          </button>
        ))}
      </div>

      {/* Recurring prompts explainer card */}
      <div className="mt-8 p-5 rounded-2xl border border-slate-200/80 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] text-center max-w-[500px]">
        <h3 className="text-[13.5px] font-semibold text-slate-900 dark:text-white">
          Manage recurring prompts
        </h3>
        <p className="mt-1 mx-auto max-w-[340px] text-[12px] text-slate-500 dark:text-slate-400 leading-[1.6]">
          Recurring prompts generate structured revision content and daily podcasts automatically.
        </p>
        <button
          type="button"
          onClick={onViewTemplates}
          className="mt-3.5 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-white/12 bg-white dark:bg-white/[0.04] text-[12px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-white/[0.08] transition-colors shadow-2xs"
        >
          View Recommended Prompts
        </button>
      </div>
    </motion.div>
  );
}

/** Templates pane — the four starter podcast recipes. */
function TemplatesPane({
  onPick,
  disabled,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className="pt-5 space-y-2 max-w-[500px]"
    >
      {PODCAST_TEMPLATES.map((tpl) => (
        <button
          key={tpl.name}
          type="button"
          onClick={() => onPick(tpl.prompt)}
          disabled={disabled}
          className="group w-full flex items-start gap-3 p-3.5 rounded-xl border border-slate-200/90 dark:border-white/10 bg-white dark:bg-white/[0.03] shadow-xs hover:border-[#8ba32b]/40 dark:hover:border-[#c8e558]/40 hover:bg-slate-50/80 dark:hover:bg-white/[0.06] transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 shadow-2xs',
              tpl.accent || 'bg-slate-900 dark:bg-white text-white dark:text-slate-900'
            )}
          >
            <FileText className="w-4 h-4" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[13px] font-semibold text-slate-900 dark:text-white">
              {tpl.name}
            </span>
            <span className="block text-[12px] text-slate-500 dark:text-slate-400 leading-[1.5] mt-0.5">
              {tpl.blurb}
            </span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
        </button>
      ))}
      <p className="pt-2 text-center text-[11.5px] text-slate-400 dark:text-slate-500">
        Pick a template to prefill the prompt, then edit it however you like.
      </p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Reply input (docked at bottom during `ready` phase)
// ---------------------------------------------------------------------------

interface StudioReplyInputProps {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder?: string;
}

function StudioReplyInput({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
}: StudioReplyInputProps) {
  const canSend = value.trim().length > 0 && !disabled;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSend) onSend();
    }
  };

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#1a1d21] flex-shrink-0">
      <div className="max-w-3xl mx-auto px-6 py-3">
        <div className="relative bg-white dark:bg-[#2a2d32] rounded-lg border border-gray-300 dark:border-white/10 shadow-sm">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            disabled={disabled}
            className="w-full pl-4 pr-12 py-2.5 bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none resize-none text-[14.5px] leading-relaxed disabled:opacity-60 scrollbar-hide"
            style={{ minHeight: '38px', maxHeight: '160px' }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 160) + 'px';
            }}
          />
          <button
            onClick={onSend}
            disabled={!canSend}
            aria-label="Send message"
            className={cn(
              'absolute right-1.5 bottom-1.5 p-1.5 rounded-md transition-colors',
              canSend
                ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed'
            )}
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-1 text-[11.5px] text-gray-400 dark:text-gray-500">
          Enter to send · Shift+Enter for new line
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Small subcomponents
// ---------------------------------------------------------------------------

function UserPill({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      {/* Same font and rhythm as the AI prose it sits beside. */}
      <div className="max-w-[75%] px-3.5 py-2 rounded-2xl rounded-br-md bg-gray-100 dark:bg-[#2a2d32] font-answer text-[15px] leading-[1.7] text-gray-800 dark:text-gray-100">
        <p className="whitespace-pre-wrap">{content}</p>
      </div>
    </div>
  );
}

function StartingPulse() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center gap-1.5 text-[13px] text-gray-500 dark:text-gray-400 my-2"
    >
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400 dark:bg-gray-500 animate-bounce" />
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * A single AI prose line. When `typing: true`, characters are revealed
 * progressively — same feel as chat streaming — and a caret pulses at the
 * end until the full string is on screen.
 *
 * `compact` shrinks the type-size for reasoning/intermediate lines shown
 * inside a loaded history. `emphasise` slightly enlarges + weights the
 * final line so it reads as the summary at the bottom.
 */
function AiProseLine({
  turn,
  compact = false,
  emphasise = false,
}: {
  turn: Extract<Turn, { kind: 'ai_prose' }>;
  compact?: boolean;
  emphasise?: boolean;
}) {
  const revealed = useProseTypewriter(turn.content, !!turn.typing);
  const stillTyping = revealed.length < turn.content.length;

  // Explicit `size` on the turn wins over the computed compact/emphasise.
  //
  // Line-height is stated in absolute terms rather than via `leading-relaxed`,
  // because that utility is relative to font size: mixing it with four different
  // px sizes gave every variant a slightly different rhythm. A single 1.7 ratio
  // keeps the column even no matter which variant a line uses.
  const sizeClass = (() => {
    if (turn.size === 'sm') return 'text-[13.5px] leading-[1.6]';
    if (turn.size === 'lg') return 'text-[16.5px] leading-[1.7] font-medium';
    // Recap lines in a restored project: readable, slightly muted, not tiny.
    if (compact) return 'text-[15px] leading-[1.7] text-gray-600 dark:text-gray-400';
    // The closing line of a restored project gets the emphasis.
    if (emphasise)
      return 'text-[16.5px] leading-[1.7] font-medium text-gray-800 dark:text-gray-100';
    return 'text-[15px] leading-[1.7]';
  })();

  return (
    <motion.div
      key={turn.id}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={cn(
        compact ? 'mb-2.5' : 'mb-4',
        // `font-answer` is the app's existing Inter stack with letter-spacing
        // normalised — the same class the chat answers use. The studio prose was
        // inheriting the default body font instead, so the two surfaces rendered
        // the same sentence differently.
        'font-answer text-gray-700 dark:text-gray-300',
        sizeClass
      )}
    >
      <span className="whitespace-pre-wrap">{revealed}</span>
      {stillTyping && (
        <span className="inline-block w-[2px] h-[1.05em] ml-0.5 bg-indigo-400/80 animate-pulse align-[-0.15em]" />
      )}
    </motion.div>
  );
}

function useProseTypewriter(text: string, animate: boolean): string {
  const [shown, setShown] = useState<number>(animate ? 0 : text.length);
  const textRef = useRef(text);
  textRef.current = text;

  useEffect(() => {
    if (!animate) {
      setShown(text.length);
      return;
    }

    setShown(0);

    let raf = 0;
    let lastTs = 0;
    /** Fractional characters carried between frames, so the rate is exact. */
    let owed = 0;
    /** Remaining dwell at a sentence boundary. */
    let holdMs = 0;
    let revealed = 0;

    const tick = (ts: number) => {
      if (!lastTs) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;

      const full = textRef.current.length;

      if (holdMs > 0) {
        holdMs = Math.max(0, holdMs - dt);
      } else {
        owed += (dt / 1000) * PROSE_CHARS_PER_SECOND;
        if (owed >= 1) {
          const step = Math.floor(owed);
          owed -= step;
          revealed = Math.min(full, revealed + step);
          setShown(revealed);

          // Breathe at the end of a sentence. Without this a steady reveal
          // reads as a machine feed; with it, it reads like someone talking.
          const justRevealed = textRef.current[revealed - 1];
          if (justRevealed && SENTENCE_ENDS.includes(justRevealed) && revealed < full) {
            holdMs = PROSE_SENTENCE_PAUSE_MS;
          }
        }
      }

      if (revealed < textRef.current.length) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [text, animate]);

  return text.slice(0, shown);
}


/**
 * Reveal a streaming answer character-by-character at a steady rate.
 *
 * Chunks from the SSE stream can arrive in bursts (network buffering, SDK
 * batching), which paints the plan in visible jumps. This hook decouples
 * "what has arrived" from "what is shown": arrivals are appended to a target,
 * and a rAF loop advances the shown prefix at ~STREAM_CHARS_PER_SECOND. If the
 * target keeps growing, the reveal keeps catching up until it matches. If the
 * arrival is faster than the reveal rate, the reveal rate is auto-boosted so
 * we never drift more than a couple of seconds behind — otherwise a 300-char
 * burst would take 3+ seconds to catch up, which reads as broken.
 *
 * When `live` flips to false (turn finalized), we snap to the full text so
 * historical turns render instantly.
 */
const STREAM_CHARS_PER_SECOND = 80;
const STREAM_CATCHUP_MAX_LAG = 240; // chars behind before we accelerate
function useSmoothStreamReveal(fullText: string, live: boolean): string {
  const [shown, setShown] = useState<number>(live ? 0 : fullText.length);
  const targetRef = useRef(fullText);
  targetRef.current = fullText;

  useEffect(() => {
    if (!live) {
      setShown(fullText.length);
      return;
    }

    let raf = 0;
    let lastTs = 0;
    let owed = 0;
    let revealed = shown;

    const tick = (ts: number) => {
      if (!lastTs) lastTs = ts;
      const dt = ts - lastTs;
      lastTs = ts;

      const full = targetRef.current.length;
      const lag = full - revealed;

      // Base reveal rate; accelerate when we're falling far behind so the UI
      // never lingers more than a beat behind the actual answer.
      const rate =
        lag > STREAM_CATCHUP_MAX_LAG
          ? STREAM_CHARS_PER_SECOND * (1 + lag / STREAM_CATCHUP_MAX_LAG)
          : STREAM_CHARS_PER_SECOND;

      owed += (dt / 1000) * rate;
      if (owed >= 1 && revealed < full) {
        const step = Math.floor(owed);
        owed -= step;
        revealed = Math.min(full, revealed + step);
        setShown(revealed);
      }

      raf = window.requestAnimationFrame(tick);
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
    // We deliberately do NOT depend on fullText — new chars just extend the
    // target that the loop is already chasing, keeping the reveal continuous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  return fullText.slice(0, shown);
}

function buildPlanningPrompt(p: Collected): string {
  const parts = [
    `Plan a podcast about: ${p.topic}`,
    `Target duration: ${p.duration?.label ?? 'unspecified'}`,
    `Language: ${p.language?.label ?? 'unspecified'}`,
    `Podcast style: ${p.style?.label ?? 'unspecified'}`,
    '',
    'Return an outline with sections, learning objectives, and a suggested teaching approach.',
  ];
  return parts.join('\n');
}
