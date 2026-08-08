/**
 * Podcast Studio V2 — the Podcast Workspace.
 *
 * Three panes:
 *   - Left:   Podcast Projects list + "New Podcast" (see StudioSidebar)
 *   - Center: the AI conversation for the active project
 *   - Right:  transcript for the project's generated podcast
 *
 * Project model: every podcast conversation is a persistent project. Opening
 * one from the sidebar restores its conversation, its reasoning trail, and
 * its generated assets. Projects are created automatically as soon as the
 * user sends their first message, and stay editable forever — the workspace
 * never resets itself after generation.
 *
 * The backend generation pipeline is untouched; projects are a navigation
 * and continuity layer on top of it (see lib/podcastProjects.ts).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Moon,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  Share2,
  Sun,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { useTheme } from '../lib/ThemeContext';
import StudioSidebar, { StudioView } from '../components/studio-v2/StudioSidebar';
import StudioContent from '../components/studio-v2/StudioContent';
import StudioTranscript from '../components/studio-v2/StudioTranscript';
import TextToSpeechView from '../components/studio-v2/TextToSpeechView';
import type { PodcastMetadata } from '../types';
import { podcastsApi, type TranscriptSegment } from '../lib/api/podcasts';
import { usePodcasts } from '../hooks/api/usePodcasts';
import {
  backfillFromPodcasts,
  deleteProject as deleteStoredProject,
  getProject,
  listProjects,
  type PodcastProjectDetail,
  type PodcastProjectMeta,
} from '../lib/podcastProjects';

interface PodcastStudioV2Props {
  onClose?: () => void;
  /** Open the full episode dashboard (player, quiz, flashcards, mind map). */
  onOpenEpisode?: (podcast: PodcastMetadata) => void;
}

/** Ensure every transcript segment has the fields the UI expects. */
function normalizeSegments(raw: any[]): TranscriptSegment[] {
  return raw
    .map((seg, i) => {
      if (typeof seg === 'string') {
        return { segmentId: i, speaker: 'Speaker', text: seg, startMs: 0 };
      }
      return {
        segmentId: typeof seg.segmentId === 'number' ? seg.segmentId : i,
        chapterIndex: seg.chapterIndex,
        speaker: seg.speaker || seg.role || 'Speaker',
        text: seg.text || seg.content || '',
        startMs: typeof seg.startMs === 'number' ? seg.startMs : seg.start ?? undefined,
        endMs: typeof seg.endMs === 'number' ? seg.endMs : seg.end ?? undefined,
        citations: seg.citations,
      };
    })
    .filter((seg) => seg.text && seg.text.length > 0);
}

/** Small square icon button used in the breadcrumb header's action group. */
function HeaderIconButton({
  children,
  onClick,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        'p-1.5 rounded-md text-gray-500 dark:text-gray-400 transition-colors',
        'hover:bg-gray-100 dark:hover:bg-white/[0.07] hover:text-gray-700 dark:hover:text-gray-200',
        'disabled:opacity-35 disabled:hover:bg-transparent disabled:cursor-not-allowed'
      )}
    >
      {children}
    </button>
  );
}

