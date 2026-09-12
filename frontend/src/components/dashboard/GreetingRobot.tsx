import React from "react";
import { motion } from "motion/react";

interface GreetingRobotProps {
  className?: string;
}

export const GreetingRobot: React.FC<GreetingRobotProps> = ({ className = "" }) => {
  return (
    <div
      className={`relative shrink-0 select-none aspect-[494/613] w-[110px] sm:w-[126px] md:w-[140px] pointer-events-none ${className}`}
      aria-label="Sadhya AI mascot greeting"
    >
      {/* 100% Static 3D Studio Body & Visor (Never shifts or moves) */}
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
    </div>
  );
};
