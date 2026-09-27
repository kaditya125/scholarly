import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Target, BarChart3, Sparkles, ArrowRight, Check } from 'lucide-react';
import { useTheme } from '../../lib/ThemeContext';

interface OnboardingCelebrationModalProps {
  isOpen: boolean;
  userName: string;
  /** The student's target exam, shown in the subtitle when known. */
  examName?: string;
  /** Called when the student dismisses the welcome; the parent persists "celebrated". */
  onClose: () => void;
}

/** A confetti ribbon: a thin strip that tumbles (its visible width follows cos(flip)) and sways. */
interface Ribbon {
  x: number; y: number; vx: number; vy: number;
  w: number; h: number; color: string;
  rot: number; vrot: number; flip: number; vflip: number;
  sway: number; swayPhase: number; alpha: number;
}

/** A spark from a cracker burst: a short streak that flies out, slows and fades. */
interface Spark {
  x: number; y: number; vx: number; vy: number; life: number; max: number; color: string;
}

// Sadhya palette: signature lime, deeper lime, gold, white, sage.
const COLORS = ['#c8e558', '#a3e635', '#fde047', '#ffffff', '#4ade80', '#6ca855'];
const GRAVITY = 0.16;
const DURATION_MS = 5200;

/**
 * Full-screen celebration layer: two confetti cannons fire ribbons up from the bottom corners, a
 * second wave drifts down from the top, and a few cracker bursts crackle overhead. Canvas-drawn so
 * hundreds of strips cost one layer; stops itself after ~5s. Skipped for reduced-motion users.
 */
function useCelebration(canvasRef: React.RefObject<HTMLCanvasElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let W = 0, H = 0;
    const resize = () => {
      W = window.innerWidth; H = window.innerHeight;
      canvas.width = W * dpr; canvas.height = H * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const rand = (a: number, b: number) => a + Math.random() * (b - a);
    const pick = () => COLORS[Math.floor(Math.random() * COLORS.length)];
    const scale = Math.min(1, W / 1200);
    const ribbons: Ribbon[] = [];
    const sparks: Spark[] = [];

    const ribbon = (x: number, y: number, vx: number, vy: number): Ribbon => ({
      x, y, vx, vy,
      w: rand(5, 8), h: rand(12, 22), color: pick(),
      rot: rand(0, Math.PI * 2), vrot: rand(-0.12, 0.12),
      flip: rand(0, Math.PI * 2), vflip: rand(0.08, 0.2),
      sway: rand(0.4, 1.2), swayPhase: rand(0, Math.PI * 2), alpha: 1,
    });

    // Corner cannons: aim up and inward so the strips arc over the card and rain across the screen.
    const cannon = (fromLeft: boolean, n: number) => {
      const dir = fromLeft ? 1 : -1;
      for (let i = 0; i < n; i++) {
        const angle = rand(Math.PI * 0.28, Math.PI * 0.44); // above the horizontal, tilted inward
        const speed = rand(13, 21) * (0.75 + 0.25 * scale) * Math.sqrt(H / 800);
        ribbons.push(ribbon(
          fromLeft ? rand(-10, 30) : W - rand(-10, 30),
          H + rand(0, 20),
          dir * Math.cos(angle) * speed,
          -Math.sin(angle) * speed,
        ));
      }
    };
    // Top wave: a gentle curtain of strips drifting down across the full width.
    const curtain = (n: number) => {
      for (let i = 0; i < n; i++) ribbons.push(ribbon(rand(0, W), rand(-H * 0.5, -10), rand(-1, 1), rand(1, 3)));
    };
    // Cracker burst: a ring of sparks at a point in the upper half of the screen.
    const burst = (x: number, y: number) => {
      const n = 26, color = pick();
      for (let i = 0; i < n; i++) {
        const a = (Math.PI * 2 * i) / n + rand(-0.1, 0.1);
        const s = rand(2.5, 5.5);
        sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: rand(38, 60), color: Math.random() < 0.3 ? '#ffffff' : color });
      }
    };

    const perCannon = Math.round(70 + 50 * scale);
    cannon(true, perCannon);
    cannon(false, perCannon);
    const timers = [
      window.setTimeout(() => curtain(Math.round(60 + 60 * scale)), 350),
      window.setTimeout(() => burst(W * rand(0.18, 0.32), H * rand(0.14, 0.26)), 250),
      window.setTimeout(() => burst(W * rand(0.68, 0.82), H * rand(0.12, 0.24)), 650),
      window.setTimeout(() => burst(W * rand(0.42, 0.58), H * rand(0.06, 0.16)), 1050),
      window.setTimeout(() => { cannon(true, Math.round(perCannon / 2)); cannon(false, Math.round(perCannon / 2)); }, 1300),
    ];

    const start = performance.now();
    let last = start;
    let raf = 0;
    const frame = (now: number) => {
      const t = now - start;
      // Time-based steps (1 = one 60Hz frame) so the show runs at the same speed on 60/120Hz
      // screens and slow phones; clamped so a stalled tab doesn't teleport everything.
      const dt = Math.min((now - last) / (1000 / 60), 4);
      last = now;
      const fading = t > DURATION_MS - 1400;
      ctx.clearRect(0, 0, W, H);

      for (let i = ribbons.length - 1; i >= 0; i--) {
        const r = ribbons[i];
        r.vy = Math.min(r.vy + GRAVITY * dt, 3.2 + r.sway); // air drag caps fall speed so strips flutter
        r.vx *= Math.pow(0.985, dt);
        r.swayPhase += 0.05 * dt;
        r.x += (r.vx + Math.sin(r.swayPhase) * r.sway) * dt;
        r.y += r.vy * dt;
        r.rot += r.vrot * dt;
        r.flip += r.vflip * dt;
        if (fading) r.alpha = Math.max(0, r.alpha - 0.018 * dt);
        if (r.y > H + 30 || r.alpha <= 0) { ribbons.splice(i, 1); continue; }

        const face = Math.cos(r.flip); // tumbling: strip narrows to an edge and widens again
        ctx.save();
        ctx.translate(r.x, r.y);
        ctx.rotate(r.rot);
        ctx.globalAlpha = r.alpha * (0.65 + 0.35 * Math.abs(face));
        ctx.fillStyle = r.color;
        ctx.fillRect((-r.w / 2) * face, -r.h / 2, r.w * face, r.h);
        ctx.restore();
      }

      ctx.lineCap = 'round';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.life += dt;
        const drag = Math.pow(0.94, dt);
        s.vx *= drag; s.vy = s.vy * drag + 0.05 * dt;
        const px = s.x, py = s.y;
        s.x += s.vx * dt; s.y += s.vy * dt;
        const k = 1 - s.life / s.max;
        if (k <= 0) { sparks.splice(i, 1); continue; }
        // Crackle: sparks flicker as they die out.
        ctx.globalAlpha = k * (Math.random() < 0.25 ? 0.35 : 1);
        ctx.strokeStyle = s.color;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(px - s.vx * 2.2, py - s.vy * 2.2);
        ctx.lineTo(s.x, s.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      if (t < DURATION_MS && (ribbons.length || sparks.length || t < 1500)) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, W, H);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', resize);
    };
  }, [active, canvasRef]);
}

