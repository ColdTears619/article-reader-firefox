import { describe, expect, it } from 'vitest';
import { DEFAULT_READER_PREFERENCES } from '../defaults';
import { readerStyle } from './preferences';

describe('reader preference behavior', () => {
  it('maps persisted numeric preferences to safe CSS values', () => {
    expect(readerStyle({ ...DEFAULT_READER_PREFERENCES, fontSize: 24, lineHeight: 2, columnWidth: 820 })).toEqual({
      '--reader-size': '24px', '--reader-leading': '2', '--reader-width': '820px', '--reader-half-width': '410px'
    });
  });
});
