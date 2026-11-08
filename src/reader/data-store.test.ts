import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Article, Highlight } from '../types';

const sendMessage = vi.fn();

vi.mock('webextension-polyfill', () => ({
  default: { runtime: { sendMessage } }
}));

vi.mock('../storage/repositories', () => ({
  articleRepository: {},
  highlightRepository: {},
  noteRepository: {}
}));

const article: Article = {
  id: 'article-1',
  url: 'https://example.com/article',
  title: 'Example',
  byline: '',
  siteName: 'Example',
  content: '<p>Article text</p>',
  textContent: 'Article text',
  excerpt: 'Article text',
  length: 12,
  language: 'en',
  direction: 'ltr',
  extractedAt: 1,
  contentHash: 'hash',
  references: []
};

describe('compatible Reader data store', () => {
  beforeEach(() => sendMessage.mockReset());

  it('uses the article already passed to the compatible page', async () => {
    const { createReaderDataStore } = await import('./data-store');
    const store = createReaderDataStore(article);
    await expect(store.getArticle(article.id)).resolves.toEqual(article);
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('routes annotations through the background extension database', async () => {
    const highlight = { id: 'highlight-1' } as Highlight;
    sendMessage.mockResolvedValue({ ok: true });
    const { createReaderDataStore } = await import('./data-store');
    const store = createReaderDataStore(article);
    await store.putHighlight(highlight);
    expect(sendMessage).toHaveBeenCalledWith({ type: 'reader-data', action: 'put-highlight', highlight });
  });

  it('surfaces background storage failures', async () => {
    sendMessage.mockResolvedValue({ ok: false, error: 'Storage unavailable' });
    const { createReaderDataStore } = await import('./data-store');
    const store = createReaderDataStore(article);
    await expect(store.listNotes(article.id)).rejects.toThrow('Storage unavailable');
  });
});
