import React from "react";
import { motion } from "motion/react";

export type RobotState = 'celebrating' | 'flying' | 'greeting' | 'hidden';

interface GreetingRobotProps {
  className?: string;
  state?: RobotState;
  flightStartRect?: DOMRect | null;
  onFlightComplete?: () => void;
}

export const GreetingRobot: React.FC<GreetingRobotProps> = ({
  className = "",
  state = "greeting",
  flightStartRect = null,
  onFlightComplete,
}) => {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [flightDelta, setFlightDelta] = React.useState<{ x: number; y: number; scale: number } | null>(null);
  const [animState, setAnimState] = React.useState<RobotState>(state);

  React.useEffect(() => {
    setAnimState(state);
  }, [state]);

  React.useEffect(() => {
    if (state === 'flying' && flightStartRect && containerRef.current) {
      const destRect = containerRef.current.getBoundingClientRect();
      const dx = flightStartRect.left + flightStartRect.width / 2 - (destRect.left + destRect.width / 2);
      const dy = flightStartRect.top + flightStartRect.height / 2 - (destRect.top + destRect.height / 2);
      const scale = (flightStartRect.width || 175) / (destRect.width || 126);
      setFlightDelta({ x: dx, y: dy, scale });
    }
  }, [state, flightStartRect]);

  const isFlying = animState === 'flying' && flightDelta;

  return (
    <div
      ref={containerRef}
      className={`relative shrink-0 select-none aspect-[494/613] w-[110px] sm:w-[126px] md:w-[140px] pointer-events-none ${className}`}
      aria-label="Sadhya AI mascot greeting"
    >
      <motion.div
        className="w-full h-full relative"
        initial={false}
        animate={
          isFlying
            ? {
                x: [flightDelta.x, flightDelta.x * 0.4, 0],
                y: [flightDelta.y, Math.min(flightDelta.y, 0) - 45, 0], // graceful arc
                scale: [flightDelta.scale, (flightDelta.scale + 1) / 2, 1],
                rotate: [0, -6, 2, 0],
              }
            : {
                x: 0,
                y: 0,
                scale: 1,
                rotate: 0,
              }
        }
        transition={
          isFlying
            ? {
                duration: 1.15,
                ease: [0.16, 1, 0.3, 1],
                times: [0, 0.55, 1],
              }
            : { duration: 0.2 }
        }
        onAnimationComplete={() => {
          if (isFlying) {
            setAnimState('greeting');
            if (onFlightComplete) onFlightComplete();
          }
        }}
      >
        {/* Soft lime motion particle / trail glow while flying */}
        {isFlying && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: [0, 0.8, 0], scale: [0.8, 1.4, 1] }}
            transition={{ duration: 1.15 }}
            className="absolute -inset-4 bg-[#c8e558]/30 blur-2xl rounded-full pointer-events-none -z-10"
          />
        )}

        {/* 100% Static 3D Studio Body & Visor (Never shifts or moves when greeting) */}
        <img
          src="/images/mascot-body-v3.webp"
          alt="Sadhya AI mascot"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-sm select-none"
          loading="eager"
          draggable={false}
        />

        {/* Joyful, Excited Blinking Happy Eyes */}
        <motion.img
          src="/images/mascot-eyes-v3.webp"
          alt="Sadhya AI mascot happy eyes"
          className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none z-10"
          loading="eager"
          draggable={false}
          initial={{ scaleY: 1, scaleX: 1, filter: "brightness(1) drop-shadow(0 0 0px #a3e635)" }}
          animate={{
            scaleY: [
              1, 1, 1, 1,
              0.08, 1, // Quick natural blink 1
              1, 1,
              1.14, 0.94, 1.12, 1, // Excited happy bounce / giggle squeeze!
              1, 1,
              0.08, 1, 0.08, 1, // Happy double blink!
              1, 1, 1
            ],
            scaleX: [
              1, 1, 1, 1,
              1.06, 1,
              1, 1,
              1.08, 1.02, 1.05, 1,
              1, 1,
              1.05, 1, 1.05, 1,
              1, 1, 1
            ],
            filter: [
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(0.85) drop-shadow(0 0 0px transparent)",
              "brightness(1.15) drop-shadow(0 0 5px rgba(163,230,53,0.6))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(1.3) drop-shadow(0 0 8px rgba(190,242,100,0.85))",
              "brightness(1.1) drop-shadow(0 0 4px rgba(163,230,53,0.5))",
              "brightness(1.25) drop-shadow(0 0 7px rgba(190,242,100,0.8))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(0.85) drop-shadow(0 0 0px transparent)",
              "brightness(1.15) drop-shadow(0 0 5px rgba(163,230,53,0.6))",
              "brightness(0.85) drop-shadow(0 0 0px transparent)",
              "brightness(1.2) drop-shadow(0 0 6px rgba(190,242,100,0.7))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
              "brightness(1) drop-shadow(0 0 2px rgba(163,230,53,0.3))",
            ],
          }}
          transition={{
            duration: 5.4,
            repeat: Infinity,
            ease: "easeInOut",
            times: [
              0, 0.2, 0.28, 0.3,
              0.32, 0.35,
              0.45, 0.52,
              0.57, 0.61, 0.66, 0.72,
              0.78, 0.84,
              0.86, 0.89, 0.91, 0.94,
              0.96, 0.98, 1
            ],
          }}
          style={{
            transformOrigin: "49% 27%",
          }}
        />
      </motion.div>
    </div>
  );
};
