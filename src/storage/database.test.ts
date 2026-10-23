import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import type { Article, Highlight, Note } from '../types';
import { getDatabase } from './database';

describe('IndexedDB storage', () => {
  it('stores and retrieves an article with related highlights and notes', async () => {
    const db = await getDatabase();
    const article: Article = { id: 'article-test', url: 'https://example.com/a', title: 'Test', byline: '', siteName: 'example.com', excerpt: '', content: '<p>Text</p>', textContent: 'Text', length: 4, direction: 'ltr', extractedAt: 1, savedAt: 2, contentHash: 'hash' };
    const highlight: Highlight = { id: 'highlight-test', articleId: article.id, url: article.url, color: 'yellow', anchor: { quote: 'Text', prefix: '', suffix: '', startOffset: 0, endOffset: 4, blockId: 'block-1', domPath: 'p:1', contentHash: 'hash' }, createdAt: 3, updatedAt: 3 };
    const note: Note = { id: 'note-test', articleId: article.id, highlightId: highlight.id, text: 'My note', createdAt: 4, updatedAt: 4 };
    const tx = db.transaction(['articles', 'highlights', 'notes'], 'readwrite');
    await Promise.all([tx.objectStore('articles').put(article), tx.objectStore('highlights').put(highlight), tx.objectStore('notes').put(note)]);
    await tx.done;
    expect(await db.get('articles', article.id)).toEqual(article);
    expect(await db.getAllFromIndex('highlights', 'by-article', article.id)).toEqual([highlight]);
    expect(await db.getAllFromIndex('notes', 'by-highlight', highlight.id)).toEqual([note]);
  });
});
