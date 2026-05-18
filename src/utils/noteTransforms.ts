import type { Note } from '../types/music';

// ─────────────────────────────────────────────────────────────────────────
//  Quantize
// ─────────────────────────────────────────────────────────────────────────

export interface QuantizeOptions {
  gridTicks: number;             // 480 / 240 / 120 / 60 / 30 …
  strength: number;              // 0..1 — 1 = full snap, 0 = no change
  quantizeDuration?: boolean;    // also align note end to the grid
}

/**
 * Pull a single note toward its nearest grid line by `strength`.
 * Pure — does not touch the store. Returns a new Note.
 */
export function quantizeNote(note: Note, opts: QuantizeOptions): Note {
  const { gridTicks, strength, quantizeDuration = false } = opts;
  if (gridTicks <= 0) return note;
  const s = clamp01(strength);

  const targetStart = Math.round(note.startTick / gridTicks) * gridTicks;
  const startTick   = Math.round(note.startTick + (targetStart - note.startTick) * s);

  let durationTicks = note.durationTicks;
  if (quantizeDuration) {
    const targetDur = Math.max(gridTicks, Math.round(note.durationTicks / gridTicks) * gridTicks);
    durationTicks   = Math.round(note.durationTicks + (targetDur - note.durationTicks) * s);
  }

  return { ...note, startTick: Math.max(0, startTick), durationTicks };
}

export function quantizeNotes(notes: Note[], opts: QuantizeOptions): Note[] {
  return notes.map((n) => quantizeNote(n, opts));
}

// ─────────────────────────────────────────────────────────────────────────
//  Humanize
// ─────────────────────────────────────────────────────────────────────────

export interface HumanizeOptions {
  timingAmountTicks: number;     // max absolute shift applied to startTick
  velocityAmount: number;        // max absolute delta applied to velocity
  seed?: number;                 // optional — when provided, results are deterministic
}

/**
 * Apply small random shifts to startTick and velocity. The deltas are
 * symmetric around 0 (so notes can drift earlier or later). Bounds are
 * enforced: startTick ≥ 0, velocity ∈ [1, 127].
 *
 * If `seed` is supplied, a mulberry32 PRNG is used for reproducibility —
 * useful in tests and for deterministic exports.
 */
export function humanizeNotes(notes: Note[], opts: HumanizeOptions): Note[] {
  const rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
  return notes.map((n) => {
    const dT = Math.round((rng() * 2 - 1) * opts.timingAmountTicks);
    const dV = Math.round((rng() * 2 - 1) * opts.velocityAmount);
    return {
      ...n,
      startTick: Math.max(0, n.startTick + dT),
      velocity:  Math.max(1, Math.min(127, n.velocity + dV)),
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────
//  Internals
// ─────────────────────────────────────────────────────────────────────────

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Small fast seeded PRNG. Returns floats in [0, 1). */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
