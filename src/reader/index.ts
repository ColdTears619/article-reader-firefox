import browser from 'webextension-polyfill';
import DOMPurify from 'dompurify';
import { createTextAnchor, resolveTextAnchor } from '../highlights/anchor';
import { wrapTextRange } from '../highlights/render';
import { articleRepository, highlightRepository, noteRepository, resultRepository, settingsRepository } from '../storage/repositories';
import type { AIResult, Article, Highlight, HighlightColor, Note, ProviderSettings, ReaderPreferences, ReferenceLink, TranslationResult } from '../types';
import { isExtensionContextInvalidatedError, isMissingMessageReceiverError, isRtlText, uid } from '../shared/utils';
import { readerStyle } from './preferences';
import { highlightCodeBlocks } from './code-highlighting';
import { collectReferences } from '../extraction/references';
import { replaceWithTrustedHtml } from '../shared/dom';
import { createProviders } from '../providers';
import { detectSourceLanguage } from '../providers/local-translation';
import { hasCloudDataPermissions, type FirefoxDataPermissions } from '../shared/cloud-permissions';
import { aiRequestTimeoutMs, runAIForText } from '../providers/full-text-ai';

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const state = byId<HTMLElement>('state');
const articleElement = byId<HTMLElement>('article');
const content = byId<HTMLElement>('article-content');
const toolbar = byId<HTMLElement>('selection-toolbar');
const resultDialog = byId<HTMLDialogElement>('result-dialog');
const noteDialog = byId<HTMLDialogElement>('note-dialog');
const translationDialog = byId<HTMLDialogElement>('translation-dialog');
const imageDialog = byId<HTMLDialogElement>('image-dialog');
const highlightPalette = byId<HTMLElement>('highlight-palette');
const notesPanel = byId<HTMLElement>('notes-panel');
const referencesPanel = byId<HTMLElement>('references-panel');
let article: Article | undefined;
let highlights: Highlight[] = [];
let notes: Note[] = [];
let selectedRange: Range | undefined;
let selectedText = '';
let pendingHighlight: Highlight | undefined;
let currentRequestId: string | undefined;
let currentRequestController: AbortController | undefined;
let currentPreferences: ReaderPreferences;
let selectionRect: DOMRect | undefined;
let pendingTranslationText = '';
let activeHighlightId: string | undefined;

async function init(): Promise<void> {
  currentPreferences = await settingsRepository.getReader();
  await applyPreferences(currentPreferences);
  const providerSettings = await settingsRepository.getProvider();
  const languageSelect = byId<HTMLSelectElement>('translation-language');
  const readerLanguageSelect = byId<HTMLSelectElement>('reader-translation-language');
  if (!Array.from(languageSelect.options).some(option => option.value === providerSettings.targetLanguage)) {
    languageSelect.add(new Option(providerSettings.targetLanguage.toUpperCase(), providerSettings.targetLanguage));
    readerLanguageSelect.add(new Option(providerSettings.targetLanguage.toUpperCase(), providerSettings.targetLanguage));
  }
  languageSelect.value = providerSettings.targetLanguage;
  readerLanguageSelect.value = providerSettings.targetLanguage;
  const params = new URLSearchParams(location.search);
  if (params.has('context')) { await handleContextAction(); return; }
  const id = params.get('id');
  if (!id) return showError('The article ID is missing from the URL.');
  article = await articleRepository.get(id);
  if (!article) return showError('The article could not be found. It may have been deleted.');
  [highlights, notes] = await Promise.all([highlightRepository.list(id), noteRepository.list(id)]);
  renderArticle();
  setSaveState(Boolean(article.savedAt));
  renderHighlights();
  renderNotes();
}

function renderArticle(): void {
  if (!article) return;
  byId('title').textContent = article.title;
  byId('source').textContent = article.siteName;
  byId('meta').textContent = [article.byline, new URL(article.url).hostname].filter(Boolean).join(' · ');
  replaceWithTrustedHtml(content, DOMPurify.sanitize(article.content));
  highlightCodeBlocks(content);
  prepareTables();
  prepareImages();
  renderReferences();
  applyArticleDirection(currentPreferences.direction);
  articleElement.classList.remove('hidden'); state.classList.add('hidden');
}

