import type { ReferenceLink } from '../types';

export function collectReferences(root: ParentNode, pageUrl: string): ReferenceLink[] {
  const current = withoutHash(new URL(pageUrl));
  const seen = new Set<string>();
  const references: ReferenceLink[] = [];

  for (const anchor of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    let url: URL;
    try { url = new URL(anchor.getAttribute('href') ?? '', current); } catch { continue; }
    if (!['http:', 'https:'].includes(url.protocol)) continue;
    url.hash = '';
    const href = url.href;
    if (href === current.href || seen.has(href)) continue;
    seen.add(href);
    const text = anchor.textContent?.replace(/\s+/g, ' ').trim();
    references.push({ url: href, label: text || readableUrl(url) });
  }

  return references;
}

function withoutHash(url: URL): URL {
  const copy = new URL(url.href);
  copy.hash = '';
  return copy;
}

function readableUrl(url: URL): string {
  const path = url.pathname === '/' ? '' : url.pathname.replace(/\/$/, '');
  return `${url.hostname}${path}`;
}
