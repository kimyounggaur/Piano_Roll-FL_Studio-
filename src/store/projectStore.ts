import { create } from 'zustand';
import type {
  Project, Track, Note, NoteId, TrackId,
  ProjectSettings, PianoRollViewport, PianoRollTool,
  SnapValue, ScaleType,
} from '../types/music';
import { ticksPerBar, snapUnitToTicks, snapTick } from '../utils/time';
import { quantizeNote, humanizeNotes, strumNotes, arpeggiateNotes, randomizeVelocity, scaleVelocity,
  flipNotes, limitNotes, randomizeNotes, applyLfo, articulateNotes,
  type LfoOptions, type ArticulatePattern, type RandomizeOptions,
} from '../utils/noteTransforms';
import type { StrumDirection, ArpPattern } from '../types/music';
import { snapPitchToScale } from '../utils/musicTheory';
import { DEFAULT_PPQ, DEFAULT_BPM } from '../types/music';
import { buildTracksFromImport, type ImportedMidi } from '../utils/midiFile';
import { generateProgression, type ProgressionOptions } from '../utils/chordProgression';
import { generateRiff as generateRiffNotes, type RiffOptions } from '../utils/riffMachine';

// ═══════════════════════════════════════════════════════════════════
//  Selection rect (tick-space, not pixel-space)
// ═══════════════════════════════════════════════════════════════════
export interface SelectionRect {
  startTick: number;
  endTick: number;
  minPitch: number;
  maxPitch: number;
}

// ═══════════════════════════════════════════════════════════════════
//  Factory helpers
// ═══════════════════════════════════════════════════════════════════
// Wise-inspired track colour palette
const TRACK_COLORS = [
  '#9fe870',  // Wise Green (primary)
  '#ffc091',  // Wise Bright Orange
  '#ffd11a',  // Wise Warning Yellow
  '#38c8ff',  // Background Cyan (solid)
  '#cdffad',  // Wise Pastel Green
  '#d03238',  // Wise Danger Red
  '#e2f6d5',  // Wise Light Mint
  '#868685',  // Wise Gray
] as const;