function renderHighlights(): void {
  if (!article) return;
  const fullText = content.textContent ?? '';
  const resolvedHighlights = highlights.flatMap(highlight => {
    const resolved = resolveTextAnchor(fullText, highlight.anchor);
    return resolved ? [{ highlight, ...resolved }] : [];
  }).sort((a, b) => b.start - a.start);
  for (const { highlight, start, end } of resolvedHighlights) wrapTextRange(content, start, end, highlight);
}

function renderNotes(): void {
  const list = byId<HTMLElement>('notes-list'); list.replaceChildren();
  if (!highlights.length) { const empty = document.createElement('p'); empty.className = 'muted'; empty.textContent = 'No highlights yet.'; list.append(empty); return; }
  for (const highlight of highlights) {
    const note = notes.find(item => item.highlightId === highlight.id);
    const card = document.createElement('section'); card.className = 'note-card'; card.tabIndex = 0;
    const quote = document.createElement('q'); quote.textContent = highlight.anchor.quote; quote.dir = 'auto';
    const noteText = document.createElement('p'); noteText.textContent = note?.text || 'No note'; noteText.dir = 'auto';
    const colors = document.createElement('div'); colors.className = 'color-row';
    for (const color of ['yellow', 'green', 'blue', 'pink'] as HighlightColor[]) {
      const dot = document.createElement('button'); dot.className = `color-dot highlight-${color}${color === highlight.color ? ' active' : ''}`; dot.title = `${color} highlight`;
      dot.addEventListener('click', event => { event.stopPropagation(); void changeColor(highlight, color); }); colors.append(dot);
    }
    const actions = document.createElement('div'); actions.className = 'note-actions';
    const edit = smallButton(note ? 'Edit note' : 'Add note', event => { event.stopPropagation(); openNoteDialog(highlight, note); });
    const removeNote = note ? smallButton('Delete note', event => { event.stopPropagation(); void deleteNote(note.id); }, 'danger') : undefined;
    const remove = smallButton('Delete highlight', event => { event.stopPropagation(); void deleteHighlight(highlight.id); }, 'danger');
    actions.append(edit); if (removeNote) actions.append(removeNote); actions.append(remove); card.append(quote, noteText, colors, actions);
    card.addEventListener('click', () => scrollToHighlight(highlight.id));
    card.addEventListener('keydown', event => { if (event.key === 'Enter') scrollToHighlight(highlight.id); });
    list.append(card);
  }
}

document.addEventListener('selectionchange', () => {
  const selection = getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) { if (!toolbar.matches(':hover') && !toolbar.contains(document.activeElement)) toolbar.classList.add('hidden'); return; }
  const range = selection.getRangeAt(0);
  if (!article || !content.contains(range.commonAncestorContainer)) return;
  selectedText = selection.toString().trim();
  if (!selectedText) return;
  selectedRange = range.cloneRange();
  const rect = range.getBoundingClientRect();
  selectionRect = rect;
  toolbar.classList.remove('hidden');
  const toolbarRect = toolbar.getBoundingClientRect();
  toolbar.style.left = `${Math.max(8, Math.min(innerWidth - toolbarRect.width - 8, rect.left + rect.width / 2 - toolbarRect.width / 2))}px`;
  toolbar.style.top = `${rect.top > toolbarRect.height + 80 ? rect.top - toolbarRect.height - 8 : rect.bottom + 8}px`;
});

toolbar.addEventListener('mousedown', event => { if (!(event.target instanceof HTMLSelectElement)) event.preventDefault(); });
toolbar.addEventListener('click', event => {
  const action = (event.target as HTMLElement).closest<HTMLButtonElement>('button')?.dataset.action;
  if (!action) return;
  if (action === 'copy') { void navigator.clipboard.writeText(selectedText); toolbar.classList.add('hidden'); return; }
  if (action === 'highlight') { void createHighlight('yellow'); return; }
  if (action === 'note') { void createHighlight('yellow').then(value => value && openNoteDialog(value)); return; }
  if (action === 'translate') { void translateWithSavedLanguage(selectedText); return; }
  if (action === 'explain' || action === 'summarize') void requestResult(action, selectedText);
});

