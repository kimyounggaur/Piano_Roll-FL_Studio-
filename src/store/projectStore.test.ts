import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from './projectStore';

// Reset the store between test cases by reading the implementation's
// createDefaultProject — exported alongside the store for exactly this
// reason. We replace the project + clear history so each test is hermetic.
import { createDefaultProject } from './projectStore';

beforeEach(() => {
  useProjectStore.getState().replaceProject(createDefaultProject());
});

function addNoteAndGet(pitch: number, startTick: number, durationTicks: number) {
  const trackId = useProjectStore.getState().project.tracks[0].id;
  useProjectStore.getState().addNote(trackId, { pitch, startTick, durationTicks, velocity: 100 });
  const track = useProjectStore.getState().project.tracks.find((t) => t.id === trackId)!;
  return { trackId, note: track.notes[track.notes.length - 1] };
}

describe('move invariants', () => {
  it('moveSelectedNotes never produces a negative startTick', () => {
    const { trackId, note } = addNoteAndGet(60, 100, 480);
    useProjectStore.getState().selectNote(trackId, note.id, false);
    useProjectStore.getState().moveSelectedNotes(0, -10_000);
    const moved = useProjectStore.getState().project.tracks[0].notes[0];
    expect(moved.startTick).toBeGreaterThanOrEqual(0);
  });

  it('moveSelectedNotes clamps pitch within [0, 127]', () => {
    const { trackId, note } = addNoteAndGet(60, 0, 480);
    useProjectStore.getState().selectNote(trackId, note.id, false);
    useProjectStore.getState().moveSelectedNotes(200, 0);
    expect(useProjectStore.getState().project.tracks[0].notes[0].pitch).toBe(127);
    useProjectStore.getState().moveSelectedNotes(-300, 0);
    expect(useProjectStore.getState().project.tracks[0].notes[0].pitch).toBe(0);
  });
});

describe('resize invariants', () => {
  it('resizeSelectedNotes never shrinks below snapTicks', () => {
    const { trackId, note } = addNoteAndGet(60, 0, 480);
    useProjectStore.getState().selectNote(trackId, note.id, false);
    const minDur = useProjectStore.getState().snapTicks();
    useProjectStore.getState().resizeSelectedNotes(-10_000);
    const after = useProjectStore.getState().project.tracks[0].notes[0];
    expect(after.durationTicks).toBeGreaterThanOrEqual(minDur);
  });
});

describe('undo / redo', () => {
  it('undo reverses the last add and redo replays it', () => {
    addNoteAndGet(60, 0, 480);
    expect(useProjectStore.getState().project.tracks[0].notes.length).toBe(1);
    useProjectStore.getState().undo();
    expect(useProjectStore.getState().project.tracks[0].notes.length).toBe(0);
    useProjectStore.getState().redo();
    expect(useProjectStore.getState().project.tracks[0].notes.length).toBe(1);
  });
});
