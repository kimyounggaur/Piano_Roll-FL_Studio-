import { NOTE_NAMES, SCALES, type NoteName, type ScaleType, type ChordType } from '../types/music';

// ═══════════════════════════════════════════════════════════════════
//  Basic helpers
// ═══════════════════════════════════════════════════════════════════

export function midiToNoteName(pitch: number): string {
  const octave = Math.floor(pitch / 12) - 1;
  const name = NOTE_NAMES[pitch % 12];
  return `${name}${octave}`;
}

export function isBlackKey(pitch: number): boolean {
  return [1, 3, 6, 8, 10].includes(((pitch % 12) + 12) % 12);
}

export function noteNameFromIndex(index: number): NoteName {
  return NOTE_NAMES[((index % 12) + 12) % 12];
}

// ═══════════════════════════════════════════════════════════════════
//  Scales
// ═══════════════════════════════════════════════════════════════════

/**
 * Returns the pitch classes (0..11) that make up the given scale rooted at
 * `root`. Example: getScalePitchClasses(0, 'major') → [0,2,4,5,7,9,11]
 *                  getScalePitchClasses(9, 'minor') → [9,11,0,2,4,5,7]
 */
export function getScalePitchClasses(root: number, scaleType: ScaleType): number[] {
  const intervals = SCALES[scaleType] ?? [];
  return intervals.map((i) => (((i + root) % 12) + 12) % 12);
}

/** True when the pitch's pitch-class is contained in the scale rooted at `root`. */
export function isPitchInScale(pitch: number, root: number, scaleType: ScaleType | string): boolean {
  if (scaleType === 'none') return true;
  const intervals = SCALES[scaleType as ScaleType];
  if (!intervals || intervals.length === 0) return true;
  const pc = (((pitch - root) % 12) + 12) % 12;
  return intervals.includes(pc);
}

// Legacy alias — older code uses `isInScale`.
export const isInScale = isPitchInScale;

/**
 * Snap a pitch to the nearest in-scale degree.
 * @param direction "nearest" finds the closest in-scale pitch (default);
 *                  "up" only searches upward; "down" only downward.
 *                  For "nearest", ties round upward.
 */
export function snapPitchToScale(
  pitch: number,
  root: number,
  scaleType: ScaleType | string,
  direction: 'nearest' | 'up' | 'down' = 'nearest',
): number {
  if (scaleType === 'none') return pitch;
  if (isPitchInScale(pitch, root, scaleType)) return pitch;

  let up = -1;
  for (let i = 1; i <= 12 && pitch + i <= 127; i++) {
    if (isPitchInScale(pitch + i, root, scaleType)) { up = pitch + i; break; }
  }
  let down = -1;
  for (let i = 1; i <= 12 && pitch - i >= 0; i++) {
    if (isPitchInScale(pitch - i, root, scaleType)) { down = pitch - i; break; }
  }

  if (direction === 'up')   return up   >= 0 ? up   : pitch;
  if (direction === 'down') return down >= 0 ? down : pitch;

  // nearest — fall back to whichever direction had a hit
  if (up < 0)   return down >= 0 ? down : pitch;
  if (down < 0) return up;
  const dUp   = up - pitch;
  const dDown = pitch - down;
  return dUp <= dDown ? up : down;
}

// ═══════════════════════════════════════════════════════════════════
//  Chords
// ═══════════════════════════════════════════════════════════════════

const CHORD_INTERVALS: Record<ChordType, number[]> = {
  major:           [0, 4, 7],
  minor:           [0, 3, 7],
  diminished:      [0, 3, 6],
  augmented:       [0, 4, 8],
  sus2:            [0, 2, 7],
  sus4:            [0, 5, 7],
  major7:          [0, 4, 7, 11],
  minor7:          [0, 3, 7, 10],
  dominant7:       [0, 4, 7, 10],
  diminished7:     [0, 3, 6, 9],
  halfDiminished7: [0, 3, 6, 10],
  add9:            [0, 4, 7, 14],
  minorAdd9:       [0, 3, 7, 14],
  powerChord:      [0, 7],
};

/** Semitone intervals (relative to root) for the given chord type. */
export function getChordIntervals(type: ChordType): number[] {
  return CHORD_INTERVALS[type] ?? [];
}

/** Human-readable label for UI dropdowns. */
export const CHORD_LABELS: Record<ChordType, string> = {
  major:           '메이저',
  minor:           '마이너',
  diminished:      '디미니시드',
  augmented:       '어그먼티드',
  sus2:            'Sus2',
  sus4:            'Sus4',
  major7:          'Maj7',
  minor7:          'Min7',
  dominant7:       'Dom7',
  diminished7:     'Dim7',
  halfDiminished7: 'm7♭5',
  add9:            'Add9',
  minorAdd9:       'mAdd9',
  powerChord:      '5도 파워',
};

/**
 * Build a chord's MIDI pitches from a root pitch and chord type.
 * - Any pitch that exceeds 127 is octave-shifted down until in range.
 * - If `opts.scaleSnap` is true and a scale is given, each chord tone is
 *   snapped to the nearest in-scale degree (useful when scale-locking).
 */
export function buildChord(
  rootPitch: number,
  type: ChordType,
  opts?: { scaleSnap?: boolean; scaleRoot?: number; scaleName?: ScaleType | string },
): number[] {
  const intervals = getChordIntervals(type);
  const out: number[] = [];
  for (const iv of intervals) {
    let p = rootPitch + iv;
    while (p > 127) p -= 12;
    while (p < 0)   p += 12;
    if (opts?.scaleSnap && opts.scaleName && opts.scaleName !== 'none') {
      p = snapPitchToScale(p, opts.scaleRoot ?? 0, opts.scaleName, 'nearest');
    }
    out.push(p);
  }
  return out;
}

// Legacy alias — older code uses `generateChord(root, intervals[])`.
export function generateChord(root: number, intervals: number[]): number[] {
  return intervals.map((i) => Math.min(127, Math.max(0, root + i)));
}
