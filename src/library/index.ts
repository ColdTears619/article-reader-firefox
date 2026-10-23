import browser from 'webextension-polyfill';
import { articleRepository, highlightRepository, noteRepository } from '../storage/repositories';
import type { Article } from '../types';

const list = document.querySelector<HTMLElement>('#article-list')!;
const state = document.querySelector<HTMLElement>('#library-state')!;
const search = document.querySelector<HTMLInputElement>('#search')!;
const sort = document.querySelector<HTMLSelectElement>('#sort')!;
let articles: Article[] = [];

async function load(): Promise<void> {
  articles = await articleRepository.list();
  await render();
}

async function render(): Promise<void> {
  const query = search.value.trim().toLocaleLowerCase('fa');
  const values = articles.filter(article => `${article.title} ${article.siteName} ${article.textContent}`.toLocaleLowerCase('fa').includes(query));
  values.sort((a, b) => sort.value === 'oldest' ? (a.savedAt ?? 0) - (b.savedAt ?? 0) : sort.value === 'title' ? a.title.localeCompare(b.title, 'fa') : (b.savedAt ?? 0) - (a.savedAt ?? 0));
  list.replaceChildren();
  state.classList.toggle('hidden', values.length > 0);
  state.textContent = articles.length ? 'No articles match this search.' : 'You have not saved any articles yet.';
  const cards = await Promise.all(values.map(createCard));
  list.append(...cards);
}

async function createCard(article: Article): Promise<HTMLElement> {
  const [highlights, notes] = await Promise.all([highlightRepository.list(article.id), noteRepository.list(article.id)]);
  const card = document.createElement('article');
  card.className = 'article-card';
  const domain = document.createElement('p'); domain.className = 'eyebrow'; domain.textContent = article.siteName;
  const title = document.createElement('h2'); title.textContent = article.title;
  const excerpt = document.createElement('p'); excerpt.className = 'excerpt'; excerpt.textContent = article.excerpt;
  const stats = document.createElement('p'); stats.className = 'muted'; stats.textContent = `${highlights.length} highlights · ${notes.length} notes · ${new Date(article.savedAt ?? article.extractedAt).toLocaleDateString('en')}`;
  const actions = document.createElement('div'); actions.className = 'card-actions';
  const open = button('Read', async () => { await browser.tabs.create({ url: browser.runtime.getURL(`reader.html?id=${encodeURIComponent(article.id)}`) }); });
  const source = button('Source', async () => { await browser.tabs.create({ url: article.url }); }, 'ghost');
  const remove = button('Delete', async () => {
    if (!confirm('Delete this article and all of its highlights, notes, and saved results?')) return;
    await articleRepository.deleteCascade(article.id);
    articles = articles.filter(item => item.id !== article.id);
    await render();
  }, 'danger');
  actions.append(open, source, remove); card.append(domain, title, excerpt, stats, actions); return card;
}

function button(label: string, handler: () => Promise<void>, className = ''): HTMLButtonElement {
  const element = document.createElement('button'); element.textContent = label; element.className = className; element.addEventListener('click', () => void handler()); return element;
}

search.addEventListener('input', () => void render());
sort.addEventListener('change', () => void render());
void load();