function nanoid(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

function makeTrack(name: string, colorIndex: number): Track {
  return {
    id: nanoid(),
    name,
    color: TRACK_COLORS[colorIndex % TRACK_COLORS.length],
    instrument: { type: 'synth', preset: 'triangle' },
    channel: 1,
    muted: false,
    solo: false,
    volume: 1.0,
    pan: 0,
    notes: [],
  };
}

// ═══════════════════════════════════════════════════════════════════
//  createDefaultProject
//  Returns a fresh project with one empty track and sensible defaults.
//  Example state:
//    bpm: 120, ppq: 480, 4/4 time, 8 bars
//    snapUnit: '1/16', no scale
//    Track 1 — empty, colour #4a9eff
// ═══════════════════════════════════════════════════════════════════
export function createDefaultProject(): Project {
  const track = makeTrack('트랙 1', 0);
  return {
    name: '새 프로젝트',
    settings: {
      bpm: DEFAULT_BPM,
      ppq: DEFAULT_PPQ,
      timeSignature: { numerator: 4, denominator: 4 },
      bars: 8,
      loopStartTick: 0,
      loopEndTick: 0,
      snapUnit: '1/16',
      scaleRoot: 0,
      scaleName: 'none',
      scaleSnapEnabled: false,
      stampChordType: 'major',
      stampHoldTool: false,
      stampDurationTicks: 0,
      quantizeStrength: 1,
      quantizeDuration: false,
      humanizeTimingTicks: 20,
      humanizeVelocity: 10,
      strumAmountTicks: 60,
      strumDirection: 'down',
      arpPattern: 'up',
      arpStepTicks: 120,
      arpRepeatCount: 2,
      arpReplaceOriginals: true,
      randomVelMin: 80,
      randomVelMax: 110,
      scaleVelocityAmount: 1.1,
      ghostNotesVisible: true,
      ghostDoubleClickActivates: true,
    },
    tracks: [track],
    activeTrackId: track.id,
  };
}

const DEFAULT_VIEWPORT: PianoRollViewport = {
  scrollX: 0,
  scrollY: 0,
  zoomX: 1.0,
  zoomY: 1.0,
  rowHeight: 18,
  beatWidth: 96,
  minPitch: 0,
  maxPitch: 127,
  width: 0,
  height: 0,
  // derived — beatWidth * zoomX / DEFAULT_PPQ = 96 / 480 = 0.2
  pixelsPerTick: 96 / DEFAULT_PPQ,
  // derived — rowHeight * zoomY = 18
  keyHeight: 18,
};

const LS_KEY = 'rolllab_project';

// ═══════════════════════════════════════════════════════════════════
//  History (undo/redo)
// ═══════════════════════════════════════════════════════════════════
const MAX_HISTORY = 100;

// Pitches currently held down on the MIDI input. Module-local because it's
// transient runtime state, not part of the persisted project document.
const _activeRecordingNotes: Map<number, { startTick: number; velocity: number; colorGroup?: string }> = new Map();

// ═══════════════════════════════════════════════════════════════════
//  Pure helpers (no store access — easy to unit-test)
// ═══════════════════════════════════════════════════════════════════

/** Closest SnapValue for an arbitrary tick count. */
function ticksToSnapValue(ticks: number, ppq: number): SnapValue {
  const UNITS: SnapValue[] = [
    '1/1', '1/2', '1/4', '1/8', '1/16', '1/32', '1/64',
    '1/8T', '1/16T', '1/32T',
  ];
  let best: SnapValue = '1/16';
  let bestDiff = Infinity;
  for (const u of UNITS) {
    const t = snapUnitToTicks(u, ppq);
    const diff = Math.abs(t - ticks);
    if (diff < bestDiff) { bestDiff = diff; best = u; }
  }
  return best;
}

/** Merge a partial note patch while enforcing invariants. */
function applyNotePatch(
  note: Note,
  patch: Partial<Note>,
  minDuration: number,
  totalTicks: number
): Note {
  const merged = { ...note, ...patch };
  merged.pitch        = Math.max(0,   Math.min(127, merged.pitch));
  merged.startTick    = Math.max(0,   Math.min(totalTicks - minDuration, merged.startTick));
  merged.durationTicks = Math.max(minDuration, merged.durationTicks);
  merged.velocity     = Math.max(1,   Math.min(127, merged.velocity));
  return merged;
}

// ─────────────────────────────────────────────────────────────────────
//  Pattern unification helper — pure function, returns a migrated copy
//  of `project` without mutating anything (Zustand v5 immutable state).
// ─────────────────────────────────────────────────────────────────────
function getMigratedProject(project: Project): Project {
  if (project.patterns && project.patterns.length > 0) {
    const validActive = project.activePatternId
      && project.patterns.some((p) => p.id === project.activePatternId);
    if (validActive) return project;
    return { ...project, activePatternId: project.patterns[0].id };
  }
  const pid = nanoid();
  const stub: import('../types/music').Pattern = {
    id: pid,
    name: 'Pattern 1',
    lengthBars: project.settings.bars,
    tracks: project.tracks,
  };
  return { ...project, patterns: [stub], activePatternId: pid };
}

function updateTrackNotes(
  tracks: Track[],
  trackId: TrackId,
  fn: (notes: Note[]) => Note[]
): Track[] {
  return tracks.map((t) => t.id === trackId ? { ...t, notes: fn(t.notes) } : t);
}

function updateAllNotes(
  tracks: Track[],
  fn: (note: Note) => Note
): Track[] {
  return tracks.map((t) => ({ ...t, notes: t.notes.map(fn) }));
}

// ═══════════════════════════════════════════════════════════════════
//  Store interface
// ═══════════════════════════════════════════════════════════════════
interface ProjectStore {
  project: Project;
  viewport: PianoRollViewport;
  activeTool: PianoRollTool;
  playheadTick: number;
  isPlaying: boolean;
  isLooping: boolean;
  isMetronome: boolean;

  // ── computed selectors ────────────────────────────────────────────
  /** Returns the currently active track, or null if none. */
  activeTrack: () => Track | null;
  /** Snaps a raw tick to the current grid. */
  snapTickValue: (tick: number) => number;
  /** Total tick length of the arrangement. */
  totalTicks: () => number;
  /** Current snap resolution in ticks. */
  snapTicks: () => number;

  // ── project ───────────────────────────────────────────────────────
  setProjectName: (name: string) => void;
  updateSettings: (partial: Partial<ProjectSettings>) => void;
  setBpm: (bpm: number) => void;
  setSnapUnit: (unit: SnapValue) => void;
  /** Accepts a raw tick count and finds the closest SnapValue. */
  setSnapTicks: (ticks: number) => void;
  setTool: (tool: PianoRollTool) => void;
  /** Convenience alias for setTool (keeps existing components working). */
  setActiveTool: (tool: PianoRollTool) => void;
  setScale: (root: number, scaleName: ScaleType) => void;

  // ── tracks ────────────────────────────────────────────────────────
  addTrack: () => void;
  removeTrack: (id: TrackId) => void;
  setActiveTrack: (id: TrackId) => void;
  updateTrack: (id: TrackId, partial: Partial<Omit<Track, 'id' | 'notes'>>) => void;
  toggleTrackMute: (id: TrackId) => void;
  toggleTrackSolo: (id: TrackId) => void;

  // ── notes (individual) ────────────────────────────────────────────
  addNote: (trackId: TrackId, note: Omit<Note, 'id'>) => void;
  removeNote: (trackId: TrackId, noteId: NoteId) => void;
  /** Alias for removeNote. */
  deleteNote: (trackId: TrackId, noteId: NoteId) => void;
  updateNote: (trackId: TrackId, noteId: NoteId, partial: Partial<Note>) => void;
  setNotes: (trackId: TrackId, notes: Note[]) => void;
  /**
   * Append many notes at once. Generates fresh ids and returns them in input order.
   * Used by Paint Tool / paste / import flows that produce groups of notes.
   * Wrap in a transaction to keep a long paint drag as a single undo entry.
   */
  bulkAddNotes: (trackId: TrackId, notes: Array<Omit<Note, 'id'>>) => NoteId[];
  /** Remove every note whose id appears in `ids` from `trackId`. */
  bulkRemoveNotes: (trackId: TrackId, ids: NoteId[]) => void;
  /** Toggle a single note's muted flag. Used by Mute tool. */
  toggleNoteMuted: (trackId: TrackId, noteId: NoteId, value?: boolean) => void;
  /**
   * Split a note at `sliceTick`. Left keeps the original id; the right
   * fragment gets a fresh id. Returns the new ids or null if either
   * fragment would fall below `minDur` ticks.
   */
  sliceNoteAt: (trackId: TrackId, noteId: NoteId, sliceTick: number) => { leftId: NoteId; rightId: NoteId } | null;
  /** Slice every active-track note crossing `sliceTick` (drum-slice gesture). */
  sliceNotesAtTick: (trackId: TrackId, sliceTick: number) => NoteId[];
  /** Merge pitch-aligned adjacent selected notes into single longer notes. */
  glueSelectedNotes: () => void;
  /** Extend each selected note to the start of the next same-pitch note. */
  legatoSelectedNotes: (gapTicks?: number) => void;
  /** Resize via the LEFT handle: shift startTick by delta, keep right edge fixed. */
  resizeSelectedNotesLeft: (deltaTicks: number) => void;
  /** Align every selected note to the same startTick (Shift+left-resize). */
  alignSelectedNotesStartTick: (startTick: number) => void;
  /** Flip note.selected on every active-track note. */
  invertSelection: () => void;
  /** Tag all selected notes with a shared new groupId. */
  groupSelectedNotes: () => void;
  /** Remove groupId from all selected notes. */
  ungroupSelectedNotes: () => void;
  /** Set noteKind on selected notes (slide/portamento). */
  setNoteKindForSelected: (kind: 'normal' | 'slide' | 'portamento') => void;
  /** Flip selected notes around their bounding-box centre (#49). */
  flipSelectedNotes: (axis: 'pitch' | 'time') => void;
  /** Force selected note pitches inside [minPitch, maxPitch] (#49). */
  limitSelectedNotes: (minPitch: number, maxPitch: number, mode?: 'clamp' | 'wrap') => void;
  /** Seeded random perturbation of selected note attributes (#49). */
  randomizeSelectedNotes: (opts: RandomizeOptions) => void;
  /** Apply an LFO to selected notes (#60). */
  applyLfoToSelectedNotes: (opts: LfoOptions) => void;
  /** Apply an articulation pattern to selected notes (#60). */
  articulateSelectedNotes: (pattern: ArticulatePattern, intensity: number) => void;
  /** Generate a chord progression and append to the active track (#50). */
  generateChordProgression: (opts: import('../utils/chordProgression').ProgressionOptions) => NoteId[];
  /** Generate a riff and append to the active track (#51). */
  generateRiff: (opts: import('../utils/riffMachine').RiffOptions) => NoteId[];

  // ── Markers (#44) ───────────────────────────────────────────────
  addMarker: (tick: number, name?: string, color?: string) => string;
  removeMarker: (id: string) => void;
  updateMarker: (id: string, partial: Partial<{ tick: number; name: string; color: string }>) => void;
  jumpToMarker: (id: string) => void;
  jumpToAdjacentMarker: (direction: 'prev' | 'next') => void;

  // ── Ghost selector (#47) ────────────────────────────────────────
  toggleGhostEditable: () => void;
  setGhostVisibleTracks: (ids: TrackId[] | 'all') => void;
  toggleGhostVisibleTrack: (id: TrackId) => void;

  // ── Performance mode (#56) ──────────────────────────────────────
  setPerformanceMode: (v: boolean) => void;

  // ── MIDI channel routing (#57) ──────────────────────────────────
  setChannelColorMap: (channel: number, group: number) => void;
  toggleChannelThrough: () => void;

  // ── Time-signature changes (#59) ────────────────────────────────
  addTimeSignatureChange: (tick: number, numerator: number, denominator: number) => void;
  removeTimeSignatureChange: (tick: number) => void;

  // ── Pattern system (#53) ────────────────────────────────────────
  addPattern: (name?: string) => string;
  removePattern: (id: string) => void;
  duplicatePattern: (id: string) => string;
  renamePattern: (id: string, name: string) => void;
  setActivePattern: (id: string) => void;

  // ── Background waveform (#52) ────────────────────────────────────
  setBackgroundWaveform: (data: NonNullable<Project['backgroundWaveform']> | null) => void;
  setBackgroundWaveformOffset: (tick: number) => void;

  // ── Drum sequencer (#62) ───────────────────────────────────────
  setTrackKind: (trackId: TrackId, kind: 'melodic' | 'drum') => void;
  setDrumKit: (trackId: TrackId, kit: Array<{ pitch: number; name: string }>) => void;
  toggleDrumStep: (trackId: TrackId, pitch: number, startTick: number, stepTicks: number) => void;

  // ── notes (selection) ────────────────────────────────────────────
  /**
   * Select a note.
   * @param additive - if true, adds to current selection (Shift-click);
   *                   if false, replaces selection.
   */
  selectNote: (trackId: TrackId, noteId: NoteId, additive: boolean) => void;
  deselectAll: () => void;
  /** Alias for deselectAll. */
  clearSelection: () => void;
  /**
   * Select notes that overlap a tick/pitch rectangle (rubber-band marquee).
   * A note overlaps when its [startTick, startTick+durationTicks) range
   * intersects [startTick, endTick) AND its pitch is within [minPitch, maxPitch].
   * @param additive - if true, OR with current selection; if false, replace it.
   */
  selectNotesInRect: (rect: SelectionRect, additive?: boolean) => void;
  deleteSelected: () => void;
  /**
   * Translate all selected notes by (deltaPitch, deltaTicks).
   * Pitch is clamped to [0, 127]; startTick to [0, totalTicks − duration].
   */
  moveSelectedNotes: (deltaPitch: number, deltaTicks: number) => void;
  /**
   * Extend or shorten all selected notes by deltaTicks.
   * Minimum duration is enforced to snapTicks.
   */
  resizeSelectedNotes: (deltaTicks: number) => void;
  /**
   * Set every selected note's end tick (= startTick + durationTicks) to the
   * same target value. Used by Shift-resize so multiple notes line up at
   * the same release point. Minimum duration is `snapTicks`.
   */
  alignSelectedNotesEndTick: (endTick: number) => void;
  /**
   * Copy all selected notes and offset them by one bar.
   * Originals are deselected; copies are selected.
   */
  duplicateSelectedNotes: () => void;
  /**
   * Copy all selected notes in place (no offset).  Originals are deselected;
   * copies are selected.  Used by Alt-drag to clone before moving.
   */
  duplicateSelectedNotesInPlace: () => void;
  setVelocityForSelectedNotes: (velocity: number) => void;
  /**
   * Pull every selected note toward its nearest grid line.
   * @param gridTicks  e.g. 480 = 1/4, 120 = 1/16
   * @param strength   0..1 — 1 fully snaps, 0.5 moves halfway, 0 no change
   * @param quantizeDuration  also align note length to the grid
   */
  quantizeSelectedNotes: (gridTicks: number, strength: number, quantizeDuration?: boolean) => void;
  /**
   * Apply small random shifts to startTick / velocity of every selected note.
   * Pass `seed` for reproducible output.
   */
  humanizeSelectedNotes: (timingAmountTicks: number, velocityAmount: number, seed?: number) => void;
  /**
   * Spread chord-grouped selected notes across `amountTicks`.
   * "up" = low-pitch-first cascade; "down" = high-pitch-first cascade.
   */
  strumSelectedNotes: (amountTicks: number, direction: StrumDirection) => void;
  /**
   * Replace (or augment) selected chord notes with an arpeggio.
   * @param replaceOriginals  if true, delete the source notes before adding arp notes.
   */
  arpeggiateSelectedNotes: (
    pattern: ArpPattern,
    stepTicks: number,
    repeatCount: number,
    replaceOriginals?: boolean,
    seed?: number,
  ) => void;

  /** Replace each selected note's velocity with a uniform random value in [min, max]. */
  randomizeVelocitySelectedNotes: (minVelocity: number, maxVelocity: number, seed?: number) => void;
  /** Multiply each selected note's velocity by `amount`. */
  scaleVelocitySelectedNotes: (amount: number) => void;
  /** Set `muted: true` on every selected note. */
  muteSelectedNotes: () => void;
  /** Set `muted: false` on every selected note. */
  unmuteSelectedNotes: () => void;
  /** Tag every selected note with a colour group (0..15). Group 0 means "use track colour". */
  setColorGroupForSelectedNotes: (group: number) => void;

  // ── transport ────────────────────────────────────────────────────
  setPlayheadTick: (tick: number) => void;
  setIsPlaying: (v: boolean) => void;
  setIsLooping: (v: boolean) => void;
  setIsMetronome: (v: boolean) => void;

  // ── viewport ─────────────────────────────────────────────────────
  setViewport: (partial: Partial<PianoRollViewport>) => void;
  /** Whether the canvas should auto-scroll to keep the playhead in view. */
  autoFollowPlayhead: boolean;
  setAutoFollowPlayhead: (v: boolean) => void;
  /** Center the viewport on the selected notes' bounding box (#42). */
  zoomToSelection: () => void;
  /** Zoom out so the entire arrangement fits. */
  zoomToFitAll: () => void;
  /** Quick zoom presets (Shift+1..5). */
  setZoomPreset: (level: '100' | '50' | '25' | 'far' | 'selection') => void;

  // ── persistence ──────────────────────────────────────────────────
  saveProjectToLocalStorage: () => void;
  loadProjectFromLocalStorage: () => boolean;
  exportJSON: () => string;
  /** Alias for exportJSON. */
  exportProjectJson: () => string;
  importJSON: (json: string) => void;
  /** Alias for importJSON. */
  importProjectJson: (json: string) => void;
  /**
   * Replace or append imported MIDI tracks. Updates BPM if the file had a
   * tempo and `mode === 'replace'`. Sets the first imported track active.
   */
  importMidi: (imported: ImportedMidi, mode: 'replace' | 'append') => void;
  /** Swap the whole project document. Clears history. Used by file import. */
  replaceProject: (project: Project) => void;

  // ── MIDI input recording ─────────────────────────────────────────
  isRecording: boolean;
  /** While true, recordedNoteOn/Off will write into the active track. */
  setRecording: (v: boolean) => void;
  /**
   * Snap incoming MIDI pitch to the current project scale when armed.
   * Off by default — recording exact-played notes is usually preferable.
   */
  recordingScaleSnap: boolean;
  setRecordingScaleSnap: (v: boolean) => void;
  /** Called from the Web MIDI handler. Stamps an in-flight note in `_activeRecordingNotes`. */
  recordedNoteOn: (pitch: number, velocity: number, channel?: number) => void;
  /** Looks up the in-flight note, computes duration, and commits to the active track. */
  recordedNoteOff: (pitch: number) => void;
  /** Flush every in-flight note as a short note at the current playhead. Called on disarm. */
  flushRecordingNotes: () => void;

  // ── history (undo/redo) ──────────────────────────────────────────
  /** @internal Past project snapshots — oldest first, newest last. */
  _undoStack: Project[];
  /** @internal Snapshots produced by undo, ready to redo. */
  _redoStack: Project[];
  /** @internal Snapshot captured at beginTransaction(); commit flushes it. */
  _transactionSnapshot: Project | null;
  /** @internal While true, edit actions skip pushing per-step history. */
  _inTransaction: boolean;
  /**
   * Open a multi-step edit (e.g. drag). Snapshots the current project once.
   * Subsequent edits during the transaction do NOT push individual entries;
   * `commitTransaction()` flushes the original snapshot as a single entry.
   */
  beginTransaction: () => void;
  /** Close the open transaction and record one undo entry if state changed. */
  commitTransaction: () => void;
  /** Abort the open transaction, restoring the snapshot. */
  cancelTransaction: () => void;
  /** Pop one entry from the undo stack and push current state onto redo. */
  undo: () => void;
  /** Pop one entry from the redo stack and push current state onto undo. */
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
}

// ═══════════════════════════════════════════════════════════════════
//  Implementation
// ═══════════════════════════════════════════════════════════════════
export const useProjectStore = create<ProjectStore>((set, get) => ({
  project:      createDefaultProject(),
  viewport:     DEFAULT_VIEWPORT,
  activeTool:   'draw',
  playheadTick: 0,
  isPlaying:    false,
  isLooping:    true,
  isMetronome:  false,

  // ── computed selectors ──────────────────────────────────────────
  activeTrack: () => {
    const { project } = get();
    return project.tracks.find((t) => t.id === project.activeTrackId) ?? null;
  },

  snapTicks: () => {
    const { settings } = get().project;
    return snapUnitToTicks(settings.snapUnit, settings.ppq);
  },

  snapTickValue: (tick) => {
    const { settings } = get().project;
    return snapTick(tick, snapUnitToTicks(settings.snapUnit, settings.ppq));
  },

  totalTicks: () => {
    const { settings } = get().project;
    return ticksPerBar(settings.ppq, settings.timeSignature) * settings.bars;
  },

  // ── project ────────────────────────────────────────────────────
  setProjectName: (name) => {
    pushHistory(get, set);
    set((s) => ({ project: { ...s.project, name } }));
  },

  updateSettings: (partial) => {
    pushHistory(get, set);
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, ...partial } },
    }));
  },

  setBpm: (bpm) => {
    pushHistory(get, set);
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, bpm: Math.max(1, Math.min(999, bpm)) } },
    }));
  },

  setSnapUnit: (unit) => {
    pushHistory(get, set);
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, snapUnit: unit } },
    }));
  },

  setSnapTicks: (ticks) => {
    const { ppq } = get().project.settings;
    const unit = ticksToSnapValue(ticks, ppq);
    pushHistory(get, set);
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, snapUnit: unit } },
    }));
  },

  setTool: (tool) => set({ activeTool: tool }),
  setActiveTool: (tool) => set({ activeTool: tool }),

  setScale: (root, scaleName) => {
    pushHistory(get, set);
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, scaleRoot: root, scaleName } },
    }));
  },

  // ── tracks ─────────────────────────────────────────────────────
  addTrack: () => {
    pushHistory(get, set);
    set((s) => {
      const track = makeTrack(`트랙 ${s.project.tracks.length + 1}`, s.project.tracks.length);
      return {
        project: {
          ...s.project,
          tracks: [...s.project.tracks, track],
          activeTrackId: track.id,
        },
      };
    });
  },

  removeTrack: (id) => {
    if (get().project.tracks.length <= 1) return; // never remove last track
    pushHistory(get, set);
    set((s) => {
      const tracks = s.project.tracks.filter((t) => t.id !== id);
      const activeTrackId =
        s.project.activeTrackId === id ? (tracks[0]?.id ?? null) : s.project.activeTrackId;
      return { project: { ...s.project, tracks, activeTrackId } };
    });
  },

  setActiveTrack: (id) =>
    set((s) => ({ project: { ...s.project, activeTrackId: id } })),

  updateTrack: (id, partial) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === id ? { ...t, ...partial } : t),
      },
    }));
  },

  toggleTrackMute: (id) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === id ? { ...t, muted: !t.muted } : t),
      },
    }));
  },

  toggleTrackSolo: (id) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === id ? { ...t, solo: !t.solo } : t),
      },
    }));
  },

  // ── notes (individual) ─────────────────────────────────────────
  addNote: (trackId, note) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) => [
          ...notes, { selected: false, ...note, id: nanoid() },
        ]),
      },
    }));
  },

  removeNote: (trackId, noteId) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) =>
          notes.filter((n) => n.id !== noteId)
        ),
      },
    }));
  },

  deleteNote: (trackId, noteId) => get().removeNote(trackId, noteId),

  updateNote: (trackId, noteId, partial) => {
    const { totalTicks, snapTicks } = get();
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) =>
          notes.map((n) =>
            n.id === noteId
              ? applyNotePatch(n, partial, snapTicks(), totalTicks())
              : n
          )
        ),
      },
    }));
  },

  setNotes: (trackId, notes) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === trackId ? { ...t, notes } : t),
      },
    }));
  },

  bulkAddNotes: (trackId: TrackId, incoming: Array<Omit<Note, 'id'>>): NoteId[] => {
    if (incoming.length === 0) return [];
    pushHistory(get, set);
    const withIds: Note[] = incoming.map((n) => ({
      selected: false,
      ...n,
      id: nanoid(),
    }));
    const ids = withIds.map((n) => n.id);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) => [...notes, ...withIds]),
      },
    }));
    return ids;
  },

  toggleNoteMuted: (trackId, noteId, value) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) =>
          notes.map((n) => n.id === noteId
            ? { ...n, muted: value !== undefined ? value : !n.muted }
            : n
          )
        ),
      },
    }));
  },

  sliceNoteAt: (trackId, noteId, sliceTick) => {
    const minDur = get().snapTicks();
    const track = get().project.tracks.find((t) => t.id === trackId);
    if (!track) return null;
    const orig = track.notes.find((n) => n.id === noteId);
    if (!orig) return null;
    const left = sliceTick - orig.startTick;
    const right = (orig.startTick + orig.durationTicks) - sliceTick;
    if (left < minDur || right < minDur) return null;
    const rightId: NoteId = nanoid();
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) => {
          const out: Note[] = [];
          for (const n of notes) {
            if (n.id !== noteId) { out.push(n); continue; }
            out.push({ ...n, durationTicks: left, selected: true });
            out.push({ ...n, id: rightId, startTick: sliceTick, durationTicks: right, selected: false });
          }
          return out;
        }),
      },
    }));
    return { leftId: noteId, rightId };
  },

  sliceNotesAtTick: (trackId, sliceTick) => {
    const minDur = get().snapTicks();
    const track = get().project.tracks.find((t) => t.id === trackId);
    if (!track) return [];
    const newIds: NoteId[] = [];
    const updated: Note[] = [];
    for (const n of track.notes) {
      const left = sliceTick - n.startTick;
      const right = (n.startTick + n.durationTicks) - sliceTick;
      if (left >= minDur && right >= minDur) {
        const rightId: NoteId = nanoid();
        updated.push({ ...n, durationTicks: left, selected: true });
        updated.push({ ...n, id: rightId, startTick: sliceTick, durationTicks: right, selected: false });
        newIds.push(rightId);
      } else {
        updated.push(n);
      }
    }
    if (newIds.length === 0) return [];
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === trackId ? { ...t, notes: updated } : t),
      },
    }));
    return newIds;
  },

  glueSelectedNotes: () => {
    const minGap = Math.max(1, Math.floor(get().snapTicks() / 4));
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const selected = t.notes.filter((n) => n.selected);
          if (selected.length < 2) return t;
          // Group by pitch + colorGroup, sort by startTick, merge adjacent.
          const key = (n: Note) => `${n.pitch}|${n.colorGroup ?? ''}`;
          const groups = new Map<string, Note[]>();
          for (const n of selected) {
            const arr = groups.get(key(n)) ?? [];
            arr.push(n);
            groups.set(key(n), arr);
          }
          const removeIds = new Set<NoteId>();
          const replaceMap = new Map<NoteId, Note>();
          for (const arr of groups.values()) {
            arr.sort((a, b) => a.startTick - b.startTick);
            let run: Note[] = [];
            const flush = () => {
              if (run.length < 2) { run = []; return; }
              const first = run[0];
              const last = run[run.length - 1];
              const merged: Note = {
                ...first,
                durationTicks: (last.startTick + last.durationTicks) - first.startTick,
                selected: true,
              };
              replaceMap.set(first.id, merged);
              for (let i = 1; i < run.length; i++) removeIds.add(run[i].id);
              run = [];
            };
            for (const n of arr) {
              if (run.length === 0) { run.push(n); continue; }
              const prev = run[run.length - 1];
              const gap = n.startTick - (prev.startTick + prev.durationTicks);
              if (gap <= minGap) run.push(n);
              else { flush(); run = [n]; }
            }
            flush();
          }
          return {
            ...t,
            notes: t.notes
              .filter((n) => !removeIds.has(n.id))
              .map((n) => replaceMap.get(n.id) ?? n),
          };
        }),
      },
    }));
  },

  legatoSelectedNotes: (gapTicks = 0) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const samePitchSorted = new Map<number, Note[]>();
          for (const n of t.notes) {
            const arr = samePitchSorted.get(n.pitch) ?? [];
            arr.push(n);
            samePitchSorted.set(n.pitch, arr);
          }
          samePitchSorted.forEach((arr) => arr.sort((a, b) => a.startTick - b.startTick));
          return {
            ...t,
            notes: t.notes.map((n) => {
              if (!n.selected) return n;
              const peers = samePitchSorted.get(n.pitch)!;
              const idx = peers.findIndex((p) => p.id === n.id);
              const next = peers[idx + 1];
              if (!next) return n;
              const targetEnd = next.startTick - gapTicks;
              const newDur = Math.max(1, targetEnd - n.startTick);
              return { ...n, durationTicks: newDur };
            }),
          };
        }),
      },
    }));
  },

  resizeSelectedNotesLeft: (deltaTicks) => {
    const minDur = get().snapTicks();
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          notes: t.notes.map((n) => {
            if (!n.selected) return n;
            const newStart = Math.max(0, n.startTick + deltaTicks);
            const origEnd  = n.startTick + n.durationTicks;
            const newDur   = Math.max(minDur, origEnd - newStart);
            return { ...n, startTick: origEnd - newDur, durationTicks: newDur };
          }),
        })),
      },
    }));
  },

  invertSelection: () => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) =>
          t.id === s.project.activeTrackId
            ? { ...t, notes: t.notes.map((n) => ({ ...n, selected: !n.selected })) }
            : t
        ),
      },
    }));
  },

  groupSelectedNotes: () => {
    const gid = nanoid();
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) => n.selected ? { ...n, groupId: gid } : n),
      },
    }));
  },

  ungroupSelectedNotes: () => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) => {
          if (!n.selected || !n.groupId) return n;
          const next = { ...n };
          delete next.groupId;
          return next;
        }),
      },
    }));
  },

  setNoteKindForSelected: (kind) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) => n.selected ? { ...n, noteKind: kind } : n),
      },
    }));
  },

  flipSelectedNotes: (axis) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const sel = t.notes.filter((n) => n.selected);
          if (sel.length === 0) return t;
          const out = flipNotes(sel, axis);
          const byId = new Map(out.map((n) => [n.id, n]));
          return { ...t, notes: t.notes.map((n) => byId.get(n.id) ?? n) };
        }),
      },
    }));
  },

  limitSelectedNotes: (minPitch, maxPitch, mode = 'wrap') => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const sel = t.notes.filter((n) => n.selected);
          if (sel.length === 0) return t;
          const out = limitNotes(sel, minPitch, maxPitch, mode);
          const byId = new Map(out.map((n) => [n.id, n]));
          return { ...t, notes: t.notes.map((n) => byId.get(n.id) ?? n) };
        }),
      },
    }));
  },

  randomizeSelectedNotes: (opts) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const sel = t.notes.filter((n) => n.selected);
          if (sel.length === 0) return t;
          const out = randomizeNotes(sel, opts);
          const byId = new Map(out.map((n) => [n.id, n]));
          return { ...t, notes: t.notes.map((n) => byId.get(n.id) ?? n) };
        }),
      },
    }));
  },

  applyLfoToSelectedNotes: (opts) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const sel = t.notes.filter((n) => n.selected);
          if (sel.length === 0) return t;
          const out = applyLfo(sel, opts);
          const byId = new Map(out.map((n) => [n.id, n]));
          return { ...t, notes: t.notes.map((n) => byId.get(n.id) ?? n) };
        }),
      },
    }));
  },

  generateChordProgression: (opts: ProgressionOptions) => {
    const tr = get().activeTrack();
    if (!tr) return [];
    const notes = generateProgression(opts);
    return get().bulkAddNotes(tr.id, notes);
  },

  generateRiff: (opts: RiffOptions) => {
    const tr = get().activeTrack();
    if (!tr) return [];
    const notes = generateRiffNotes(opts);
    return get().bulkAddNotes(tr.id, notes);
  },

  // ── Markers (#44) ────────────────────────────────────────────
  addMarker: (tick, name, color) => {
    const id = nanoid();
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        markers: [...(s.project.markers ?? []), { id, tick, name: name ?? `Marker ${(s.project.markers?.length ?? 0) + 1}`, color }],
      },
    }));
    return id;
  },

  removeMarker: (id) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        markers: (s.project.markers ?? []).filter((m) => m.id !== id),
      },
    }));
  },

  updateMarker: (id, partial) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        markers: (s.project.markers ?? []).map((m) => m.id === id ? { ...m, ...partial } : m),
      },
    }));
  },

  jumpToMarker: (id) => {
    const m = get().project.markers?.find((x) => x.id === id);
    if (m) set({ playheadTick: m.tick });
  },

  jumpToAdjacentMarker: (direction) => {
    const { playheadTick, project } = get();
    const ms = (project.markers ?? []).slice().sort((a, b) => a.tick - b.tick);
    if (ms.length === 0) return;
    const target = direction === 'next'
      ? ms.find((m) => m.tick > playheadTick) ?? ms[0]
      : [...ms].reverse().find((m) => m.tick < playheadTick) ?? ms[ms.length - 1];
    set({ playheadTick: target.tick });
  },

  // ── Ghost selector (#47) ─────────────────────────────────────
  toggleGhostEditable: () =>
    set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, ghostEditable: !s.project.settings.ghostEditable } } })),

  setGhostVisibleTracks: (ids) =>
    set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, ghostVisibleTrackIds: ids } } })),

  toggleGhostVisibleTrack: (id) =>
    set((s) => {
      const current = s.project.settings.ghostVisibleTrackIds;
      const list = current === 'all' || current === undefined
        ? s.project.tracks.filter((t) => t.id !== id).map((t) => t.id)
        : current.includes(id)
          ? current.filter((x) => x !== id)
          : [...current, id];
      return { project: { ...s.project, settings: { ...s.project.settings, ghostVisibleTrackIds: list } } };
    }),

  // ── Performance mode (#56) ───────────────────────────────────
  setPerformanceMode: (v) =>
    set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, performanceMode: v } } })),

  // ── MIDI channel routing (#57) ───────────────────────────────
  setChannelColorMap: (channel, group) =>
    set((s) => ({
      project: {
        ...s.project,
        settings: {
          ...s.project.settings,
          midiChannelColorMap: {
            ...(s.project.settings.midiChannelColorMap ?? {}),
            [channel]: group,
          },
        },
      },
    })),

  toggleChannelThrough: () =>
    set((s) => ({ project: { ...s.project, settings: { ...s.project.settings, midiChannelThrough: !s.project.settings.midiChannelThrough } } })),

  // ── Time-signature changes (#59) ─────────────────────────────
  addTimeSignatureChange: (tick, numerator, denominator) => {
    pushHistory(get, set);
    set((s) => {
      const list = (s.project.timeSignatureChanges ?? []).filter((x) => x.tick !== tick);
      list.push({ tick, numerator, denominator });
      list.sort((a, b) => a.tick - b.tick);
      return { project: { ...s.project, timeSignatureChanges: list } };
    });
  },
  removeTimeSignatureChange: (tick) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        timeSignatureChanges: (s.project.timeSignatureChanges ?? []).filter((x) => x.tick !== tick),
      },
    }));
  },

  // ── Pattern system (#53) ────────────────────────────────────
  //   Unification rule:
  //     project.tracks       → working set being edited by the Piano Roll
  //     patterns[active]     → the same tracks, snapshotted whenever the
  //                            active pattern changes or a new one is added.
  //   Migration: if project.patterns is undefined, we wrap project.tracks
  //   inside `Pattern 1` on first pattern action. Callers can also invoke
  //   ensurePatternsInitialized() defensively.
  addPattern: (name) => {
    const id = nanoid();
    pushHistory(get, set);
    set((s) => {
      const project = getMigratedProject(s.project);
      // 1) Persist the current edit buffer into the previously-active pattern.
      const patternsWithSnapshot = (project.patterns ?? []).map((p) =>
        p.id === project.activePatternId ? { ...p, tracks: project.tracks } : p);
      // 2) Append a fresh empty pattern and switch to it.
      const fresh: import('../types/music').Pattern = {
        id, name: name ?? `Pattern ${patternsWithSnapshot.length + 1}`,
        lengthBars: project.settings.bars,
        tracks: [makeTrack(`트랙 1`, 0)],
      };
      return {
        project: {
          ...project,
          tracks: fresh.tracks,
          activeTrackId: fresh.tracks[0].id,
          patterns: [...patternsWithSnapshot, fresh],
          activePatternId: id,
        },
      };
    });
    return id;
  },

  removePattern: (id) => {
    pushHistory(get, set);
    set((s) => {
      const project = getMigratedProject(s.project);
      const patterns = (project.patterns ?? []).filter((p) => p.id !== id);
      if (patterns.length === 0) {
        // Never leave the project pattern-less; snapshot current tracks back.
        const stub: import('../types/music').Pattern = {
          id: nanoid(), name: 'Pattern 1',
          lengthBars: project.settings.bars,
          tracks: project.tracks,
        };
        return { project: { ...project, patterns: [stub], activePatternId: stub.id } };
      }
      // If we're removing the active pattern, swap to the first remaining one.
      let nextTracks = project.tracks;
      let nextActive = project.activePatternId;
      if (project.activePatternId === id) {
        nextTracks = patterns[0].tracks;
        nextActive = patterns[0].id;
      }
      return {
        project: {
          ...project,
          tracks: nextTracks,
          activeTrackId: nextTracks[0]?.id ?? null,
          patterns,
          activePatternId: nextActive,
        },
      };
    });
  },

  duplicatePattern: (id) => {
    const newId = nanoid();
    pushHistory(get, set);
    set((s) => {
      const project = getMigratedProject(s.project);
      const patterns = project.patterns ?? [];
      // Snapshot current edit buffer back into its pattern first.
      const synced = patterns.map((p) =>
        p.id === project.activePatternId ? { ...p, tracks: project.tracks } : p);
      const source = synced.find((p) => p.id === id);
      if (!source) return s;
      const clonedTracks = source.tracks.map((t) => ({
        ...t,
        id: nanoid(),
        notes: t.notes.map((n) => ({ ...n, id: nanoid() })),
      }));
      const copy = { ...source, id: newId, name: `${source.name} (copy)`, tracks: clonedTracks };
      return {
        project: {
          ...project,
          tracks: clonedTracks,
          activeTrackId: clonedTracks[0]?.id ?? null,
          patterns: [...synced, copy],
          activePatternId: newId,
        },
      };
    });
    return newId;
  },

  renamePattern: (id, name) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        patterns: (s.project.patterns ?? []).map((p) => p.id === id ? { ...p, name } : p),
      },
    }));
  },

  setActivePattern: (id) => {
    pushHistory(get, set);
    set((s) => {
      const project = getMigratedProject(s.project);
      const patterns = project.patterns ?? [];
      // Snapshot current edit buffer into the previously-active pattern.
      const synced = patterns.map((p) =>
        p.id === project.activePatternId ? { ...p, tracks: project.tracks } : p);
      const target = synced.find((p) => p.id === id);
      if (!target) return s;
      return {
        project: {
          ...project,
          tracks: target.tracks,
          activeTrackId: target.tracks[0]?.id ?? null,
          patterns: synced,
          activePatternId: id,
        },
      };
    });
  },

  // ── Background waveform (#52) ────────────────────────────────
  setBackgroundWaveform: (data) => {
    pushHistory(get, set);
    set((s) => ({ project: { ...s.project, backgroundWaveform: data ?? undefined } }));
  },
  setBackgroundWaveformOffset: (tick) =>
    set((s) => {
      const cur = s.project.backgroundWaveform;
      if (!cur) return s;
      return { project: { ...s.project, backgroundWaveform: { ...cur, offsetTick: Math.max(0, tick) } } };
    }),

  // ── Drum sequencer (#62) ───────────────────────────────────────
  setTrackKind: (trackId, kind) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === trackId ? { ...t, trackKind: kind } : t),
      },
    }));
  },

  setDrumKit: (trackId, kit) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === trackId ? { ...t, drumKit: kit } : t),
      },
    }));
  },

  toggleDrumStep: (trackId, pitch, startTick, stepTicks) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) => {
          const existing = notes.find((n) =>
            n.pitch === pitch &&
            n.startTick === startTick &&
            n.durationTicks === stepTicks);
          if (existing) return notes.filter((n) => n.id !== existing.id);
          return [...notes, {
            id: nanoid(), pitch, startTick, durationTicks: stepTicks, velocity: 100,
          }];
        }),
      },
    }));
  },

  articulateSelectedNotes: (pattern, intensity) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const sel = t.notes.filter((n) => n.selected);
          if (sel.length === 0) return t;
          const out = articulateNotes(sel, pattern, intensity);
          const byId = new Map(out.map((n) => [n.id, n]));
          return { ...t, notes: t.notes.map((n) => byId.get(n.id) ?? n) };
        }),
      },
    }));
  },

  alignSelectedNotesStartTick: (startTick) => {
    const minDur = get().snapTicks();
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          notes: t.notes.map((n) => {
            if (!n.selected) return n;
            const origEnd = n.startTick + n.durationTicks;
            const newStart = Math.min(startTick, origEnd - minDur);
            return { ...n, startTick: Math.max(0, newStart), durationTicks: origEnd - Math.max(0, newStart) };
          }),
        })),
      },
    }));
  },

  bulkRemoveNotes: (trackId: TrackId, ids: NoteId[]) => {
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) =>
          notes.filter((n) => !idSet.has(n.id))
        ),
      },
    }));
  },

  // ── notes (selection) ──────────────────────────────────────────
  selectNote: (trackId, noteId, additive) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          if (t.id !== trackId) {
            // non-additive: clear other tracks
            return additive ? t : { ...t, notes: t.notes.map((n) => ({ ...n, selected: false })) };
          }
          return {
            ...t,
            notes: t.notes.map((n) => ({
              ...n,
              selected: n.id === noteId
                ? true                            // always select clicked note
                : additive ? !!n.selected : false, // additive keeps others; exclusive clears
            })),
          };
        }),
      },
    })),

  deselectAll: () =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) => ({ ...n, selected: false })),
      },
    })),

  clearSelection: () => get().deselectAll(),

  selectNotesInRect: ({ startTick, endTick, minPitch, maxPitch }, additive = false) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          // Marquee applies only to the active track; non-active tracks
          // keep their existing selection state.
          if (t.id !== s.project.activeTrackId) return t;
          return {
            ...t,
            notes: t.notes.map((n) => {
              const overlaps =
                n.startTick + n.durationTicks > startTick &&
                n.startTick < endTick &&
                n.pitch >= minPitch &&
                n.pitch <= maxPitch;
              return {
                ...n,
                selected: overlaps
                  ? true
                  : additive ? !!n.selected : false,
              };
            }),
          };
        }),
      },
    })),

  deleteSelected: () => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          notes: t.notes.filter((n) => !n.selected),
        })),
      },
    }));
  },

  moveSelectedNotes: (deltaPitch, deltaTicks) => {
    const { totalTicks, snapTicks } = get();
    const total = totalTicks();
    const minDur = snapTicks();
    const { scaleSnapEnabled, scaleName, scaleRoot } = get().project.settings;
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          notes: t.notes.map((n) => {
            if (!n.selected) return n;
            let newPitch = n.pitch + deltaPitch;
            if (scaleSnapEnabled && scaleName !== 'none') {
              newPitch = snapPitchToScale(newPitch, scaleRoot, scaleName, 'nearest');
            }
            return applyNotePatch(
              n,
              { pitch: newPitch, startTick: n.startTick + deltaTicks },
              minDur,
              total,
            );
          }),
        })),
      },
    }));
  },

  resizeSelectedNotes: (deltaTicks) => {
    const minDur = get().snapTicks();
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          notes: t.notes.map((n) => {
            if (!n.selected) return n;
            return { ...n, durationTicks: Math.max(minDur, n.durationTicks + deltaTicks) };
          }),
        })),
      },
    }));
  },

  alignSelectedNotesEndTick: (endTick) => {
    const minDur = get().snapTicks();
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          notes: t.notes.map((n) => {
            if (!n.selected) return n;
            return { ...n, durationTicks: Math.max(minDur, endTick - n.startTick) };
          }),
        })),
      },
    }));
  },

  duplicateSelectedNotes: () => {
    const { project } = get();
    const barTicks = ticksPerBar(project.settings.ppq, project.settings.timeSignature);
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const selected = t.notes.filter((n) => n.selected);
          if (selected.length === 0) return t;
          const copies: Note[] = selected.map((n) => ({
            ...n,
            id: nanoid(),
            startTick: n.startTick + barTicks,
            selected: true,
          }));
          // deselect originals, add copies
          return {
            ...t,
            notes: [
              ...t.notes.map((n) => ({ ...n, selected: false })),
              ...copies,
            ],
          };
        }),
      },
    }));
  },

  duplicateSelectedNotesInPlace: () => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const selected = t.notes.filter((n) => n.selected);
          if (selected.length === 0) return t;
          const copies: Note[] = selected.map((n) => ({
            ...n,
            id: nanoid(),
            selected: true,
          }));
          return {
            ...t,
            notes: [
              ...t.notes.map((n) => ({ ...n, selected: false })),
              ...copies,
            ],
          };
        }),
      },
    }));
  },

  setVelocityForSelectedNotes: (velocity) => {
    const vel = Math.max(1, Math.min(127, velocity));
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) =>
          n.selected ? { ...n, velocity: vel } : n
        ),
      },
    }));
  },

  quantizeSelectedNotes: (gridTicks, strength, quantizeDuration = false) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) =>
          n.selected ? quantizeNote(n, { gridTicks, strength, quantizeDuration }) : n
        ),
      },
    }));
  },

  humanizeSelectedNotes: (timingAmountTicks, velocityAmount, seed) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const selected = t.notes.filter((n) => n.selected);
          if (selected.length === 0) return t;
          const humanized = humanizeNotes(selected, { timingAmountTicks, velocityAmount, seed });
          const byId = new Map(humanized.map((n) => [n.id, n]));
          return {
            ...t,
            notes: t.notes.map((n) => byId.get(n.id) ?? n),
          };
        }),
      },
    }));
  },

  strumSelectedNotes: (amountTicks, direction) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const selected = t.notes.filter((n) => n.selected);
          if (selected.length < 2) return t;
          const strummed = strumNotes(selected, { amountTicks, direction });
          const byId = new Map(strummed.map((n) => [n.id, n]));
          return {
            ...t,
            notes: t.notes.map((n) => byId.get(n.id) ?? n),
          };
        }),
      },
    }));
  },

  randomizeVelocitySelectedNotes: (minVelocity, maxVelocity, seed) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const selected = t.notes.filter((n) => n.selected);
          if (selected.length === 0) return t;
          const out  = randomizeVelocity(selected, minVelocity, maxVelocity, seed);
          const byId = new Map(out.map((n) => [n.id, n]));
          return { ...t, notes: t.notes.map((n) => byId.get(n.id) ?? n) };
        }),
      },
    }));
  },

  scaleVelocitySelectedNotes: (amount) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const selected = t.notes.filter((n) => n.selected);
          if (selected.length === 0) return t;
          const out  = scaleVelocity(selected, amount);
          const byId = new Map(out.map((n) => [n.id, n]));
          return { ...t, notes: t.notes.map((n) => byId.get(n.id) ?? n) };
        }),
      },
    }));
  },

  muteSelectedNotes: () => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) => n.selected ? { ...n, muted: true } : n),
      },
    }));
  },

  unmuteSelectedNotes: () => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) => n.selected ? { ...n, muted: false } : n),
      },
    }));
  },

  setColorGroupForSelectedNotes: (group) => {
    const g = Math.max(0, Math.min(15, Math.round(group)));
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) => n.selected ? { ...n, colorGroup: String(g) } : n),
      },
    }));
  },

  arpeggiateSelectedNotes: (pattern, stepTicks, repeatCount, replaceOriginals = true, seed) => {
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          const selected = t.notes.filter((n) => n.selected);
          if (selected.length === 0) return t;
          const arp = arpeggiateNotes(selected, { pattern, stepTicks, repeatCount, seed })
            // Replace synthetic IDs with real ones, deselect any prior selection
            .map((n) => ({ ...n, id: nanoid() }));
          const kept = replaceOriginals
            ? t.notes.filter((n) => !n.selected)
            : t.notes.map((n) => ({ ...n, selected: false }));
          return { ...t, notes: [...kept, ...arp] };
        }),
      },
    }));
  },

  // ── transport ──────────────────────────────────────────────────
  setPlayheadTick: (tick) => set({ playheadTick: tick }),
  setIsPlaying:    (v)    => set({ isPlaying: v }),
  setIsLooping:    (v)    => set({ isLooping: v }),
  setIsMetronome:  (v)    => set({ isMetronome: v }),

  // ── viewport ───────────────────────────────────────────────────
  autoFollowPlayhead: true,
  setAutoFollowPlayhead: (v) => set({ autoFollowPlayhead: v }),

  zoomToSelection: () => {
    const { project, viewport } = get();
    const all: Note[] = [];
    for (const t of project.tracks) {
      if (t.id !== project.activeTrackId) continue;
      for (const n of t.notes) if (n.selected) all.push(n);
    }
    let minTick: number, maxTick: number, minPitch: number, maxPitch: number;
    if (all.length === 0) {
      // Fall back to entire active-track content; if empty, the project span.
      const active = project.tracks.find((t) => t.id === project.activeTrackId);
      const source: Note[] = (active?.notes.length ? active.notes : project.tracks.flatMap((t) => t.notes));
      if (source.length === 0) { get().zoomToFitAll(); return; }
      minTick = Math.min(...source.map((n) => n.startTick));
      maxTick = Math.max(...source.map((n) => n.startTick + n.durationTicks));
      minPitch = Math.min(...source.map((n) => n.pitch));
      maxPitch = Math.max(...source.map((n) => n.pitch));
    } else if (all.length === 1) {
      const n = all[0];
      const barTicks = ticksPerBar(project.settings.ppq, project.settings.timeSignature);
      minTick = Math.max(0, n.startTick - 2 * barTicks);
      maxTick = n.startTick + n.durationTicks + 2 * barTicks;
      minPitch = Math.max(0, n.pitch - 12);
      maxPitch = Math.min(127, n.pitch + 12);
    } else {
      minTick = Math.min(...all.map((n) => n.startTick));
      maxTick = Math.max(...all.map((n) => n.startTick + n.durationTicks));
      minPitch = Math.min(...all.map((n) => n.pitch));
      maxPitch = Math.max(...all.map((n) => n.pitch));
    }
    const spanTick   = Math.max(1, maxTick - minTick);
    const spanPitch  = Math.max(1, maxPitch - minPitch + 1);
    const padding    = 0.1;
    const targetPPT  = viewport.width  / (spanTick * (1 + padding * 2));
    const targetKH   = viewport.height / (spanPitch * (1 + padding * 2));
    // Translate ppt/kh back into zoomX/zoomY (clamped to allowed ranges).
    const ppq        = project.settings.ppq;
    const zoomX      = Math.max(0.25, Math.min(4, targetPPT * ppq / viewport.beatWidth));
    const zoomY      = Math.max(0.75, Math.min(2, targetKH / viewport.rowHeight));
    const newPPT     = viewport.beatWidth * zoomX / ppq;
    const newKH      = viewport.rowHeight * zoomY;
    const centerTick = (minTick + maxTick) / 2;
    const scrollX    = Math.max(0, centerTick * newPPT - viewport.width / 2);
    const centerPitch = (minPitch + maxPitch) / 2;
    const scrollY    = Math.max(0, (127 - centerPitch) * newKH - viewport.height / 2);
    set({
      viewport: {
        ...viewport,
        zoomX, zoomY,
        pixelsPerTick: newPPT,
        keyHeight: newKH,
        scrollX, scrollY,
      },
    });
  },

  zoomToFitAll: () => {
    const { project, viewport } = get();
    const total = get().totalTicks();
    const ppq   = project.settings.ppq;
    const zoomX = Math.max(0.25, Math.min(4, viewport.width / (total * viewport.beatWidth / ppq)));
    set({
      viewport: {
        ...viewport,
        zoomX,
        pixelsPerTick: viewport.beatWidth * zoomX / ppq,
        scrollX: 0,
      },
    });
  },

  setZoomPreset: (level) => {
    const { viewport, project } = get();
    if (level === 'selection') { get().zoomToSelection(); return; }
    if (level === 'far') { get().zoomToFitAll(); return; }
    const zoomX = level === '100' ? 1 : level === '50' ? 0.5 : 0.25;
    set({
      viewport: {
        ...viewport,
        zoomX,
        pixelsPerTick: viewport.beatWidth * zoomX / project.settings.ppq,
      },
    });
  },

  setViewport: (partial) =>
    set((s) => {
      const merged = { ...s.viewport, ...partial };
      const ppq = s.project.settings.ppq;
      // Keep legacy derived fields in sync when zoom or layout fields change
      if ('zoomX' in partial || 'beatWidth' in partial) {
        merged.pixelsPerTick = merged.beatWidth * merged.zoomX / ppq;
      }
      if ('zoomY' in partial || 'rowHeight' in partial) {
        merged.keyHeight = merged.rowHeight * merged.zoomY;
      }
      // If caller sets pixelsPerTick directly (wheel zoom), back-compute zoomX
      if ('pixelsPerTick' in partial && !('zoomX' in partial)) {
        merged.zoomX = partial.pixelsPerTick! * ppq / merged.beatWidth;
      }
      if ('keyHeight' in partial && !('zoomY' in partial)) {
        merged.zoomY = partial.keyHeight! / merged.rowHeight;
      }
      return { viewport: merged };
    }),

  // ── persistence ────────────────────────────────────────────────
  saveProjectToLocalStorage: () => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(get().project));
    } catch (err) {
      console.error('Save failed:', err);
    }
  },

  loadProjectFromLocalStorage: () => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return false;
      const project = JSON.parse(raw) as Project;
      set({ project });
      return true;
    } catch {
      return false;
    }
  },

  exportJSON: () => JSON.stringify(get().project, null, 2),
  exportProjectJson: () => get().exportJSON(),

  importJSON: (json) => {
    try {
      const project = JSON.parse(json) as Project;
      pushHistory(get, set);
      set({ project });
    } catch {
      console.error('Invalid project JSON');
    }
  },
  importProjectJson: (json) => get().importJSON(json),

  replaceProject: (project) => {
    // Auto-migrate pre-pattern projects: wrap project.tracks into a single
    // implicit Pattern 1 so downstream pattern actions are immediately valid.
    const migrated: Project = { ...project };
    if (!migrated.patterns || migrated.patterns.length === 0) {
      const pid = nanoid();
      migrated.patterns = [{
        id: pid,
        name: 'Pattern 1',
        lengthBars: migrated.settings.bars,
        tracks: migrated.tracks,
      }];
      migrated.activePatternId = pid;
    } else if (!migrated.activePatternId
        || !migrated.patterns.some((p) => p.id === migrated.activePatternId)) {
      migrated.activePatternId = migrated.patterns[0].id;
      migrated.tracks = migrated.patterns[0].tracks;
      migrated.activeTrackId = migrated.tracks[0]?.id ?? null;
    }
    set({
      project: migrated,
      _undoStack: [],
      _redoStack: [],
      _transactionSnapshot: null,
      _inTransaction: false,
    });
  },

  importMidi: (imported, mode) => {
    pushHistory(get, set);
    const startIdx = mode === 'append' ? get().project.tracks.length : 0;
    const importedTracks = buildTracksFromImport(imported.tracks, startIdx);
    if (importedTracks.length === 0) return;
    set((s) => {
      const tracks = mode === 'replace'
        ? importedTracks
        : [...s.project.tracks, ...importedTracks];
      const settings = (mode === 'replace' && imported.bpm)
        ? { ...s.project.settings, bpm: imported.bpm }
        : s.project.settings;
      return {
        project: {
          ...s.project,
          settings,
          tracks,
          activeTrackId: importedTracks[0].id,
        },
      };
    });
  },

  // ── MIDI input recording ─────────────────────────────────────────
  isRecording: false,
  recordingScaleSnap: false,
  setRecording: (v) => {
    if (!v) get().flushRecordingNotes();
    set({ isRecording: v });
  },
  setRecordingScaleSnap: (v) => set({ recordingScaleSnap: v }),

  recordedNoteOn: (pitch, velocity, channel) => {
    const { isRecording, playheadTick, recordingScaleSnap } = get();
    const { scaleSnapEnabled, scaleName, scaleRoot, midiChannelThrough, midiChannelColorMap } = get().project.settings;
    if (!isRecording) return;
    let p = Math.max(0, Math.min(127, pitch));
    if (recordingScaleSnap && scaleSnapEnabled && scaleName !== 'none') {
      p = snapPitchToScale(p, scaleRoot, scaleName, 'nearest');
    }
    // Stash channel → colorGroup mapping so the off handler can apply it.
    const colorGroup = midiChannelThrough && channel != null
      ? String(midiChannelColorMap?.[channel] ?? 0)
      : undefined;
    _activeRecordingNotes.set(p, {
      startTick: playheadTick,
      velocity: Math.max(1, Math.min(127, velocity)),
      ...(colorGroup ? { colorGroup } : {}),
    } as { startTick: number; velocity: number; colorGroup?: string });
  },

  recordedNoteOff: (pitch) => {
    const { isRecording, playheadTick, activeTrack, snapTicks } = get();
    if (!isRecording) return;
    const p = Math.max(0, Math.min(127, pitch));
    const inflight = _activeRecordingNotes.get(p);
    if (!inflight) return;
    _activeRecordingNotes.delete(p);
    const track = activeTrack();
    if (!track) return;
    const dur = Math.max(snapTicks(), playheadTick - inflight.startTick);
    // Bypass pushHistory per-note so a long take is one undo (caller wraps
    // an entire recording session in a transaction if desired).
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, track.id, (notes) => [
          ...notes,
          {
            id: nanoid(),
            pitch: p,
            startTick: inflight.startTick,
            durationTicks: dur,
            velocity: inflight.velocity,
            channel: track.channel,
            trackId: track.id,
            ...(inflight.colorGroup ? { colorGroup: inflight.colorGroup } : {}),
          },
        ]),
      },
    }));
  },

  flushRecordingNotes: () => {
    if (_activeRecordingNotes.size === 0) return;
    const { playheadTick, snapTicks, activeTrack } = get();
    const track = activeTrack();
    if (!track) { _activeRecordingNotes.clear(); return; }
    const minDur = snapTicks();
    const pending: Note[] = [];
    _activeRecordingNotes.forEach((meta, pitch) => {
      pending.push({
        id: nanoid(),
        pitch,
        startTick: meta.startTick,
        durationTicks: Math.max(minDur, playheadTick - meta.startTick),
        velocity: meta.velocity,
        channel: track.channel,
        trackId: track.id,
      });
    });
    _activeRecordingNotes.clear();
    pushHistory(get, set);
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, track.id, (notes) => [...notes, ...pending]),
      },
    }));
  },

  // ── history (undo/redo) ────────────────────────────────────────
  _undoStack: [],
  _redoStack: [],
  _transactionSnapshot: null,
  _inTransaction: false,

  beginTransaction: () => {
    const { _inTransaction, project } = get();
    if (_inTransaction) return; // nested begins ignored
    set({ _transactionSnapshot: project, _inTransaction: true });
  },

  commitTransaction: () => {
    const { _transactionSnapshot, _undoStack, project, _inTransaction } = get();
    if (!_inTransaction) return;
    if (_transactionSnapshot && _transactionSnapshot !== project) {
      const next = [..._undoStack, _transactionSnapshot];
      if (next.length > MAX_HISTORY) next.splice(0, next.length - MAX_HISTORY);
      set({ _undoStack: next, _redoStack: [] });
    }
    set({ _transactionSnapshot: null, _inTransaction: false });
  },

  cancelTransaction: () => {
    const { _transactionSnapshot } = get();
    if (_transactionSnapshot) {
      set({ project: _transactionSnapshot });
    }
    set({ _transactionSnapshot: null, _inTransaction: false });
  },

  undo: () => {
    const { _undoStack, _redoStack, project } = get();
    if (_undoStack.length === 0) return;
    const prev = _undoStack[_undoStack.length - 1];
    const nextRedo = [..._redoStack, project];
    if (nextRedo.length > MAX_HISTORY) nextRedo.splice(0, nextRedo.length - MAX_HISTORY);
    set({
      project: prev,
      _undoStack: _undoStack.slice(0, -1),
      _redoStack: nextRedo,
      _transactionSnapshot: null,
      _inTransaction: false,
    });
  },

  redo: () => {
    const { _undoStack, _redoStack, project } = get();
    if (_redoStack.length === 0) return;
    const next = _redoStack[_redoStack.length - 1];
    const nextUndo = [..._undoStack, project];
    if (nextUndo.length > MAX_HISTORY) nextUndo.splice(0, nextUndo.length - MAX_HISTORY);
    set({
      project: next,
      _redoStack: _redoStack.slice(0, -1),
      _undoStack: nextUndo,
      _transactionSnapshot: null,
      _inTransaction: false,
    });
  },

  canUndo: () => get()._undoStack.length > 0,
  canRedo: () => get()._redoStack.length > 0,
}));

// ═══════════════════════════════════════════════════════════════════
//  History helper — used by every editing action above
//  Records the *current* project to the undo stack and clears redo.
//  No-op while a transaction is open (one snapshot recorded at commit).
// ═══════════════════════════════════════════════════════════════════
function pushHistory(
  get: () => ProjectStore,
  set: (partial: Partial<ProjectStore>) => void,
): void {
  const { _inTransaction, _undoStack, project } = get();
  if (_inTransaction) return;
  const next = [..._undoStack, project];
  if (next.length > MAX_HISTORY) next.splice(0, next.length - MAX_HISTORY);
  set({ _undoStack: next, _redoStack: [] });
}
