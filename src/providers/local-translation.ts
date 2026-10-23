import { gunzipSync } from 'fflate';
import { decompress as decompressZstd } from 'fzstd';
import { LatencyOptimisedTranslator, TranslatorBacking, type TranslatorOptions } from '@browsermt/bergamot-translator/translator.js';
import type { TranslationProvider } from './index';

const MODEL_CATALOG_URL = 'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models-v2/records';
const MODEL_CDN_URL = 'https://firefox-settings-attachments.cdn.mozilla.net/';
const MODEL_CACHE = 'article-reader-translation-models-v2';
const LEGACY_MODEL_CACHE = 'article-reader-translation-models-v1';
const MODEL_CACHE_MAX_BYTES = 128 * 1024 * 1024;
const TRANSLATOR_IDLE_TIMEOUT_MS = 20_000;

type ModelFileType = 'model' | 'lex' | 'vocab' | 'srcvocab' | 'trgvocab';

export interface RemoteSettingsModelRecord {
  name: string;
  version: string;
  fileType: ModelFileType;
  architecture: string;
  sourceLanguage: string;
  targetLanguage: string;
  decompressedHash: string;
  decompressedSize: number;
  filter_expression?: string;
  attachment: {
    hash: string;
    size: number;
    filename: string;
    location: string;
    mimetype: string;
  };
}

interface ModelFiles {
  model?: RemoteSettingsModelRecord;
  lex?: RemoteSettingsModelRecord;
  vocab?: RemoteSettingsModelRecord;
  srcvocab?: RemoteSettingsModelRecord;
  trgvocab?: RemoteSettingsModelRecord;
}

interface RegistryEntry {
  from: string;
  to: string;
  architecture: string;
  version: string;
  files: ModelFiles;
}

interface WorkerCall {
  accept: (value: unknown) => void;
  reject: (reason: Error) => void;
  description: string;
}

class MozillaTranslationBacking extends TranslatorBacking {
  async loadModelRegistery(): Promise<RegistryEntry[]> {
    const response = await fetch(MODEL_CATALOG_URL, { credentials: 'omit' });
    if (!response.ok) throw new Error(`Could not load Firefox's language-model catalog (HTTP ${response.status}).`);
    const data = await response.json() as { data?: RemoteSettingsModelRecord[] };
    return buildModelRegistry(data.data ?? []);
  }

  async loadTranslationModel({ from, to }: { from: string; to: string }, options?: { signal?: AbortSignal }): Promise<{ model: ArrayBuffer; shortlist: ArrayBuffer; vocabs: ArrayBuffer[]; config: Record<string, string | number | boolean> }> {
    const entries = await this.registry as unknown as RegistryEntry[];
    const entry = entries.find(candidate => candidate.from === from && candidate.to === to);
    if (!entry?.files.model || !entry.files.lex) throw new Error(`Firefox does not currently provide an on-device model for ${from} → ${to}. Choose another language or an optional cloud provider in Settings.`);

    const [model, shortlist] = await Promise.all([
      fetchModelFile(entry.files.model, options?.signal),
      fetchModelFile(entry.files.lex, options?.signal)
    ]);
    const vocabs = entry.files.vocab
      ? [await fetchModelFile(entry.files.vocab, options?.signal)]
      : entry.files.srcvocab && entry.files.trgvocab
        ? await Promise.all([fetchModelFile(entry.files.srcvocab, options?.signal), fetchModelFile(entry.files.trgvocab, options?.signal)])
        : [];
    if (!vocabs.length) throw new Error(`The ${from} → ${to} model does not include a compatible vocabulary.`);

    return {
      model,
      shortlist,
      vocabs,
      config: {
        'beam-size': 1,
        normalize: 1,
        'word-penalty': 0,
        'max-length-break': 128,
        'mini-batch-words': 1024,
        workspace: 128,
        'max-length-factor': 2,
        'skip-cost': true,
        'gemm-precision': entry.files.model.name.includes('intgemm8.bin') ? 'int8shiftAll' : 'int8shiftAlphaAll'
      }
    };
  }

