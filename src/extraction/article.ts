import type { Article, ReferenceLink, TextDirection } from '../types';
import { hashText } from '../shared/utils';

export interface ReadableArticleInput {
  title?: string | null;
  byline?: string | null;
  siteName?: string | null;
  excerpt?: string | null;
  content: string;
  textContent: string;
  length?: number | null;
  references?: ReferenceLink[];
}

export interface PageMetadata {
  url: string;
  documentTitle: string;
  hostname: string;
  language?: string;
  direction: TextDirection;
  extractedAt?: number;
}

export async function toArticle(input: ReadableArticleInput, page: PageMetadata): Promise<Article> {
  const textContent = input.textContent.replace(/\s+/g, ' ').trim();
  const url = new URL(page.url);
  return {
    id: await hashText(`${url.origin}${url.pathname}`),
    url: page.url,
    title: input.title || page.documentTitle,
    byline: input.byline || '',
    siteName: input.siteName || page.hostname,
    excerpt: input.excerpt || textContent.slice(0, 180),
    content: input.content,
    textContent,
    length: input.length ?? textContent.length,
    language: page.language || undefined,
    direction: page.direction,
    extractedAt: page.extractedAt ?? Date.now(),
    contentHash: await hashText(textContent),
    references: input.references ?? []
  };
}
