import { describe, expect, it } from 'vitest';
import { Midi } from '@tonejs/midi';
import type { Note, Project, Track } from '../types/music';
import {
  countExportableNotes,
  getUsedColorGroups,
  parseNoteColorGroup,
} from './exportFilters';
import { exportMidi } from './midiFile';
import { exportMusicXml } from './musicXmlFile';

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    pitch: 60,
    startTick: 0,
    durationTicks: 120,
    velocity: 90,
    ...overrides,
  };
}

function track(overrides: Partial<Track> = {}): Track {
  return {
    id: 't1',
    name: 'Track 1',
    color: '#9fe870',
    instrument: { type: 'synth' },
    channel: 1,
    muted: false,
    solo: false,
    volume: 1,
    pan: 0,
    notes: [],
    ...overrides,
  };
}

function project(tracks: Track[]): Project {
  return {
    name: 'Test Project',
    tracks,
    activeTrackId: tracks[0]?.id ?? null,
    settings: {
      bpm: 120,
      ppq: 480,
      timeSignature: { numerator: 4, denominator: 4 },
      bars: 4,
      loopStartTick: 0,
      loopEndTick: 0,
      snapUnit: '1/4',
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
      strumAmountTicks: 40,
      strumDirection: 'up',
      arpPattern: 'up',
      arpStepTicks: 120,
      arpRepeatCount: 1,
      arpReplaceOriginals: true,
      randomVelMin: 64,
      randomVelMax: 110,
      scaleVelocityAmount: 1,
      ghostNotesVisible: true,
      ghostDoubleClickActivates: true,
    },
  };
}

describe('exportFilters', () => {
  it('normalizes missing or invalid note color groups to group 0', () => {
    expect(parseNoteColorGroup(undefined)).toBe(0);
    expect(parseNoteColorGroup('')).toBe(0);
    expect(parseNoteColorGroup('nope')).toBe(0);
    expect(parseNoteColorGroup('4')).toBe(4);
  });

  it('counts only notes matching the requested color group filter', () => {
    const p = project([
      track({
        notes: [
          note({ id: 'a' }),
          note({ id: 'b', colorGroup: '3' }),
          note({ id: 'c', colorGroup: '3', muted: true }),
          note({ id: 'd', colorGroup: '5' }),
        ],
      }),
      track({
        id: 'muted',
        muted: true,
        notes: [note({ id: 'e', colorGroup: '3' })],
      }),
    ]);

    expect(countExportableNotes(p, { colorGroups: [3] })).toBe(1);
    expect(countExportableNotes(p, { colorGroups: [3], excludeMutedNotes: false })).toBe(2);
    expect(countExportableNotes(p, { colorGroups: [3], excludeMutedTracks: false })).toBe(2);
    expect(countExportableNotes(p, { colorGroups: [9] })).toBe(0);
  });

  it('returns sorted color groups that actually have exportable notes', () => {
    const p = project([
      track({
        notes: [
          note({ id: 'a', colorGroup: '5' }),
          note({ id: 'b' }),
          note({ id: 'c', colorGroup: '5', muted: true }),
          note({ id: 'd', colorGroup: '2' }),
        ],
      }),
    ]);

    expect(getUsedColorGroups(p)).toEqual([
      { group: 0, count: 1 },
      { group: 2, count: 1 },
      { group: 5, count: 1 },
    ]);
  });

  it('exports a MIDI file with only the requested color group notes', async () => {
    const p = project([
      track({
        notes: [
          note({ id: 'c', pitch: 60, colorGroup: '3' }),
          note({ id: 'd', pitch: 62, colorGroup: '5' }),
        ],
      }),
    ]);

    const { blob } = exportMidi(p, { colorGroups: [3] });
    const midi = new Midi(await blob.arrayBuffer());
    const pitches = midi.tracks.flatMap((midiTrack) => midiTrack.notes.map((midiNote) => midiNote.midi));

    expect(pitches).toEqual([60]);
  });

  it('exports MusicXML with only the requested color group notes', async () => {
    const p = project([
      track({
        notes: [
          note({ id: 'c', pitch: 60, colorGroup: '3' }),
          note({ id: 'd', pitch: 62, colorGroup: '5' }),
        ],
      }),
    ]);

    const { blob } = exportMusicXml(p, { colorGroups: [5] });
    const xml = await blob.text();

    expect(xml).toContain('<step>D</step>');
    expect(xml).not.toContain('<step>C</step>');
  });
});
