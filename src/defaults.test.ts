import { DEFAULT_PROVIDER_SETTINGS, DEFAULT_READER_PREFERENCES } from './defaults';
import { describe, expect, it } from 'vitest';

describe('safe defaults', () => {
  it('starts with private local providers and no key', () => {
    expect(DEFAULT_PROVIDER_SETTINGS.apiKey).toBe('');
    expect(DEFAULT_PROVIDER_SETTINGS.googleApiKey).toBe('');
    expect(DEFAULT_PROVIDER_SETTINGS.aiProvider).toBe('local');
    expect(DEFAULT_PROVIDER_SETTINGS.translationProvider).toBe('local');
    expect(DEFAULT_PROVIDER_SETTINGS.targetLanguageConfirmed).toBe(false);
  });

  it('keeps reader preferences in usable bounds', () => {
    expect(DEFAULT_READER_PREFERENCES.toolbarPosition).toBe('left');
    expect(DEFAULT_READER_PREFERENCES.fontSize).toBeGreaterThanOrEqual(16);
    expect(DEFAULT_READER_PREFERENCES.lineHeight).toBeGreaterThanOrEqual(1.4);
    expect(DEFAULT_READER_PREFERENCES.columnWidth).toBeGreaterThanOrEqual(560);
  });
});
