import type { TranslationProvider } from './index';
import { ProviderConfigurationError } from './errors';

export const GOOGLE_TRANSLATE_ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';
export const GOOGLE_TRANSLATE_ORIGIN = 'https://translation.googleapis.com/*';

interface GoogleTranslationResponse {
  data?: {
    translations?: Array<{
      translatedText?: unknown;
      detectedSourceLanguage?: unknown;
    }>;
  };
  error?: { message?: unknown };
}

export class GoogleTranslationProvider implements TranslationProvider {
  constructor(private readonly apiKey: string) {}

  async translate(text: string, sourceLanguage: string, targetLanguage: string, signal: AbortSignal): Promise<string> {
    if (!this.apiKey) throw new ProviderConfigurationError('Enter a Google Cloud Translation API key in Settings, or select the free on-device translator.');
    const body: { q: string; target: string; format: 'text'; source?: string } = { q: text, target: targetLanguage, format: 'text' };
    if (sourceLanguage && sourceLanguage !== 'auto') body.source = sourceLanguage;

    const response = await fetch(GOOGLE_TRANSLATE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', 'X-goog-api-key': this.apiKey },
      body: JSON.stringify(body),
      signal
    });
    const data = await readResponse(response);
    if (!response.ok) {
      const detail = typeof data.error?.message === 'string' ? ` ${data.error.message}` : '';
      throw new Error(`Google Cloud Translation returned HTTP ${response.status}.${detail}`);
    }
    const translatedText = data.data?.translations?.[0]?.translatedText;
    if (typeof translatedText !== 'string' || !translatedText.trim()) throw new Error('Google Cloud Translation returned an invalid response.');
    return decodeEntities(translatedText.trim());
  }
}

async function readResponse(response: Response): Promise<GoogleTranslationResponse> {
  try { return await response.json() as GoogleTranslationResponse; } catch { return {}; }
}

function decodeEntities(text: string): string {
  const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };
  return text.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|#39);/gi, (entity, code: string) => {
    if (code.startsWith('#x')) return codePoint(code.slice(2), 16, entity);
    if (code.startsWith('#')) return codePoint(code.slice(1), 10, entity);
    return named[code.toLowerCase()] ?? entity;
  });
}

function codePoint(value: string, radix: number, fallback: string): string {
  const point = Number.parseInt(value, radix);
  return Number.isInteger(point) && point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : fallback;
}
