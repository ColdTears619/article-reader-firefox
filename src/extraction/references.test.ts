import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { collectReferences } from './references';

describe('reference collection', () => {
  it('resolves and deduplicates article links while ignoring same-page fragments', () => {
    const dom = new JSDOM(`<main>
      <a href="#part">Same page</a>
      <a href="/guide">The guide</a>
      <a href="https://example.com/guide#details">Duplicate guide</a>
      <a href="https://other.test/">External source</a>
      <a href="mailto:test@example.com">Email</a>
    </main>`);
    expect(collectReferences(dom.window.document, 'https://example.com/article#intro')).toEqual([
      { url: 'https://example.com/guide', label: 'The guide' },
      { url: 'https://other.test/', label: 'External source' }
    ]);
  });
});
