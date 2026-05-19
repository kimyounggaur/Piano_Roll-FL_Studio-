import { describe, expect, it } from 'vitest';
import type { Note } from '../../types/music';
import { isToolMenuItemDisabled, quickChopNotes, TOOL_MENU_ITEMS } from './toolsMenuModel';

const baseNote: Note = {
  id: 'n1',
  pitch: 60,
  startTick: 0,
  durationTicks: 480,
  velocity: 90,
  selected: true,
};

describe('tools menu model', () => {
  it('disables selection tools until notes are selected', () => {
    const quickLegato = TOOL_MENU_ITEMS.find((item) => item.id === 'quick-legato');
    expect(quickLegato).toBeDefined();
    expect(isToolMenuItemDisabled(quickLegato!, 0, true)).toBe(true);
    expect(isToolMenuItemDisabled(quickLegato!, 1, true)).toBe(false);
  });

  it('keeps generator tools enabled when an active track exists', () => {
    const riff = TOOL_MENU_ITEMS.find((item) => item.id === 'riff-machine');
    expect(riff).toBeDefined();
    expect(isToolMenuItemDisabled(riff!, 0, true)).toBe(false);
  });

  it('disables every tool without an active track', () => {
    const riff = TOOL_MENU_ITEMS.find((item) => item.id === 'riff-machine');
    expect(riff).toBeDefined();
    expect(isToolMenuItemDisabled(riff!, 4, false)).toBe(true);
  });

  it('splits selected notes into snap-sized pieces for quick chop', () => {
    let next = 1;
    const chopped = quickChopNotes([baseNote], 120, () => `new-${next++}`);
    expect(chopped).toHaveLength(4);
    expect(chopped.map((note) => note.id)).toEqual(['n1', 'new-1', 'new-2', 'new-3']);
    expect(chopped.map((note) => note.startTick)).toEqual([0, 120, 240, 360]);
    expect(chopped.map((note) => note.durationTicks)).toEqual([120, 120, 120, 120]);
  });
});
