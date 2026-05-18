// ═══════════════════════════════════════════════════════════════════
//  Branded scalar primitives
//  Naming things precisely prevents "pass velocity where pitch is
//  expected" bugs even though they're all `number` at runtime.
// ═══════════════════════════════════════════════════════════════════

/** PPQ-based absolute time unit. 1 quarter-note = ppq ticks (default 480). */
export type Tick = number;

/** MIDI pitch number 0–127 (middle C = 60, displayed as C4 or C3 depending on convention). */
export type MidiPitch = number;

/** MIDI velocity 1–127. 0 is note-off and is never stored in a Note. */
export type Velocity = number;

/** Opaque string ID for a Note record. */
export type NoteId = string;

/** Opaque string ID for a Track record. */
export type TrackId = string;

// Legacy aliases kept so existing components don't need to change.
export type Pitch = MidiPitch;


// ═══════════════════════════════════════════════════════════════════
//  Note
//  All timing is tick-based; pixel coordinates are computed on the
//  fly from the viewport and never stored here.
// ═══════════════════════════════════════════════════════════════════

export interface Note {
  id: NoteId;
  pitch: MidiPitch;
  startTick: Tick;
  durationTicks: Tick;
  velocity: Velocity;
  /** Whether this note is silenced inside its track (independent of track mute). */
  muted?: boolean;
  /** Whether the note is highlighted in the selection set. */
  selected?: boolean;
  /**
   * Optional colour group key — lets you colour-code notes by chord
   * function, voice, or any custom category without changing track colour.
   */
  colorGroup?: string;
  /** MIDI channel 1–16. Defaults to the parent track's channel. */
  channel?: number;
  /** Back-reference to the owning track. Redundant but useful in flat queries. */
  trackId?: TrackId;
  /** Per-note stereo pan (-1 left .. +1 right). Default 0. (#41) */
  pan?: number;
  /** Per-note pitch micro-tuning in cents (-100 .. +100). Default 0. (#41) */
  finePitch?: number;
  /** Release velocity (1..127). Default 64. (#41) */
  releaseVelocity?: number;
  /** Membership in a locked edit group — all members move/delete together. (#43) */
  groupId?: string;
  /** Articulation/glide kind. Default 'normal'. (#48) */
  noteKind?: 'normal' | 'slide' | 'portamento';
}


// ═══════════════════════════════════════════════════════════════════
//  Track
//  A track owns an ordered list of notes and carries audio routing
//  metadata (instrument, volume, pan).
// ═══════════════════════════════════════════════════════════════════

/**
 * Instrument descriptor.  Keep it open-ended so you can later swap
 * between a Tone.js synth preset name, a sample URL, or a VST identifier.
 */
export interface Instrument {
  type: 'synth' | 'sampler' | 'external';
  /** Preset name for Tone.js synths, or sample URL for samplers. */
  preset?: string;
}

export interface Track {
  id: TrackId;
  name: string;
  /** Hex colour used for note rendering and track UI accent. */
  color: string;
  instrument: Instrument;
  /** MIDI channel 1–16 assigned to all notes unless overridden per-note. */
  channel: number;
  /** Track-level mute — silences all notes during playback. */
  muted: boolean;
  /** Solo — when any track is soloed, only soloed tracks play. */
  solo: boolean;
  /** 0.0–1.0 linear gain. 1.0 = 0 dBFS. */
  volume: number;
  /** −1.0 (full left) to +1.0 (full right). */
  pan: number;
  notes: Note[];
  /** Track behaviour: melodic (default) or drum step-sequencer (#62). */
  trackKind?: 'melodic' | 'drum';
  /** Drum-kit slot definitions for `trackKind === 'drum'`. */
  drumKit?: Array<{ pitch: number; name: string }>;
}


// ═══════════════════════════════════════════════════════════════════
//  Snap & tool enumerations
// ═══════════════════════════════════════════════════════════════════

