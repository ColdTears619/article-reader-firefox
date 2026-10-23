import { describe, expect, it } from 'vitest';
import { toArticle } from './article';

describe('article conversion', () => {
  it('normalizes readability output and applies page fallbacks', async () => {
    const article = await toArticle({ content: '<p>Safe</p>', textContent: '  متن   مقاله  ' }, {
      url: 'https://example.com/story?tracking=1', documentTitle: 'عنوان صفحه', hostname: 'example.com', direction: 'rtl', extractedAt: 42
    });
    expect(article.title).toBe('عنوان صفحه');
    expect(article.siteName).toBe('example.com');
    expect(article.textContent).toBe('متن مقاله');
    expect(article.direction).toBe('rtl');
    expect(article.contentHash).toHaveLength(64);
    expect(article.extractedAt).toBe(42);
  });
});
