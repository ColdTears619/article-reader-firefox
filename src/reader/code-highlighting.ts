import hljs from 'highlight.js/lib/common';

export function highlightCodeBlocks(root: Element): number {
  let count = 0;
  root.querySelectorAll<HTMLElement>('pre').forEach(pre => {
    let code = pre.querySelector<HTMLElement>(':scope > code');
    if (!code) {
      code = root.ownerDocument.createElement('code');
      code.textContent = codeText(pre);
      pre.replaceChildren(code);
    }
    const source = codeText(code);
    const highlighted = hljs.highlightAuto(source);
    code.innerHTML = highlighted.value;
    code.classList.add('hljs');
    if (highlighted.language) code.dataset.language = highlighted.language;
    count += 1;
  });
  return count;
}

function codeText(element: HTMLElement): string {
  const lines = element.querySelectorAll<HTMLElement>(':scope > .token-line, :scope > .line, :scope > [data-line]');
  if (lines.length > 1) return Array.from(lines, line => (line.textContent ?? '').replace(/\r?\n$/, '')).join('\n');
  if (!element.querySelector('br')) return element.textContent ?? '';
  const clone = element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('br').forEach(br => br.replaceWith(element.ownerDocument.createTextNode('\n')));
  return clone.textContent ?? '';
}
