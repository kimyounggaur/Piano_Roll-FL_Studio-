import type { Project, Note } from '../types/music';

export interface NoteExportFilterOptions {
  excludeMutedNotes?: boolean;
  excludeMutedTracks?: boolean;
  colorGroups?: number[];
}

export interface UsedColorGroup {
  group: number;
  count: number;
}

/** Returns the group index a note belongs to. Missing/empty/'0' maps to 0. */
export function parseNoteColorGroup(raw: string | undefined | null): number {
  if (raw == null || raw === '') return 0;
  const group = parseInt(String(raw), 10);
  return Number.isFinite(group) ? group : 0;
}

export function notePassesExportFilter(note: Note, opts: NoteExportFilterOptions = {}): boolean {
  if (opts.excludeMutedNotes !== false && note.muted) return false;
  if (opts.colorGroups && opts.colorGroups.length > 0) {
    return opts.colorGroups.includes(parseNoteColorGroup(note.colorGroup));
  }
  return true;
}

export function countExportableNotes(project: Project, opts: NoteExportFilterOptions = {}): number {
  const excludeMutedTracks = opts.excludeMutedTracks ?? true;
  let count = 0;

  for (const track of project.tracks) {
    if (excludeMutedTracks && track.muted) continue;
    for (const note of track.notes) {
      if (notePassesExportFilter(note, opts)) count += 1;
    }
  }

  return count;
}

export function getUsedColorGroups(project: Project, opts: NoteExportFilterOptions = {}): UsedColorGroup[] {
  const excludeMutedTracks = opts.excludeMutedTracks ?? true;
  const counts = new Map<number, number>();

  for (const track of project.tracks) {
    if (excludeMutedTracks && track.muted) continue;
    for (const note of track.notes) {
      if (!notePassesExportFilter(note, { ...opts, colorGroups: undefined })) continue;
      const group = parseNoteColorGroup(note.colorGroup);
      counts.set(group, (counts.get(group) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([group, count]) => ({ group, count }));
}
