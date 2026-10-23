import browser from 'webextension-polyfill';
import { DEFAULT_PROVIDER_SETTINGS, DEFAULT_READER_PREFERENCES } from '../defaults';
import type { AIResult, Article, Highlight, Note, ProviderSettings, ReaderPreferences, TranslationResult } from '../types';
import { getDatabase } from './database';

export const articleRepository = {
  async put(article: Article, saved = true): Promise<Article> {
    const db = await getDatabase();
    const existing = await db.get('articles', article.id);
    const value = { ...article, savedAt: saved ? (article.savedAt ?? existing?.savedAt ?? Date.now()) : (article.savedAt ?? existing?.savedAt) };
    await db.put('articles', value);
    return value;
  },
  async get(id: string): Promise<Article | undefined> {
    return (await getDatabase()).get('articles', id);
  },
  async getByUrl(url: string): Promise<Article | undefined> {
    return (await getDatabase()).getFromIndex('articles', 'by-url', url);
  },
  async list(): Promise<Article[]> {
    const values = await (await getDatabase()).getAll('articles');
    return values.filter(item => item.savedAt).sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
  },
  async deleteCascade(id: string): Promise<void> {
    const db = await getDatabase();
    const tx = db.transaction(['articles', 'highlights', 'notes', 'translations', 'aiResults'], 'readwrite');
    const removeByIndex = async (storeName: 'highlights' | 'notes' | 'translations' | 'aiResults') => {
      const keys = await tx.objectStore(storeName).index('by-article').getAllKeys(id);
      await Promise.all(keys.map(key => tx.objectStore(storeName).delete(key)));
    };
    await Promise.all([removeByIndex('highlights'), removeByIndex('notes'), removeByIndex('translations'), removeByIndex('aiResults')]);
    await tx.objectStore('articles').delete(id);
    await tx.done;
  }
};

export const highlightRepository = {
  async put(value: Highlight): Promise<void> { await (await getDatabase()).put('highlights', value); },
  async list(articleId: string): Promise<Highlight[]> { return (await getDatabase()).getAllFromIndex('highlights', 'by-article', articleId); },
  async delete(id: string): Promise<void> {
    const db = await getDatabase();
    const tx = db.transaction(['highlights', 'notes'], 'readwrite');
    const noteKeys = await tx.objectStore('notes').index('by-highlight').getAllKeys(id);
    await Promise.all(noteKeys.map(key => tx.objectStore('notes').delete(key)));
    await tx.objectStore('highlights').delete(id);
    await tx.done;
  }
};

export const noteRepository = {
  async put(value: Note): Promise<void> { await (await getDatabase()).put('notes', value); },
  async list(articleId: string): Promise<Note[]> { return (await getDatabase()).getAllFromIndex('notes', 'by-article', articleId); },
  async delete(id: string): Promise<void> { await (await getDatabase()).delete('notes', id); }
};

export const resultRepository = {
  async putTranslation(value: TranslationResult): Promise<void> { await (await getDatabase()).put('translations', value); },
  async putAI(value: AIResult): Promise<void> { await (await getDatabase()).put('aiResults', value); }
};

export const settingsRepository = {
  async getProvider(): Promise<ProviderSettings> {
    const stored = await browser.storage.local.get('providerSettings');
    const value = { ...DEFAULT_PROVIDER_SETTINGS, ...(stored.providerSettings as Partial<ProviderSettings> | undefined) };
    if (value.translationProvider === 'mock') value.translationProvider = 'local';
    if (value.aiProvider === 'mock') value.aiProvider = 'local';
    return value;
  },
  async setProvider(value: ProviderSettings): Promise<void> { await browser.storage.local.set({ providerSettings: value }); },
  async getReader(): Promise<ReaderPreferences> {
    const stored = await browser.storage.local.get('readerPreferences');
    return { ...DEFAULT_READER_PREFERENCES, ...(stored.readerPreferences as Partial<ReaderPreferences> | undefined) };
  },
  async setReader(value: ReaderPreferences): Promise<void> { await browser.storage.local.set({ readerPreferences: value }); }
};
