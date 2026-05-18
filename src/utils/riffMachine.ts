import type { Note, ScaleType } from '../types/music';
import { snapPitchToScale } from './musicTheory';

// ═══════════════════════════════════════════════════════════════════
//  Riff Machine — generates a single-line melodic phrase by combining
//  a rhythm pattern and a pitch contour, both seedable for repeatability.
// ═══════════════════════════════════════════════════════════════════

export type RhythmPattern = 'straight' | 'swing' | 'triplet' | 'syncopated';
export type PitchContour  = 'ascending' | 'descending' | 'arch' | 'valley' | 'randomWalk';

export interface RiffOptions {
  bars: number;
  density: number;           // 0..1 — fraction of cells that become notes
  rhythm: RhythmPattern;
  contour: PitchContour;
  scaleRoot: number;         // 0..11
  scaleName: ScaleType;
  pitchMin: number;          // MIDI low bound
  pitchMax: number;          // MIDI high bound
  velocityRange: number;     // ± offset around 90
  ppq: number;
  tsNumerator: number;
  startTick: number;
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state |= 0; state = (state + 0x6D2B79F5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate onset ticks across the bars based on the rhythm pattern. */
function generateOnsets(opts: RiffOptions, rand: () => number): number[] {
  const ticksPerBar = opts.ppq * 4;
  const totalTicks  = opts.bars * ticksPerBar;
  const onsets: number[] = [];

  const step =
    opts.rhythm === 'triplet' ? opts.ppq / 3 :     // triplet 8ths
    opts.rhythm === 'swing'   ? opts.ppq / 2 :
    opts.rhythm === 'syncopated' ? opts.ppq / 4 :
    opts.ppq / 4;                                  // straight 16ths

  for (let t = 0; t < totalTicks; t += step) {
    if (rand() > opts.density) continue;
    let offset = 0;
    if (opts.rhythm === 'swing') {
      // every odd 8th delayed by 1/12 of a beat
      const beatPos = (t % opts.ppq) / opts.ppq;
      if (Math.abs(beatPos - 0.5) < 1e-3) offset = Math.round(opts.ppq / 12);
    } else if (opts.rhythm === 'syncopated') {
      // bias toward off-beats by occasionally skipping on-beats
      if (t % opts.ppq === 0 && rand() < 0.5) continue;
    }
    onsets.push(opts.startTick + t + offset);
  }
  return onsets;
}

/** Map onset index → scale degree per the chosen contour. */
function contourValue(contour: PitchContour, t: number, rand: () => number): number {
  // Returns 0..1; the caller maps to scale degree range.
  switch (contour) {
    case 'ascending':  return t;
    case 'descending': return 1 - t;
    case 'arch':       return 1 - Math.abs(t - 0.5) * 2;
    case 'valley':     return Math.abs(t - 0.5) * 2;
    case 'randomWalk': return rand();
  }
}

export function generateRiff(opts: RiffOptions): Array<Omit<Note, 'id'>> {
  const rand    = mulberry32(opts.seed ?? Date.now());
  const onsets  = generateOnsets(opts, rand);
  if (onsets.length === 0) return [];
  const out: Array<Omit<Note, 'id'>> = [];
  const pitchRange = opts.pitchMax - opts.pitchMin;
  let prevPitch: number | null = null;

  for (let i = 0; i < onsets.length; i++) {
    const t = i / Math.max(1, onsets.length - 1);
    const norm = contourValue(opts.contour, t, rand);
    // Add modest randomness for natural feel.
    const jitter = (rand() - 0.5) * 0.15;
    const targetPitch = Math.round(opts.pitchMin + (norm + jitter) * pitchRange);
    let pitch = Math.max(opts.pitchMin, Math.min(opts.pitchMax, targetPitch));
    if (opts.scaleName !== 'none') {
      pitch = snapPitchToScale(pitch, opts.scaleRoot, opts.scaleName, 'nearest');
    }
    // Random walk caps the step size between successive notes.
    if (opts.contour === 'randomWalk' && prevPitch != null) {
      if (Math.abs(pitch - prevPitch) > 5) {
        pitch = prevPitch + (pitch > prevPitch ? 5 : -5);
      }
    }
    prevPitch = pitch;
    const durationTicks = (i < onsets.length - 1)
      ? Math.max(1, onsets[i + 1] - onsets[i] - Math.floor(opts.ppq / 16))
      : Math.max(1, opts.ppq);
    const velocity = Math.max(1, Math.min(127, 90 + Math.round((rand() - 0.5) * 2 * opts.velocityRange)));
    out.push({ pitch, startTick: onsets[i], durationTicks, velocity });
  }
  return out;
}
