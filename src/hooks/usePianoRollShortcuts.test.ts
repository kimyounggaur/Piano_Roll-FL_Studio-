import { describe, expect, it } from 'vitest';
import { SNAP_KEY_TO_UNIT } from './usePianoRollShortcuts';

describe('piano roll snap shortcuts', () => {
  it('maps number keys to the requested snap units', () => {
    expect(SNAP_KEY_TO_UNIT).toEqual({
      '1': '1/1',
      '2': '1/4',
      '3': '1/8',
      '4': '1/16',
      '5': '1/32',
      '6': '1/64',
      '7': '1/8T',
      '8': '1/16T',
      '9': '1/32T',
      '0': '1/64T',
    });
  });
});
