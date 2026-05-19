import { describe, expect, it } from 'vitest';
import { SNAP_KEY_TO_UNIT } from './usePianoRollShortcuts';

describe('piano roll snap shortcuts', () => {
  it('maps number keys to the requested snap units', () => {
    expect(SNAP_KEY_TO_UNIT).toEqual({
      '1': '1/1',
      '2': '1/2',
      '3': '1/4',
      '4': '1/8',
      '5': '1/16',
      '6': '1/32',
      '7': '1/64',
      '8': '1/8T',
      '9': '1/16T',
      '0': '1/32T',
    });
  });
});
