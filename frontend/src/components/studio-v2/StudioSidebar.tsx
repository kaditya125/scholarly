/**
 * Studio Sidebar
 *
 * Left navigation for the Podcast Workspace. The centrepiece is the
 * **Podcast Projects** list: one entry per podcast conversation, in the
 * ChatGPT / Claude-Projects model. Clicking a project restores its full
 * workspace; "+ New Podcast" starts a fresh conversation.
 *
 * This replaces the old demo scaffolding ("My Space > House Cleaning BC >
 * Recording", plus Pages / Speakers / Prompt / Team / Workflow stubs) which
 * showed mock data and had no relationship to the user's real podcasts.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Home,
  Layers,
  Video,
  MessageSquare,
  Settings,
  ChevronDown,
  ChevronRight,
  Plus,
  Mic,
  Loader2,
  CheckCircle2,
  AlertCircle,
  AudioLines,
  FileAudio,
  Trash2,
  Search,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import {
  type PodcastProjectMeta,
  projectMetaLine,
  projectStatusLabel,
  timeAgo,
} from '../../lib/podcastProjects';

export type StudioView = 'podcast' | 'tts';

interface StudioSidebarProps {
  /** All of the user's podcast projects, newest activity first. */
  projects: PodcastProjectMeta[];
  /** Currently open project, if any. */
  activeProjectId: string | null;
  /** Open a project — restores its conversation and assets. */
  onSelectProject: (projectId: string) => void;
  /** Start a brand-new podcast conversation. */
  onNewProject: () => void;
  /** Delete a project permanently. */
  onDeleteProject?: (projectId: string) => void;
  /** Project whose podcast is generating right now (drives the live spinner). */
  liveProjectId?: string | null;
  /** Which top-level tool is open in the center pane. */
  activeView?: StudioView;
  onSelectView?: (view: StudioView) => void;
}

