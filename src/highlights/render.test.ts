import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import type { Highlight } from '../types';
import { wrapTextRange } from './render';

const highlight: Highlight = {
  id: 'highlight-test', articleId: 'article-test', url: 'https://example.com', color: 'yellow',
  anchor: { quote: '', prefix: '', suffix: '', startOffset: 0, endOffset: 0, blockId: '', domPath: '', contentHash: '' },
  createdAt: 1, updatedAt: 1
};

describe('highlight rendering', () => {
  it('wraps the selected words instead of creating an empty marker', () => {
    const dom = new JSDOM('<main><p>Before selected words after</p></main>');
    const root = dom.window.document.querySelector('main')!;
    const text = root.textContent!;
    const start = text.indexOf('selected words');
    expect(wrapTextRange(root, start, start + 'selected words'.length, highlight)).toBe(1);
    const mark = root.querySelector('mark')!;
    expect(mark.textContent).toBe('selected words');
    expect(mark.classList.contains('highlight-yellow')).toBe(true);
  });

  it('wraps a range that crosses inline elements without losing text', () => {
    const dom = new JSDOM('<main><p>Hello <strong>highlighted</strong> world</p></main>');
    const root = dom.window.document.querySelector('main')!;
    const text = root.textContent!;
    const start = text.indexOf('Hello');
    const end = text.indexOf(' world');
    expect(wrapTextRange(root, start, end, highlight)).toBe(2);
    expect(Array.from(root.querySelectorAll('mark')).map(mark => mark.textContent).join('')).toBe('Hello highlighted');
    expect(root.textContent).toBe(text);
  });
});
