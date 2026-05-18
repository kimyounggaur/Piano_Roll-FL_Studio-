import type { Note, StrumDirection, ArpPattern } from '../types/music';

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

// ─────────────────────────────────────────────────────────────────────────
//  Strum — spread chord notes across `amountTicks` so they cascade
// ─────────────────────────────────────────────────────────────────────────

export interface StrumOptions {
  amountTicks: number;
  direction: StrumDirection;
  /** Notes whose startTick differs by ≤ this count form one chord group. Default 10. */
  groupToleranceTicks?: number;
}

/**
 * Spread chord groups across `amountTicks` so the notes cascade.
 * - "up"  : low pitches start first, high pitches arrive later.
 * - "down": high pitches start first, low pitches arrive later.
 * Notes are grouped by proximity in startTick (within `groupToleranceTicks`).
 * Pure function — returns a new array; non-grouped notes pass through unchanged.
 */
export function strumNotes(notes: Note[], opts: StrumOptions): Note[] {
  if (notes.length < 2 || opts.amountTicks <= 0) {
    return notes.map((n) => ({ ...n }));
  }
  const tol = opts.groupToleranceTicks ?? 10;

  // Sort a *shallow copy* by startTick so original input is untouched
  const sorted = [...notes].sort((a, b) => a.startTick - b.startTick);

  // Walk and bucket into groups whose startTicks are within tolerance
  const groups: Note[][] = [];
  let current: Note[] = [];
  let anchor = -Infinity;
  for (const n of sorted) {
    if (n.startTick - anchor > tol) {
      if (current.length) groups.push(current);
      current = [n];
      anchor  = n.startTick;
    } else {
      current.push(n);
    }
  }
  if (current.length) groups.push(current);

  // Map id → patched note
  const patched = new Map<string, Note>();
  for (const group of groups) {
    if (group.length < 2) continue;
    const groupAnchor = Math.min(...group.map((n) => n.startTick));
    const byPitch = [...group].sort((a, b) =>
      opts.direction === 'up' ? a.pitch - b.pitch : b.pitch - a.pitch,
    );
    const step = opts.amountTicks / (group.length - 1);
    byPitch.forEach((n, idx) => {
      patched.set(n.id, { ...n, startTick: Math.max(0, Math.round(groupAnchor + idx * step)) });
    });
  }

  return notes.map((n) => patched.get(n.id) ?? { ...n });
}

// ─────────────────────────────────────────────────────────────────────────
//  Arpeggiate — turn a chord into a sequence of single notes
// ─────────────────────────────────────────────────────────────────────────

export interface ArpeggiateOptions {
  pattern: ArpPattern;
  stepTicks: number;
  repeatCount: number;
  seed?: number;
}

/**
 * Generate a sequence of arpeggio notes from a chord (or any pitch set).
 * - Pitch order:
 *     "up"     : sorted ascending
 *     "down"   : sorted descending
 *     "upDown" : ascending then descending (without repeating top/bottom)
 *     "random" : random pick each step (seedable)
 * - Duration of each arp note = round(stepTicks * 0.8) (≥ 1)
 * - Velocity = average of the source notes
 * - Returned notes have synthetic IDs; the caller assigns real ones if needed.
 */
export function arpeggiateNotes(notes: Note[], opts: ArpeggiateOptions): Note[] {
  if (notes.length === 0 || opts.repeatCount <= 0 || opts.stepTicks <= 0) return [];

  const sortedAsc = [...notes].sort((a, b) => a.pitch - b.pitch);

  let oneRound: number[];
  if (opts.pattern === 'down') {
    oneRound = sortedAsc.map((n) => n.pitch).reverse();
  } else if (opts.pattern === 'upDown') {
    const up = sortedAsc.map((n) => n.pitch);
    const down = up.slice(1, -1).reverse(); // avoid repeating top + bottom
    oneRound = down.length ? [...up, ...down] : up;
  } else if (opts.pattern === 'random') {
    const rng = opts.seed != null ? mulberry32(opts.seed) : Math.random;
    const total = sortedAsc.length * opts.repeatCount;
    oneRound = Array.from({ length: total }, () => sortedAsc[Math.floor(rng() * sortedAsc.length)].pitch);
  } else {
    oneRound = sortedAsc.map((n) => n.pitch);
  }

  // Expand by repeatCount (random already includes repeats above)
  const allPitches = opts.pattern === 'random'
    ? oneRound
    : Array.from({ length: opts.repeatCount }, () => oneRound).flat();

  const anchor = Math.min(...notes.map((n) => n.startTick));
  const dur    = Math.max(1, Math.round(opts.stepTicks * 0.8));
  const avgVel = clamp1to127(Math.round(
    notes.reduce((s, n) => s + n.velocity, 0) / notes.length,
  ));

  return allPitches.map((pitch, i) => ({
    id: `arp_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
    pitch,
    startTick: Math.max(0, anchor + i * opts.stepTicks),
    durationTicks: dur,
    velocity: avgVel,
    selected: true,
  }));
}

function clamp1to127(v: number): number {
  return v < 1 ? 1 : v > 127 ? 127 : v;
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
