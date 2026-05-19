import { describe, expect, it } from 'vitest';
import { getNextThemeMode, isThemeMode, normalizeThemeMode } from './themeMode';

describe('theme mode helpers', () => {
  it('accepts only light and dark theme modes', () => {
    expect(isThemeMode('light')).toBe(true);
    expect(isThemeMode('dark')).toBe(true);
    expect(isThemeMode('system')).toBe(false);
    expect(isThemeMode(null)).toBe(false);
  });

  it('normalizes unknown values to dark', () => {
    expect(normalizeThemeMode('light')).toBe('light');
    expect(normalizeThemeMode('dark')).toBe('dark');
    expect(normalizeThemeMode('')).toBe('dark');
  });

  it('toggles between light and dark', () => {
    expect(getNextThemeMode('dark')).toBe('light');
    expect(getNextThemeMode('light')).toBe('dark');
  });
});