/**
 * Grid snap resolution.
 * T suffix = triplet (multiplied by 2/3).
 * We use string literals so the value is human-readable in JSON.
 */
export type SnapValue =
  | '1/1' | '1/2' | '1/4' | '1/8' | '1/16' | '1/32' | '1/64'
  | '1/4T' | '1/8T' | '1/16T';

// Legacy alias.
export type SnapUnit = SnapValue;

/**
 * Active editing tool.
 * - select   : rubber-band selection, move, resize
 * - draw     : click/drag to create a single note
 * - paint    : hold and drag to paint a stream of notes
 * - erase    : click to delete a note
 * - slice    : click on a note to split it at the cursor position
 * - stamp    : place a chord or pattern defined in InspectorPanel
 */
export type PianoRollTool = 'select' | 'draw' | 'paint' | 'erase' | 'slice' | 'stamp' | 'mute';

// Legacy alias so existing components keep working.
export type EditTool = PianoRollTool;


// ═══════════════════════════════════════════════════════════════════
//  Time signature
// ═══════════════════════════════════════════════════════════════════

export interface TimeSignature {
  /** Beats per bar (top number). */
  numerator: number;
  /** Beat unit (bottom number): 2, 4, 8, or 16. */
  denominator: number;
}


// ═══════════════════════════════════════════════════════════════════
//  Scale
// ═══════════════════════════════════════════════════════════════════

/**
 * Named scale modes.  'none' means no scale constraint is applied.
 * Intervals are stored in SCALES below; the root is stored separately
 * in ProjectSettings so it can be transposed without changing the mode.
 */
export type ScaleType =
  | 'none'
  | 'major'
  | 'minor'
  | 'dorian'
  | 'phrygian'
  | 'lydian'
  | 'mixolydian'
  | 'locrian'
  | 'harmonicMinor'
  | 'pentatonicMajor'
  | 'pentatonicMinor'
  | 'blues';


// ═══════════════════════════════════════════════════════════════════
//  Project settings
// ═══════════════════════════════════════════════════════════════════

export interface ProjectSettings {
  /** Beats per minute. */
  bpm: number;
  /** Pulses per quarter-note. 480 gives sub-millisecond resolution at 300 BPM. */
  ppq: number;
  timeSignature: TimeSignature;
  /** Number of bars in the arrangement. Determines the playback end point. */
  bars: number;
  /** Loop region start (inclusive). */
  loopStartTick: Tick;
  /** Loop region end (exclusive). When 0, the entire arrangement loops. */
  loopEndTick: Tick;
  /** Snap resolution for note placement and movement. */
  snapUnit: SnapValue;
  /** Chromatic root of the active scale (0 = C, 1 = C#, …, 11 = B). */
  scaleRoot: number;
  /** Active scale mode. 'none' disables scale highlighting and snap. */
  scaleName: ScaleType;

  // ── Scale snap ─────────────────────────────────────────────────────
  /** Force new notes and dragged notes onto the active scale. */
  scaleSnapEnabled: boolean;

  // ── Ghost notes (#47) ─────────────────────────────────────────────
  /** If true, ghost notes from other tracks can be clicked & edited inline. */
  ghostEditable?: boolean;
  /** Track ids visible as ghosts. 'all' = every non-active visible track. */
  ghostVisibleTrackIds?: TrackId[] | 'all';

  // ── Performance mode (#56) ────────────────────────────────────────
  /** Allow live editing during playback (reschedules notes on every change). */
  performanceMode?: boolean;

  // ── MIDI input routing (#57) ──────────────────────────────────────
  /** Channel 1..16 → colorGroup 0..15 mapping. */
  midiChannelColorMap?: Record<number, number>;
  /** When true, MIDI noteOn channel determines the new note's colorGroup. */
  midiChannelThrough?: boolean;

