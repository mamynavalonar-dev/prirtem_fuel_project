import React from 'react';
import { useTheme } from './ThemeContext.jsx';

export default function ThemeSwitch() {
  const { theme, setTheme } = useTheme();

  const isLight = theme === 'light';

  return (
    <div className="themeSwitch">
      <label htmlFor="theme-switch" className="switch" aria-label="Changer le thème">
        <input
          id="theme-switch"
          type="checkbox"
          checked={isLight}
          onChange={(e) => setTheme(e.target.checked ? 'light' : 'dark')}
        />
        <span className="slider" />
        <span className="decoration" />
      </label>
    </div>
  );
}