async function createHighlight(color: HighlightColor): Promise<Highlight | undefined> {
  if (!article || !selectedRange || !selectedText) return;
  const offsets = offsetsFromRange(content, selectedRange);
  if (!offsets) return;
  const block = parentElement(selectedRange.startContainer)?.closest<HTMLElement>('[data-reader-block],p,h1,h2,h3,h4,h5,h6,li,blockquote');
  const now = Date.now();
  const value: Highlight = {
    id: uid('highlight'), articleId: article.id, url: article.url, color,
    anchor: createTextAnchor(content.textContent ?? '', offsets.start, offsets.end, block?.dataset.readerBlock ?? '', domPath(block), article.contentHash),
    createdAt: now, updatedAt: now
  };
  await highlightRepository.put(value); highlights.push(value); toolbar.classList.add('hidden');
  rerenderHighlightsAndNotes(); return value;
}

async function changeColor(highlight: Highlight, color: HighlightColor): Promise<void> {
  highlight.color = color; highlight.updatedAt = Date.now(); await highlightRepository.put(highlight); hideHighlightPalette(); rerenderHighlightsAndNotes();
}

async function deleteHighlight(id: string): Promise<void> {
  await highlightRepository.delete(id); highlights = highlights.filter(item => item.id !== id); notes = notes.filter(item => item.highlightId !== id); rerenderHighlightsAndNotes();
}

async function deleteNote(id: string): Promise<void> {
  await noteRepository.delete(id); notes = notes.filter(item => item.id !== id); renderNotes();
}

function rerenderHighlightsAndNotes(): void { renderArticle(); renderHighlights(); renderNotes(); }

function openNoteDialog(highlight: Highlight, note?: Note): void {
  pendingHighlight = highlight;
  byId<HTMLTextAreaElement>('note-text').value = note?.text ?? '';
  noteDialog.showModal();
  positionNoteDialog(highlight);
  byId<HTMLTextAreaElement>('note-text').focus();
}

byId<HTMLFormElement>('note-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!pendingHighlight || !article) return;
  const existing = notes.find(item => item.highlightId === pendingHighlight!.id);
  const now = Date.now();
  const value: Note = { id: existing?.id ?? uid('note'), articleId: article.id, highlightId: pendingHighlight.id, text: byId<HTMLTextAreaElement>('note-text').value.trim(), createdAt: existing?.createdAt ?? now, updatedAt: now };
  void noteRepository.put(value).then(() => { notes = notes.filter(item => item.id !== value.id).concat(value); noteDialog.close(); renderNotes(); });
});
byId('cancel-note').addEventListener('click', () => noteDialog.close());
byId('close-note').addEventListener('click', () => noteDialog.close());

type ResultResponse = { ok: boolean; result?: TranslationResult | AIResult; error?: string; needsSettings?: boolean };
type ResultOperation = 'translate' | 'explain' | 'summarize' | 'key-points';

async function requestResult(operation: ResultOperation, text: string, targetLanguage?: string): Promise<void> {
  if (currentRequestId) return;
  currentRequestId = uid('request');
  const providerSettings = await settingsRepository.getProvider();
  byId('result-title').textContent = operation === 'translate' ? `Translation to ${languageName(targetLanguage ?? 'en')}` : operation === 'key-points' ? 'Key points' : operation === 'summarize' ? 'Summary' : 'Simple explanation';
  byId('result-loading').textContent = operation === 'translate' && providerSettings.translationProvider === 'local'
    ? 'Translating privately on this device…'
    : operation === 'summarize' || operation === 'key-points'
      ? providerSettings.aiProvider === 'local'
        ? 'Analyzing the full article on this device…'
        : 'Analyzing the full article in secure parts…'
      : 'Working…';
  byId('result-output').textContent = ''; byId('result-settings').classList.add('hidden'); byId('result-reload').classList.add('hidden'); byId('result-loading').classList.remove('hidden'); byId('cancel-request').classList.remove('hidden');
  if (!resultDialog.open) resultDialog.showModal(); toolbar.classList.add('hidden');
  const slowTranslationHint = operation === 'translate' && providerSettings.translationProvider === 'local'
    ? window.setTimeout(() => {
      byId('result-loading').textContent = 'Still preparing the local translator… On first use, its language model may still be downloading. If this takes more than 3 minutes, cancel and try again.';
    }, 60_000)
    : undefined;
  const payload = operation === 'translate' ? { type: 'translate', text, articleId: article?.id, sourceLanguage: 'auto', targetLanguage: targetLanguage ?? 'en', requestId: currentRequestId } : { type: 'ai', text, articleId: article?.id, operation, requestId: currentRequestId };
  try {
    const response = await requestThroughBackground(payload).catch(async error => {
      if (!isMissingMessageReceiverError(error) || !extensionContextIsAlive()) throw error;
      return runRequestInReader(operation, text, targetLanguage, providerSettings);
    });
    byId('result-output').textContent = response.ok && response.result ? ('translatedText' in response.result ? response.result.translatedText : response.result.output) : (response.error ?? 'The request failed.');
    byId('result-settings').classList.toggle('hidden', !response.needsSettings);
  } catch (error) {
    const invalidated = isExtensionContextInvalidatedError(error);
    byId('result-output').textContent = invalidated
      ? 'This Reader page belongs to an older extension session. Close it and open the article in Article Reader again.'
      : error instanceof Error ? error.message : 'The request failed unexpectedly.';
    byId('result-reload').classList.toggle('hidden', !invalidated);
  } finally {
    if (slowTranslationHint !== undefined) window.clearTimeout(slowTranslationHint);
    currentRequestController = undefined;
    byId('result-loading').classList.add('hidden'); byId('cancel-request').classList.add('hidden'); currentRequestId = undefined;
  }
}

