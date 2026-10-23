import type { ProviderSettings, ReaderPreferences } from './types';

export const DEFAULT_PROVIDER_SETTINGS: ProviderSettings = {
  translationProvider: 'local',
  aiProvider: 'local',
  endpoint: 'https://api.openai.com/v1/chat/completions',
  model: 'gpt-4.1-mini',
  apiKey: '',
  googleApiKey: '',
  targetLanguage: 'fa',
  targetLanguageConfirmed: false,
  consentGiven: false,
  timeoutMs: 30_000,
  maxInputChars: 16_000
};

export const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  theme: 'system',
  toolbarPosition: 'left',
  fontSize: 20,
  lineHeight: 1.9,
  columnWidth: 760,
  direction: 'auto'
};
