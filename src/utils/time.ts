import type { SnapUnit, TimeSignature } from '../types/music';

export function ticksPerBar(ppq: number, ts: TimeSignature): number {
  // one bar = numerator beats, each beat = ppq * (4/denominator) ticks
  return ppq * 4 * (ts.numerator / ts.denominator);
}

export function ticksPerBeat(ppq: number, ts: TimeSignature): number {
  return ppq * (4 / ts.denominator);
}

export function snapUnitToTicks(unit: SnapUnit, ppq: number): number {
  const tripletFactor = unit.endsWith('T') ? 2 / 3 : 1;
  const base = unit.replace('T', '') as Exclude<SnapUnit, `${string}T`>;
  const map: Record<string, number> = {
    '1/1':  ppq * 4,
    '1/2':  ppq * 2,
    '1/4':  ppq,
    '1/8':  ppq / 2,
    '1/16': ppq / 4,
    '1/32': ppq / 8,
    '1/64': ppq / 16,
  };
  return Math.round((map[base] ?? ppq) * tripletFactor);
}

export function snapTick(tick: number, snapTicks: number): number {
  return Math.round(tick / snapTicks) * snapTicks;
}

export function tickToSeconds(tick: number, bpm: number, ppq: number): number {
  return (tick / ppq) * (60 / bpm);
}
