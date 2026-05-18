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
