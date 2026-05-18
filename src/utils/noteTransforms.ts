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

// ─────────────────────────────────────────────────────────────────────────
//  Velocity-only transforms
// ─────────────────────────────────────────────────────────────────────────

/**
 * Replace each note's velocity with a uniform random value in
 * [min, max] (inclusive). Both bounds are clamped to [1, 127] and
 * automatically swapped if `min > max`. `seed` makes the result deterministic.
 */
export function randomizeVelocity(
  notes: Note[],
  min: number,
  max: number,
  seed?: number,
): Note[] {
  let lo = clamp1to127(Math.round(min));
  let hi = clamp1to127(Math.round(max));
  if (lo > hi) [lo, hi] = [hi, lo];
  const rng = seed != null ? mulberry32(seed) : Math.random;
  return notes.map((n) => ({
    ...n,
    velocity: lo + Math.floor(rng() * (hi - lo + 1)),
  }));
}

/**
 * Multiply each note's velocity by `amount` and clamp to [1, 127].
 * `amount = 1.1` boosts by 10 %, `0.9` cuts 10 %.
 */
export function scaleVelocity(notes: Note[], amount: number): Note[] {
  return notes.map((n) => ({
    ...n,
    velocity: clamp1to127(Math.round(n.velocity * amount)),
  }));
}

// ═══════════════════════════════════════════════════════════════════
//  Flip / Limit / Randomize (#49)
// ═══════════════════════════════════════════════════════════════════

/** Mirror notes around the centre of their bounding box. */
export function flipNotes(notes: Note[], axis: 'pitch' | 'time'): Note[] {
  if (notes.length === 0) return notes;
  if (axis === 'pitch') {
    const minP = Math.min(...notes.map((n) => n.pitch));
    const maxP = Math.max(...notes.map((n) => n.pitch));
    return notes.map((n) => ({ ...n, pitch: minP + maxP - n.pitch }));
  }
  const minT = Math.min(...notes.map((n) => n.startTick));
  const maxT = Math.max(...notes.map((n) => n.startTick + n.durationTicks));
  return notes.map((n) => ({
    ...n,
    startTick: Math.max(0, minT + maxT - (n.startTick + n.durationTicks)),
  }));
}

/**
 * Force every note's pitch into [minPitch, maxPitch].
 * - mode 'clamp'  → snap to boundary
 * - mode 'wrap'   → octave-shift up/down until inside
 */
export function limitNotes(
  notes: Note[],
  minPitch: number,
  maxPitch: number,
  mode: 'clamp' | 'wrap' = 'wrap',
): Note[] {
  if (maxPitch < minPitch) [minPitch, maxPitch] = [maxPitch, minPitch];
  return notes.map((n) => {
    let p = n.pitch;
    if (mode === 'clamp') {
      p = Math.max(minPitch, Math.min(maxPitch, p));
    } else {
      while (p > maxPitch) p -= 12;
      while (p < minPitch) p += 12;
      p = Math.max(0, Math.min(127, p));
    }
    return { ...n, pitch: p };
  });
}

export interface RandomizeOptions {
  pitchRangeSemitones?: number;
  timeRangeTicks?: number;
  velocityRange?: number;
  durationRangeTicks?: number;
  seed?: number;
}

/** Apply seeded random perturbations to each note. */
export function randomizeNotes(notes: Note[], opts: RandomizeOptions): Note[] {
  const rand = mulberry32(opts.seed ?? Date.now());
  const pr = opts.pitchRangeSemitones ?? 0;
  const tr = opts.timeRangeTicks ?? 0;
  const vr = opts.velocityRange ?? 0;
  const dr = opts.durationRangeTicks ?? 0;
  const sym = (range: number) => (rand() * 2 - 1) * range;
  return notes.map((n) => ({
    ...n,
    pitch:         Math.max(0, Math.min(127, n.pitch + Math.round(sym(pr)))),
    startTick:     Math.max(0, n.startTick + Math.round(sym(tr))),
    durationTicks: Math.max(1, n.durationTicks + Math.round(sym(dr))),
    velocity:      clamp1to127(Math.round(n.velocity + sym(vr))),
  }));
}

