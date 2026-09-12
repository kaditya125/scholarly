import React from "react";
import { useTheme } from "../../lib/ThemeContext";

interface GreetingRobotProps {
  className?: string;
}

export const GreetingRobot: React.FC<GreetingRobotProps> = ({ className = "" }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  // Pristine high-resolution unmultiplied assets (270 x 274 Retina resolution)
  const imageSrc = isDarkMode
    ? "/images/greeting-robot-dark.webp"
    : "/images/greeting-robot-light.webp";

  return (
    <div
      className={`relative shrink-0 select-none aspect-[494/613] w-[110px] sm:w-[126px] md:w-[140px] pointer-events-none ${className}`}
      aria-label="Sadhya AI mascot greeting"
    >
      <img
        src={imageSrc}
        alt="Sadhya AI mascot greeting"
        className="w-full h-full object-contain pointer-events-none drop-shadow-sm select-none"
        loading="eager"
        draggable={false}
      />
    </div>
  );
};