export default function StudioSidebar({
  projects,
  activeProjectId,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  liveProjectId,
  activeView = 'podcast',
  onSelectView,
}: StudioSidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [projectsExpanded, setProjectsExpanded] = useState(true);

  // Search across the fields a user would actually recall: what it's about,
  // and how it was configured.
  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) =>
      [p.title, p.subject, p.language, p.styleLabel]
        .filter(Boolean)
        .some((v) => (v as string).toLowerCase().includes(q))
    );
  }, [projects, searchQuery]);

  return (
    <div className="w-64 bg-white dark:bg-[#111113] border-r border-slate-200/80 dark:border-white/10 flex flex-col font-sans">
      {/* App Header */}
      <div className="h-12 px-4 flex items-center justify-between border-b border-slate-200/80 dark:border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center shadow-xs">
            <Mic className="w-3.5 h-3.5 text-[#c8e558] dark:text-slate-900" />
          </div>
          <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white">
            Podcast Studio
          </span>
        </div>
      </div>

      {/* New Podcast — the primary action, mirroring "New chat" */}
      <div className="px-3 pt-3">
        <button
          type="button"
          onClick={onNewProject}
          className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-[13px] font-semibold transition-all shadow-xs active:scale-[0.98]"
        >
          <Plus className="w-4 h-4 text-[#c8e558] dark:text-slate-900" />
          New Podcast
        </button>
      </div>

      {/* Search */}
      <div className="px-3 py-2.5 border-b border-slate-200/80 dark:border-white/10">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search podcasts..."
            className="w-full pl-8 pr-3 py-1.5 text-[12.5px] bg-slate-50/80 dark:bg-white/[0.04] border border-slate-200/80 dark:border-white/10 rounded-lg text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:border-[#8ba32b] dark:focus:border-[#c8e558] transition-colors"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {/* Tools */}
        <div className="px-2 py-2 space-y-0.5">
          <NavItem icon={Home} label="Home" />
          <NavItem icon={Layers} label="Content Pipeline" badge="New" />
          <NavItem
            icon={Video}
            label="Studio"
            active={activeView === 'podcast'}
            onClick={() => onSelectView?.('podcast')}
          />
          <NavItem icon={MessageSquare} label="Magic Chat" />
          <NavItem
            icon={AudioLines}
            label="Text to Speech"
            active={activeView === 'tts'}
            onClick={() => onSelectView?.('tts')}
          />
        </div>

        {/* Podcast Projects */}
        <div className="px-2 py-2 border-t border-slate-200/80 dark:border-white/10">
          <button
            onClick={() => setProjectsExpanded((v) => !v)}
            className="w-full flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          >
            {projectsExpanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            <span className="flex-1 text-left">Podcast Projects</span>
            {projects.length > 0 && (
              <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded-full normal-case tracking-normal">
                {projects.length}
              </span>
            )}
          </button>

          {projectsExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-1.5 space-y-1"
            >
              {filteredProjects.length === 0 ? (
                <EmptyProjects hasQuery={!!searchQuery.trim()} onNewProject={onNewProject} />
              ) : (
                <AnimatePresence initial={false}>
                  {filteredProjects.map((project) => (
                    <ProjectCard
                      key={project.id}
                      project={project}
                      isActive={project.id === activeProjectId}
                      isLive={project.id === liveProjectId}
                      onClick={() => onSelectProject(project.id)}
                      onDelete={
                        onDeleteProject ? () => onDeleteProject(project.id) : undefined
                      }
                    />
                  ))}
                </AnimatePresence>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <div className="border-t border-slate-200/80 dark:border-white/10 p-2">
        <NavItem icon={Settings} label="Settings" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Project card
// ---------------------------------------------------------------------------

function ProjectCard({
  project,
  isActive,
  isLive,
  onClick,
  onDelete,
}: {
  project: PodcastProjectMeta;
  isActive: boolean;
  isLive: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  const metaLine = projectMetaLine(project);
  const statusLine = projectStatusLabel(project);
  const inFlight = project.status === 'generating' || project.status === 'planning';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.15 }}
      className="group relative"
    >
      <button
        type="button"
        onClick={onClick}
        title={project.title}
        className={cn(
          'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-xl text-left transition-all',
          isActive
            ? 'bg-slate-100/90 dark:bg-white/[0.07] ring-1 ring-inset ring-slate-300 dark:ring-white/15 shadow-2xs'
            : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
        )}
      >
        {/* Thumbnail or status glyph */}
        <div className="shrink-0 mt-0.5">
          {project.thumbnailUrl ? (
            <img
              src={project.thumbnailUrl}
              alt=""
              className="w-8 h-8 rounded-lg object-cover shadow-2xs"
            />
          ) : (
            <div
              className={cn(
                'w-8 h-8 rounded-lg flex items-center justify-center shadow-2xs',
                isActive
                  ? 'bg-slate-900 text-[#c8e558] dark:bg-white dark:text-slate-900'
                  : 'bg-slate-100 dark:bg-white/10 text-slate-500 dark:text-slate-400'
              )}
            >
              <FileAudio className="w-4 h-4" />
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Title */}
          <div
            className={cn(
              'text-[12.5px] font-medium leading-snug truncate',
              isActive
                ? 'text-slate-900 dark:text-white font-semibold'
                : 'text-slate-700 dark:text-slate-200'
            )}
          >
            {project.title}
          </div>

          {/* duration • language • style */}
          {metaLine && (
            <div className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate mt-0.5">
              {metaLine}
            </div>
          )}

          {/* Status + last updated */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <StatusGlyph status={project.status} isLive={isLive} />
            <span
              className={cn(
                'text-[10.5px] truncate',
                project.status === 'failed'
                  ? 'text-red-500 dark:text-red-400'
                  : project.status === 'ready'
                  ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400'
              )}
            >
              {statusLine}
            </span>
            <span className="text-[10.5px] text-slate-400 dark:text-slate-500 shrink-0">
              · {timeAgo(project.updatedAt)}
            </span>
          </div>

          {/* Indeterminate progress bar while a job is in flight */}
          {inFlight && (
            <div className="mt-1.5 h-1 w-full rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden">
              <motion.div
                className="h-full w-1/3 rounded-full bg-[#8ba32b] dark:bg-[#c8e558]"
                animate={{ x: ['-100%', '300%'] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              />
            </div>
          )}
        </div>
      </button>

      {/* Delete — only on hover so the card stays clean */}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          title="Delete project"
          className="absolute top-1.5 right-1.5 p-1 rounded opacity-0 group-hover:opacity-100 focus:opacity-100 text-slate-400 hover:text-red-500 hover:bg-white dark:hover:bg-black/40 transition-all"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </motion.div>
  );
}

function StatusGlyph({
  status,
  isLive,
}: {
  status: PodcastProjectMeta['status'];
  isLive: boolean;
}) {
  if (status === 'ready') {
    return <CheckCircle2 className="w-3 h-3 text-emerald-500 dark:text-emerald-400 shrink-0" />;
  }
  if (status === 'failed') {
    return <AlertCircle className="w-3 h-3 text-red-500 dark:text-red-400 shrink-0" />;
  }
  if (status === 'generating' || status === 'planning') {
    return (
      <Loader2
        className={cn(
          'w-3 h-3 animate-spin shrink-0',
          isLive ? 'text-[#8ba32b] dark:text-[#c8e558]' : 'text-slate-400 dark:text-slate-500'
        )}
      />
    );
  }
  // Draft
  return (
    <span
      className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 shrink-0 ml-0.5"
      aria-hidden
    />
  );
}

function EmptyProjects({
  hasQuery,
  onNewProject,
}: {
  hasQuery: boolean;
  onNewProject: () => void;
}) {
  if (hasQuery) {
    return (
      <div className="px-2 py-3 text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed">
        No podcasts match your search.
      </div>
    );
  }
  return (
    <div className="px-2 py-3">
      <p className="text-[12px] text-slate-500 dark:text-slate-400 leading-relaxed mb-2">
        No podcasts yet. Start a conversation and your project will be saved here
        automatically.
      </p>
      <button
        type="button"
        onClick={onNewProject}
        className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#8ba32b] dark:text-[#c8e558] hover:underline"
      >
        <Plus className="w-3.5 h-3.5" />
        Create your first podcast
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Basic nav items
// ---------------------------------------------------------------------------

interface NavItemProps {
  icon: React.ComponentType<any>;
  label: string;
  active?: boolean;
  badge?: string;
  onClick?: () => void;
}

function NavItem({ icon: Icon, label, active = false, badge, onClick }: NavItemProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors',
        active
          ? 'bg-slate-100 dark:bg-white/[0.08] text-slate-900 dark:text-white font-semibold'
          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04] hover:text-slate-900 dark:hover:text-white'
      )}
    >
      <Icon className={cn('w-4 h-4', active ? 'text-[#8ba32b] dark:text-[#c8e558]' : 'text-slate-400 dark:text-slate-400')} />
      <span className="flex-1 text-left">{label}</span>
      {badge && (
        <span className="px-1.5 py-0.5 text-[9.5px] font-bold rounded-md bg-slate-900 text-white dark:bg-[#c8e558] dark:text-slate-900">
          {badge}
        </span>
      )}
    </button>
  );
}
