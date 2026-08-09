import React, { createContext, useContext, useState, useEffect } from 'react';

type Theme = 'light' | 'dark';
type ThemePreference = 'system' | 'light' | 'dark';

export interface BackgroundPreset {
  id: string;
  label: string;
  swatch: string;
}

export interface ChatColorPreset {
  id: string;
  color: string;
}

export const BACKGROUND_PRESETS: BackgroundPreset[] = [
  {
    id: 'aurora',
    label: 'Aurora Borealis',
    swatch: 'linear-gradient(135deg, #0284c7 0%, #10b981 50%, #1e1b4b 100%)',
  },
  {
    id: 'sunset',
    label: 'Sunset Glow',
    swatch: 'linear-gradient(135deg, #f59e0b 0%, #ec4899 50%, #312e81 100%)',
  },
  {
    id: 'ocean',
    label: 'Ocean Breeze',
    swatch: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
  },
  {
    id: 'forest',
    label: 'Forest Mist',
    swatch: 'linear-gradient(135deg, #10b981 0%, #065f46 100%)',
  },
  {
    id: 'midnight',
    label: 'Midnight Sparkle',
    swatch: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #311042 100%)',
  },
];

export const CHAT_COLOR_PRESETS: ChatColorPreset[] = [
  { id: 'Indigo', color: '#4f46e5' },
  { id: 'Violet', color: '#7c3aed' },
  { id: 'Pink', color: '#db2777' },
  { id: 'Emerald', color: '#059669' },
  { id: 'Blue', color: '#2563eb' },
];

interface ThemeContextType {
  theme: Theme;
  themePreference: ThemePreference;
  setThemePreference: (pref: ThemePreference) => void;
  background: string;
  setBackground: (bg: string) => void;
  chatColor: string;
  setChatColor: (color: string) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>(() => {
    const saved = localStorage.getItem('app-theme-preference') || localStorage.getItem('app-theme');
    return (saved as ThemePreference) || 'dark'; // defaulting to dark based on user's preference
  });

  const [background, setBackgroundState] = useState<string>(() => {
    return localStorage.getItem('app-theme-background') || 'none';
  });

  const [chatColor, setChatColorState] = useState<string>(() => {
    return localStorage.getItem('app-theme-chatcolor') || 'none';
  });

  const [theme, setTheme] = useState<Theme>('dark');

  // Compute theme when preference or system preference changes
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const computeAndApplyTheme = () => {
      let resolvedTheme: Theme = 'dark';
      if (themePreference === 'system') {
        resolvedTheme = mediaQuery.matches ? 'dark' : 'light';
      } else {
        resolvedTheme = themePreference;
      }
      setTheme(resolvedTheme);
      
      const root = window.document.documentElement;
      if (resolvedTheme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
    };

    computeAndApplyTheme();

    if (themePreference === 'system') {
      mediaQuery.addEventListener('change', computeAndApplyTheme);
      return () => mediaQuery.removeEventListener('change', computeAndApplyTheme);
    }
  }, [themePreference]);

  // Save preference
  const setThemePreference = (pref: ThemePreference) => {
    setThemePreferenceState(pref);
    localStorage.setItem('app-theme-preference', pref);
    localStorage.setItem('app-theme', pref); // keep app-theme in sync
  };

  // Save background
  const setBackground = (bg: string) => {
    setBackgroundState(bg);
    localStorage.setItem('app-theme-background', bg);
  };

  // Save chat color
  const setChatColor = (color: string) => {
    setChatColorState(color);
    localStorage.setItem('app-theme-chatcolor', color);
  };

  // Toggle theme utility
  const toggleTheme = () => {
    setThemePreference(theme === 'light' ? 'dark' : 'light');
  };

  // Apply background styles
  useEffect(() => {
    if (background !== 'none') {
      const preset = BACKGROUND_PRESETS.find(p => p.id === background);
      if (preset) {
        document.body.style.backgroundImage = preset.swatch;
      } else {
        document.body.style.backgroundImage = '';
      }
    } else {
      document.body.style.backgroundImage = '';
    }
  }, [background]);

  // Apply chat color css variable
  useEffect(() => {
    const root = window.document.documentElement;
    if (chatColor !== 'none') {
      root.style.setProperty('--chat-brand-color', chatColor);
      root.style.setProperty('--chat-brand-color-light', `${chatColor}1a`); // 10% opacity for backgrounds
    } else {
      root.style.removeProperty('--chat-brand-color');
      root.style.removeProperty('--chat-brand-color-light');
    }
  }, [chatColor]);

  return (
    <ThemeContext.Provider value={{
      theme,
      themePreference,
      setThemePreference,
      background,
      setBackground,
      chatColor,
      setChatColor,
      toggleTheme
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
