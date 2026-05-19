import { describe, it, expect } from 'vitest';
import {
  ticksPerBeat, ticksPerBar, ticksToBeats, beatsToTicks, snapTick,
  snapUnitToTicks, barsToTicks, tickToBarBeat,
} from './time';

const TS_4_4 = { numerator: 4, denominator: 4 };
const TS_6_8 = { numerator: 6, denominator: 8 };

describe('time conversions', () => {
  it('ticksPerBeat respects denominator', () => {
    expect(ticksPerBeat(480, TS_4_4)).toBe(480);
    expect(ticksPerBeat(480, TS_6_8)).toBe(240);
  });

  it('ticksPerBar = beat * numerator', () => {
    expect(ticksPerBar(480, TS_4_4)).toBe(1920);
    expect(ticksPerBar(480, TS_6_8)).toBe(1440);
  });

  it('ticks ↔ beats roundtrip', () => {
    expect(ticksToBeats(480, 480)).toBe(1);
    expect(ticksToBeats(240, 480)).toBe(0.5);
    expect(beatsToTicks(1, 480)).toBe(480);
    expect(beatsToTicks(2.5, 480)).toBe(1200);
  });

  it('barsToTicks at 4/4', () => {
    expect(barsToTicks(0, TS_4_4, 480)).toBe(0);
    expect(barsToTicks(1, TS_4_4, 480)).toBe(1920);
    expect(barsToTicks(4, TS_4_4, 480)).toBe(7680);
  });

  it('tickToBarBeat returns 1-based bar/beat positions', () => {
    const out = tickToBarBeat(0, TS_4_4, 480);
    expect(out.bar).toBe(1);
    expect(out.beat).toBe(1);
    const mid = tickToBarBeat(960, TS_4_4, 480);
    expect(mid.bar).toBe(1);
    expect(mid.beat).toBe(3);
    const next = tickToBarBeat(1920, TS_4_4, 480);
    expect(next.bar).toBe(2);
    expect(next.beat).toBe(1);
  });

  it('snapTick rounds to nearest', () => {
    expect(snapTick(95, 120)).toBe(120);
    expect(snapTick(50, 120)).toBe(0);
    expect(snapTick(60, 120)).toBe(120); // exactly halfway -> rounds up
    expect(snapTick(-5, 120)).toBe(0);
  });

  it('snapUnitToTicks for common units (ppq=480)', () => {
    expect(snapUnitToTicks('1/4', 480)).toBe(480);
    expect(snapUnitToTicks('1/8', 480)).toBe(240);
    expect(snapUnitToTicks('1/16', 480)).toBe(120);
    expect(snapUnitToTicks('1/32', 480)).toBe(60);
    expect(snapUnitToTicks('1/8T', 480)).toBe(160);
    expect(snapUnitToTicks('1/16T', 480)).toBe(80);
    expect(snapUnitToTicks('1/32T', 480)).toBe(40);
    expect(snapUnitToTicks('1/64T', 480)).toBe(20);
  });
});
