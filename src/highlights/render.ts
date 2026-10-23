import type { Highlight } from '../types';

export function wrapTextRange(root: Element, start: number, end: number, highlight: Highlight): number {
  if (end <= start) return 0;
  const document = root.ownerDocument;
  const walker = document.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  const segments: Array<{ node: Text; start: number; end: number }> = [];
  let position = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nodeEnd = position + node.length;
    const localStart = Math.max(0, start - position);
    const localEnd = Math.min(node.length, end - position);
    if (localEnd > localStart && /\S/.test(node.data.slice(localStart, localEnd))) segments.push({ node, start: localStart, end: localEnd });
    position = nodeEnd;
    if (position >= end) break;
  }
  let wrapped = 0;
  for (const segment of segments.reverse()) {
    const range = document.createRange();
    range.setStart(segment.node, segment.start);
    range.setEnd(segment.node, segment.end);
    const mark = document.createElement('mark');
    mark.className = `reader-highlight highlight-${highlight.color}`;
    mark.dataset.highlightId = highlight.id;
    mark.tabIndex = 0;
    mark.title = 'Show highlight details';
    try { range.surroundContents(mark); wrapped += 1; } catch { /* Ignore only the affected fragment. */ }
  }
  return wrapped;
}