  // ── Chord stamp ────────────────────────────────────────────────────
  /** Chord type used when the stamp tool is active. */
  stampChordType: ChordType;
  /** If true, the stamp tool stays active after each click. */
  stampHoldTool: boolean;
  /** Optional fixed duration (in ticks) for stamped chord notes. 0 = use current snapTicks. */
  stampDurationTicks: number;

  // ── Quantize / humanize defaults (used by the UI controls) ─────────
  quantizeStrength: number;     // 0..1, default 1
  quantizeDuration: boolean;    // also quantize note length
  humanizeTimingTicks: number;  // ± random shift in ticks
  humanizeVelocity: number;     // ± random delta in velocity units

  // ── Strum / Arpeggiate defaults ────────────────────────────────────
  strumAmountTicks: number;            // total spread of a strummed chord, in ticks
  strumDirection: 'up' | 'down';
  arpPattern: 'up' | 'down' | 'upDown' | 'random';
  arpStepTicks: number;
  arpRepeatCount: number;
  arpReplaceOriginals: boolean;        // delete the source chord notes when arpeggiating

  // ── Randomize / scale velocity defaults ──────────────────────────────
  randomVelMin: number;          // 1..127
  randomVelMax: number;          // 1..127
  scaleVelocityAmount: number;   // multiplier, e.g. 1.1 = +10%

  // ── Ghost notes (multi-track display) ────────────────────────────────
  ghostNotesVisible: boolean;
  /** Double-clicking a ghost note switches its track to the active track. */
  ghostDoubleClickActivates: boolean;
}

// Re-exports for convenience
export type StrumDirection = 'up' | 'down';
export type ArpPattern     = 'up' | 'down' | 'upDown' | 'random';

// ═══════════════════════════════════════════════════════════════════
//  Chord types
// ═══════════════════════════════════════════════════════════════════

export type ChordType =
  | 'major' | 'minor' | 'diminished' | 'augmented'
  | 'sus2'  | 'sus4'
  | 'major7' | 'minor7' | 'dominant7' | 'diminished7' | 'halfDiminished7'
  | 'add9'   | 'minorAdd9'
  | 'powerChord';


// ═══════════════════════════════════════════════════════════════════
//  Viewport
//  Describes how tick-space maps to pixel-space on screen.
//  No state about *which notes exist* lives here — purely rendering.
// ═══════════════════════════════════════════════════════════════════

export interface PianoRollViewport {
  /** Horizontal pixel offset (how far the user has scrolled right). */
  scrollX: number;
  /** Vertical pixel offset (how far the user has scrolled down). */
  scrollY: number;

  // ── Zoom / layout ──────────────────────────────────────────────────
  /** Horizontal zoom multiplier applied on top of beatWidth. Default 1.0. */
  zoomX: number;
  /** Vertical zoom multiplier applied on top of rowHeight. Default 1.0. */
  zoomY: number;
  /** Pixel height of one semitone row at zoomY = 1. Default 18 px. */
  rowHeight: number;
  /** Pixel width of one quarter-note at zoomX = 1. Default 96 px. */
  beatWidth: number;

  // ── Pitch bounds ────────────────────────────────────────────────────
  /** Lowest MIDI pitch rendered (default 0). */
  minPitch: number;
  /** Highest MIDI pitch rendered (default 127). */
  maxPitch: number;

  // ── Canvas dimensions (set by the host component on resize) ─────────
  width: number;
  height: number;

  // ── Legacy derived fields (kept for backward-compat with canvas code) ─
  /**
   * Pixels per tick at the current zoom.
   * Equals beatWidth * zoomX / ppq — kept in sync by the store.
   */
  pixelsPerTick: number;
  /** Pixel height of one semitone row at the current zoom. Equals rowHeight * zoomY. */
  keyHeight: number;
}

// Legacy alias.
export type Viewport = PianoRollViewport;


// ═══════════════════════════════════════════════════════════════════
//  Project root
// ═══════════════════════════════════════════════════════════════════

export interface TimeMarker {
  id: string;
  tick: Tick;
  name: string;
  color?: string;
}