  async loadWorker(): Promise<{ worker: Worker; exports: Record<string, (...args: unknown[]) => Promise<unknown>> }> {
    const browser = (await import('webextension-polyfill')).default;
    const worker = new Worker(browser.runtime.getURL('bergamot/translator-worker.js'));
    let serial = 0;
    const pending = new Map<number, WorkerCall>();
    const call = (name: string, ...args: unknown[]): Promise<unknown> => new Promise((accept, reject) => {
      const id = ++serial;
      pending.set(id, { accept, reject, description: `${name}()` });
      worker.postMessage({ id, name, args });
    });

    worker.addEventListener('message', event => {
      const data = event.data as { id: number; result?: unknown; error?: { message?: string; stack?: string } };
      const request = pending.get(data.id);
      if (!request) return;
      pending.delete(data.id);
      if (data.error) request.reject(Object.assign(new Error(data.error.message ?? `Bergamot failed during ${request.description}.`), data.error));
      else request.accept(data.result);
    });
    worker.addEventListener('error', event => {
      const error = new Error(event.message || 'The local translation worker could not start.');
      for (const request of pending.values()) request.reject(error);
      pending.clear();
    });

    await call('initialize', this.options);
    return {
      worker,
      exports: new Proxy({}, { get: (_target, name) => name === 'then' ? undefined : (...args: unknown[]) => call(String(name), ...args) }) as Record<string, (...args: unknown[]) => Promise<unknown>>
    };
  }
}

let translator: LatencyOptimisedTranslator | undefined;
let translatorIdleTimer: ReturnType<typeof setTimeout> | undefined;
let activeTranslations = 0;
let cacheMaintenance = Promise.resolve();
let legacyCacheCleanupStarted = false;

function getTranslator(): LatencyOptimisedTranslator {
  if (!legacyCacheCleanupStarted && typeof caches !== 'undefined') {
    legacyCacheCleanupStarted = true;
    void caches.delete(LEGACY_MODEL_CACHE);
  }
  if (translatorIdleTimer !== undefined) {
    clearTimeout(translatorIdleTimer);
    translatorIdleTimer = undefined;
  }
  if (translator) return translator;
  const options: TranslatorOptions = { cacheSize: 0, downloadTimeout: 180_000, pivotLanguage: 'en', useNativeIntGemm: false };
  const backing = new MozillaTranslationBacking(options);
  translator = new LatencyOptimisedTranslator(options, backing);
  return translator;
}

export class LocalTranslationProvider implements TranslationProvider {
  async translate(text: string, sourceLanguage: string, targetLanguage: string, signal: AbortSignal): Promise<string> {
    const from = normalizeLanguage(sourceLanguage);
    const to = normalizeLanguage(targetLanguage);
    if (!from || from === 'auto') throw new Error('The source language could not be detected. Try a longer passage.');
    if (from === to) return text;
    const activeTranslator = getTranslator();
    activeTranslations += 1;
    try {
      const response = await activeTranslator.translate({ from, to, text, html: false }, { signal });
      if (!response.target.text.trim()) throw new Error('The local translation model returned an empty result.');
      return response.target.text.trim();
    } finally {
      activeTranslations = Math.max(0, activeTranslations - 1);
      if (activeTranslations === 0) scheduleTranslatorCleanup(activeTranslator);
    }
  }
}

function scheduleTranslatorCleanup(activeTranslator: LatencyOptimisedTranslator): void {
  if (translatorIdleTimer !== undefined) clearTimeout(translatorIdleTimer);
  translatorIdleTimer = setTimeout(() => {
    translatorIdleTimer = undefined;
    if (translator !== activeTranslator) return;
    translator = undefined;
    void activeTranslator.delete().catch(() => undefined);
  }, TRANSLATOR_IDLE_TIMEOUT_MS);
}

export async function detectSourceLanguage(text: string): Promise<string> {
  const browser = (await import('webextension-polyfill')).default;
  const result = await browser.i18n.detectLanguage(text.slice(0, 8_000));
  const best = result.languages.find(language => language.percentage >= 20) ?? result.languages[0];
  return normalizeLanguage(best?.language ?? '');
}

export function normalizeLanguage(language: string): string {
  const base = language.trim().toLocaleLowerCase().split(/[-_]/)[0];
  if (base === 'nb' || base === 'nn') return 'no';
  return base;
}

export function buildModelRegistry(records: RemoteSettingsModelRecord[]): RegistryEntry[] {
  const groups = new Map<string, RegistryEntry>();
  for (const record of records) {
    if (!isDesktopRelease(record)) continue;
    const from = normalizeLanguage(record.sourceLanguage);
    const to = normalizeLanguage(record.targetLanguage);
    const key = `${from}:${to}:${record.version}:${record.architecture}`;
    let entry = groups.get(key);
    if (!entry) {
      entry = { from, to, architecture: record.architecture, version: record.version, files: {} };
      groups.set(key, entry);
    }
    entry.files[record.fileType] = record;
  }

  const complete = [...groups.values()].filter(entry =>
    entry.files.model && entry.files.lex && (entry.files.vocab || (entry.files.srcvocab && entry.files.trgvocab))
  );
  const pairs = new Map<string, RegistryEntry>();
  for (const entry of complete.sort(compareModelVariants)) {
    const pair = `${entry.from}:${entry.to}`;
    if (!pairs.has(pair)) pairs.set(pair, entry);
  }
  return [...pairs.values()];
}

