import { Readability } from '@mozilla/readability';
import DOMPurify from 'dompurify';
import browser from 'webextension-polyfill';
import type { Article, ExtensionMessage } from '../types';
import { toArticle } from '../extraction/article';
import { collectReferences } from '../extraction/references';

async function extractArticle(): Promise<Article> {
  const clone = document.cloneNode(true) as Document;
  const parsed = new Readability(clone, { charThreshold: 250 }).parse();
  if (!parsed || (parsed.textContent ?? '').trim().length < 200) {
    throw new Error('This page does not appear to contain an extractable article.');
  }
  const cleanContent = DOMPurify.sanitize(parsed.content ?? '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form'],
    FORBID_ATTR: ['style', 'srcset']
  });
  const base = new URL(location.href);
  const container = document.createElement('div');
  container.innerHTML = cleanContent;
  container.querySelectorAll<HTMLElement>('*').forEach((element, index) => {
    if (/^(P|H[1-6]|LI|BLOCKQUOTE|PRE)$/.test(element.tagName)) element.dataset.readerBlock = `block-${index}`;
  });
  container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(node => { node.href = new URL(node.getAttribute('href')!, base).href; node.rel = 'noopener noreferrer'; });
  container.querySelectorAll<HTMLImageElement>('img[src]').forEach(node => {
    node.src = new URL(node.getAttribute('src')!, base).href;
    node.removeAttribute('onerror');
    node.loading = 'lazy';
  });
  const textContent = (parsed.textContent ?? '').replace(/\s+/g, ' ').trim();
  const references = collectReferences(container, location.href);
  return toArticle({
    title: parsed.title,
    byline: parsed.byline,
    siteName: parsed.siteName,
    excerpt: parsed.excerpt,
    content: DOMPurify.sanitize(container.innerHTML),
    textContent,
    length: parsed.length,
    references
  }, {
    url: location.href,
    documentTitle: document.title,
    hostname: base.hostname,
    language: document.documentElement.lang || undefined,
    direction: document.dir === 'rtl' ? 'rtl' : document.dir === 'ltr' ? 'ltr' : 'auto'
  });
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const request = message as ExtensionMessage;
  if (request.type === 'probe-page') {
    const probable = document.querySelectorAll('article p, main p').length >= 2 || document.body.innerText.length > 1000;
    return Promise.resolve({ ok: true, probable, title: document.title });
  }
  if (request.type === 'extract-article') {
    return extractArticle().then(article => ({ ok: true, article })).catch(error => ({ ok: false, error: error instanceof Error ? error.message : 'Article extraction failed.' }));
  }
  return undefined;
});
