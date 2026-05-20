import type { SnapValue } from '../types/music';

export const SNAP_SHORTCUT_OPTIONS = [
  { key: '1', unit: '1/1' },
  { key: '2', unit: '1/2' },
  { key: '3', unit: '1/4' },
  { key: '4', unit: '1/8' },
  { key: '5', unit: '1/16' },
  { key: '6', unit: '1/32' },
  { key: '7', unit: '1/64' },
  { key: '8', unit: '1/8T' },
  { key: '9', unit: '1/16T' },
  { key: '0', unit: '1/32T' },
] as const satisfies ReadonlyArray<{ key: string; unit: SnapValue }>;

export const SNAP_KEY_TO_UNIT = Object.fromEntries(
  SNAP_SHORTCUT_OPTIONS.map(({ key, unit }) => [key, unit]),
) as Record<string, SnapValue>;
