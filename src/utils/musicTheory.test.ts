import { describe, it, expect } from 'vitest';
import { isPitchInScale, snapPitchToScale, buildChord } from './musicTheory';

describe('isPitchInScale', () => {
  it('C major includes C, D, E, F, G, A, B and rejects accidentals', () => {
    // root = 0 (C), pitch 60 = C4
    expect(isPitchInScale(60, 0, 'major')).toBe(true); // C
    expect(isPitchInScale(62, 0, 'major')).toBe(true); // D
    expect(isPitchInScale(64, 0, 'major')).toBe(true); // E
    expect(isPitchInScale(61, 0, 'major')).toBe(false); // C#
    expect(isPitchInScale(63, 0, 'major')).toBe(false); // D#
  });

  it('returns true for any pitch when scale is none', () => {
    expect(isPitchInScale(61, 0, 'none')).toBe(true);
  });
});

describe('snapPitchToScale', () => {
  it('nearest mode pulls accidentals onto the closest scale tone', () => {
    const out = snapPitchToScale(61, 0, 'major', 'nearest');
    // C# (61) → nearest scale tones are C (60) and D (62); both equidistant.
    expect([60, 62]).toContain(out);
  });

  it('returns the input pitch when already in-scale', () => {
    expect(snapPitchToScale(60, 0, 'major', 'nearest')).toBe(60);
  });
});

describe('buildChord', () => {
  it('major triad has root, major third, perfect fifth', () => {
    expect(buildChord(60, 'major')).toEqual([60, 64, 67]);
  });

  it('minor triad has root, minor third, perfect fifth', () => {
    expect(buildChord(60, 'minor')).toEqual([60, 63, 67]);
  });

  it('clamps overflow pitches by shifting an octave down', () => {
    const out = buildChord(126, 'major'); // 126 + 4 = 130 -> would overflow
    out.forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
    out.forEach((p) => expect(p).toBeLessThanOrEqual(127));
  });
});