async function requestThroughBackground(payload: object): Promise<ResultResponse> {
  let lastError: unknown = new Error('Could not establish connection. Receiving end does not exist.');
  for (const delayMs of [0, 180, 650]) {
    if (delayMs) await delay(delayMs);
    try {
      const response = await browser.runtime.sendMessage(payload) as ResultResponse | undefined;
      if (response) return response;
    } catch (error) {
      if (!isMissingMessageReceiverError(error)) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function runRequestInReader(operation: ResultOperation, text: string, targetLanguage: string | undefined, settings: ProviderSettings): Promise<ResultResponse> {
  try {
    const provider = operation === 'translate' ? settings.translationProvider : settings.aiProvider;
    await requireCloudPermission(provider, settings.consentGiven);
    const useCloudChunking = settings.aiProvider === 'openai-compatible';
    const timeoutMs = operation === 'translate'
      ? settings.translationProvider === 'local' ? Math.max(settings.timeoutMs, 180_000) : settings.timeoutMs
      : aiRequestTimeoutMs(text.length, settings.maxInputChars, settings.timeoutMs, useCloudChunking, operation);
    const controller = new AbortController();
    currentRequestController = controller;
    const timeout = window.setTimeout(() => controller.abort(new DOMException('The request timed out.', 'TimeoutError')), timeoutMs);
    try {
      if (operation === 'translate') {
        const limitedText = text.length <= settings.maxInputChars
          ? text
          : `${text.slice(0, settings.maxInputChars)}\n\n[Text was shortened to fit the configured input limit.]`;
        const sourceLanguage = await detectSourceLanguage(limitedText);
        const selectedTarget = targetLanguage ?? settings.targetLanguage;
        const translatedText = await createProviders(settings).translation.translate(limitedText, sourceLanguage, selectedTarget, controller.signal);
        const result: TranslationResult = { id: uid('translation'), articleId: article?.id, sourceText: limitedText, translatedText, sourceLanguage, targetLanguage: selectedTarget, provider: settings.translationProvider, createdAt: Date.now() };
        await resultRepository.putTranslation(result);
        return { ok: true, result };
      }
      const output = await runAIForText(createProviders(settings).ai, text, operation, settings.maxInputChars, useCloudChunking, controller.signal);
      const result: AIResult = { id: uid('ai'), articleId: article?.id, operation, sourceText: text, output, provider: settings.aiProvider, createdAt: Date.now() };
      await resultRepository.putAI(result);
      return { ok: true, result };
    } finally {
      window.clearTimeout(timeout);
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')
        ? 'The request was cancelled or timed out.'
        : error instanceof Error ? error.message : 'An unexpected error occurred.',
      needsSettings: Boolean(error && typeof error === 'object' && 'needsSettings' in error && error.needsSettings)
    };
  }
}

async function requireCloudPermission(provider: string, consentGiven: boolean): Promise<void> {
  if (provider === 'local' || provider === 'mock' || provider === 'none') return;
  if (!consentGiven) throw new Error('Confirm provider data sharing in Settings before using a cloud provider.');
  const permissions = await browser.permissions.getAll() as browser.Permissions.Permissions & FirefoxDataPermissions;
  if (!hasCloudDataPermissions(permissions)) throw new Error('Cloud data permission is missing or was revoked. Open Settings and save the provider again.');
}

function extensionContextIsAlive(): boolean {
  try { return Boolean(browser.runtime.getManifest().name); } catch { return false; }
}

function delay(milliseconds: number): Promise<void> { return new Promise(resolve => window.setTimeout(resolve, milliseconds)); }

byId('cancel-request').addEventListener('click', () => {
  currentRequestController?.abort();
  if (currentRequestId) void browser.runtime.sendMessage({ type: 'cancel-request', requestId: currentRequestId }).catch(() => undefined);
});
byId('result-settings').addEventListener('click', () => { void browser.runtime.openOptionsPage(); });
byId('result-reload').addEventListener('click', () => { location.reload(); });
byId<HTMLFormElement>('translation-form').addEventListener('submit', event => {
  event.preventDefault();
  const text = pendingTranslationText;
  const targetLanguage = byId<HTMLSelectElement>('translation-language').value;
  translationDialog.close();
  if (text) void settingsRepository.getProvider()
    .then(settings => settingsRepository.setProvider({ ...settings, targetLanguage, targetLanguageConfirmed: true }))
    .then(() => {
      byId<HTMLSelectElement>('reader-translation-language').value = targetLanguage;
      return requestResult('translate', text, targetLanguage);
    });
});
byId('cancel-translation').addEventListener('click', () => translationDialog.close());
byId('close-translation').addEventListener('click', () => translationDialog.close());
byId<HTMLSelectElement>('reader-translation-language').addEventListener('change', event => {
  const targetLanguage = (event.currentTarget as HTMLSelectElement).value;
  byId<HTMLSelectElement>('translation-language').value = targetLanguage;
  void settingsRepository.getProvider().then(settings => settingsRepository.setProvider({ ...settings, targetLanguage, targetLanguageConfirmed: true }));
});
byId('summarize-article').addEventListener('click', () => { if (article) void requestResult('summarize', article.textContent); });
byId('key-points').addEventListener('click', () => { if (article) void requestResult('key-points', article.textContent); });
byId('save-article').addEventListener('click', () => {
  if (!article) return; void articleRepository.put(article).then(saved => { article = saved; setSaveState(true); });
});
byId('back-source').addEventListener('click', () => {
  if (!article) return;
  void browser.tabs.getCurrent().then(tab => tab?.id === undefined ? browser.tabs.create({ url: article!.url }) : browser.tabs.update(tab.id, { url: article!.url }));
});
byId('toggle-notes').addEventListener('click', () => toggleSidePanel('notes'));
byId('toggle-references').addEventListener('click', () => toggleSidePanel('references'));
byId('close-notes').addEventListener('click', closeSidePanels);
byId('close-references').addEventListener('click', closeSidePanels);
byId('flip-toolbar').addEventListener('click', () => {
  const toolbarPosition: ReaderPreferences['toolbarPosition'] = currentPreferences.toolbarPosition === 'left' ? 'right' : 'left';
  const preferences = { ...currentPreferences, toolbarPosition };
  void settingsRepository.setReader(preferences).then(() => applyPreferences(preferences));
});
content.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  const mark = target.closest<HTMLElement>('mark[data-highlight-id]');
  if (mark?.dataset.highlightId) { event.preventDefault(); event.stopPropagation(); showHighlightPalette(mark.dataset.highlightId, mark); return; }
  const image = target.closest<HTMLImageElement>('img');
  if (image) { event.preventDefault(); openImageViewer(image); }
});
content.addEventListener('keydown', event => {
  const image = (event.target as HTMLElement).closest<HTMLImageElement>('img');
  if (image && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); openImageViewer(image); }
});

