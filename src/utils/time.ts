import type { SnapValue, TimeSignature } from '../types/music';

// ──────────────────────────────────────────────────────────────────
//  All functions are pure (no side-effects, no global state) so they
//  can be imported in unit tests without a browser environment.
//
//  Convention used throughout:
//    tick  — absolute PPQ-based position (integer)
//    bar   — 1-based measure number
//    beat  — 1-based beat within a measure
//    sixteenth — 1-based sixteenth-note subdivision within a beat
//    ppq   — pulses per quarter-note (default 480)
// ──────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════
//  Low-level tick ↔ beat conversions
// ═══════════════════════════════════════════════════════════════════

/**
 * Number of ticks in one beat for a given time signature.
 *
 * A "beat" is always the denominator note value (quarter, eighth, etc.).
 *   4/4  → 1 beat = 1 quarter = ppq ticks         (480)
 *   3/4  → 1 beat = 1 quarter = ppq ticks         (480)
 *   6/8  → 1 beat = 1 eighth  = ppq/2 ticks       (240)
 *   12/8 → 1 beat = 1 eighth  = ppq/2 ticks       (240)
 *
 * Example:  ticksPerBeat(480, { numerator:4, denominator:4 }) → 480
 *           ticksPerBeat(480, { numerator:6, denominator:8 }) → 240
 */
export function ticksPerBeat(ppq: number, ts: TimeSignature): number {
  return ppq * (4 / ts.denominator);
}

/**
 * Number of ticks in one complete bar (measure).
 *
 * Example:  ticksPerBar(480, { numerator:4, denominator:4 }) → 1920
 *           ticksPerBar(480, { numerator:3, denominator:4 }) → 1440
 *           ticksPerBar(480, { numerator:6, denominator:8 }) → 1440
 */
export function ticksPerBar(ppq: number, ts: TimeSignature): number {
  return ticksPerBeat(ppq, ts) * ts.numerator;
}

/**
 * Convert a tick count to fractional beats.
 *
 * Example:  ticksToBeats(480, 480)  → 1.0
 *           ticksToBeats(240, 480)  → 0.5
 *           ticksToBeats(1920, 480) → 4.0
 */
export function ticksToBeats(ticks: number, ppq = 480): number {
  return ticks / ppq;
}

/**
 * Convert fractional beats to a tick count.
 *
 * Example:  beatsToTicks(1, 480)  → 480
 *           beatsToTicks(0.5, 480) → 240
 */
export function beatsToTicks(beats: number, ppq = 480): number {
  return Math.round(beats * ppq);
}

/**
 * Convert a bar count to ticks.
 *
 * Example:  barsToTicks(1, { numerator:4, denominator:4 }, 480) → 1920
 *           barsToTicks(2, { numerator:3, denominator:4 }, 480) → 2880
 */
export function barsToTicks(bars: number, ts: TimeSignature, ppq = 480): number {
  return ticksPerBar(ppq, ts) * bars;
}

// ═══════════════════════════════════════════════════════════════════
//  Tick ↔ bar / beat position
// ═══════════════════════════════════════════════════════════════════

export interface BarBeatPosition {
  /** 1-based measure number */
  bar: number;
  /** 1-based beat within the measure */
  beat: number;
  /** 1-based sixteenth-note subdivision within the beat (1–4 for quarter beats) */
  sixteenth: number;
  /** Remaining ticks after the sixteenth boundary */
  remainderTicks: number;
}

/**
 * Decompose an absolute tick into a human-readable bar / beat / sixteenth position.
 *
 * A "sixteenth" here means the 1/16 note relative to the quarter-note grid
 * (i.e. 4 sixteenths per quarter regardless of time-signature denominator),
 * which matches the Tone.js Transport time convention.
 *
 * Example with 4/4, ppq=480:
 *   tickToBarBeat(0,    ts44, 480) → { bar:1, beat:1, sixteenth:1, remainderTicks:0 }
 *   tickToBarBeat(480,  ts44, 480) → { bar:1, beat:2, sixteenth:1, remainderTicks:0 }
 *   tickToBarBeat(600,  ts44, 480) → { bar:1, beat:2, sixteenth:2, remainderTicks:0 }
 *                                     (600 = 480 + 120 = beat2 + 1 sixteenth)
 *   tickToBarBeat(1920, ts44, 480) → { bar:2, beat:1, sixteenth:1, remainderTicks:0 }
 *
 * Example with 3/4, ppq=480:
 *   tickToBarBeat(1440, ts34, 480) → { bar:2, beat:1, sixteenth:1, remainderTicks:0 }
 */
