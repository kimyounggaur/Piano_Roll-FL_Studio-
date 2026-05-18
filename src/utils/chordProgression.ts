import type { Note, ScaleType } from '../types/music';
import { SCALES } from '../types/music';

// ═══════════════════════════════════════════════════════════════════
//  Chord progression generation (#50)
//
//  Inputs:
//    rootKey, scaleName, progressionTemplate, bars, chordsPerBar
//  Output: Note[] (no ids — caller assigns via bulkAddNotes)
// ═══════════════════════════════════════════════════════════════════

export type RomanNumeral = 'I' | 'ii' | 'iii' | 'IV' | 'V' | 'vi' | 'vii';

export const PROGRESSION_PRESETS: Record<string, RomanNumeral[]> = {
  'I-V-vi-IV':  ['I', 'V', 'vi', 'IV'],
  'I-IV-V':     ['I', 'IV', 'V', 'V'],
  'ii-V-I':     ['ii', 'V', 'I', 'I'],
  'vi-IV-I-V':  ['vi', 'IV', 'I', 'V'],
  'I-vi-IV-V':  ['I', 'vi', 'IV', 'V'],
  'I-IV-vi-V':  ['I', 'IV', 'vi', 'V'],
};

// Roman numeral → scale-degree index (0-based) + chord quality.
//   Capital = major triad, lowercase = minor triad.
const NUMERAL_TO_DEGREE: Record<RomanNumeral, { degree: number; quality: 'major' | 'minor' | 'diminished' }> = {
  I:   { degree: 0, quality: 'major' },
  ii:  { degree: 1, quality: 'minor' },
  iii: { degree: 2, quality: 'minor' },
  IV:  { degree: 3, quality: 'major' },
  V:   { degree: 4, quality: 'major' },
  vi:  { degree: 5, quality: 'minor' },
  vii: { degree: 6, quality: 'diminished' },
};

/** Resolve a roman numeral to its absolute root pitch + triad interval set. */
function romanToChordPitches(
  numeral: RomanNumeral,
  scaleRoot: number,
  scaleName: ScaleType,
  octave: number,
): number[] {
  const intervals = SCALES[scaleName] ?? SCALES.major;
  const { degree, quality } = NUMERAL_TO_DEGREE[numeral];
  const rootInterval = intervals[degree % intervals.length] ?? 0;
  const rootPitch = scaleRoot + rootInterval + octave * 12;
  const triad =
    quality === 'major' ? [0, 4, 7]
    : quality === 'minor' ? [0, 3, 7]
    : [0, 3, 6]; // diminished
  return triad.map((iv) => Math.max(0, Math.min(127, rootPitch + iv)));
}

/**
 * Smooth voicing: shift each chord so its average pitch is within an octave
 * of the previous chord. Reduces parallel-octave jumps.
 */
function smoothVoicing(prev: number[] | null, current: number[]): number[] {
  if (!prev) return current;
  const prevAvg    = prev.reduce((a, b) => a + b, 0) / prev.length;
  const currentAvg = current.reduce((a, b) => a + b, 0) / current.length;
  let offset = 0;
  if (currentAvg - prevAvg > 6) offset = -12;
  else if (prevAvg - currentAvg > 6) offset = 12;
  return current.map((p) => Math.max(0, Math.min(127, p + offset)));
}

export interface ProgressionOptions {
  rootKey: number;             // 0..11 (C..B)
  scaleName: ScaleType;
  template: RomanNumeral[];    // chord per slot, repeated to fill `bars * chordsPerBar`
  bars: number;
  chordsPerBar: number;        // 1, 2, or 4
  ppq: number;
  tsNumerator: number;
  startTick: number;
  octave?: number;             // default 5
  velocity?: number;           // default 90
  voicing?: 'root' | 'smooth';
  with7th?: boolean;
  /** Optional starting colorGroup index — successive chords cycle through. */
  startColorGroup?: number;
}

/** Returns an array of Notes ready to insert via bulkAddNotes. */
export function generateProgression(opts: ProgressionOptions): Array<Omit<Note, 'id'>> {
  const {
    rootKey, scaleName, template, bars, chordsPerBar, ppq, tsNumerator,
    startTick, octave = 5, velocity = 90, voicing = 'smooth', with7th = false,
    startColorGroup = 1,
  } = opts;
  const ticksPerBar    = ppq * 4 * tsNumerator / 4;   // assume denom=4 in popup
  const ticksPerChord  = Math.floor(ticksPerBar / Math.max(1, chordsPerBar));
  const totalSlots     = bars * chordsPerBar;
  const out: Array<Omit<Note, 'id'>> = [];

  let prev: number[] | null = null;
  for (let i = 0; i < totalSlots; i++) {
    const numeral = template[i % template.length];
    let pitches = romanToChordPitches(numeral, rootKey, scaleName, octave);
    if (with7th) {
      const { quality } = NUMERAL_TO_DEGREE[numeral];
      pitches = [...pitches, pitches[0] + (quality === 'major' ? 11 : 10)];
    }
    if (voicing === 'smooth') pitches = smoothVoicing(prev, pitches);
    prev = pitches;
    const slotStart = startTick + i * ticksPerChord;
    const colorGroup = String(((startColorGroup + i) % 15) + 1);
    for (const p of pitches) {
      out.push({
        pitch: p,
        startTick: slotStart,
        durationTicks: ticksPerChord,
        velocity,
        colorGroup,
      });
    }
  }
  return out;
}
