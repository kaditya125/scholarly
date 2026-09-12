import React, { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "../../lib/ThemeContext";

interface GreetingRobotProps {
  className?: string;
}

export const GreetingRobot: React.FC<GreetingRobotProps> = ({ className = "" }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";
  const shouldReduceMotion = useReducedMotion();
  const [animationFinished, setAnimationFinished] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Pristine unmultiplied assets (270 x 274 Retina resolution)
  const imageSrc = isDarkMode
    ? "/images/greeting-robot-dark.webp"
    : "/images/greeting-robot-light.webp";

  // If user prefers reduced motion, render clean static resting pose directly
  if (shouldReduceMotion) {
    return (
      <div 
        className={`relative shrink-0 select-none aspect-[270/274] w-[105px] sm:w-[125px] md:w-[140px] pointer-events-auto ${className}`}
        aria-label="Sadhya AI mascot greeting"
      >
        <img
          src={imageSrc}
          alt="Sadhya AI mascot"
          className="w-full h-full object-contain pointer-events-none drop-shadow-sm"
          loading="eager"
        />
      </div>
    );
  }

  // Animation sequence:
  // 0.0s - 0.5s: Appears smoothly beside the greeting
  // 0.5s - 1.0s: Notice/curious gesture (cute bounce & tilt)
  // 1.0s - 2.1s: Friendly waving interaction (2-3 gentle waves)
  // 2.1s - 2.8s: Looks left
  // 2.8s - 3.6s: Looks right
  // 3.6s - 4.2s: Glides toward text, aligning hand with "Good Morning"
  // 4.2s - 4.8s: Hand rests directly on top of the "G" in "Good Morning"
  // 4.8s+: Settles into resting pose
  // 5.0s onward: Subtle idle breathing only (4.2s cycle)

  const introX = [
    -10, // 0.0s: slightly to the left
    -10, // 0.5s: starts greeting
    -10, // 1.0s
    -10, // 2.1s: during waves
    -10, // 2.8s: look left
    -10, // 3.6s: look right
    2,   // 4.2s: glides toward greeting
    4,   // 4.8s: resting position with hand on 'G'
  ];

  const introY = [
    0,   // 0.0s
    -6,  // 0.6s: buoyant notice bounce
    0,   // 0.9s
    -7,  // 1.3s: wave peak 1
    0,   // 1.6s
    -5,  // 1.9s: wave peak 2
    0,   // 2.2s
    0,   // 4.8s
  ];

  const introRotate = [
    0,   // 0.0s
    -4,  // 0.6s: curious tilt
    0,   // 0.9s
    -7,  // 1.25s: wave left
    6,   // 1.55s: wave right
    -7,  // 1.85s: wave left
    4,   // 2.15s: wave right
    6,   // 2.6s: look left
    -6,  // 3.2s: look right
    0,   // 3.6s: look back at user
    1.2, // 4.4s: lean gently toward text
    1.2, // 4.8s: resting securely on "Good Morning"
  ];

  const introScale = [
    0.95, // 0.0s
    1.02, // 0.6s
    1.0,  // 0.9s
    1.03, // 1.3s
    1.0,  // 1.6s
    1.02, // 1.9s
    1.0,  // 2.2s
    1.0,  // 4.8s
  ];

  const timesX = [0, 0.1, 0.2, 0.44, 0.58, 0.75, 0.88, 1.0];
  const timesY = [0, 0.12, 0.19, 0.27, 0.33, 0.40, 0.46, 1.0];
  const timesRotate = [0, 0.12, 0.19, 0.26, 0.32, 0.39, 0.45, 0.54, 0.67, 0.75, 0.92, 1.0];
  const timesScale = [0, 0.12, 0.19, 0.27, 0.33, 0.40, 0.46, 1.0];

  return (
    <div
      className={`relative shrink-0 select-none aspect-[270/274] w-[105px] sm:w-[125px] md:w-[140px] pointer-events-auto cursor-pointer z-20 ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Sadhya AI Assistant"
      aria-label="Sadhya AI mascot greeting"
    >
      <motion.div
        className="w-full h-full relative"
        initial={{ opacity: 0, x: -10, scale: 0.95 }}
        animate={
          animationFinished
            ? isHovered
              ? {
                  x: 4,
                  y: [0, -3, 0],
                  rotate: [1.2, -4, 4, 1.2],
                  scale: [1, 1.02, 1],
                  opacity: 1,
                }
              : {
                  x: 4,
                  rotate: 1.2,
                  opacity: 1,
                }
            : {
                x: introX,
                y: introY,
                rotate: introRotate,
                scale: introScale,
                opacity: 1,
              }
        }
        transition={
          animationFinished
            ? isHovered
              ? { duration: 0.6, ease: "easeInOut" }
              : { duration: 0.3 }
            : {
                x: { duration: 4.8, times: timesX, ease: "easeInOut" },
                y: { duration: 4.8, times: timesY, ease: "easeInOut" },
                rotate: { duration: 4.8, times: timesRotate, ease: "easeInOut" },
                scale: { duration: 4.8, times: timesScale, ease: "easeInOut" },
                opacity: { duration: 0.4, ease: "easeOut" },
              }
        }
        onAnimationComplete={() => {
          if (!animationFinished) {
            setAnimationFinished(true);
          }
        }}
      >
        {/* Subtle idle breathing container once intro is complete */}
        <motion.div
          className="w-full h-full relative"
          animate={
            animationFinished
              ? {
                  y: [0, -1.2, 0],
                  scale: [1, 1.008, 1],
                }
              : {}
          }
          transition={{
            duration: 4.2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <img
            src={imageSrc}
            alt="Sadhya AI mascot greeting"
            className="w-full h-full object-contain pointer-events-none drop-shadow-sm select-none"
            loading="eager"
            draggable={false}
          />
        </motion.div>
      </motion.div>
    </div>
  );
};
