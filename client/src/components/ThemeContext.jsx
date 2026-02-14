import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

const ThemeContext = createContext(null);
const STORAGE_KEY = 'prirtem_theme';

function getInitialTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'dark' || saved === 'light') return saved;

  // fallback: préfère le thème système
  const prefersDark =
    typeof window !== 'undefined' &&
    window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;

  return prefersDark ? 'dark' : 'light';
}

export function ThemeProvider({ children }) {
  const location = useLocation();
  const [theme, setTheme] = useState(() => getInitialTheme());

  // ✅ Login toujours en light (exclu)
  useEffect(() => {
    const forced = location.pathname === '/login' ? 'light' : theme;
    document.documentElement.dataset.theme = forced;
  }, [theme, location.pathname]);

  // ✅ persistance (pas sur login)
  useEffect(() => {
    if (location.pathname !== '/login') {
      localStorage.setItem(STORAGE_KEY, theme);
    }
  }, [theme, location.pathname]);

  const value = useMemo(
    () => ({
      theme,
      setTheme,
      toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    }),
    [theme]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    return { theme: 'light', setTheme: () => {}, toggle: () => {} };
  }
  return ctx;
}
