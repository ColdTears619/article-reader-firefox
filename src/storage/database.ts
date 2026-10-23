import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { AIResult, Article, Highlight, Note, TranslationResult } from '../types';

interface ReaderDB extends DBSchema {
  articles: { key: string; value: Article; indexes: { 'by-savedAt': number; 'by-url': string } };
  highlights: { key: string; value: Highlight; indexes: { 'by-article': string } };
  notes: { key: string; value: Note; indexes: { 'by-article': string; 'by-highlight': string } };
  translations: { key: string; value: TranslationResult; indexes: { 'by-article': string } };
  aiResults: { key: string; value: AIResult; indexes: { 'by-article': string } };
}

let database: Promise<IDBPDatabase<ReaderDB>> | undefined;

export function getDatabase(): Promise<IDBPDatabase<ReaderDB>> {
  database ??= openDB<ReaderDB>('article-reader', 1, {
    upgrade(db) {
      const articles = db.createObjectStore('articles', { keyPath: 'id' });
      articles.createIndex('by-savedAt', 'savedAt');
      articles.createIndex('by-url', 'url');
      const highlights = db.createObjectStore('highlights', { keyPath: 'id' });
      highlights.createIndex('by-article', 'articleId');
      const notes = db.createObjectStore('notes', { keyPath: 'id' });
      notes.createIndex('by-article', 'articleId');
      notes.createIndex('by-highlight', 'highlightId');
      const translations = db.createObjectStore('translations', { keyPath: 'id' });
      translations.createIndex('by-article', 'articleId');
      const aiResults = db.createObjectStore('aiResults', { keyPath: 'id' });
      aiResults.createIndex('by-article', 'articleId');
    }
  });
  return database;
}
