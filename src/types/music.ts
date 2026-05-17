// ── Core primitives ──────────────────────────────────────────────────
export type Tick = number;   // PPQ-based absolute tick position
export type Pitch = number;  // MIDI note number 0-127

export interface Note {
  id: string;
  pitch: Pitch;
  startTick: Tick;
  durationTicks: Tick;
  velocity: number; // 1-127
  selected?: boolean;
}

// ── Track ─────────────────────────────────────────────────────────────
export interface Track {
  id: string;
  name: string;
  color: string;
  muted: boolean;
  solo: boolean;
  notes: Note[];
}

// ── Time signature & project settings ────────────────────────────────
export interface TimeSignature {
  numerator: number;
  denominator: number;
}

export type SnapUnit =
  | '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32'
  | '1/4T' | '1/8T' | '1/16T'; // T = triplet

export type EditTool = 'draw' | 'select' | 'erase';

export interface ProjectSettings {
  bpm: number;
  timeSignature: TimeSignature;
  bars: number;
  ppq: number;          // pulses per quarter note
  snapUnit: SnapUnit;
  scaleRoot: number;    // 0=C … 11=B
  scaleName: string;    // e.g. 'major', 'minor', 'none'
}

// ── Viewport ──────────────────────────────────────────────────────────
export interface Viewport {
  scrollX: number;
  scrollY: number;
  pixelsPerTick: number;   // horizontal zoom
  keyHeight: number;       // vertical zoom (px per semitone)
}

// ── Project root ──────────────────────────────────────────────────────
export interface Project {
  name: string;
  settings: ProjectSettings;
  tracks: Track[];
  activeTrackId: string | null;
}

// ── Music theory helpers ──────────────────────────────────────────────
export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;
export type NoteName = typeof NOTE_NAMES[number];

export const SCALES: Record<string, number[]> = {
  none:        [],
  major:       [0,2,4,5,7,9,11],
  minor:       [0,2,3,5,7,8,10],
  dorian:      [0,2,3,5,7,9,10],
  phrygian:    [0,1,3,5,7,8,10],
  lydian:      [0,2,4,6,7,9,11],
  mixolydian:  [0,2,4,5,7,9,10],
  pentatonic:  [0,2,4,7,9],
  blues:       [0,3,5,6,7,10],
};

export const CHORD_STAMPS: Record<string, number[]> = {
  'Major':      [0,4,7],
  'Minor':      [0,3,7],
  'Dom7':       [0,4,7,10],
  'Maj7':       [0,4,7,11],
  'Min7':       [0,3,7,10],
  'Dim':        [0,3,6],
  'Aug':        [0,4,8],
  'Sus2':       [0,2,7],
  'Sus4':       [0,5,7],
};
