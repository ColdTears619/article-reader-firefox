import browser from 'webextension-polyfill';
import { articleRepository, highlightRepository, noteRepository } from '../storage/repositories';
import type { Article, Highlight, Note } from '../types';

export interface ReaderDataStore {
  getArticle(id: string): Promise<Article | undefined>;
  saveArticle(article: Article): Promise<Article>;
  listHighlights(articleId: string): Promise<Highlight[]>;
  putHighlight(highlight: Highlight): Promise<void>;
  deleteHighlight(highlightId: string): Promise<void>;
  listNotes(articleId: string): Promise<Note[]>;
  putNote(note: Note): Promise<void>;
  deleteNote(noteId: string): Promise<void>;
}

type DataResponse<T> = { ok: boolean; value?: T; error?: string };

async function remoteValue<T>(message: object): Promise<T> {
  const response = await browser.runtime.sendMessage(message) as DataResponse<T> | undefined;
  if (!response?.ok) throw new Error(response?.error ?? 'Reader data could not be saved.');
  return response.value as T;
}

export function createReaderDataStore(compatibleArticle?: Article): ReaderDataStore {
  if (!compatibleArticle) {
    return {
      getArticle: id => articleRepository.get(id),
      saveArticle: article => articleRepository.put(article),
      listHighlights: articleId => highlightRepository.list(articleId),
      putHighlight: highlight => highlightRepository.put(highlight),
      deleteHighlight: highlightId => highlightRepository.delete(highlightId),
      listNotes: articleId => noteRepository.list(articleId),
      putNote: note => noteRepository.put(note),
      deleteNote: noteId => noteRepository.delete(noteId)
    };
  }

  return {
    getArticle: async id => id === compatibleArticle.id ? compatibleArticle : undefined,
    saveArticle: article => remoteValue<Article>({ type: 'reader-data', action: 'save-article', article }),
    listHighlights: articleId => remoteValue<Highlight[]>({ type: 'reader-data', action: 'list-highlights', articleId }),
    putHighlight: highlight => remoteValue<void>({ type: 'reader-data', action: 'put-highlight', highlight }),
    deleteHighlight: highlightId => remoteValue<void>({ type: 'reader-data', action: 'delete-highlight', highlightId }),
    listNotes: articleId => remoteValue<Note[]>({ type: 'reader-data', action: 'list-notes', articleId }),
    putNote: note => remoteValue<void>({ type: 'reader-data', action: 'put-note', note }),
    deleteNote: noteId => remoteValue<void>({ type: 'reader-data', action: 'delete-note', noteId })
  };
}
