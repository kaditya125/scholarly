import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check, ChevronDown, GripVertical, MoreHorizontal, Bell, Target, Trophy, MessageSquare,
} from 'lucide-react';
import { cn } from '../../lib/utils';

import { useNotificationStore } from '../../lib/store/useNotificationStore';

/**
 * Rich notification settings panel (Edit notifications) — email categories,
 * frequency, priority alerts, quiet hours, custom sound, banner style and
 * app-specific scope. State is persisted via Zustand & Firestore.
 */

type PriorityKey = 'reminders' | 'results' | 'achievements' | 'community';

type NotifState = {
  email: { study: boolean; community: boolean; product: boolean };
  frequency: string;
  priorityAlerts: boolean;
  priority: Record<PriorityKey, boolean>;
  quietHours: boolean;
  quietFrom: string;
  quietTo: string;
  quietWeekdays: boolean;
  quietWeekends: boolean;
  customSound: boolean;
  sound: string;
  bannerStyle: boolean;
  banner: string;
  appSpecific: boolean;
  appScope: string;
};

const DEFAULTS: NotifState = {
  email: { study: true, community: false, product: false },
  frequency: 'Every 5 min',
  priorityAlerts: true,
  priority: { reminders: true, results: true, achievements: false, community: true },
  quietHours: true,
  quietFrom: '22:00',
  quietTo: '07:00',
  quietWeekdays: true,
  quietWeekends: false,
  customSound: false,
  sound: 'Default',
  bannerStyle: false,
  banner: 'Minimal',
  appSpecific: false,
  appScope: 'All',
};

