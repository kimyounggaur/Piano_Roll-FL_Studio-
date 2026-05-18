import { quantizeNote, humanizeNotes, strumNotes, arpeggiateNotes } from './noteTransforms';
import { describe, it } from 'vitest';
import type { Note } from '../types/music';

function makeNote(over: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    pitch: 60,
    startTick: 0,
    durationTicks: 480,
    velocity: 100,
    ...over,
  };
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectInRange(actual: number, min: number, max: number, message: string): void {
  if (actual < min || actual > max) {
    throw new Error(`${message}: expected ${actual} to be between ${min} and ${max}`);
  }
}

export function runNoteTransformChecks(): void {
  expectEqual(
    quantizeNote(makeNote({ startTick: 95 }), { gridTicks: 120, strength: 1 }).startTick,
    120,
    'full quantize snaps to nearest grid',
  );

  expectEqual(
    quantizeNote(makeNote({ startTick: 100 }), { gridTicks: 120, strength: 0.5 }).startTick,
    110,
    'half strength quantize moves halfway',
  );

  expectEqual(
    quantizeNote(makeNote({ startTick: 73 }), { gridTicks: 120, strength: 0 }).startTick,
    73,
    'zero strength leaves start tick unchanged',
  );

  expectEqual(
    quantizeNote(makeNote({ durationTicks: 470 }), { gridTicks: 120, strength: 1 }).durationTicks,
    470,
    'duration is unchanged unless enabled',
  );

  expectEqual(
    quantizeNote(makeNote({ durationTicks: 470 }), {
      gridTicks: 120,
      strength: 1,
      quantizeDuration: true,
    }).durationTicks,
    480,
    'duration quantizes to nearest grid multiple',
  );

  const seededA = humanizeNotes([makeNote({ startTick: 1000, velocity: 100 })], {
    timingAmountTicks: 20,
    velocityAmount: 10,
    seed: 42,
  });
  const seededB = humanizeNotes([makeNote({ startTick: 1000, velocity: 100 })], {
    timingAmountTicks: 20,
    velocityAmount: 10,
    seed: 42,
  });
  expectEqual(JSON.stringify(seededA), JSON.stringify(seededB), 'seeded humanize is deterministic');

  const timingOut = humanizeNotes(
    Array.from({ length: 100 }, (_, i) => makeNote({ id: `n${i}`, startTick: 1000 })),
    { timingAmountTicks: 15, velocityAmount: 0, seed: 1 },
  );
  for (const note of timingOut) {
    expectInRange(note.startTick, 985, 1015, 'humanize timing stays within range');
  }

  const velocityOut = humanizeNotes(
    [makeNote({ id: 'a', velocity: 1 }), makeNote({ id: 'b', velocity: 127 })],
    { timingAmountTicks: 0, velocityAmount: 50, seed: 7 },
  );
  for (const note of velocityOut) {
    expectInRange(note.velocity, 1, 127, 'humanize velocity stays within MIDI range');
  }

  expectInRange(
    humanizeNotes([makeNote({ startTick: 5 })], {
      timingAmountTicks: 100,
      velocityAmount: 0,
      seed: 3,
    })[0].startTick,
    0,
    Number.MAX_SAFE_INTEGER,
    'humanize never creates negative start ticks',
  );

  // ── Strum ────────────────────────────────────────────────────────────
  // 4-note chord at tick 1000, strum down 60 ticks → step = 20.
  // direction 'down' = highest pitch first (offset 0), lowest last (offset 60).
  const chord = [
    makeNote({ id: 'c1', pitch: 60, startTick: 1000 }),
    makeNote({ id: 'c2', pitch: 64, startTick: 1003 }),  // within tolerance
    makeNote({ id: 'c3', pitch: 67, startTick: 1000 }),
    makeNote({ id: 'c4', pitch: 71, startTick: 1002 }),
  ];
  const strDown = strumNotes(chord, { amountTicks: 60, direction: 'down' });
  const byId = new Map(strDown.map((n) => [n.id, n]));
  // Anchor = min startTick = 1000. Pitches sorted desc: 71, 67, 64, 60.
  expectEqual(byId.get('c4')!.startTick, 1000, 'strum down highest pitch first');
  expectEqual(byId.get('c3')!.startTick, 1020, 'strum down second note offset');
  expectEqual(byId.get('c2')!.startTick, 1040, 'strum down third note offset');
  expectEqual(byId.get('c1')!.startTick, 1060, 'strum down lowest pitch last');

  // 'up' reverses order: lowest pitch first
  const strUp = strumNotes(chord, { amountTicks: 60, direction: 'up' });
  const byIdU = new Map(strUp.map((n) => [n.id, n]));
  expectEqual(byIdU.get('c1')!.startTick, 1000, 'strum up lowest pitch first');
  expectEqual(byIdU.get('c4')!.startTick, 1060, 'strum up highest pitch last');

  // Notes outside the group tolerance are left alone
  const mixed = [
    makeNote({ id: 'a', pitch: 60, startTick: 0 }),
    makeNote({ id: 'b', pitch: 64, startTick: 5 }),
    makeNote({ id: 'far', pitch: 67, startTick: 2000 }),   // separate group
  ];
  const strMixed = strumNotes(mixed, { amountTicks: 40, direction: 'down' });
  const byIdM = new Map(strMixed.map((n) => [n.id, n]));
  expectEqual(byIdM.get('far')!.startTick, 2000, 'strum leaves out-of-group notes alone');

  // startTick clamp to 0 — anchor 5, step 40 going down would underflow for the last,
  // but anchor stays at min so worst case offset = +amount; never negative here.
  expectInRange(byIdM.get('a')!.startTick, 0, Number.MAX_SAFE_INTEGER, 'strum never negative');

  // ── Arpeggiate ───────────────────────────────────────────────────────
  // C-major chord (60, 64, 67) at tick 0, step 120, repeat 2, 'up' pattern
  const cMajor = [
    makeNote({ id: 'r1', pitch: 60, startTick: 0, velocity: 90 }),
    makeNote({ id: 'r2', pitch: 64, startTick: 0, velocity: 100 }),
    makeNote({ id: 'r3', pitch: 67, startTick: 0, velocity: 110 }),
  ];
  const arpUp = arpeggiateNotes(cMajor, { pattern: 'up', stepTicks: 120, repeatCount: 2 });
  expectEqual(arpUp.length, 6, 'arp up produces noteCount × repeatCount notes');
  expectEqual(arpUp[0].pitch, 60, 'arp up starts with lowest pitch');
  expectEqual(arpUp[1].pitch, 64, 'arp up second pitch');
  expectEqual(arpUp[2].pitch, 67, 'arp up third pitch');
  expectEqual(arpUp[3].pitch, 60, 'arp up repeats from lowest');
  expectEqual(arpUp[0].startTick, 0, 'arp first note at anchor');
  expectEqual(arpUp[1].startTick, 120, 'arp second note at +stepTicks');
  expectEqual(arpUp[1].durationTicks, 96, 'arp duration = stepTicks * 0.8');
  expectEqual(arpUp[0].velocity, 100, 'arp velocity = average of source notes');

  const arpDown = arpeggiateNotes(cMajor, { pattern: 'down', stepTicks: 60, repeatCount: 1 });
  expectEqual(arpDown[0].pitch, 67, 'arp down starts with highest pitch');
  expectEqual(arpDown[2].pitch, 60, 'arp down ends with lowest pitch');

  const arpUpDown = arpeggiateNotes(cMajor, { pattern: 'upDown', stepTicks: 60, repeatCount: 1 });
  // up=[60,64,67], down without dup endpoints = [64] → sequence [60,64,67,64]
  expectEqual(arpUpDown.length, 4, 'upDown skips endpoint duplication');
  expectEqual(arpUpDown[3].pitch, 64, 'upDown ends mid-chord');

  // Random pattern is deterministic when seeded
  const r1 = arpeggiateNotes(cMajor, { pattern: 'random', stepTicks: 60, repeatCount: 2, seed: 99 });
  const r2 = arpeggiateNotes(cMajor, { pattern: 'random', stepTicks: 60, repeatCount: 2, seed: 99 });
  expectEqual(
    r1.map((n) => n.pitch).join(','),
    r2.map((n) => n.pitch).join(','),
    'seeded random arp is deterministic',
  );
}

describe('noteTransforms', () => {
  it('quantize / humanize / strum / arpeggiate', () => {
    runNoteTransformChecks();
  });
});
