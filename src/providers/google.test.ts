import { afterEach, describe, expect, it, vi } from 'vitest';
import { GoogleTranslationProvider, GOOGLE_TRANSLATE_ENDPOINT } from './google';

describe('Google Cloud Translation provider', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses automatic detection and sends the API key in a header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { translations: [{ detectedSourceLanguage: 'en', translatedText: 'سلام &amp; خداحافظ' }] } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const output = await new GoogleTranslationProvider('google-secret').translate('Hello and goodbye', 'auto', 'fa', new AbortController().signal);

    expect(output).toBe('سلام & خداحافظ');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe(GOOGLE_TRANSLATE_ENDPOINT);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(request.headers).get('x-goog-api-key')).toBe('google-secret');
    const body = JSON.parse(String(request.body)) as { q: string; target: string; format: string; source?: string };
    expect(body).toEqual({ q: 'Hello and goodbye', target: 'fa', format: 'text' });
  });

  it('sends an explicit source language when one is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{"data":{"translations":[{"translatedText":"Bonjour"}]}}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    await new GoogleTranslationProvider('key').translate('Hello', 'en', 'fr', new AbortController().signal);
    const body = JSON.parse(String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)) as { source?: string };
    expect(body.source).toBe('en');
  });

  it('reports Google API errors without exposing the key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"error":{"message":"API key is invalid"}}', { status: 403 })));
    const promise = new GoogleTranslationProvider('top-secret').translate('Hello', 'auto', 'fa', new AbortController().signal);
    await expect(promise).rejects.toThrow('403');
    await expect(promise).rejects.not.toThrow('top-secret');
  });
});