// ═══════════════════════════════════════════════════════════════════
//  LFO / Articulate (#60)
// ═══════════════════════════════════════════════════════════════════

export type LfoTarget   = 'velocity' | 'pitch' | 'duration' | 'pan';
export type LfoWaveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface LfoOptions {
  target: LfoTarget;
  waveform: LfoWaveform;
  /** Period in ticks — distance between successive peaks of the LFO. */
  periodTicks: number;
  /** Variation amplitude (units differ per target — see below). */
  depth: number;
  /** Phase offset 0..1 of a single cycle. */
  phase?: number;
}

function lfoValue(waveform: LfoWaveform, t: number): number {
  // t ∈ [0, 1) — single cycle. Returns roughly [-1, 1].
  const tau = t * 2 * Math.PI;
  switch (waveform) {
    case 'sine':     return Math.sin(tau);
    case 'triangle': return 4 * Math.abs(t - 0.5) - 1;
    case 'square':   return t < 0.5 ? 1 : -1;
    case 'sawtooth': return 2 * t - 1;
  }
}

/** Apply an LFO to the chosen target attribute of every note. */
export function applyLfo(notes: Note[], opts: LfoOptions): Note[] {
  const period = Math.max(1, opts.periodTicks);
  const phase  = opts.phase ?? 0;
  return notes.map((n) => {
    const t = (((n.startTick / period) + phase) % 1 + 1) % 1;
    const v = lfoValue(opts.waveform, t);
    switch (opts.target) {
      case 'velocity':
        return { ...n, velocity: clamp1to127(Math.round(n.velocity + v * opts.depth)) };
      case 'pitch':
        return { ...n, pitch: Math.max(0, Math.min(127, n.pitch + Math.round(v * opts.depth))) };
      case 'duration':
        return { ...n, durationTicks: Math.max(1, Math.round(n.durationTicks * (1 + v * opts.depth))) };
      case 'pan':
        return { ...n, pan: Math.max(-1, Math.min(1, (n.pan ?? 0) + v * opts.depth)) };
    }
  });
}

export type ArticulatePattern = 'staccato' | 'tenuto' | 'accent' | 'marcato' | 'legato';

/**
 * Apply an articulation profile. Tenuto/legato need the FULL note list to find
 * each note's successor; the function does its own grouping.
 */
export function articulateNotes(
  notes: Note[],
  pattern: ArticulatePattern,
  intensity: number,
): Note[] {
  const i = Math.max(0, Math.min(1, intensity));
  // For tenuto / legato we need per-pitch sorted neighbours.
  if (pattern === 'tenuto' || pattern === 'legato') {
    const byPitch = new Map<number, Note[]>();
    for (const n of notes) {
      const arr = byPitch.get(n.pitch) ?? [];
      arr.push(n); byPitch.set(n.pitch, arr);
    }
    byPitch.forEach((arr) => arr.sort((a, b) => a.startTick - b.startTick));
    return notes.map((n) => {
      const peers = byPitch.get(n.pitch)!;
      const idx = peers.findIndex((p) => p.id === n.id);
      const next = peers[idx + 1];
      if (!next) return n;
      const newDur = Math.max(1, next.startTick - n.startTick - (pattern === 'legato' ? 0 : 2));
      return { ...n, durationTicks: newDur };
    });
  }
  return notes.map((n, idx) => {
    switch (pattern) {
      case 'staccato':
        return { ...n, durationTicks: Math.max(1, Math.round(n.durationTicks * (1 - 0.6 * i))) };
      case 'accent':
        return idx % 2 === 0
          ? { ...n, velocity: clamp1to127(Math.round(n.velocity + 25 * i)) }
          : n;
      case 'marcato':
        return {
          ...n,
          velocity: clamp1to127(Math.round(n.velocity + 18 * i)),
          durationTicks: Math.max(1, Math.round(n.durationTicks * (1 - 0.3 * i))),
        };
    }
    return n;
  });
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
