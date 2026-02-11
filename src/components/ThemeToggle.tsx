"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyThemeToDom,
  sanitizeTheme,
  type ThemeMode,
} from "@/lib/theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>(DEFAULT_THEME);

  useEffect(() => {
    const themeFromDom = sanitizeTheme(document.documentElement.dataset.theme);
    let storedTheme: ThemeMode | null = null;
    try {
      const rawStoredTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (rawStoredTheme) {
        storedTheme = sanitizeTheme(rawStoredTheme);
      }
    } catch {
      storedTheme = null;
    }
    const resolvedTheme = storedTheme ?? themeFromDom;
    setTheme(resolvedTheme);
    applyThemeToDom(resolvedTheme);
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyThemeToDom(nextTheme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    } catch {
      // If storage is blocked, keep applying theme for this session only.
    }
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-pressed={theme === "light"}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
    >
      <span className="theme-toggle-track" aria-hidden="true">
        <span className="theme-toggle-thumb" />
      </span>
      <span className="theme-toggle-label">{theme === "dark" ? "Dark" : "Light"}</span>
    </button>
  );
}
