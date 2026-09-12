import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Target, BarChart3, Sparkles, ArrowRight } from 'lucide-react';

interface OnboardingCelebrationModalProps {
  isOpen: boolean;
  userName: string;
  onStartFlight: (destinationRect: DOMRect | null) => void;
  greetingTargetRef: React.RefObject<HTMLDivElement | null>;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  rotationSpeed: number;
  aspectRatio: number;
  alpha: number;
}

export const OnboardingCelebrationModal: React.FC<OnboardingCelebrationModalProps> = ({
  isOpen,
  userName,
  onStartFlight,
  greetingTargetRef,
}) => {
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Confetti / Ribbon particle burst effect
  useEffect(() => {
    if (!isOpen || reducedMotion) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    // Sadhya brand palette: lime, gold, white, subtle green
    const colors = [
      '#c8e558', // Signature Sadhya Lime
      '#a3e635', // Bright Lime
      '#fde047', // Soft Gold
      '#fef08a', // Pale Gold
      '#ffffff', // Crisp White
      '#4ade80', // Soft Sage Green
    ];

    // Burst origin: around the robot in the center top of card
    const originX = width / 2;
    const originY = height * 0.32;

    const particles: Particle[] = [];
    const count = Math.min(65, Math.floor(width / 18));

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.6;
      const speed = 4 + Math.random() * 8;
      particles.push({
        x: originX + (Math.random() - 0.5) * 60,
        y: originY + (Math.random() - 0.5) * 40,
        vx: Math.cos(angle) * speed * (0.8 + Math.random() * 0.6),
        vy: Math.sin(angle) * speed * 0.9 - 3.5, // initial upward lift
        size: 8 + Math.random() * 10,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 14,
        aspectRatio: Math.random() > 0.4 ? 2.6 : 1.2,
        alpha: 1,
      });
    }

    let startTime = Date.now();

    const render = () => {
      const elapsed = (Date.now() - startTime) / 1000;
      ctx.clearRect(0, 0, width, height);

      let alive = false;
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.22;
        p.vx *= 0.98;
        p.rotation += p.rotationSpeed;

        if (elapsed > 1.4) {
          p.alpha = Math.max(0, p.alpha - 0.025);
        }

        if (p.alpha > 0.01 && p.y < height + 50) {
          alive = true;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = p.color;

          const w = p.size;
          const h = p.size / p.aspectRatio;
          ctx.beginPath();
          ctx.roundRect(-w / 2, -h / 2, w, h, 2);
          ctx.fill();
          ctx.restore();
        }
      }

      if (alive && elapsed < 3.2) {
        animId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
    };

    animId = requestAnimationFrame(render);

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animId);
    };
  }, [isOpen, reducedMotion]);

  const handleStart = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);

    const targetRect = greetingTargetRef.current
      ? greetingTargetRef.current.getBoundingClientRect()
      : null;

    onStartFlight(targetRect);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="onboarding-celebration-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: isTransitioning ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-hidden bg-black/65 dark:bg-black/80 backdrop-blur-md"
        style={{ pointerEvents: isTransitioning ? 'none' : 'auto' }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 pointer-events-none z-10 w-full h-full"
        />

        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] sm:w-[580px] h-[350px] sm:h-[450px] bg-[#c8e558]/15 dark:bg-[#c8e558]/20 blur-[90px] sm:blur-[130px] rounded-full pointer-events-none" />

        <div className="relative z-20 w-full max-w-[720px] flex flex-col items-center">
          {!isTransitioning && (
            <motion.div
              initial={{ opacity: 0, y: 28, scale: 0.88 }}
              animate={{
                opacity: 1,
                y: [28, 0, -4, 0],
                scale: [0.88, 1.02, 1, 1],
              }}
              transition={{
                duration: 0.7,
                ease: [0.16, 1, 0.3, 1],
                times: [0, 0.6, 0.8, 1],
              }}
              className="relative -mb-10 sm:-mb-14 z-30 select-none pointer-events-none"
            >
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-32 sm:w-44 h-8 bg-[#c8e558]/30 blur-xl rounded-full" />

              <motion.img
                src="/images/mascot-celebrating.webp"
                alt="Sadhya celebrating mascot"
                className="w-[140px] sm:w-[175px] md:w-[195px] aspect-[745/864] object-contain drop-shadow-md select-none pointer-events-none"
                draggable={false}
                animate={{
                  y: [0, -6, 0, -4, 0],
                  rotate: [0, 1.2, -1.2, 0.8, 0],
                }}
                transition={{
                  duration: 4.2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              />
            </motion.div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 35, scale: 0.94 }}
            animate={{
              opacity: isTransitioning ? 0 : 1,
              y: isTransitioning ? 20 : 0,
              scale: isTransitioning ? 0.95 : 1,
            }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="w-full rounded-3xl p-6 sm:p-9 pt-14 sm:pt-16 text-center border shadow-2xl backdrop-blur-2xl relative overflow-hidden transition-colors bg-[#161619]/90 border-white/10 dark:bg-[#151518]/95 dark:border-white/10 shadow-black/70"
            style={{
              boxShadow: '0 25px 60px -15px rgba(0,0,0,0.7), 0 0 45px -10px rgba(200,229,88,0.14)',
            }}
          >
            <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#c8e558]/60 to-transparent" />

            <div className="space-y-2 mb-6">
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-white antialiased">
                Congratulations!
              </h1>
              <div className="inline-flex items-center gap-2 text-lg sm:text-xl font-semibold text-[#c8e558]">
                <span>Welcome to Sadhya</span>
                <span>🎉</span>
              </div>
            </div>

            <div className="max-w-xl mx-auto space-y-1 text-sm sm:text-base text-slate-300 dark:text-gray-300 leading-relaxed antialiased mb-7">
              <p>You&rsquo;re now one step closer to your goals.</p>
              <p className="text-slate-400 dark:text-gray-400 text-[13px] sm:text-[14.5px]">
                Let&rsquo;s make this journey focused, consistent, and successful together!
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2.5 sm:gap-4 max-w-lg mx-auto mb-8 text-center">
              <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex flex-col items-center justify-center space-y-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#c8e558]/10 text-[#c8e558] flex items-center justify-center">
                  <Target className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="text-[11.5px] sm:text-[12.5px] font-medium text-slate-200 leading-snug">
                  Personalized<br />Learning
                </div>
              </div>

              <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex flex-col items-center justify-center space-y-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#c8e558]/10 text-[#c8e558] flex items-center justify-center">
                  <BarChart3 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="text-[11.5px] sm:text-[12.5px] font-medium text-slate-200 leading-snug">
                  Track Your<br />Progress
                </div>
              </div>

              <div className="p-3 sm:p-4 rounded-2xl bg-white/[0.03] border border-white/[0.07] flex flex-col items-center justify-center space-y-2">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-[#c8e558]/10 text-[#c8e558] flex items-center justify-center">
                  <Sparkles className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                </div>
                <div className="text-[11.5px] sm:text-[12.5px] font-medium text-slate-200 leading-snug">
                  Achieve<br />Your Goals
                </div>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center space-y-3">
              <button
                onClick={handleStart}
                disabled={isTransitioning}
                className="inline-flex items-center justify-center gap-2.5 px-8 sm:px-10 py-3.5 sm:py-4 rounded-2xl text-[15px] sm:text-[16px] font-bold text-slate-950 bg-[#c8e558] hover:bg-[#d4f266] active:scale-[0.98] transition-all cursor-pointer shadow-[0_4px_25px_rgba(200,229,88,0.35)] hover:shadow-[0_6px_35px_rgba(200,229,88,0.45)]"
              >
                <span>Let&rsquo;s Get Started</span>
                <ArrowRight className="w-4.5 h-4.5 stroke-[2.5]" />
              </button>

              <div className="text-[11.5px] text-slate-400 dark:text-gray-400 font-medium tracking-tight">
                Smarter Preparation. Brighter Tomorrows.
              </div>
            </div>
          </motion.div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
};