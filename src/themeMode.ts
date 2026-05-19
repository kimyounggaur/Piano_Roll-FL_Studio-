export type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'rolllab-theme-mode';

export const isThemeMode = (value: unknown): value is ThemeMode =>
  value === 'light' || value === 'dark';

export const normalizeThemeMode = (value: unknown): ThemeMode =>
  isThemeMode(value) ? value : 'dark';

export const getNextThemeMode = (mode: ThemeMode): ThemeMode =>
  mode === 'dark' ? 'light' : 'dark';

export const readStoredThemeMode = (): ThemeMode => {
  if (typeof window === 'undefined') return 'dark';
  return normalizeThemeMode(window.localStorage.getItem(STORAGE_KEY));
};

export const writeStoredThemeMode = (mode: ThemeMode) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, mode);
};

export const applyThemeMode = (mode: ThemeMode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.colorScheme = mode;
};
