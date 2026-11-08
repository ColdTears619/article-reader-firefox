import browser from 'webextension-polyfill';
import readerDocument from '../../reader.html?raw';
import readerStyles from '../styles.css?inline';
import type { ExtensionMessage } from '../types';
import { setCompatibleArticle } from '../reader/runtime';

declare global {
  interface Window { __articleReaderCompatibleLoaded?: boolean; }
}

if (!window.__articleReaderCompatibleLoaded) {
  window.__articleReaderCompatibleLoaded = true;
  browser.runtime.onMessage.addListener((message: unknown) => {
    const request = message as ExtensionMessage;
    if (request.type !== 'mount-compatible-reader') return undefined;
    return mount(request.article)
      .then(() => ({ ok: true }))
      .catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : 'Compatible Reader could not start.' }));
  });
}

async function mount(article: Extract<ExtensionMessage, { type: 'mount-compatible-reader' }>['article']): Promise<void> {
  if (document.documentElement.dataset.articleReaderCompatible === 'true') return;
  const styleResponse = await browser.runtime.sendMessage({ type: 'inject-compatible-reader-styles', css: readerStyles }) as { ok?: boolean; error?: string } | undefined;
  if (!styleResponse?.ok) throw new Error(styleResponse?.error ?? 'Reader styles could not be loaded.');

  window.stop();
  const parsed = new DOMParser().parseFromString(readerDocument, 'text/html');
  parsed.querySelectorAll('script').forEach(script => script.remove());
  const readerBody = document.importNode(parsed.body, true);
  document.querySelectorAll('link[rel="stylesheet"], style').forEach(node => node.remove());
  try { document.adoptedStyleSheets = []; } catch { /* Some pages expose a read-only implementation. */ }
  document.body.replaceWith(readerBody);
  document.documentElement.lang = 'en';
  document.documentElement.dir = 'ltr';
  document.documentElement.dataset.articleReaderCompatible = 'true';
  document.title = 'Article Reader';
  setCompatibleArticle(article);
  await import('../reader/index');
}
