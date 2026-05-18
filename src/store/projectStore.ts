import { create } from 'zustand';
import type {
  Project, Track, Note, NoteId, TrackId,
  ProjectSettings, PianoRollViewport, PianoRollTool,
  SnapValue, ScaleType,
} from '../types/music';
import { ticksPerBar, snapUnitToTicks, snapTick } from '../utils/time';
import { DEFAULT_PPQ, DEFAULT_BPM } from '../types/music';

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
//  Pure helpers (no store access — easy to unit-test)
// ═══════════════════════════════════════════════════════════════════

/** Closest SnapValue for an arbitrary tick count. */
function ticksToSnapValue(ticks: number, ppq: number): SnapValue {
  const UNITS: SnapValue[] = ['1/1','1/2','1/4','1/8','1/16','1/32','1/64'];
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
  /** Select all notes inside a tick/pitch rectangle (rubber-band). */
  selectNotesInRect: (rect: SelectionRect) => void;
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

  // ── transport ────────────────────────────────────────────────────
  setPlayheadTick: (tick: number) => void;
  setIsPlaying: (v: boolean) => void;
  setIsLooping: (v: boolean) => void;
  setIsMetronome: (v: boolean) => void;

  // ── viewport ─────────────────────────────────────────────────────
  setViewport: (partial: Partial<PianoRollViewport>) => void;

  // ── persistence ──────────────────────────────────────────────────
  saveProjectToLocalStorage: () => void;
  loadProjectFromLocalStorage: () => boolean;
  exportJSON: () => string;
  /** Alias for exportJSON. */
  exportProjectJson: () => string;
  importJSON: (json: string) => void;
  /** Alias for importJSON. */
  importProjectJson: (json: string) => void;
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
  setProjectName: (name) =>
    set((s) => ({ project: { ...s.project, name } })),

  updateSettings: (partial) =>
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, ...partial } },
    })),

  setBpm: (bpm) =>
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, bpm: Math.max(1, Math.min(999, bpm)) } },
    })),

  setSnapUnit: (unit) =>
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, snapUnit: unit } },
    })),

  setSnapTicks: (ticks) => {
    const { ppq } = get().project.settings;
    const unit = ticksToSnapValue(ticks, ppq);
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, snapUnit: unit } },
    }));
  },

  setTool: (tool) => set({ activeTool: tool }),
  setActiveTool: (tool) => set({ activeTool: tool }),

  setScale: (root, scaleName) =>
    set((s) => ({
      project: { ...s.project, settings: { ...s.project.settings, scaleRoot: root, scaleName } },
    })),

  // ── tracks ─────────────────────────────────────────────────────
  addTrack: () =>
    set((s) => {
      const track = makeTrack(`트랙 ${s.project.tracks.length + 1}`, s.project.tracks.length);
      return {
        project: {
          ...s.project,
          tracks: [...s.project.tracks, track],
          activeTrackId: track.id,
        },
      };
    }),

  removeTrack: (id) =>
    set((s) => {
      if (s.project.tracks.length <= 1) return s; // never remove last track
      const tracks = s.project.tracks.filter((t) => t.id !== id);
      const activeTrackId =
        s.project.activeTrackId === id ? (tracks[0]?.id ?? null) : s.project.activeTrackId;
      return { project: { ...s.project, tracks, activeTrackId } };
    }),

  setActiveTrack: (id) =>
    set((s) => ({ project: { ...s.project, activeTrackId: id } })),

  updateTrack: (id, partial) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === id ? { ...t, ...partial } : t),
      },
    })),

  toggleTrackMute: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === id ? { ...t, muted: !t.muted } : t),
      },
    })),

  toggleTrackSolo: (id) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === id ? { ...t, solo: !t.solo } : t),
      },
    })),

  // ── notes (individual) ─────────────────────────────────────────
  addNote: (trackId, note) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) => [
          ...notes, { ...note, id: nanoid(), selected: false },
        ]),
      },
    })),

  removeNote: (trackId, noteId) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateTrackNotes(s.project.tracks, trackId, (notes) =>
          notes.filter((n) => n.id !== noteId)
        ),
      },
    })),

  deleteNote: (trackId, noteId) => get().removeNote(trackId, noteId),

  updateNote: (trackId, noteId, partial) => {
    const { totalTicks, snapTicks } = get();
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

  setNotes: (trackId, notes) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => t.id === trackId ? { ...t, notes } : t),
      },
    })),

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

  selectNotesInRect: ({ startTick, endTick, minPitch, maxPitch }) =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => {
          if (t.id !== s.project.activeTrackId) return t;
          return {
            ...t,
            notes: t.notes.map((n) => ({
              ...n,
              selected:
                n.startTick >= startTick &&
                n.startTick + n.durationTicks <= endTick &&
                n.pitch     >= minPitch &&
                n.pitch     <= maxPitch,
            })),
          };
        }),
      },
    })),

  deleteSelected: () =>
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          notes: t.notes.filter((n) => !n.selected),
        })),
      },
    })),

  moveSelectedNotes: (deltaPitch, deltaTicks) => {
    const { totalTicks, snapTicks } = get();
    const total = totalTicks();
    const minDur = snapTicks();
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => ({
          ...t,
          notes: t.notes.map((n) => {
            if (!n.selected) return n;
            return applyNotePatch(
              n,
              { pitch: n.pitch + deltaPitch, startTick: n.startTick + deltaTicks },
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

  duplicateSelectedNotes: () => {
    const { project } = get();
    const barTicks = ticksPerBar(project.settings.ppq, project.settings.timeSignature);
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
    set((s) => ({
      project: {
        ...s.project,
        tracks: updateAllNotes(s.project.tracks, (n) =>
          n.selected ? { ...n, velocity: vel } : n
        ),
      },
    }));
  },

  // ── transport ──────────────────────────────────────────────────
  setPlayheadTick: (tick) => set({ playheadTick: tick }),
  setIsPlaying:    (v)    => set({ isPlaying: v }),
  setIsLooping:    (v)    => set({ isLooping: v }),
  setIsMetronome:  (v)    => set({ isMetronome: v }),

  // ── viewport ───────────────────────────────────────────────────
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
      set({ project });
    } catch {
      console.error('Invalid project JSON');
    }
  },
  importProjectJson: (json) => get().importJSON(json),
}));
