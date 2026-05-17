import { create } from 'zustand';
import type {
  Project, Track, Note, ProjectSettings,
  Viewport, EditTool,
} from '../types/music';
import { ticksPerBar, snapUnitToTicks, snapTick } from '../utils/time';

// ── Defaults ──────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: ProjectSettings = {
  bpm: 120,
  ppq: 480,
  timeSignature: { numerator: 4, denominator: 4 },
  bars: 8,
  loopStartTick: 0,
  loopEndTick: 0,
  snapUnit: '1/16',
  scaleRoot: 0,
  scaleName: 'none',
};

const DEFAULT_VIEWPORT: Viewport = {
  scrollX: 0,
  scrollY: 0,
  pixelsPerTick: 0.25,
  keyHeight: 14,
};

function makeTrack(name: string, color: string): Track {
  return {
    id: nanoid(),
    name,
    color,
    instrument: { type: 'synth', preset: 'triangle' },
    channel: 1,
    muted: false,
    solo: false,
    volume: 1.0,
    pan: 0,
    notes: [],
  };
}

// ── Store shape ───────────────────────────────────────────────────────
interface ProjectStore {
  project: Project;
  viewport: Viewport;
  activeTool: EditTool;
  playheadTick: number;
  isPlaying: boolean;
  isLooping: boolean;
  isMetronome: boolean;

  // project mutations
  setProjectName: (name: string) => void;
  updateSettings: (partial: Partial<ProjectSettings>) => void;

  // track mutations
  addTrack: () => void;
  removeTrack: (id: string) => void;
  setActiveTrack: (id: string) => void;
  updateTrack: (id: string, partial: Partial<Omit<Track, 'id' | 'notes'>>) => void;

  // note mutations
  addNote: (trackId: string, note: Omit<Note, 'id'>) => void;
  removeNote: (trackId: string, noteId: string) => void;
  updateNote: (trackId: string, noteId: string, partial: Partial<Note>) => void;
  setNotes: (trackId: string, notes: Note[]) => void;
  selectNote: (trackId: string, noteId: string, multi: boolean) => void;
  clearSelection: () => void;
  deleteSelected: () => void;

  // viewport
  setViewport: (partial: Partial<Viewport>) => void;

  // tool
  setActiveTool: (tool: EditTool) => void;

  // transport state
  setPlayheadTick: (tick: number) => void;
  setIsPlaying: (v: boolean) => void;
  setIsLooping: (v: boolean) => void;
  setIsMetronome: (v: boolean) => void;

  // persistence
  exportJSON: () => string;
  importJSON: (json: string) => void;

  // computed helpers
  snapTickValue: (tick: number) => number;
  totalTicks: () => number;
}

// ── Implementation ────────────────────────────────────────────────────
export const useProjectStore = create<ProjectStore>((set, get) => {
  const initialTrack = makeTrack('Track 1', '#4a9eff');
  return {
    project: {
      name: 'New Project',
      settings: DEFAULT_SETTINGS,
      tracks: [initialTrack],
      activeTrackId: initialTrack.id,
    },
    viewport: DEFAULT_VIEWPORT,
    activeTool: 'draw',
    playheadTick: 0,
    isPlaying: false,
    isLooping: true,
    isMetronome: false,

    setProjectName: (name) =>
      set((s) => ({ project: { ...s.project, name } })),

    updateSettings: (partial) =>
      set((s) => ({
        project: {
          ...s.project,
          settings: { ...s.project.settings, ...partial },
        },
      })),

    addTrack: () =>
      set((s) => {
        const colors = ['#4a9eff', '#ff6b6b', '#6bcb77', '#ffd93d', '#c77dff', '#ff9f43'];
        const color = colors[s.project.tracks.length % colors.length];
        const track = makeTrack(`Track ${s.project.tracks.length + 1}`, color);
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
          tracks: s.project.tracks.map((t) =>
            t.id === id ? { ...t, ...partial } : t
          ),
        },
      })),

    addNote: (trackId, note) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? { ...t, notes: [...t.notes, { ...note, id: nanoid() }] }
              : t
          ),
        },
      })),

    removeNote: (trackId, noteId) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? { ...t, notes: t.notes.filter((n) => n.id !== noteId) }
              : t
          ),
        },
      })),

    updateNote: (trackId, noteId, partial) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId
              ? {
                  ...t,
                  notes: t.notes.map((n) =>
                    n.id === noteId ? { ...n, ...partial } : n
                  ),
                }
              : t
          ),
        },
      })),

    setNotes: (trackId, notes) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) =>
            t.id === trackId ? { ...t, notes } : t
          ),
        },
      })),

    selectNote: (trackId, noteId, multi) =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => {
            if (t.id !== trackId) {
              return multi ? t : { ...t, notes: t.notes.map((n) => ({ ...n, selected: false })) };
            }
            return {
              ...t,
              notes: t.notes.map((n) => ({
                ...n,
                selected: n.id === noteId ? true : multi ? !!n.selected : false,
              })),
            };
          }),
        },
      })),

    clearSelection: () =>
      set((s) => ({
        project: {
          ...s.project,
          tracks: s.project.tracks.map((t) => ({
            ...t,
            notes: t.notes.map((n) => ({ ...n, selected: false })),
          })),
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

    setViewport: (partial) =>
      set((s) => ({ viewport: { ...s.viewport, ...partial } })),

    setActiveTool: (tool) => set({ activeTool: tool }),

    setPlayheadTick: (tick) => set({ playheadTick: tick }),
    setIsPlaying: (v) => set({ isPlaying: v }),
    setIsLooping: (v) => set({ isLooping: v }),
    setIsMetronome: (v) => set({ isMetronome: v }),

    exportJSON: () => {
      const { project } = get();
      return JSON.stringify(project, null, 2);
    },

    importJSON: (json) => {
      try {
        const project = JSON.parse(json) as Project;
        set({ project });
      } catch {
        console.error('Invalid project JSON');
      }
    },

    snapTickValue: (tick) => {
      const { settings } = get().project;
      const snapTicks = snapUnitToTicks(settings.snapUnit, settings.ppq);
      return snapTick(tick, snapTicks);
    },

    totalTicks: () => {
      const { settings } = get().project;
      return ticksPerBar(settings.ppq, settings.timeSignature) * settings.bars;
    },
  };
});

// Convenience: nanoid shim (Vite already includes it via zustand deps, but be explicit)
function nanoid(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}
