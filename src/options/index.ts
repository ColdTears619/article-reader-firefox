import browser from 'webextension-polyfill';
import { settingsRepository } from '../storage/repositories';
import type { ProviderSettings } from '../types';
import { GOOGLE_TRANSLATE_ORIGIN } from '../providers/google';

const form = document.querySelector<HTMLFormElement>('#provider-form')!;
const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const status = byId<HTMLElement>('save-status');

async function load(): Promise<void> {
  const value = await settingsRepository.getProvider();
  byId<HTMLSelectElement>('translation-provider').value = value.translationProvider;
  byId<HTMLSelectElement>('ai-provider').value = value.aiProvider;
  byId<HTMLInputElement>('endpoint').value = value.endpoint;
  byId<HTMLInputElement>('model').value = value.model;
  byId<HTMLInputElement>('api-key').value = value.apiKey;
  byId<HTMLInputElement>('google-api-key').value = value.googleApiKey;
  byId<HTMLInputElement>('target-language').value = value.targetLanguage;
  byId<HTMLInputElement>('timeout').value = String(value.timeoutMs / 1000);
  byId<HTMLInputElement>('max-input').value = String(value.maxInputChars);
  byId<HTMLInputElement>('consent').checked = value.consentGiven;
  syncProviderFields();
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const value: ProviderSettings = {
    translationProvider: byId<HTMLSelectElement>('translation-provider').value as ProviderSettings['translationProvider'],
    aiProvider: byId<HTMLSelectElement>('ai-provider').value as ProviderSettings['aiProvider'],
    endpoint: byId<HTMLInputElement>('endpoint').value.trim(),
    model: byId<HTMLInputElement>('model').value.trim(),
    apiKey: byId<HTMLInputElement>('api-key').value.trim(),
    googleApiKey: byId<HTMLInputElement>('google-api-key').value.trim(),
    targetLanguage: byId<HTMLInputElement>('target-language').value.trim() || 'fa',
    targetLanguageConfirmed: true,
    timeoutMs: Number(byId<HTMLInputElement>('timeout').value) * 1000,
    maxInputChars: Number(byId<HTMLInputElement>('max-input').value),
    consentGiven: byId<HTMLInputElement>('consent').checked
  };
  void ensureEndpointPermission(value).then(() => settingsRepository.setProvider(value)).then(() => {
    status.textContent = 'Settings saved.';
    setTimeout(() => { status.textContent = ''; }, 2500);
  }).catch((error: unknown) => { status.textContent = error instanceof Error ? error.message : 'Could not save settings.'; });
});

async function ensureEndpointPermission(value: ProviderSettings): Promise<void> {
  const origins = new Set<string>();
  if (value.translationProvider === 'google-cloud') {
    if (!value.googleApiKey) throw new Error('Enter a Google Cloud Translation API key.');
    origins.add(GOOGLE_TRANSLATE_ORIGIN);
  }
  if (value.aiProvider === 'openai-compatible' || value.translationProvider === 'openai-compatible') {
    if (!value.apiKey) throw new Error('Enter an API key for the OpenAI-compatible provider, or select the free on-device option.');
    const endpoint = new URL(value.endpoint);
    origins.add(`${endpoint.protocol}//${endpoint.host}/*`);
  }
  if (!origins.size) return;
  const granted = await browser.permissions.request({ origins: [...origins] });
  if (!granted) throw new Error('Permission to access the provider domain was not granted.');
}

byId<HTMLButtonElement>('clear-key').addEventListener('click', () => {
  byId<HTMLInputElement>('api-key').value = '';
  status.textContent = 'Save settings to apply this change.';
});

byId<HTMLButtonElement>('clear-google-key').addEventListener('click', () => {
  byId<HTMLInputElement>('google-api-key').value = '';
  status.textContent = 'Save settings to apply this change.';
});

byId<HTMLSelectElement>('translation-provider').addEventListener('change', syncProviderFields);
byId<HTMLSelectElement>('ai-provider').addEventListener('change', syncProviderFields);

function syncProviderFields(): void {
  const translationProvider = byId<HTMLSelectElement>('translation-provider').value;
  const aiProvider = byId<HTMLSelectElement>('ai-provider').value;
  byId('local-translation-settings').classList.toggle('hidden', translationProvider !== 'local');
  byId('local-ai-settings').classList.toggle('hidden', aiProvider !== 'local');
  byId('google-settings').classList.toggle('hidden', translationProvider !== 'google-cloud');
  byId('openai-settings').classList.toggle('hidden', translationProvider !== 'openai-compatible' && aiProvider !== 'openai-compatible');
}

void load();