const FREQUENCY_OPTS = ['Instant', 'Every 5 min', 'Hourly', 'Daily digest', 'Weekly digest'];
const SOUND_OPTS = ['Default', 'Chime', 'Ping', 'Bell', 'None'];
const BANNER_OPTS = ['Minimal', 'Detailed'];
const SCOPE_OPTS = ['All', 'Important only', 'Mentions'];
const TIMES = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, '0')}:00`);

const EMAIL_CHIPS: { key: keyof NotifState['email']; label: string }[] = [
  { key: 'study', label: 'Study updates' },
  { key: 'community', label: 'Community' },
  { key: 'product', label: 'Product news' },
];

const PRIORITY_ROWS: { key: PriorityKey; label: string; icon: any; color: string }[] = [
  { key: 'reminders', label: 'Study reminders', icon: Bell, color: 'text-indigo-500' },
  { key: 'results', label: 'Test results', icon: Target, color: 'text-teal-500' },
  { key: 'achievements', label: 'Streak & achievements', icon: Trophy, color: 'text-amber-500' },
  { key: 'community', label: 'Community replies', icon: MessageSquare, color: 'text-rose-500' },
];

// We map frontend NotifState directly to the backend Record<string, boolean> for simplicity in this demo.
// A real app would define strict schemas for the config object.

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      className={cn('relative w-9 h-5 rounded-full transition-colors shrink-0', on ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-white/15')}
    >
      <span className={cn('absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform', on && 'translate-x-4')} />
    </button>
  );
}

function PillSelect({ value, options, onChange, width = 'w-40' }: { value: string; options: string[]; onChange: (v: string) => void; width?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 text-[13px] font-medium text-slate-700 dark:text-gray-200 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 transition-colors"
      >
        {value} <ChevronDown className={cn('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
              className={cn('absolute right-0 top-full mt-1 bg-white dark:bg-[#1f1f1f] rounded-xl border border-slate-200 dark:border-white/10 shadow-lg z-50 py-1', width)}
            >
              {options.map((o) => (
                <button
                  key={o}
                  onClick={() => { onChange(o); setOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[13px] text-left text-slate-700 dark:text-gray-200 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                >
                  <span className={cn('w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0', value === o ? 'border-indigo-500' : 'border-slate-300 dark:border-white/20')}>
                    {value === o && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
                  </span>
                  {o}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function Card({ on, onToggle, title, desc, control, children }: {
  on: boolean; onToggle: () => void; title: string; desc: string; control?: React.ReactNode; children?: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-2xl border p-4 transition-colors', on ? 'border-slate-200 dark:border-white/10 bg-white dark:bg-[#1a1a1b]' : 'border-slate-200/70 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]')}>
      <div className="flex gap-3">
        <div className="pt-0.5"><Toggle on={on} onClick={onToggle} /></div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-[14px] font-semibold text-slate-900 dark:text-white">{title}</h4>
              <p className="text-[12.5px] text-slate-500 dark:text-gray-400 leading-snug mt-0.5 max-w-md">{desc}</p>
            </div>
            {control}
          </div>
          {on && children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border transition-colors',
        active
          ? 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300'
          : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-gray-300 hover:border-slate-300 dark:hover:border-white/20'
      )}
    >
      {active && <Check className="w-3.5 h-3.5" />}
      {children}
    </button>
  );
}

export function NotificationsPanel() {
  const storePrefs = useNotificationStore(s => s.preferences);
  const updateStorePrefs = useNotificationStore(s => s.updatePreferences);

  // Merge storePrefs into local state for form UI, fallback to defaults
  const [s, setS] = useState<NotifState>({ ...DEFAULTS, ...(storePrefs as any) });

  // When store preferences load/change from Firestore, update local UI state
  useEffect(() => {
    if (Object.keys(storePrefs).length > 0) {
      setS(prev => ({ ...prev, ...storePrefs }));
    }
  }, [storePrefs]);

  const persistToBackend = (newState: NotifState) => {
    setS(newState);
    updateStorePrefs(newState as any);
  };

  const set = <K extends keyof NotifState>(key: K, value: NotifState[K]) => {
    persistToBackend({ ...s, [key]: value });
  };
  
  const toggle = (key: keyof NotifState) => {
    persistToBackend({ ...s, [key]: !s[key] });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-[18px] font-bold text-slate-900 dark:text-white">Edit notifications</h2>
        <button
          onClick={() => { if (window.confirm('Reset notification settings to defaults?')) persistToBackend(DEFAULTS); }}
          title="Reset to defaults"
          className="w-8 h-8 rounded-full border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-gray-400 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </div>

      {/* Email + category chips */}
      <div>
        <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white">Email</h3>
        <p className="text-[12.5px] text-slate-500 dark:text-gray-400 mt-0.5 mb-3 max-w-lg">
          Choose which kinds of updates land in your inbox so you stay informed without being overwhelmed.
        </p>
        <div className="flex flex-wrap gap-2">
          {EMAIL_CHIPS.map((c) => (
            <Chip key={c.key} active={s.email[c.key]} onClick={() => set('email', { ...s.email, [c.key]: !s.email[c.key] })}>
              {c.label}
            </Chip>
          ))}
        </div>
      </div>

      {/* Notification Frequency */}
      <Card
        on={s.frequency !== 'off'}
        onToggle={() => set('frequency', s.frequency === 'off' ? 'Every 5 min' : 'off')}
        title="Notification Frequency"
        desc="Choose how often you receive notifications, ensuring you stay updated without being overwhelmed."
        control={s.frequency !== 'off' ? <PillSelect value={s.frequency} options={FREQUENCY_OPTS} onChange={(v) => set('frequency', v)} /> : undefined}
      />

      {/* Priority Alerts */}
      <Card
        on={s.priorityAlerts}
        onToggle={() => toggle('priorityAlerts')}
        title="Priority Alerts"
        desc="Select which types of notifications are most important for you to stay informed about."
      >
        <div className="flex flex-col divide-y divide-slate-100 dark:divide-white/5">
          {PRIORITY_ROWS.map((row) => (
            <div key={row.key} className="flex items-center gap-3 py-2.5">
              <GripVertical className="w-4 h-4 text-slate-300 dark:text-gray-600 cursor-grab shrink-0" />
              <row.icon className={cn('w-4 h-4 shrink-0', row.color)} />
              <span className="flex-1 text-[13px] font-medium text-slate-700 dark:text-gray-200">{row.label}</span>
              <Toggle on={s.priority[row.key]} onClick={() => set('priority', { ...s.priority, [row.key]: !s.priority[row.key] })} />
            </div>
          ))}
        </div>
      </Card>

      {/* Quiet Hours */}
      <Card
        on={s.quietHours}
        onToggle={() => toggle('quietHours')}
        title="Quiet Hours"
        desc="Set specific times when notifications are muted to avoid disturbances during your downtime."
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] text-slate-500 dark:text-gray-400">From</span>
            <PillSelect value={s.quietFrom} options={TIMES} onChange={(v) => set('quietFrom', v)} width="w-28" />
            <span className="text-[12.5px] text-slate-500 dark:text-gray-400">To</span>
            <PillSelect value={s.quietTo} options={TIMES} onChange={(v) => set('quietTo', v)} width="w-28" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip active={s.quietWeekdays} onClick={() => toggle('quietWeekdays')}>Weekdays</Chip>
            <Chip active={s.quietWeekends} onClick={() => toggle('quietWeekends')}>Weekends</Chip>
          </div>
        </div>
      </Card>

      {/* Custom Sound */}
      <Card
        on={s.customSound}
        onToggle={() => toggle('customSound')}
        title="Custom Sound"
        desc="Assign a unique sound to different types of notifications for easy identification."
        control={s.customSound ? <PillSelect value={s.sound} options={SOUND_OPTS} onChange={(v) => set('sound', v)} width="w-36" /> : undefined}
      />

      {/* Banner Style */}
      <Card
        on={s.bannerStyle}
        onToggle={() => toggle('bannerStyle')}
        title="Banner Style"
        desc="Pick the visual style of notification banners that suits your taste and preferences."
        control={s.bannerStyle ? <PillSelect value={s.banner} options={BANNER_OPTS} onChange={(v) => set('banner', v)} width="w-36" /> : undefined}
      />

      {/* App-Specific Notifications */}
      <Card
        on={s.appSpecific}
        onToggle={() => toggle('appSpecific')}
        title="App-Specific Notifications"
        desc="Tailor notifications from each area according to your preferences and needs."
        control={s.appSpecific ? <PillSelect value={s.appScope} options={SCOPE_OPTS} onChange={(v) => set('appScope', v)} width="w-40" /> : undefined}
      />
    </div>
  );
}
