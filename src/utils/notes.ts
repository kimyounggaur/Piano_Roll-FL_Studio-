import type { Note, MidiPitch, Tick } from '../types/music';

/** Composite key for a note position — tracks paint already-painted cells. */
export function noteCellKey(startTick: Tick, pitch: MidiPitch): string {
  return `${startTick}:${pitch}`;
}

/** True when a note with the same startTick AND pitch already exists. */
export function hasNoteAt(notes: Note[], startTick: Tick, pitch: MidiPitch): boolean {
  for (const n of notes) {
    if (n.startTick === startTick && n.pitch === pitch) return true;
  }
  return false;
}

/** Notes whose tick-span includes `tick` AND whose pitch matches. */
export function notesUnder(notes: Note[], tick: Tick, pitch: MidiPitch): Note[] {
  return notes.filter(
    (n) => n.pitch === pitch && n.startTick <= tick && n.startTick + n.durationTicks > tick,
  );
}

/** Every note crossing `tick` (any pitch), used by Slice-drag. */
export function notesCrossingTick(notes: Note[], tick: Tick): Note[] {
  return notes.filter(
    (n) => n.startTick < tick && n.startTick + n.durationTicks > tick,
  );
}

/**
 * Does slicing `note` at `sliceTick` produce two parts both at least `minDur` ticks?
 * Use this guard before committing a slice so the resulting fragments stay editable.
 */
export function canSliceNote(note: Note, sliceTick: Tick, minDur: Tick): boolean {
  const left = sliceTick - note.startTick;
  const right = (note.startTick + note.durationTicks) - sliceTick;
  return left >= minDur && right >= minDur;
}

/**
 * Cluster a list of notes into runs of pitch-aligned, adjacent notes.
 * "Adjacent" means the next note's start lies within `joinToleranceTicks` of
 * the previous note's end. Optionally requires the same colorGroup.
 *
 * Notes are sorted by startTick inside each pitch first, so order in input
 * does not matter. Output is `Note[][]`, where each inner array has ≥ 1 note.
 */
export function groupAdjacentNotes(
  notes: Note[],
  joinToleranceTicks: Tick,
  sameColorGroup: boolean,
): Note[][] {
  const byPitch: Map<number, Note[]> = new Map();
  for (const n of notes) {
    const arr = byPitch.get(n.pitch) ?? [];
    arr.push(n);
    byPitch.set(n.pitch, arr);
  }
  const out: Note[][] = [];
  for (const arr of byPitch.values()) {
    arr.sort((a, b) => a.startTick - b.startTick);
    let run: Note[] = [];
    for (const n of arr) {
      if (run.length === 0) { run.push(n); continue; }
      const last = run[run.length - 1];
      const gap = n.startTick - (last.startTick + last.durationTicks);
      const sameGroup = !sameColorGroup || (last.colorGroup ?? '') === (n.colorGroup ?? '');
      if (gap <= joinToleranceTicks && sameGroup) {
        run.push(n);
      } else {
        out.push(run);
        run = [n];
      }
    }
    if (run.length > 0) out.push(run);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════
//  Bar/Beat/Sixteenth text formatting — used by Note Properties popup
// ═══════════════════════════════════════════════════════════════════

/** Format a tick as "Bar.Beat.Sixteenth" using the project ppq/timeSignature. */
export function tickToBarString(tick: Tick, ppq: number, tsNum: number): string {
  const tpBeat = ppq;                  // assume denominator 4 for popup
  const tpBar  = tpBeat * tsNum;
  const tp16   = ppq / 4;
  const bar    = Math.floor(tick / tpBar) + 1;
  const remBar = tick - (bar - 1) * tpBar;
  const beat   = Math.floor(remBar / tpBeat) + 1;
  const rem    = remBar - (beat - 1) * tpBeat;
  const six    = Math.floor(rem / tp16) + 1;
  return `${bar}.${beat}.${six}`;
}

/** Parse "Bar.Beat.Sixteenth" back to ticks. Returns null on malformed input. */
export function barStringToTick(text: string, ppq: number, tsNum: number): Tick | null {
  const parts = text.split('.').map((s) => Number(s.trim()));
  if (parts.length < 1 || parts.some((p) => !Number.isFinite(p) || p < 1)) return null;
  const [bar = 1, beat = 1, six = 1] = parts;
  const tpBeat = ppq;
  const tpBar  = tpBeat * tsNum;
  const tp16   = ppq / 4;
  return (bar - 1) * tpBar + (beat - 1) * tpBeat + (six - 1) * tp16;
}
