export type ThemeMode = "dark" | "light";

export const THEME_STORAGE_KEY = "startupmanch.theme";
export const DEFAULT_THEME: ThemeMode = "dark";

export const sanitizeTheme = (value: string | null | undefined): ThemeMode => {
  if (value === "light" || value === "dark") return value;
  return DEFAULT_THEME;
};

export const applyThemeToDom = (theme: ThemeMode) => {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
};