function isDesktopRelease(record: RemoteSettingsModelRecord): boolean {
  if (!/^\d+(?:\.\d+){1,2}$/.test(record.version)) return false;
  const filter = record.filter_expression ?? '';
  return !/env\.appinfo\.OS\s*={2,3}\s*['"]Android['"]/.test(filter);
}

function compareModelVariants(a: RegistryEntry, b: RegistryEntry): number {
  const versionDifference = compareVersions(b.version, a.version);
  if (versionDifference) return versionDifference;
  const preference: Record<string, number> = { base: 3, 'base-memory': 2, tiny: 1 };
  return (preference[b.architecture] ?? 0) - (preference[a.architecture] ?? 0);
}

function compareVersions(a: string, b: string): number {
  const left = a.split('.').map(Number);
  const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference) return difference;
  }
  return 0;
}

async function fetchModelFile(file: RemoteSettingsModelRecord, signal?: AbortSignal): Promise<ArrayBuffer> {
  const url = new URL(file.attachment.location, MODEL_CDN_URL).href;
  const cache = typeof caches === 'undefined' ? undefined : await caches.open(MODEL_CACHE);
  const cached = await cache?.match(url);
  if (cached) {
    try {
      return await unpackAndVerify(new Uint8Array(await cached.arrayBuffer()), file);
    } catch {
      await cache?.delete(url);
    }
  }

  const response = await fetch(url, { credentials: 'omit', signal });
  if (!response.ok) throw new Error(`Could not download a Firefox language-model file (HTTP ${response.status}).`);
  const compressed = new Uint8Array(await response.arrayBuffer());
  const unpacked = await unpackAndVerify(compressed, file);
  await cache?.put(url, new Response(compressed.slice(), {
    headers: {
      'Content-Type': file.attachment.mimetype,
      'X-Article-Reader-Cached-At': String(Date.now()),
      'X-Article-Reader-Size': String(compressed.byteLength)
    }
  }));
  if (cache) await queueCacheMaintenance(cache);
  return unpacked;
}

function queueCacheMaintenance(cache: Cache): Promise<void> {
  cacheMaintenance = cacheMaintenance.catch(() => undefined).then(async () => {
    const entries = await Promise.all((await cache.keys()).map(async request => {
      const response = await cache.match(request);
      let size = Number(response?.headers.get('X-Article-Reader-Size') ?? response?.headers.get('Content-Length') ?? 0);
      if (!size && response) size = (await response.clone().arrayBuffer()).byteLength;
      return {
        request,
        size,
        cachedAt: Number(response?.headers.get('X-Article-Reader-Cached-At') ?? 0)
      };
    }));
    let total = entries.reduce((sum, entry) => sum + entry.size, 0);
    for (const entry of entries.sort((a, b) => a.cachedAt - b.cachedAt)) {
      if (total <= MODEL_CACHE_MAX_BYTES) break;
      if (await cache.delete(entry.request)) total -= entry.size;
    }
  });
  return cacheMaintenance;
}

async function unpackAndVerify(compressed: Uint8Array, file: RemoteSettingsModelRecord): Promise<ArrayBuffer> {
  await verifyHash(compressed, file.attachment.hash);
  let unpacked: Uint8Array;
  if (file.attachment.filename.endsWith('.zst')) {
    unpacked = decompressZstd(compressed, new Uint8Array(file.decompressedSize));
  } else if (file.attachment.filename.endsWith('.gz')) {
    unpacked = gunzipSync(compressed);
  } else {
    unpacked = compressed;
  }
  if (unpacked.byteLength !== file.decompressedSize) throw new Error('A downloaded translation model has an unexpected size.');
  await verifyHash(unpacked, file.decompressedHash);
  return unpacked.buffer.slice(unpacked.byteOffset, unpacked.byteOffset + unpacked.byteLength) as ArrayBuffer;
}

async function verifyHash(bytes: Uint8Array, expected: string): Promise<void> {
  const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const digest = await crypto.subtle.digest('SHA-256', data);
  const actual = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
  if (actual !== expected) throw new Error('A downloaded translation model failed its integrity check. Clear the extension cache and try again.');
}