const FEATURES = [
  { icon: Target, label: 'Personalized learning' },
  { icon: BarChart3, label: 'Progress you can see' },
  { icon: Sparkles, label: 'An AI tutor, 24×7' },
];

export const OnboardingCelebrationModal: React.FC<OnboardingCelebrationModalProps> = ({
  isOpen,
  userName,
  examName,
  onClose,
}) => {
  const reducedMotion = useReducedMotion();
  const { theme } = useTheme();
  const isDark = theme === 'dark';
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [closing, setClosing] = useState(false);

  useCelebration(canvasRef, isOpen && !reducedMotion);

  useEffect(() => { if (isOpen) setClosing(false); }, [isOpen]);

  const handleStart = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(onClose, 260);
  };

  const accent = isDark ? 'text-[#c8e558]' : 'text-[#6ca855]';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="onboarding-celebration"
          initial={{ opacity: 0 }}
          animate={{ opacity: closing ? 0 : 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className={`fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm ${
            isDark ? 'bg-black/70' : 'bg-slate-900/25'
          }`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="onboarding-celebration-title"
        >
          {/* Confetti sits above the card so strips fall across everything, but never blocks clicks. */}
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none z-30" aria-hidden />

          <motion.div
            initial={reducedMotion ? false : { opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: closing ? 0 : 1, y: closing ? 8 : 0, scale: closing ? 0.98 : 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className={`chat-type relative z-20 w-full max-w-[420px] rounded-2xl border px-6 py-7 sm:px-8 sm:py-8 text-center ${
              isDark
                ? 'bg-[#1a1a1d] border-white/10 shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)]'
                : 'bg-white border-slate-200 shadow-[0_24px_60px_-24px_rgba(15,23,42,0.25)]'
            }`}
          >
            <motion.div
              initial={reducedMotion ? false : { scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.12, type: 'spring', stiffness: 380, damping: 18 }}
              className={`mx-auto mb-5 flex h-11 w-11 items-center justify-center rounded-full ${
                isDark ? 'bg-[#c8e558]/12 ring-1 ring-[#c8e558]/25' : 'bg-[#6ca855]/10 ring-1 ring-[#6ca855]/25'
              }`}
            >
              <Check className={`h-5 w-5 stroke-[2.5] ${accent}`} />
            </motion.div>

            <p className={`text-[12px] font-medium uppercase tracking-[0.12em] ${accent}`}>You&rsquo;re all set</p>
            <h2
              id="onboarding-celebration-title"
              className={`mt-2 text-[24px] sm:text-[26px] font-semibold tracking-[-0.03em] leading-tight ${
                isDark ? 'text-white' : 'text-slate-900'
              }`}
            >
              Welcome to Sadhya{userName ? `, ${userName}` : ''}
            </h2>
            <p className={`mt-2 text-[14px] leading-relaxed ${isDark ? 'text-gray-400' : 'text-slate-500'}`}>
              {examName
                ? <>Your {examName} preparation is ready. Let&rsquo;s make every day count.</>
                : <>Your preparation space is ready. Let&rsquo;s make every day count.</>}
            </p>

            <ul className={`mt-6 divide-y rounded-xl border text-left ${
              isDark ? 'divide-white/[0.06] border-white/[0.08]' : 'divide-slate-100 border-slate-200'
            }`}>
              {FEATURES.map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-3 px-4 py-2.5">
                  <Icon className={`h-4 w-4 shrink-0 ${accent}`} />
                  <span className={`text-[13.5px] ${isDark ? 'text-slate-200' : 'text-slate-700'}`}>{label}</span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={handleStart}
              autoFocus
              className={`mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14.5px] font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${
                isDark
                  ? 'bg-[#c8e558] text-slate-950 hover:bg-[#d4f266] focus-visible:ring-[#c8e558]/60 focus-visible:ring-offset-[#1a1a1d]'
                  : 'bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-900/40 focus-visible:ring-offset-white'
              }`}
            >
              Let&rsquo;s get started
              <ArrowRight className="h-4 w-4 stroke-[2.25]" />
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