highlightPalette.addEventListener('click', event => {
  const color = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-highlight-color]')?.dataset.highlightColor as HighlightColor | undefined;
  const highlight = highlights.find(item => item.id === activeHighlightId);
  if (color && highlight) { void changeColor(highlight, color); return; }
  if ((event.target as HTMLElement).closest('#palette-note') && highlight) {
    hideHighlightPalette(); openNoteDialog(highlight, notes.find(item => item.highlightId === highlight.id));
  }
});

byId('close-image').addEventListener('click', () => imageDialog.close());
byId('viewer-image').addEventListener('click', event => { event.stopPropagation(); imageDialog.classList.toggle('zoomed'); });
imageDialog.addEventListener('click', event => { if (event.target === imageDialog) imageDialog.close(); });
imageDialog.addEventListener('close', () => { imageDialog.classList.remove('zoomed'); byId<HTMLImageElement>('viewer-image').removeAttribute('src'); });

const settingsPanel = byId('settings-panel');
const settingsButton = byId<HTMLButtonElement>('reader-settings');
settingsButton.addEventListener('click', () => {
  const willOpen = settingsPanel.classList.contains('hidden');
  if (willOpen) closeSidePanels();
  settingsPanel.classList.toggle('hidden');
  settingsButton.setAttribute('aria-expanded', String(willOpen));
});
document.addEventListener('pointerdown', event => {
  const target = event.target as Node;
  if (!settingsPanel.classList.contains('hidden') && !settingsPanel.contains(target) && !settingsButton.contains(target)) {
    settingsPanel.classList.add('hidden'); settingsButton.setAttribute('aria-expanded', 'false');
  }
  if (!highlightPalette.classList.contains('hidden') && !highlightPalette.contains(target) && !(target instanceof Element && target.closest('mark[data-highlight-id]'))) hideHighlightPalette();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('side-panel-open')) { closeSidePanels(); return; }
  if (event.key === 'Escape' && !settingsPanel.classList.contains('hidden')) {
    settingsPanel.classList.add('hidden'); settingsButton.setAttribute('aria-expanded', 'false'); settingsButton.focus();
  }
});
for (const id of ['theme', 'toolbar-position', 'direction', 'font-size', 'line-height', 'column-width']) byId(id).addEventListener('input', () => {
  updateAppearanceReadouts();
  void savePreferences();
});

