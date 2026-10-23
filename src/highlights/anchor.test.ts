import { createTextAnchor, resolveTextAnchor } from './anchor';
import { describe, expect, it } from 'vitest';

describe('highlight anchoring', () => {
  it('restores an unchanged exact range', () => {
    const text = 'پیش‌گفتار — متن مهم مقاله — پایان';
    const start = text.indexOf('متن مهم');
    const anchor = createTextAnchor(text, start, start + 'متن مهم'.length, 'block-1', 'p:1', 'hash');
    expect(resolveTextAnchor(text, anchor)).toEqual({ start, end: start + 'متن مهم'.length, exact: true });
  });

  it('uses surrounding context after content shifts', () => {
    const original = 'A start unique quote nearby end. Another unique quote elsewhere.';
    const start = original.indexOf('unique quote');
    const anchor = createTextAnchor(original, start, start + 'unique quote'.length, 'block-1', 'p:1', 'hash');
    const changed = `New prefix. ${original}`;
    const resolved = resolveTextAnchor(changed, anchor);
    expect(resolved?.start).toBe(changed.indexOf('unique quote'));
    expect(resolved?.exact).toBe(false);
  });

  it('returns null when quote disappeared', () => {
    const anchor = createTextAnchor('hello world', 6, 11, 'b', 'p:1', 'hash');
    expect(resolveTextAnchor('hello moon', anchor)).toBeNull();
  });
});
