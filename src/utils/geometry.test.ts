import { describe, it, expect } from 'vitest';
import {
  tickToX, xToTick, pitchToY, yToPitch, clamp,
  buildNoteIndex, forEachVisibleNote, rectsIntersect, rectContainsPoint,
} from './geometry';
import type { PianoRollViewport as Viewport, Note } from '../types/music';

function vp(over: Partial<Viewport> = {}): Viewport {
  return {
    scrollX: 0,
    scrollY: 0,
    zoomX: 1,
    zoomY: 1,
    rowHeight: 18,
    beatWidth: 96,
    minPitch: 0,
    maxPitch: 127,
    width: 800,
    height: 500,
    pixelsPerTick: 96 / 480,
    keyHeight: 18,
    ...over,
  };
}

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: 'n', pitch: 60, startTick: 0, durationTicks: 480, velocity: 100,
    ...over,
  };
}

describe('geometry roundtrips', () => {
  it('tickToX ↔ xToTick (no scroll)', () => {
    const v = vp();
    expect(xToTick(tickToX(960, v), v)).toBeCloseTo(960, 5);
    expect(xToTick(tickToX(0, v), v)).toBeCloseTo(0, 5);
  });

  it('tickToX ↔ xToTick (with scroll)', () => {
    const v = vp({ scrollX: 240 });
    expect(xToTick(tickToX(1000, v), v)).toBeCloseTo(1000, 5);
  });

  it('pitchToY ↔ yToPitch', () => {
    const v = vp();
    for (const p of [0, 30, 60, 96, 127]) {
      // yToPitch reads the row containing y; pitch -> y returns the row top.
      // Adding 1px to stay inside the row ensures we get the same pitch back.
      expect(yToPitch(pitchToY(p, v) + 1, v)).toBe(p);
    }
  });

  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('rect helpers', () => {
  it('rectContainsPoint inclusive', () => {
    const r = { x: 10, y: 10, w: 20, h: 20 };
    expect(rectContainsPoint(r, 10, 10)).toBe(true);
    expect(rectContainsPoint(r, 30, 30)).toBe(true);
    expect(rectContainsPoint(r, 9, 10)).toBe(false);
  });

  it('rectsIntersect', () => {
    const a = { x: 0, y: 0, w: 10, h: 10 };
    const b = { x: 5, y: 5, w: 10, h: 10 };
    const c = { x: 11, y: 0, w: 5, h: 5 };
    expect(rectsIntersect(a, b)).toBe(true);
    expect(rectsIntersect(a, c)).toBe(false);
  });
});

describe('buildNoteIndex / forEachVisibleNote', () => {
  it('skips far-future notes via early break', () => {
    const notes: Note[] = [
      makeNote({ id: 'a', startTick: 0,    durationTicks: 100 }),
      makeNote({ id: 'b', startTick: 500,  durationTicks: 100 }),
      makeNote({ id: 'c', startTick: 5000, durationTicks: 100 }),
    ];
    const idx = buildNoteIndex(notes);
    const seen: string[] = [];
    forEachVisibleNote(idx, 0, 1000, 0, 127, (n) => seen.push(n.id));
    expect(seen).toEqual(['a', 'b']);
  });

  it('rewinds via maxDuration so long notes stretching into view are caught', () => {
    const notes: Note[] = [
      makeNote({ id: 'long', startTick: 0,    durationTicks: 10_000 }),
      makeNote({ id: 'a',    startTick: 9_000, durationTicks: 100 }),
    ];
    const idx = buildNoteIndex(notes);
    const seen: string[] = [];
    forEachVisibleNote(idx, 9_000, 9_500, 0, 127, (n) => seen.push(n.id));
    expect(seen).toContain('long');
    expect(seen).toContain('a');
  });

  it('respects pitch bounds', () => {
    const notes: Note[] = [
      makeNote({ id: 'low',  pitch: 30 }),
      makeNote({ id: 'mid',  pitch: 60 }),
      makeNote({ id: 'high', pitch: 90 }),
    ];
    const idx = buildNoteIndex(notes);
    const seen: string[] = [];
    forEachVisibleNote(idx, 0, 1000, 50, 70, (n) => seen.push(n.id));
    expect(seen).toEqual(['mid']);
  });
});