function updateAppearanceReadouts(): void {
  byId<HTMLOutputElement>('font-size-value').value = `${byId<HTMLInputElement>('font-size').value} px`;
  byId<HTMLOutputElement>('line-height-value').value = `${byId<HTMLInputElement>('line-height').value}×`;
  byId<HTMLOutputElement>('column-width-value').value = `${byId<HTMLInputElement>('column-width').value} px`;
}

async function savePreferences(): Promise<void> {
  const prefs: ReaderPreferences = { theme: byId<HTMLSelectElement>('theme').value as ReaderPreferences['theme'], toolbarPosition: byId<HTMLSelectElement>('toolbar-position').value as ReaderPreferences['toolbarPosition'], direction: byId<HTMLSelectElement>('direction').value as ReaderPreferences['direction'], fontSize: Number(byId<HTMLInputElement>('font-size').value), lineHeight: Number(byId<HTMLInputElement>('line-height').value), columnWidth: Number(byId<HTMLInputElement>('column-width').value) };
  await settingsRepository.setReader(prefs); await applyPreferences(prefs);
}

async function applyPreferences(prefs: ReaderPreferences): Promise<void> {
  currentPreferences = prefs;
  document.documentElement.dataset.theme = prefs.theme; document.body.dataset.direction = prefs.direction; document.body.dataset.toolbarPosition = prefs.toolbarPosition;
  for (const [name, value] of Object.entries(readerStyle(prefs))) document.body.style.setProperty(name, value);
  byId<HTMLSelectElement>('theme').value = prefs.theme; byId<HTMLSelectElement>('toolbar-position').value = prefs.toolbarPosition; byId<HTMLSelectElement>('direction').value = prefs.direction; byId<HTMLInputElement>('font-size').value = String(prefs.fontSize); byId<HTMLInputElement>('line-height').value = String(prefs.lineHeight); byId<HTMLInputElement>('column-width').value = String(prefs.columnWidth);
  updateAppearanceReadouts();
  const flipButton = byId<HTMLButtonElement>('flip-toolbar');
  const destination = prefs.toolbarPosition === 'left' ? 'right' : 'left';
  flipButton.dataset.label = `Move toolbar to ${destination}`; flipButton.setAttribute('aria-label', `Move toolbar to ${destination}`);
  if (article) applyArticleDirection(prefs.direction);
}

