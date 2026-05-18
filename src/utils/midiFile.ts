import { Midi } from '@tonejs/midi';
import type { Project, Track, Note, TrackId, NoteId } from '../types/music';
import { DEFAULT_PPQ } from '../types/music';

// ═══════════════════════════════════════════════════════════════════
//  Types returned by importMidi — pre-id, pre-style. The store turns
//  these into real Track records and assigns ids.
// ═══════════════════════════════════════════════════════════════════
export interface ImportedNote {
  pitch: number;
  startTick: number;
  durationTicks: number;
  velocity: number;
  channel?: number;
}

export interface ImportedTrack {
  name: string;
  channel: number;
  notes: ImportedNote[];
}

export interface ImportedMidi {
  bpm: number | null;
  tracks: ImportedTrack[];
  /** Source ppq for diagnostics; ticks have already been converted. */
  sourcePpq: number;
}

// ═══════════════════════════════════════════════════════════════════
//  Constants
// ═══════════════════════════════════════════════════════════════════
const TARGET_PPQ = DEFAULT_PPQ; // 480
const TRACK_COLORS = [
  '#9fe870', '#ffc091', '#ffd11a', '#38c8ff',
  '#cdffad', '#d03238', '#e2f6d5', '#868685',
] as const;

function nanoid(): string {
  return Math.random().toString(36).slice(2, 11) + Date.now().toString(36);
}

// ═══════════════════════════════════════════════════════════════════
//  Import
//  Throws if the buffer isn't a parseable Standard MIDI File.
// ═══════════════════════════════════════════════════════════════════
export function importMidi(buf: ArrayBuffer): ImportedMidi {
  const midi = new Midi(buf);
  const sourcePpq = midi.header.ppq || TARGET_PPQ;
  const scale = TARGET_PPQ / sourcePpq;

  const bpm = midi.header.tempos[0]?.bpm ?? null;

  const tracks: ImportedTrack[] = [];
  for (const t of midi.tracks) {
    if (t.notes.length === 0) continue; // requirement 7: skip empty tracks
    const channel = (t.channel ?? 0) + 1;
    const name = t.name?.trim() || (t.instrument?.name ? t.instrument.name : `Track ${tracks.length + 1}`);
    const notes: ImportedNote[] = t.notes.map((n) => ({
      pitch:         Math.max(0, Math.min(127, n.midi)),
      startTick:     Math.round(n.ticks * scale),
      // @tonejs/midi guarantees durationTicks on parsed notes.
      durationTicks: Math.max(1, Math.round(n.durationTicks * scale)),
      // tonejs/midi velocity is 0..1; convert to MIDI 1..127.
      velocity:      Math.max(1, Math.min(127, Math.round((n.velocity ?? 0.78) * 127))),
      channel,
    }));
    tracks.push({ name, channel, notes });
  }
  return { bpm, tracks, sourcePpq };
}

// ═══════════════════════════════════════════════════════════════════
//  buildTracksFromImport — used by the store to materialize Track records.
// ═══════════════════════════════════════════════════════════════════
export function buildTracksFromImport(imported: ImportedTrack[], startColorIndex = 0): Track[] {
  return imported.map((t, i) => {
    const tid: TrackId = nanoid();
    const notes: Note[] = t.notes.map<Note>((n) => ({
      id: nanoid() as NoteId,
      pitch: n.pitch,
      startTick: n.startTick,
      durationTicks: n.durationTicks,
      velocity: n.velocity,
      channel: n.channel,
      trackId: tid,
    }));
    return {
      id: tid,
      name: t.name,
      color: TRACK_COLORS[(startColorIndex + i) % TRACK_COLORS.length],
      instrument: { type: 'synth', preset: 'triangle' },
      channel: t.channel,
      muted: false,
      solo: false,
      volume: 1,
      pan: 0,
      notes,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════
//  Export
// ═══════════════════════════════════════════════════════════════════
export interface ExportOptions {
  /** Skip every note where `muted === true`. Default true. */
  excludeMutedNotes?: boolean;
  /** Skip every track where `muted === true`. Default true. */
  excludeMutedTracks?: boolean;
  /** File-name override (without extension). */
  fileName?: string;
}

/** Returns an export-ready { blob, fileName } pair. */
export function exportMidi(project: Project, opts: ExportOptions = {}): { blob: Blob; fileName: string } {
  const excludeMutedNotes  = opts.excludeMutedNotes  ?? true;
  const excludeMutedTracks = opts.excludeMutedTracks ?? true;

  const midi = new Midi();
  midi.header.fromJSON({
    ...midi.header.toJSON(),
    name: project.name,
    ppq: project.settings.ppq || TARGET_PPQ,
  });
  // Tempo at time 0.
  midi.header.setTempo(project.settings.bpm);
  midi.header.timeSignatures.push({
    ticks: 0,
    timeSignature: [project.settings.timeSignature.numerator, project.settings.timeSignature.denominator],
    measures: 0,
  });

  for (const track of project.tracks) {
    if (excludeMutedTracks && track.muted) continue;
    const mt = midi.addTrack();
    mt.name = track.name;
    mt.channel = Math.max(0, (track.channel ?? 1) - 1);
    for (const n of track.notes) {
      if (excludeMutedNotes && n.muted) continue;
      mt.addNote({
        midi: n.pitch,
        ticks: n.startTick,
        durationTicks: Math.max(1, n.durationTicks),
        velocity: Math.max(0.01, Math.min(1, n.velocity / 127)),
      });
    }
  }

  const bytes = midi.toArray();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'audio/midi' });
  return { blob, fileName: opts.fileName ? `${opts.fileName}.mid` : defaultFileName() };
}

/** Trigger a browser download for the given blob. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke after the click is processed.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function defaultFileName(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `rolllab-project-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.mid`;
}
