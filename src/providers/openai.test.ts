import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PROVIDER_SETTINGS } from '../defaults';
import { OpenAICompatibleClient, OpenAITranslationProvider } from './index';

describe('OpenAI-compatible error handling', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects an HTTP error without exposing the key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"message":"Invalid key top-secret"}}', { status: 401 })));
    const client = new OpenAICompatibleClient({ ...DEFAULT_PROVIDER_SETTINGS, apiKey: 'top-secret' });
    const result = await client.complete('system', 'user', new AbortController().signal).catch(reason => reason as Error);
    expect(result).toBeInstanceOf(Error);
    const error = result as Error;
    expect(error.message).toContain('401');
    expect(error.message).toContain('Invalid key [redacted]');
    expect(error.message).not.toContain('top-secret');
  });

  it('rejects malformed successful responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"unexpected":true}', { status: 200 })));
    const client = new OpenAICompatibleClient({ ...DEFAULT_PROVIDER_SETTINGS, apiKey: 'key' });
    await expect(client.complete('system', 'user', new AbortController().signal)).rejects.toThrow('invalid response');
  });

  it('passes automatic source detection and the selected target language', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"choices":[{"message":{"content":"Bonjour"}}]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const client = new OpenAICompatibleClient({ ...DEFAULT_PROVIDER_SETTINGS, apiKey: 'key' });
    await new OpenAITranslationProvider(client).translate('Hello', 'auto', 'fr', new AbortController().signal);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as { messages: Array<{ content: string }>; temperature?: number };
    expect(body.messages[1]?.content).toContain('Detect the source language automatically.');
    expect(body.messages[1]?.content).toContain('to fr');
    expect(body.temperature).toBeUndefined();
  });
});
