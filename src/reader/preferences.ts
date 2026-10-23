import type { ReaderPreferences } from '../types';

export function readerStyle(preferences: ReaderPreferences): Record<string, string> {
  return {
    '--reader-size': `${preferences.fontSize}px`,
    '--reader-leading': String(preferences.lineHeight),
    '--reader-width': `${preferences.columnWidth}px`,
    '--reader-half-width': `${preferences.columnWidth / 2}px`
  };
}
