import { quantizeNote, humanizeNotes } from './noteTransforms';
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
}
