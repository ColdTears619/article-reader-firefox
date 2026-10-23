import type { HighlightAnchor } from '../types';

export interface ResolvedAnchor { start: number; end: number; exact: boolean }

export function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export function createTextAnchor(fullText: string, start: number, end: number, blockId: string, domPath: string, contentHash: string): HighlightAnchor {
  return {
    quote: fullText.slice(start, end),
    prefix: fullText.slice(Math.max(0, start - 40), start),
    suffix: fullText.slice(end, end + 40),
    startOffset: start,
    endOffset: end,
    blockId,
    domPath,
    contentHash
  };
}

export function resolveTextAnchor(fullText: string, anchor: HighlightAnchor): ResolvedAnchor | null {
  if (fullText.slice(anchor.startOffset, anchor.endOffset) === anchor.quote) {
    return { start: anchor.startOffset, end: anchor.endOffset, exact: true };
  }
  const matches: number[] = [];
  let cursor = 0;
  while ((cursor = fullText.indexOf(anchor.quote, cursor)) !== -1) {
    matches.push(cursor);
    cursor += Math.max(1, anchor.quote.length);
  }
  if (!matches.length) return null;
  const score = (position: number): number => {
    const before = fullText.slice(Math.max(0, position - anchor.prefix.length), position);
    const after = fullText.slice(position + anchor.quote.length, position + anchor.quote.length + anchor.suffix.length);
    let result = -Math.abs(position - anchor.startOffset) / Math.max(1, fullText.length);
    if (before === anchor.prefix) result += 3;
    if (after === anchor.suffix) result += 3;
    return result;
  };
  const best = matches.sort((a, b) => score(b) - score(a))[0];
  return { start: best, end: best + anchor.quote.length, exact: false };
}