async function handleContextAction(): Promise<void> {
  const stored = await browser.storage.local.get('pendingContextAction');
  const action = stored.pendingContextAction as { operation?: string; text?: string } | undefined;
  if (!action?.text) return showError('The selected text could not be found.');
  state.textContent = action.text; state.classList.remove('hidden');
  await browser.storage.local.remove('pendingContextAction');
  if (action.operation === 'translate-selection') { await translateWithSavedLanguage(action.text); return; }
  await requestResult(action.operation === 'summarize-selection' ? 'summarize' : 'explain', action.text);
}

function offsetsFromRange(root: Node, range: Range): { start: number; end: number } | null {
  const before = range.cloneRange(); before.selectNodeContents(root);
  try { before.setEnd(range.startContainer, range.startOffset); } catch { return null; }
  const start = before.toString().length; return { start, end: start + range.toString().length };
}

function parentElement(node: Node): Element | null { return node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement; }
function openTranslationDialog(text: string): void {
  pendingTranslationText = text;
  toolbar.classList.add('hidden');
  if (!translationDialog.open) translationDialog.showModal();
  byId<HTMLSelectElement>('translation-language').focus();
}
async function translateWithSavedLanguage(text: string): Promise<void> {
  const settings = await settingsRepository.getProvider();
  if (!settings.targetLanguageConfirmed) {
    openTranslationDialog(text);
    return;
  }
  toolbar.classList.add('hidden');
  await requestResult('translate', text, settings.targetLanguage);
}
function applyArticleDirection(preference: ReaderPreferences['direction']): void {
  if (!article) return;
  const articleDirection = preference === 'auto' ? (isRtlText(article.textContent) ? 'rtl' : 'ltr') : preference;
  articleElement.dir = articleDirection;
  byId<HTMLElement>('title').dir = preference === 'auto' ? (isRtlText(article.title) ? 'rtl' : 'ltr') : preference;
  content.dir = articleDirection;
  content.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li,blockquote,pre,figcaption,td,th').forEach(block => {
    block.dir = preference === 'auto' ? (isRtlText(block.textContent ?? '') ? 'rtl' : 'ltr') : preference;
  });
  content.querySelectorAll<HTMLElement>('ul,ol,table,figure').forEach(container => {
    container.dir = preference === 'auto' ? (isRtlText(container.textContent ?? '') ? 'rtl' : 'ltr') : preference;
  });
}
function positionNoteDialog(highlight: Highlight): void {
  const markRect = content.querySelector<HTMLElement>(`[data-highlight-id="${CSS.escape(highlight.id)}"]`)?.getBoundingClientRect();
  const anchor = markRect ?? selectionRect;
  if (!anchor) { noteDialog.style.removeProperty('left'); noteDialog.style.removeProperty('top'); return; }
  const dialogRect = noteDialog.getBoundingClientRect();
  const left = Math.max(12, Math.min(innerWidth - dialogRect.width - 12, anchor.left + anchor.width / 2 - dialogRect.width / 2));
  const preferredTop = anchor.bottom + 12;
  const top = preferredTop + dialogRect.height <= innerHeight - 12 ? preferredTop : Math.max(12, anchor.top - dialogRect.height - 12);
  noteDialog.style.left = `${left}px`; noteDialog.style.top = `${top}px`;
}
function languageName(code: string): string {
  try { return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code.toUpperCase(); } catch { return code.toUpperCase(); }
}
function prepareTables(): void {
  content.querySelectorAll<HTMLTableElement>('table').forEach(table => {
    if (table.parentElement?.classList.contains('table-scroll')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'table-scroll';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Scrollable table');
    table.before(wrapper); wrapper.append(table);
  });
}
function prepareImages(): void {
  content.querySelectorAll<HTMLImageElement>('img').forEach(image => {
    image.tabIndex = 0;
    image.setAttribute('role', 'button');
    image.setAttribute('aria-label', image.alt ? `Open image: ${image.alt}` : 'Open image');
    image.title = 'Open image';
  });
}
function renderReferences(): void {
  if (!article) return;
  const list = byId<HTMLOListElement>('references-list');
  const empty = byId<HTMLElement>('references-empty');
  list.replaceChildren();
  const combined: ReferenceLink[] = [...(article.references ?? []), ...collectReferences(content, article.url)];
  const references = combined.filter((reference, index) => combined.findIndex(item => item.url === reference.url) === index);
  for (const reference of references) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = reference.url; link.textContent = reference.label; link.target = '_blank'; link.rel = 'noopener noreferrer'; link.dir = 'auto';
    const destination = document.createElement('span'); destination.className = 'reference-destination'; destination.textContent = new URL(reference.url).hostname;
    item.append(link, destination); list.append(item);
  }
  empty.classList.toggle('hidden', references.length !== 0);
  const count = byId<HTMLElement>('references-count');
  count.textContent = String(references.length); count.classList.toggle('hidden', references.length === 0);
  byId('toggle-references').dataset.label = references.length ? `References (${references.length})` : 'References';
}
function toggleSidePanel(panel: 'notes' | 'references'): void {
  const target = panel === 'notes' ? notesPanel : referencesPanel;
  const shouldOpen = target.classList.contains('hidden');
  notesPanel.classList.add('hidden'); referencesPanel.classList.add('hidden');
  if (shouldOpen) target.classList.remove('hidden');
  syncSidePanelState();
}
function closeSidePanels(): void {
  notesPanel.classList.add('hidden'); referencesPanel.classList.add('hidden'); syncSidePanelState();
}
function syncSidePanelState(): void {
  const notesOpen = !notesPanel.classList.contains('hidden');
  const referencesOpen = !referencesPanel.classList.contains('hidden');
  document.body.classList.toggle('side-panel-open', notesOpen || referencesOpen);
  byId('toggle-notes').setAttribute('aria-expanded', String(notesOpen));
  byId('toggle-references').setAttribute('aria-expanded', String(referencesOpen));
}
function showHighlightPalette(id: string, mark: HTMLElement): void {
  const highlight = highlights.find(item => item.id === id);
  if (!highlight) return;
  activeHighlightId = id;
  highlightPalette.querySelectorAll<HTMLElement>('[data-highlight-color]').forEach(button => button.classList.toggle('active', button.dataset.highlightColor === highlight.color));
  highlightPalette.classList.remove('hidden');
  const markRect = mark.getBoundingClientRect();
  const paletteRect = highlightPalette.getBoundingClientRect();
  const left = Math.max(8, Math.min(innerWidth - paletteRect.width - 8, markRect.left + markRect.width / 2 - paletteRect.width / 2));
  const top = markRect.top > paletteRect.height + 12 ? markRect.top - paletteRect.height - 8 : markRect.bottom + 8;
  highlightPalette.style.left = `${left}px`; highlightPalette.style.top = `${Math.min(innerHeight - paletteRect.height - 8, top)}px`;
}
function hideHighlightPalette(): void { highlightPalette.classList.add('hidden'); activeHighlightId = undefined; }
function setSaveState(saved: boolean): void {
  const button = byId<HTMLButtonElement>('save-article');
  button.classList.toggle('is-saved', saved);
  button.dataset.label = saved ? 'Article saved' : 'Save article';
  button.setAttribute('aria-label', saved ? 'Article saved' : 'Save article');
}
function openImageViewer(source: HTMLImageElement): void {
  const src = source.currentSrc || source.src;
  if (!src) return;
  const viewer = byId<HTMLImageElement>('viewer-image');
  viewer.src = src; viewer.alt = source.alt;
  imageDialog.classList.remove('zoomed');
  if (!imageDialog.open) imageDialog.showModal();
}
function domPath(element: HTMLElement | null | undefined): string { if (!element) return ''; const parts: string[] = []; let node: HTMLElement | null = element; while (node && node !== content) { parts.unshift(`${node.tagName.toLowerCase()}:nth-child(${Array.from(node.parentElement?.children ?? []).indexOf(node) + 1})`); node = node.parentElement; } return parts.join('>'); }
function scrollToHighlight(id: string): void { content.querySelector<HTMLElement>(`[data-highlight-id="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
function showError(message: string): void { state.textContent = message; state.classList.remove('hidden'); articleElement.classList.add('hidden'); }
function smallButton(label: string, handler: (event: MouseEvent) => void, className = 'ghost'): HTMLButtonElement { const button = document.createElement('button'); button.textContent = label; button.className = className; button.addEventListener('click', handler); return button; }

void init();