export function tickToBarBeat(
  tick: number,
  ts: TimeSignature,
  ppq = 480
): BarBeatPosition {
  const tpBar  = ticksPerBar(ppq, ts);
  const tpBeat = ticksPerBeat(ppq, ts);
  const sixteenthTicks = ppq / 4; // always 1/16 of a quarter-note

  const bar          = Math.floor(tick / tpBar);
  const remAfterBar  = tick - bar * tpBar;
  const beat         = Math.floor(remAfterBar / tpBeat);
  const remAfterBeat = remAfterBar - beat * tpBeat;
  const sixteenth    = Math.floor(remAfterBeat / sixteenthTicks);
  const remainder    = remAfterBeat - sixteenth * sixteenthTicks;

  return {
    bar:            bar + 1,          // 1-based
    beat:           beat + 1,         // 1-based
    sixteenth:      sixteenth + 1,    // 1-based
    remainderTicks: remainder,
  };
}

/**
 * Convert a 1-based bar / beat / sixteenth position back to an absolute tick.
 *
 * Example with 4/4, ppq=480:
 *   barBeatToTick(1, 1, 1, ts44, 480) → 0
 *   barBeatToTick(1, 2, 1, ts44, 480) → 480
 *   barBeatToTick(2, 1, 1, ts44, 480) → 1920
 *   barBeatToTick(1, 1, 3, ts44, 480) → 240   (2 × 120)
 */
