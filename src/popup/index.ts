import browser from 'webextension-polyfill';

const status = document.querySelector<HTMLElement>('#page-status')!;
const message = document.querySelector<HTMLElement>('#popup-message')!;
const readerButton = document.querySelector<HTMLButtonElement>('#open-reader')!;
const saveButton = document.querySelector<HTMLButtonElement>('#save-current')!;

async function activeTab() {
  return (await browser.tabs.query({ active: true, currentWindow: true }))[0];
}

async function probe(): Promise<void> {
  try {
    const tab = await activeTab();
    if (!tab?.id || !tab.url?.startsWith('http')) throw new Error();
    const result = await browser.tabs.sendMessage(tab.id, { type: 'probe-page' }) as { probable?: boolean };
    status.textContent = result.probable ? 'This page appears to contain an article.' : 'This page may not contain enough readable content.';
  } catch {
    status.textContent = 'This page cannot be read by the extension.';
    readerButton.disabled = true;
    saveButton.disabled = true;
  }
}

async function run(type: 'open-reader' | 'save-current'): Promise<void> {
  message.textContent = 'Extracting article…';
  readerButton.disabled = saveButton.disabled = true;
  const tab = await activeTab();
  const result = await browser.runtime.sendMessage({ type, tabId: tab?.id }) as { ok: boolean; error?: string };
  message.textContent = result.ok ? (type === 'save-current' ? 'Article saved.' : 'Reader opened.') : (result.error ?? 'The action failed.');
  readerButton.disabled = saveButton.disabled = false;
}

readerButton.addEventListener('click', () => void run('open-reader'));
saveButton.addEventListener('click', () => void run('save-current'));
document.querySelector('#open-library')!.addEventListener('click', () => void browser.tabs.create({ url: browser.runtime.getURL('library.html') }));
document.querySelector('#open-options')!.addEventListener('click', () => void browser.runtime.openOptionsPage());
void probe();
