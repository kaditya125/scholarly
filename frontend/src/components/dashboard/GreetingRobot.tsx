import React, { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "../../lib/ThemeContext";

interface GreetingRobotProps {
  className?: string;
}

export const GreetingRobot: React.FC<GreetingRobotProps> = ({ className = "" }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  const shouldReduceMotion = useReducedMotion();
  const [animationFinished, setAnimationFinished] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  // Asset paths based on active theme
  const mode = isDarkMode ? "dark" : "light";
  const bodySrc = `/images/greeting-robot-${mode}-body.webp`;
  const headSrc = `/images/greeting-robot-${mode}-head.webp`;
  const armSrc = `/images/greeting-robot-${mode}-arm.webp`;
  const finalSrc = `/images/greeting-robot-${mode}-final.webp`;

  // Exact relative percentages for layers based on 215 x 295 master canvas
  // Dark: Head box (39, 54, 157, 94), pivot (76, 88); Arm box (144, 130, 57, 32), pivot (14, 14)
  // Light: Head box (37, 52, 137, 96), pivot (68, 88); Arm box (142, 129, 61, 33), pivot (14, 14)
  const headStyle = isDarkMode
    ? {
        left: "18.14%",
        top: "18.31%",
        width: "73.02%",
        height: "31.86%",
        transformOrigin: "48.41% 93.62%",
      }
    : {
        left: "17.21%",
        top: "17.63%",
        width: "63.72%",
        height: "32.54%",
        transformOrigin: "49.64% 91.67%",
      };

  const armStyle = isDarkMode
    ? {
        left: "66.98%",
        top: "44.07%",
        width: "26.51%",
        height: "10.85%",
        transformOrigin: "24.56% 43.75%",
      }
    : {
        left: "66.05%",
        top: "43.73%",
        width: "28.37%",
        height: "11.19%",
        transformOrigin: "22.95% 42.42%",
      };

  // If user prefers reduced motion, render clean static resting pose directly
  if (shouldReduceMotion) {
    return (
      <div 
        className={`relative shrink-0 select-none aspect-[215/295] w-[62px] sm:w-[74px] md:w-[82px] -mr-1.5 sm:-mr-2 ${className}`}
        aria-label="Sadhya AI mascot greeting"
      >
        <img
          src={finalSrc}
          alt="Sadhya AI mascot"
          className="w-full h-full object-contain pointer-events-none drop-shadow-sm"
          loading="eager"
        />
      </div>
    );
  }

  // Motion animation definitions:
  // Timeline:
  // 0.0s - 0.5s: Stands naturally in initial pose
  // 0.5s - 0.9s: Arm rises
  // 0.9s - 2.1s: Waves 2-3 times
  // 2.1s - 2.5s: Arm returns down
  // 2.1s - 3.6s: Head looks Left (+8°), Right (-8°), and Centers (0°)
  // 3.6s - 4.4s: Robot subtly leans/glides toward greeting text (x: 0 -> 8px, rotate: 0 -> 1.2°)
  // 4.0s - 4.8s: Arm settles hand gently leaning near/on "Good Morning"
  // 4.8s+: Settled into permanent friendly resting pose with gentle idle breathing

  const armKeyframes = animationFinished
    ? isHovered
      ? [0, -28, 0]
      : [0, 0]
    : [
        0,    // 0.0s: idle resting
        0,    // 0.5s: begins noticing
        -65,  // 0.9s: arm raised
        -82,  // 1.15s: wave left
        -52,  // 1.4s: wave right
        -82,  // 1.65s: wave left
        -52,  // 1.9s: wave right
        -65,  // 2.1s: end waving
        0,    // 2.5s: lowers back
        0,    // 3.6s: resting
        -6,   // 4.2s: gentle adjust onto text
        0,    // 4.8s: resting securely on greeting
      ];

  const armTimes = animationFinished
    ? [0, 0.5, 1.0]
    : [0, 0.1, 0.19, 0.24, 0.29, 0.34, 0.40, 0.44, 0.52, 0.75, 0.88, 1.0];

  const headKeyframes = animationFinished
    ? isHovered
      ? [0, -6, 0]
      : [0, 0]
    : [
        0,   // 0.0s: forward
        0,   // 2.1s: still looking forward during wave
        8,   // 2.6s: looks Left
        -8,  // 3.2s: looks Right
        0,   // 3.6s: looks back at student
        0,   // 4.8s: stays forward
      ];

  const headTimes = animationFinished
    ? [0, 0.5, 1.0]
    : [0, 0.44, 0.54, 0.67, 0.75, 1.0];

  const bodyKeyframes = animationFinished
    ? { x: 8, rotate: 1.2 }
    : {
        x: [0, 0, 0, 8, 8],
        rotate: [0, 0, 0, 1.2, 1.2],
      };

  const bodyTimes = [0, 0.44, 0.75, 0.92, 1.0];

  return (
    <div
      className={`relative shrink-0 select-none aspect-[215/295] w-[62px] sm:w-[74px] md:w-[82px] -mr-1.5 sm:-mr-2.5 z-10 cursor-pointer ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      title="Sadhya AI Assistant"
      aria-label="Sadhya AI mascot greeting"
    >
      {/* Root animated body container with lean/glide and idle breathing */}
      <motion.div
        className="w-full h-full relative"
        initial={{ x: 0, rotate: 0 }}
        animate={bodyKeyframes}
        transition={
          animationFinished
            ? { duration: 0.2 }
            : { duration: 4.8, times: bodyTimes, ease: "easeInOut" }
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
          {/* Base Layer: Body, Torso, Legs, Left Arm, Elbow & Neck Sockets */}
          <img
            src={bodySrc}
            alt=""
            className="absolute inset-0 w-full h-full object-contain pointer-events-none drop-shadow-sm"
            loading="eager"
          />

          {/* Right Arm & Hand Layer (Waves, then rests casually on greeting) */}
          <motion.div
            className="absolute pointer-events-none"
            style={armStyle}
            animate={{ rotate: armKeyframes }}
            transition={
              animationFinished
                ? { duration: 0.7, ease: "easeInOut" }
                : { duration: 4.8, times: armTimes, ease: "easeInOut" }
            }
          >
            <img
              src={armSrc}
              alt=""
              className="w-full h-full object-contain pointer-events-none"
              loading="eager"
            />
          </motion.div>

          {/* Head & Helmet Layer (Turns to look left, right, then back at student) */}
          <motion.div
            className="absolute pointer-events-none"
            style={headStyle}
            animate={{ rotate: headKeyframes }}
            transition={
              animationFinished
                ? { duration: 0.6, ease: "easeInOut" }
                : { duration: 4.8, times: headTimes, ease: "easeInOut" }
            }
          >
            <img
              src={headSrc}
              alt=""
              className="w-full h-full object-contain pointer-events-none"
              loading="eager"
            />
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
};