export function barBeatToTick(
  bar: number,
  beat: number,
  sixteenth: number,
  ts: TimeSignature,
  ppq = 480
): number {
  const tpBar          = ticksPerBar(ppq, ts);
  const tpBeat         = ticksPerBeat(ppq, ts);
  const sixteenthTicks = ppq / 4;
  return (
    (bar - 1)       * tpBar  +
    (beat - 1)      * tpBeat +
    (sixteenth - 1) * sixteenthTicks
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Snap
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert a SnapValue string to a tick count.
 * Triplet values (suffix 'T') are multiplied by 2/3.
 *
 * Example with ppq=480:
 *   snapUnitToTicks('1/4',   480) → 480
 *   snapUnitToTicks('1/16',  480) → 120
 *   snapUnitToTicks('1/8T',  480) → 160  (240 × 2/3)
 *   snapUnitToTicks('1/32T', 480) → 40   (60 × 2/3)
 *   snapUnitToTicks('1/64',  480) → 30
 */
export function snapUnitToTicks(unit: SnapValue, ppq: number): number {
  const isTriplet = unit.endsWith('T');
  const base = unit.replace('T', '') as Exclude<SnapValue, `${string}T`>;
  const map: Record<string, number> = {
    '1/1':  ppq * 4,
    '1/2':  ppq * 2,
    '1/4':  ppq,
    '1/8':  ppq / 2,
    '1/16': ppq / 4,
    '1/32': ppq / 8,
    '1/64': ppq / 16,
  };
  return Math.round((map[base] ?? ppq) * (isTriplet ? 2 / 3 : 1));
}

/**
 * Round a tick to the nearest snap grid boundary.
 *
 * Example:  snapTick(130, 120) → 120
 *           snapTick(61,   60) → 60
 *           snapTick(91,   60) → 120
 */
export function snapTick(tick: number, snapTicks: number): number {
  if (snapTicks <= 0) return tick;
  const snapped = Math.round(tick / snapTicks) * snapTicks;
  return Object.is(snapped, -0) ? 0 : snapped;
}

/**
 * Snap a tick DOWN (floor) to the grid.
 *
 * Example:  floorTick(130, 120) → 120
 */
export function floorTick(tick: number, snapTicks: number): number {
  if (snapTicks <= 0) return tick;
  return Math.floor(tick / snapTicks) * snapTicks;
}

/**
 * Snap a tick UP (ceil) to the grid.
 *
 * Example:  ceilTick(121, 120) → 240
 */
export function ceilTick(tick: number, snapTicks: number): number {
  if (snapTicks <= 0) return tick;
  return Math.ceil(tick / snapTicks) * snapTicks;
}

// ═══════════════════════════════════════════════════════════════════
//  Human-readable formatting
// ═══════════════════════════════════════════════════════════════════

/**
 * Format a tick as a "bar:beat" display string (1-based, no sixteenth).
 * Used in the transport bar position display.
 *
 * Example with 4/4, ppq=480:
 *   formatTickAsBarBeat(0,    ts44, 480) → "1:1"
 *   formatTickAsBarBeat(480,  ts44, 480) → "1:2"
 *   formatTickAsBarBeat(1920, ts44, 480) → "2:1"
 *
 * Example with 3/4, ppq=480:
 *   formatTickAsBarBeat(1440, ts34, 480) → "2:1"
 */
export function formatTickAsBarBeat(
  tick: number,
  ts: TimeSignature,
  ppq = 480
): string {
  const { bar, beat } = tickToBarBeat(tick, ts, ppq);
  return `${bar}:${beat}`;
}

/**
 * Full "bar:beat:sixteenth" display string.
 *
 * Example:  formatTickFull(600, ts44, 480) → "1:2:2"
 */
export function formatTickFull(
  tick: number,
  ts: TimeSignature,
  ppq = 480
): string {
  const { bar, beat, sixteenth } = tickToBarBeat(tick, ts, ppq);
  return `${bar}:${beat}:${sixteenth}`;
}

// ═══════════════════════════════════════════════════════════════════
//  Tone.js Transport time ↔ tick
//
//  Tone.js uses "bars:quarters:sixteenths" (all 0-based):
//    "0:0:0" = tick 0
//    "0:1:0" = tick 480   (1 quarter)
//    "0:0:2" = tick 240   (2 sixteenths)
//    "1:0:0" = tick 1920  (1 bar in 4/4 at ppq 480)
//
//  IMPORTANT: Tone.js bars:quarters:sixteenths is always in terms of
//  quarter-note beats, regardless of time signature.  To stay in sync
//  we count transport bars as groups of ppq*4 ticks (one 4/4 bar).
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert an absolute tick to a Tone.js Transport time string
 * ("bars:quarters:sixteenths", all 0-based).
 *
 * Example with ppq=480:
 *   ticksToToneTransportTime(0,    480) → "0:0:0"
 *   ticksToToneTransportTime(480,  480) → "0:1:0"
 *   ticksToToneTransportTime(120,  480) → "0:0:1"   (1 sixteenth)
 *   ticksToToneTransportTime(240,  480) → "0:0:2"   (2 sixteenths)
 *   ticksToToneTransportTime(1920, 480) → "1:0:0"   (1 bar in 4/4)
 *   ticksToToneTransportTime(2400, 480) → "1:1:0"
 */
export function ticksToToneTransportTime(ticks: number, ppq = 480): string {
  const quarterTicks    = ppq;              // 1 quarter-note
  const sixteenthTicks  = ppq / 4;         // 1 sixteenth-note
  const barTicks        = ppq * 4;         // 1 transport bar (always 4/4 in Tone)

  const bars       = Math.floor(ticks / barTicks);
  const rem1       = ticks - bars * barTicks;
  const quarters   = Math.floor(rem1 / quarterTicks);
  const rem2       = rem1 - quarters * quarterTicks;
  const sixteenths = Math.floor(rem2 / sixteenthTicks);

  return `${bars}:${quarters}:${sixteenths}`;
}

/**
 * Parse a Tone.js Transport time string back to ticks.
 * Accepts "bars:quarters:sixteenths" (all 0-based) with optional
 * fractional sixteenths.  Unknown parts default to 0.
 *
 * Example with ppq=480:
 *   toneTransportTimeToTicks("0:0:0",  480) → 0
 *   toneTransportTimeToTicks("0:1:0",  480) → 480
 *   toneTransportTimeToTicks("1:0:0",  480) → 1920
 *   toneTransportTimeToTicks("1:2:3",  480) → 1920 + 960 + 360 = 3240
 */
export function toneTransportTimeToTicks(time: string, ppq = 480): number {
  const parts = time.split(':').map(Number);
  const bars       = parts[0] ?? 0;
  const quarters   = parts[1] ?? 0;
  const sixteenths = parts[2] ?? 0;

  return (
    bars       * ppq * 4 +
    quarters   * ppq     +
    sixteenths * (ppq / 4)
  );
}

// ═══════════════════════════════════════════════════════════════════
//  Seconds ↔ tick (BPM-dependent)
// ═══════════════════════════════════════════════════════════════════

/**
 * Convert ticks to wall-clock seconds at a given BPM.
 *
 * Example:  tickToSeconds(480, 120, 480) → 0.5  (1 quarter at 120 BPM)
 *           tickToSeconds(960, 120, 480) → 1.0
 */
export function tickToSeconds(tick: number, bpm: number, ppq = 480): number {
  return (tick / ppq) * (60 / bpm);
}

/**
 * Convert seconds to ticks at a given BPM.
 *
 * Example:  secondsToTicks(0.5, 120, 480) → 480
 *           secondsToTicks(1.0, 60,  480) → 480
 */
export function secondsToTicks(seconds: number, bpm: number, ppq = 480): number {
  return Math.round(seconds * ppq * (bpm / 60));
}

// ── Legacy alias kept for any existing callers ──
export { snapUnitToTicks as snapValueToTicks };
