import React from "react";
import { useTheme } from "../../lib/ThemeContext";

interface GreetingRobotProps {
  className?: string;
}

export const GreetingRobot: React.FC<GreetingRobotProps> = ({ className = "" }) => {
  const { theme } = useTheme();
  const isDarkMode = theme === "dark";

  // Pristine high-resolution studio 3D render (cache-busted URL to prevent browser caching old image)
  const imageSrc = isDarkMode
    ? "/images/mascot-waving-dark-v2.webp"
    : "/images/mascot-waving-light-v2.webp";

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
