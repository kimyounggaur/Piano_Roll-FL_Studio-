import { NOTE_NAMES, SCALES, type NoteName } from '../types/music';

export function midiToNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const name = NOTE_NAMES[pitch % 12];
  return `${name}${octave}`;
}

export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(pitch % 12);
}

export function isInScale(pitch: number, root: number, scaleName: string): boolean {
  if (scaleName === 'none') return true;
  const intervals = SCALES[scaleName];
  if (!intervals) return true;
  const pc = ((pitch - root) % 12 + 12) % 12;
  return intervals.includes(pc);
}

export function snapPitchToScale(
  pitch: number,
  root: number,
  scaleName: string,
  direction: 'up' | 'down' = 'down'
): number {
  if (scaleName === 'none') return pitch;
  let p = Math.max(0, Math.min(127, pitch));
  const step = direction === 'up' ? 1 : -1;
  for (let i = 0; i < 12; i++) {
    if (isInScale(p, root, scaleName)) return p;
    p = Math.max(0, Math.min(127, p + step));
  }
  return pitch;
}

export function noteNameFromIndex(index: number): NoteName {
  return NOTE_NAMES[((index % 12) + 12) % 12];
}

export function generateChord(root: number, intervals: number[]): number[] {
  return intervals.map(i => Math.min(127, root + i));
}
