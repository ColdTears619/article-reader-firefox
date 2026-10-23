import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import { highlightCodeBlocks } from './code-highlighting';

describe('code highlighting', () => {
  it('adds syntax token markup while preserving source text', () => {
    const source = 'function sort(items) { return items.length; }';
    const dom = new JSDOM(`<article><pre><code>${source}</code></pre></article>`);
    const root = dom.window.document.querySelector('article')!;
    expect(highlightCodeBlocks(root)).toBe(1);
    expect(root.querySelector('code')?.textContent).toBe(source);
    expect(root.querySelector('code')?.classList.contains('hljs')).toBe(true);
    expect(root.querySelector('.hljs-keyword')).not.toBeNull();
  });

  it('normalizes bare pre elements to pre/code blocks', () => {
    const dom = new JSDOM('<article><pre>const value = 42;</pre></article>');
    const root = dom.window.document.querySelector('article')!;
    highlightCodeBlocks(root);
    expect(root.querySelector('pre > code.hljs')?.textContent).toBe('const value = 42;');
  });

  it('restores line breaks when the source site styled line spans with CSS', () => {
    const dom = new JSDOM('<main><pre><code><span class="token-line"><span>const first = 1;</span><br></span><span class="token-line"><span>  return first;</span><br></span></code></pre></main>');
    const root = dom.window.document.querySelector('main')!;
    highlightCodeBlocks(root);
    expect(root.querySelector('code')?.textContent).toBe('const first = 1;\n  return first;');
  });

  it('turns standalone br elements into code line breaks', () => {
    const dom = new JSDOM('<main><pre><code>if (ready) {<br>  run()<br>}</code></pre></main>');
    const root = dom.window.document.querySelector('main')!;
    highlightCodeBlocks(root);
    expect(root.querySelector('code')?.textContent).toBe('if (ready) {\n  run()\n}');
  });
});
