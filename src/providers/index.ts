import type { AIOperation, ProviderSettings } from '../types';
import { GoogleTranslationProvider } from './google';
import { ProviderConfigurationError } from './errors';
import { LocalAIProvider } from './local-ai';
import { LocalTranslationProvider } from './local-translation';

export interface TranslationProvider {
  translate(text: string, sourceLanguage: string, targetLanguage: string, signal: AbortSignal): Promise<string>;
}

export interface AIProvider {
  run(text: string, operation: AIOperation, signal: AbortSignal): Promise<string>;
}

export class DisabledAIProvider implements AIProvider {
  async run(): Promise<string> {
    throw new ProviderConfigurationError('Choose a Summary & AI mode in Settings first.');
  }
}

export class OpenAICompatibleClient {
  constructor(private readonly settings: ProviderSettings) {}

  async complete(system: string, user: string, signal: AbortSignal): Promise<string> {
    if (!this.settings.apiKey) throw new ProviderConfigurationError('This AI action needs an API key. Add an OpenAI-compatible provider in Settings, or use the free local Summary and Key points tools.');
    const response = await fetch(this.settings.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.settings.apiKey}` },
      body: JSON.stringify({ model: this.settings.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      signal
    });
    const rawResponse = await response.text();
    const data: unknown = parseJson(rawResponse);
    if (!response.ok) {
      const detail = providerErrorMessage(data, rawResponse, this.settings.apiKey);
      throw new Error(`The provider returned HTTP ${response.status}.${detail ? ` ${detail}` : ' Check the endpoint, model, and API key.'}`);
    }
    const output = extractContent(data);
    if (!output) throw new Error('The provider returned an invalid response.');
    return output;
  }
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

function providerErrorMessage(value: unknown, raw: string, secret: string): string {
  const message = value && typeof value === 'object'
    ? (value as { error?: { message?: unknown }; message?: unknown }).error?.message
      ?? (value as { message?: unknown }).message
    : undefined;
  const candidate = typeof message === 'string' ? message : raw.trim();
  if (!candidate) return '';
  const redacted = secret ? candidate.replaceAll(secret, '[redacted]') : candidate;
  return redacted.replace(/\s+/g, ' ').slice(0, 300);
}

export class OpenAITranslationProvider implements TranslationProvider {
  constructor(private readonly client: OpenAICompatibleClient) {}
  translate(text: string, sourceLanguage: string, targetLanguage: string, signal: AbortSignal): Promise<string> {
    const sourceInstruction = sourceLanguage === 'auto' ? 'Detect the source language automatically.' : `The source language is ${sourceLanguage}.`;
    return this.client.complete('You are a precise translator. Preserve meaning, tone, and formatting. Return only the translation.', `${sourceInstruction} Translate the following text to ${targetLanguage}:\n\n${text}`, signal);
  }
}

export class OpenAIProvider implements AIProvider {
  constructor(private readonly client: OpenAICompatibleClient) {}
  run(text: string, operation: AIOperation, signal: AbortSignal): Promise<string> {
    const instructions: Record<AIOperation, string> = {
      explain: 'Explain the text simply in the same language as the text.',
      summarize: 'Summarize the text concisely in the same language as the text.',
      'key-points': 'Extract the key points as a concise list in the same language.',
      define: 'Explain the key term or concept in context, simply and accurately.',
      question: 'Create one insightful question answerable from this text, then answer it.'
    };
    return this.client.complete(instructions[operation], text, signal);
  }
}

export function createProviders(settings: ProviderSettings): { translation: TranslationProvider; ai: AIProvider } {
  const client = new OpenAICompatibleClient(settings);
  const translation = settings.translationProvider === 'local'
    ? new LocalTranslationProvider()
    : settings.translationProvider === 'google-cloud'
      ? new GoogleTranslationProvider(settings.googleApiKey)
      : settings.translationProvider === 'openai-compatible'
        ? new OpenAITranslationProvider(client)
        : new LocalTranslationProvider();
  return {
    translation,
    ai: settings.aiProvider === 'none'
      ? new DisabledAIProvider()
      : settings.aiProvider === 'openai-compatible'
        ? new OpenAIProvider(client)
        : new LocalAIProvider()
  };
}

function extractContent(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null;
  const choices = (value as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return null;
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
  return typeof content === 'string' && content.trim() ? content.trim() : null;
}