export default function PodcastStudioV2({ onClose, onOpenEpisode }: PodcastStudioV2Props) {
  const { theme, toggleTheme } = useTheme();

  // --- Projects ----------------------------------------------------------
  const [projects, setProjects] = useState<PodcastProjectMeta[]>(() => listProjects());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  /** Detail blob handed to StudioContent to hydrate a project's conversation. */
  const [loadProject, setLoadProject] = useState<PodcastProjectDetail | null>(null);
  /** Bumped to tell StudioContent to reset to a blank new conversation. */
  const [newProjectSignal, setNewProjectSignal] = useState(0);

  /** Re-read the project index after StudioContent mutates the store. */
  const refreshProjects = useCallback(() => {
    setProjects(listProjects());
  }, []);

  // Backfill: podcasts generated before the project model existed have no
  // project, so they'd be invisible in the sidebar. Create one per orphaned
  // podcast (with a synthesized recap conversation) the first time the
  // library loads, so nothing the user made is lost.
  const { podcasts } = usePodcasts();
  const backfilledRef = useRef(false);
  useEffect(() => {
    if (backfilledRef.current) return;
    if (!podcasts || podcasts.length === 0) return;
    backfilledRef.current = true;
    if (backfillFromPodcasts(podcasts as any[])) {
      setProjects(listProjects());
    }
  }, [podcasts]);

  // --- View / panes ------------------------------------------------------
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTranscriptExpanded, setIsTranscriptExpanded] = useState(true);
  const [activeView, setActiveView] = useState<StudioView>('podcast');

  // --- Podcast + transcript for the right pane ---------------------------
  const [readyPodcast, setReadyPodcast] = useState<PodcastMetadata | null>(null);
  const [transcriptSegments, setTranscriptSegments] = useState<TranscriptSegment[] | null>(null);
  const [transcriptLoading, setTranscriptLoading] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);
  const [liveProducingId, setLiveProducingId] = useState<string | null>(null);
  /** Transient "Copied" state on the Share button when the clipboard path runs. */
  const [shareCopied, setShareCopied] = useState(false);

  const activeProject = useMemo(
    () => projects.find((p) => p.id === activeProjectId) ?? null,
    [projects, activeProjectId]
  );

  // --- Project actions ---------------------------------------------------

  /** Start a fresh conversation. Leaves existing projects untouched. */
  const handleNewProject = useCallback(() => {
    setActiveView('podcast');
    setActiveProjectId(null);
    setLoadProject(null);
    setReadyPodcast(null);
    setTranscriptSegments(null);
    setTranscriptError(null);
    setLiveProducingId(null);
    setIsGenerating(false);
    setNewProjectSignal((n) => n + 1);
  }, []);

  /**
   * Open an existing project: restore its conversation into the center pane
   * and, when it has a generated podcast, its transcript into the right pane.
   */
  const handleSelectProject = useCallback(async (projectId: string) => {
    const detail = getProject(projectId);
    if (!detail) {
      // Index/detail drift (e.g. detail evicted by the storage cap). Drop the
      // stale index entry so the sidebar stays honest.
      deleteStoredProject(projectId);
      setProjects(listProjects());
      return;
    }

    setActiveView('podcast');
    setActiveProjectId(projectId);
    setLoadProject(detail);

    if (!detail.podcastId) {
      // Draft project — nothing generated yet, so clear the right pane.
      setReadyPodcast(null);
      setTranscriptSegments(null);
      setTranscriptError(null);
      return;
    }

    // Fetch fresh podcast metadata so the transcript pane reflects the
    // current status rather than whatever was cached at generation time.
    try {
      const fresh = await podcastsApi.get(detail.podcastId);
      setReadyPodcast(fresh);
      setIsTranscriptExpanded(true);
    } catch (err) {
      console.warn('[Studio] Failed to load podcast for project:', err);
      setReadyPodcast(null);
      setTranscriptError('Could not load this podcast. It may have been deleted.');
    }
  }, []);

  /**
   * Delete a project. When a podcast was generated for it, also delete that
   * podcast on the backend — otherwise removing the project would orphan it
   * with no way to reach it from the UI. Declining the second prompt keeps
   * the podcast and only removes the conversation.
   */
  const handleDeleteProject = useCallback(
    async (projectId: string) => {
      const project = listProjects().find((p) => p.id === projectId);
      if (!project) return;

      if (!confirm(`Delete "${project.title}"? This cannot be undone.`)) return;

      if (project.podcastId) {
        const alsoDeleteAudio = confirm(
          'Also delete the generated podcast (audio, transcript and assets)?\n\n' +
            'OK = delete everything.\n' +
            'Cancel = keep the podcast, remove only this conversation.'
        );
        if (alsoDeleteAudio) {
          try {
            await podcastsApi.delete(project.podcastId);
          } catch (err: any) {
            console.error('[Studio] Failed to delete podcast:', err);
            alert(
              `Could not delete the podcast: ${
                err?.response?.data?.error || err?.message || 'unknown error'
              }`
            );
            return;
          }
        }
      }

      deleteStoredProject(projectId);
      setProjects(listProjects());
      if (activeProjectId === projectId) {
        handleNewProject();
      }
    },
    [activeProjectId, handleNewProject]
  );

  // Fetch the timed transcript via the ownership-checked backend endpoint.
  // Handles both the current engine (GCS `transcriptPath`) and the legacy
  // flow (`transcriptUrl`) — the backend resolves whichever exists.
  useEffect(() => {
    if (!readyPodcast) {
      setTranscriptSegments(null);
      setTranscriptError(null);
      return;
    }

    let cancelled = false;
    setTranscriptLoading(true);
    setTranscriptError(null);

    (async () => {
      try {
        const rawSegments = await podcastsApi.getTranscript(readyPodcast.id);
        if (cancelled) return;

        const segments = normalizeSegments(rawSegments as any[]);
        setTranscriptSegments(segments);
        if (segments.length === 0) {
          setTranscriptError(
            readyPodcast.status === 'READY'
              ? 'Transcript is empty. It may still be publishing — try again in a few seconds.'
              : 'Transcript will appear here once generation completes.'
          );
        }
      } catch (err: any) {
        if (cancelled) return;
        console.error('[Studio] Transcript fetch failed:', err);
        setTranscriptError(
          err?.response?.data?.error ||
            err?.response?.data?.message ||
            err?.message ||
            'Failed to load transcript.'
        );
        setTranscriptSegments(null);
      } finally {
        if (!cancelled) setTranscriptLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [readyPodcast?.id, readyPodcast?.status]);

  // Auto-open the right pane when a podcast finishes.
  useEffect(() => {
    if (readyPodcast?.status === 'READY') {
      setIsTranscriptExpanded(true);
    }
  }, [readyPodcast?.status]);

  const breadcrumbTitle =
    activeView === 'tts'
      ? 'Text to Speech'
      : activeProject?.title || readyPodcast?.title || 'New podcast';

  // --- Header actions ----------------------------------------------------

  /** Open the signed audio URL in a new tab so the browser downloads it. */
  const handleDownloadAudio = useCallback(async () => {
    if (!readyPodcast) return;
    try {
      const url =
        readyPodcast.audioUrl || (await podcastsApi.getAudioUrl(readyPodcast.id));
      if (!url) {
        alert('Audio is not available for this podcast yet.');
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      console.error('[Studio] Failed to get audio URL:', err);
      alert(
        `Could not download the audio: ${
          err?.response?.data?.error || err?.message || 'unknown error'
        }`
      );
    }
  }, [readyPodcast]);

  /**
   * Share via the native share sheet where available, falling back to
   * copying the title and description to the clipboard.
   */
  const handleShare = useCallback(async () => {
    if (!readyPodcast) return;
    const title = readyPodcast.title || 'Podcast';
    const text = [title, readyPodcast.description].filter(Boolean).join('\n\n');

    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share(
          { title, text }
        );
        return;
      } catch {
        // User dismissed the sheet, or the browser refused — fall through
        // to the clipboard path rather than failing silently.
      }
    }

    try {
      await navigator.clipboard?.writeText(text);
      setShareCopied(true);
      window.setTimeout(() => setShareCopied(false), 1600);
    } catch (err) {
      console.warn('[Studio] Share fallback failed:', err);
    }
  }, [readyPodcast]);

  return (
    <div className="w-full h-full bg-gray-50 dark:bg-[#1a1d21] flex overflow-hidden">
      {/* Left Sidebar — Podcast Projects */}
      <StudioSidebar
        projects={projects}
        activeProjectId={activeProjectId}
        onSelectProject={handleSelectProject}
        onNewProject={handleNewProject}
        onDeleteProject={handleDeleteProject}
        liveProjectId={
          liveProducingId
            ? projects.find((p) => p.podcastId === liveProducingId)?.id ?? null
            : null
        }
        activeView={activeView}
        onSelectView={setActiveView}
      />

      {/* Center + Right */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden h-full">
        {/* Breadcrumb header */}
        <div className="h-12 px-4 flex items-center justify-between gap-3 border-b border-gray-200 dark:border-white/[0.07] bg-white dark:bg-[#23262b] flex-shrink-0">
          {/* Breadcrumb trail: ancestors muted, current page emphasised */}
          <nav
            className="flex items-center gap-2 text-[13px] min-w-0"
            aria-label="Breadcrumb"
          >
            <span className="text-gray-500 dark:text-gray-400 shrink-0">Scholarly</span>
            <span className="text-gray-300 dark:text-gray-600 shrink-0">/</span>
            <button
              type="button"
              onClick={handleNewProject}
              className="text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors shrink-0"
              title="Start a new podcast"
            >
              Podcast Projects
            </button>
            <span className="text-gray-300 dark:text-gray-600 shrink-0">/</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100 truncate">
              {breadcrumbTitle}
            </span>
          </nav>

          <div className="flex items-center gap-1 shrink-0">
            {/* Icon actions */}
            <HeaderIconButton
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-4 h-4" />
              ) : (
                <Moon className="w-4 h-4" />
              )}
            </HeaderIconButton>

            {activeView === 'podcast' && (
              <HeaderIconButton
                onClick={() => setIsTranscriptExpanded((v) => !v)}
                title={isTranscriptExpanded ? 'Hide transcript' : 'Show transcript'}
              >
                {isTranscriptExpanded ? (
                  <PanelRightClose className="w-4 h-4" />
                ) : (
                  <PanelRightOpen className="w-4 h-4" />
                )}
              </HeaderIconButton>
            )}

            {activeView === 'podcast' && (
              <HeaderIconButton
                onClick={handleDownloadAudio}
                title="Download audio"
                disabled={readyPodcast?.status !== 'READY'}
              >
                <Download className="w-4 h-4" />
              </HeaderIconButton>
            )}

            <span
              className="mx-1.5 w-px h-5 bg-gray-200 dark:bg-white/10"
              aria-hidden
            />

            {/* Outlined primary action */}
            {activeView === 'podcast' && readyPodcast?.status === 'READY' && onOpenEpisode ? (
              <button
                onClick={() => onOpenEpisode(readyPodcast)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/12 bg-white dark:bg-transparent text-[13px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                title="Open player, quiz, flashcards and mind map"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit episode
              </button>
            ) : (
              <button
                onClick={handleNewProject}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-white/12 bg-white dark:bg-transparent text-[13px] font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/[0.06] transition-colors shadow-[0_1px_2px_rgba(16,24,40,0.04)]"
                title="Start a new podcast"
              >
                <Plus className="w-3.5 h-3.5" />
                New podcast
              </button>
            )}

            {/* Filled share action */}
            <button
              onClick={handleShare}
              disabled={!readyPodcast}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-gray-900 dark:bg-white text-white dark:text-gray-900 text-[13px] font-medium hover:bg-gray-800 dark:hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Share this podcast"
            >
              {shareCopied ? (
                <>
                  <Check className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5" />
                  Share
                </>
              )}
            </button>
          </div>
        </div>

        {/* Panes */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Center — conversation */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0 border-r border-gray-200 dark:border-gray-700">
            <div className="flex-1 overflow-hidden">
              {activeView === 'tts' ? (
                <TextToSpeechView />
              ) : (
                <StudioContent
                  isGenerating={isGenerating}
                  onStartGeneration={() => setIsGenerating(true)}
                  onClose={onClose}
                  onPodcastProgress={(p) => setLiveProducingId(p.id)}
                  onPodcastReady={(p) => {
                    setReadyPodcast(p);
                    setLiveProducingId(null);
                  }}
                  loadProject={loadProject}
                  newProjectSignal={newProjectSignal}
                  onProjectChanged={refreshProjects}
                  onActiveProjectIdChange={setActiveProjectId}
                  activePodcast={readyPodcast}
                  onOpenEpisode={onOpenEpisode}
                  onDeleteProject={
                    activeProjectId
                      ? () => void handleDeleteProject(activeProjectId)
                      : undefined
                  }
                />
              )}
            </div>
          </div>

          {/* Right — transcript */}
          {activeView === 'podcast' && isTranscriptExpanded && (
            <div className="w-96 flex flex-col flex-shrink-0 bg-white dark:bg-[#23262b]">
              <div className="h-12 px-4 flex items-center gap-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <div
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-[13.5px] font-medium rounded',
                    'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100'
                  )}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                  Transcript
                </div>
                <button
                  onClick={() => setIsTranscriptExpanded(false)}
                  className="ml-auto p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  title="Close transcript"
                >
                  <svg
                    className="w-4 h-4 text-gray-500 dark:text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto scrollbar-hide">
                <StudioTranscript
                  podcast={readyPodcast}
                  segments={transcriptSegments}
                  isLoading={transcriptLoading}
                  errorMessage={transcriptError}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
