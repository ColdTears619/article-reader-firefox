import browser from 'webextension-polyfill';
import { createProviders } from '../providers';
import { detectSourceLanguage } from '../providers/local-translation';
import { articleRepository, resultRepository, settingsRepository } from '../storage/repositories';
import type { AIResult, Article, ExtensionMessage, TranslationResult } from '../types';
import { uid } from '../shared/utils';
import { hasCloudDataPermissions, type FirefoxDataPermissions } from '../shared/cloud-permissions';

const controllers = new Map<string, AbortController>();
const running = new Map<string, Promise<unknown>>();

browser.runtime.onInstalled.addListener(() => { void registerContextMenus(); });

async function registerContextMenus(): Promise<void> {
  await browser.contextMenus.removeAll();
  browser.contextMenus.create({ id: 'open-reader', title: 'Open in Article Reader', contexts: ['page'] });
  browser.contextMenus.create({ id: 'translate-selection', title: 'Translate selected text', contexts: ['selection'] });
  browser.contextMenus.create({ id: 'explain-selection', title: 'Explain selected text with AI', contexts: ['selection'] });
  browser.contextMenus.create({ id: 'summarize-selection', title: 'Summarize selected text', contexts: ['selection'] });
}

browser.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-reader' && tab?.id) {
    await openReader(tab.id);
    return;
  }
  if (!info.selectionText) return;
  const operation = String(info.menuItemId);
  await browser.storage.local.set({ pendingContextAction: { operation, text: info.selectionText, createdAt: Date.now() } });
  await browser.tabs.create({ url: browser.runtime.getURL('reader.html?context=1') });
});

browser.runtime.onMessage.addListener((message: unknown, sender: browser.Runtime.MessageSender) => {
  const request = message as ExtensionMessage;
  if (request.type === 'open-reader') return openReader(request.tabId ?? sender.tab?.id);
  if (request.type === 'save-current') return saveCurrent(request.tabId ?? sender.tab?.id);
  if (request.type === 'translate') return deduplicated(request.requestId, () => runTranslation(request));
  if (request.type === 'ai') return deduplicated(request.requestId, () => runAI(request));
  if (request.type === 'cancel-request') {
    controllers.get(request.requestId)?.abort();
    return Promise.resolve({ ok: true });
  }
  return undefined;
});

async function extractFromTab(tabId: number): Promise<Article> {
  let response: { ok: boolean; article?: Article; error?: string };
  try {
    response = await browser.tabs.sendMessage(tabId, { type: 'extract-article' }) as typeof response;
  } catch {
    await browser.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    response = await browser.tabs.sendMessage(tabId, { type: 'extract-article' }) as typeof response;
  }
  if (!response.ok || !response.article) throw new Error(response.error || 'Article extraction failed.');
  return response.article;
}

async function openReader(tabId?: number): Promise<{ ok: boolean; error?: string }> {
  try {
    if (tabId === undefined) throw new Error('No active tab was found.');
    const article = await extractFromTab(tabId);
    await articleRepository.put(article, false);
    await browser.tabs.update(tabId, { url: browser.runtime.getURL(`reader.html?id=${encodeURIComponent(article.id)}`) });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

async function saveCurrent(tabId?: number): Promise<{ ok: boolean; articleId?: string; error?: string }> {
  try {
    if (tabId === undefined) throw new Error('No active tab was found.');
    const article = await articleRepository.put(await extractFromTab(tabId));
    return { ok: true, articleId: article.id };
  } catch (error) {
    return { ok: false, error: friendlyError(error) };
  }
}

async function runTranslation(request: Extract<ExtensionMessage, { type: 'translate' }>) {
  const settings = await settingsRepository.getProvider();
  await requireConsent(settings.translationProvider, settings.consentGiven);
  const text = limit(request.text, settings.maxInputChars);
  const timeoutMs = settings.translationProvider === 'local' ? Math.max(settings.timeoutMs, 180_000) : settings.timeoutMs;
  const controller = withTimeout(request.requestId, timeoutMs);
  try {
    const sourceLanguage = request.sourceLanguage && request.sourceLanguage !== 'auto' ? request.sourceLanguage : await detectSourceLanguage(text);
    const output = await createProviders(settings).translation.translate(text, sourceLanguage, request.targetLanguage ?? settings.targetLanguage, controller.signal);
    const result: TranslationResult = { id: uid('translation'), articleId: request.articleId, sourceText: text, translatedText: output, sourceLanguage, targetLanguage: request.targetLanguage ?? settings.targetLanguage, provider: settings.translationProvider, createdAt: Date.now() };
    await resultRepository.putTranslation(result);
    return { ok: true, result };
  } catch (error) { return { ok: false, error: friendlyError(error), needsSettings: needsSettings(error) }; }
  finally { clearRequest(request.requestId); }
}

async function runAI(request: Extract<ExtensionMessage, { type: 'ai' }>) {
  const settings = await settingsRepository.getProvider();
  await requireConsent(settings.aiProvider, settings.consentGiven);
  const text = limit(request.text, settings.maxInputChars);
  const controller = withTimeout(request.requestId, settings.timeoutMs);
  try {
    const output = await createProviders(settings).ai.run(text, request.operation, controller.signal);
    const result: AIResult = { id: uid('ai'), articleId: request.articleId, operation: request.operation, sourceText: text, output, provider: settings.aiProvider, createdAt: Date.now() };
    await resultRepository.putAI(result);
    return { ok: true, result };
  } catch (error) { return { ok: false, error: friendlyError(error), needsSettings: needsSettings(error) }; }
  finally { clearRequest(request.requestId); }
}

function deduplicated(requestId: string, task: () => Promise<unknown>): Promise<unknown> {
  const existing = running.get(requestId);
  if (existing) return existing;
  const promise = task().finally(() => running.delete(requestId));
  running.set(requestId, promise);
  return promise;
}

function withTimeout(id: string, timeoutMs: number): AbortController {
  const controller = new AbortController();
  controllers.set(id, controller);
  setTimeout(() => controller.abort(new DOMException('The request timed out.', 'TimeoutError')), timeoutMs);
  return controller;
}

function clearRequest(id: string): void { controllers.delete(id); }
function limit(text: string, max: number): string { return text.length <= max ? text : `${text.slice(0, max)}\n\n[Text was shortened to fit the configured input limit.]`; }
async function requireConsent(provider: string, consent: boolean): Promise<void> {
  if (provider === 'local' || provider === 'mock' || provider === 'none') return;
  if (!consent) throw new Error('Confirm provider data sharing in Settings before using a cloud provider.');
  const permissions = await browser.permissions.getAll() as browser.Permissions.Permissions & FirefoxDataPermissions;
  if (!hasCloudDataPermissions(permissions)) {
    throw new Error('Cloud data permission is missing or was revoked. Open Settings and save the provider again.');
  }
}
function needsSettings(error: unknown): boolean { return Boolean(error && typeof error === 'object' && 'needsSettings' in error && error.needsSettings); }
function friendlyError(error: unknown): string {
  if (error instanceof DOMException && error.name === 'AbortError') return 'The request was cancelled or timed out.';
  return error instanceof Error ? error.message : 'An unexpected error occurred.';
}
