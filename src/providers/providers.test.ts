import { DEFAULT_PROVIDER_SETTINGS } from '../defaults';
import { createProviders, DisabledAIProvider } from './index';
import { LocalAIProvider } from './local-ai';
import { LocalTranslationProvider } from './local-translation';
import { describe, expect, it } from 'vitest';

describe('default local providers', () => {
  it('selects the on-device translator without an API key', () => {
    expect(createProviders(DEFAULT_PROVIDER_SETTINGS).translation).toBeInstanceOf(LocalTranslationProvider);
  });

  it('selects local article tools without an API key', () => {
    expect(createProviders(DEFAULT_PROVIDER_SETTINGS).ai).toBeInstanceOf(LocalAIProvider);
  });

  it('disables every AI action when None is selected', async () => {
    const provider = createProviders({ ...DEFAULT_PROVIDER_SETTINGS, aiProvider: 'none' }).ai;
    expect(provider).toBeInstanceOf(DisabledAIProvider);
    await expect(provider.run('Text to summarize.', 'summarize', new AbortController().signal))
      .rejects.toMatchObject({ needsSettings: true });
  });
});