export interface TimeSignatureChange {
  tick: Tick;
  numerator: number;
  denominator: number;
}

export interface Pattern {
  id: string;
  name: string;
  color?: string;
  lengthBars: number;
  tracks: Track[];
}

export interface Project {
  name: string;
  settings: ProjectSettings;
  tracks: Track[];
  activeTrackId: TrackId | null;
  /** Named time markers shown on the marker lane (#44). */
  markers?: TimeMarker[];
  /** Per-region time-signature changes (#59). [{ tick:0, ... }] is default. */
  timeSignatureChanges?: TimeSignatureChange[];
  /** Pattern containers (#53). When omitted, project runs as single arrangement. */
  patterns?: Pattern[];
  activePatternId?: string;
  /** Optional reference waveform overlay (#52). */
  backgroundWaveform?: {
    /** Base64-encoded Float32Array packed into a JSON-safe payload. */
    peaksBase64: string;
    bucketCount: number;
    sampleRate: number;
    lengthSec: number;
    offsetTick: number;
  };
}


// ═══════════════════════════════════════════════════════════════════
//  Music-theory constants
// ═══════════════════════════════════════════════════════════════════

export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'] as const;
export type NoteName = typeof NOTE_NAMES[number];

/** Scale intervals (semitones above root).  'none' → empty → no filtering. */
export const SCALES: Record<ScaleType, number[]> = {
  none:            [],
  major:           [0,2,4,5,7,9,11],
  minor:           [0,2,3,5,7,8,10],
  dorian:          [0,2,3,5,7,9,10],
  phrygian:        [0,1,3,5,7,8,10],
  lydian:          [0,2,4,6,7,9,11],
  mixolydian:      [0,2,4,5,7,9,10],
  locrian:         [0,1,3,5,6,8,10],
  harmonicMinor:   [0,2,3,5,7,8,11],
  pentatonicMajor: [0,2,4,7,9],
  pentatonicMinor: [0,3,5,7,10],
  blues:           [0,3,5,6,7,10],
};

/** Chord stamp intervals (semitones above root note). */
export const CHORD_STAMPS: Record<string, number[]> = {
  Major:  [0,4,7],
  Minor:  [0,3,7],
  Dom7:   [0,4,7,10],
  Maj7:   [0,4,7,11],
  Min7:   [0,3,7,10],
  Dim:    [0,3,6],
  Aug:    [0,4,8],
  Sus2:   [0,2,7],
  Sus4:   [0,5,7],
  Dim7:   [0,3,6,9],
  HalfDim:[0,3,6,10],
};

/**
 * 16-slot palette for `Note.colorGroup`. When a note has a colorGroup, the
 * canvas uses this colour instead of the parent track's colour, letting
 * users tag notes by function (melody/harmony/voicing/etc.) within a track.
 * Group 0 is reserved as "use track colour".
 */
export const NOTE_COLOR_GROUPS: readonly string[] = [
  '',         // 0 — fall back to track color
  '#9fe870',  // Wise Green
  '#ffd11a',  // Wise Yellow
  '#ffc091',  // Wise Orange
  '#d03238',  // Wise Red
  '#38c8ff',  // Cyan
  '#cdffad',  // Pale green
  '#e2f6d5',  // Mint
  '#d4f0b5',  // Light Mint
  '#868685',  // Wise Gray
  '#bb8df0',  // Lavender
  '#ff8ad6',  // Pink
  '#7bc554',  // Hover green
  '#f3d77b',  // Sand
  '#5d7aa3',  // Slate blue
  '#163300',  // Dark green
] as const;

/** Default MIDI display range: C1 (MIDI 24) – C7 (MIDI 96). */
export const DEFAULT_LOW_PITCH:  MidiPitch = 24;
export const DEFAULT_HIGH_PITCH: MidiPitch = 96;
export const DEFAULT_PPQ = 480;
export const DEFAULT_BPM = 120;
