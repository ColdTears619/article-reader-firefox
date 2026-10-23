export type TextDirection = 'auto' | 'rtl' | 'ltr';
export type Theme = 'system' | 'light' | 'dark' | 'sepia' | 'slate' | 'contrast';

export interface ReferenceLink {
  url: string;
  label: string;
}

export interface Article {
  id: string;
  url: string;
  title: string;
  byline: string;
  siteName: string;
  excerpt: string;
  content: string;
  textContent: string;
  length: number;
  language?: string;
  direction: TextDirection;
  extractedAt: number;
  savedAt?: number;
  contentHash: string;
  references?: ReferenceLink[];
}

export interface HighlightAnchor {
  quote: string;
  prefix: string;
  suffix: string;
  startOffset: number;
  endOffset: number;
  blockId: string;
  domPath: string;
  contentHash: string;
}

export interface Highlight {
  id: string;
  articleId: string;
  url: string;
  color: HighlightColor;
  anchor: HighlightAnchor;
  createdAt: number;
  updatedAt: number;
}

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

export interface Note {
  id: string;
  articleId: string;
  highlightId: string;
  text: string;
  createdAt: number;
  updatedAt: number;
}

export interface TranslationResult {
  id: string;
  articleId?: string;
  sourceText: string;
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
  provider: string;
  createdAt: number;
}

export type AIOperation = 'explain' | 'summarize' | 'key-points' | 'define' | 'question';

export interface AIResult {
  id: string;
  articleId?: string;
  operation: AIOperation;
  sourceText: string;
  output: string;
  provider: string;
  createdAt: number;
}

export interface ProviderSettings {
  translationProvider: 'local' | 'mock' | 'google-cloud' | 'openai-compatible';
  aiProvider: 'none' | 'local' | 'mock' | 'openai-compatible';
  endpoint: string;
  model: string;
  apiKey: string;
  googleApiKey: string;
  targetLanguage: string;
  targetLanguageConfirmed: boolean;
  consentGiven: boolean;
  timeoutMs: number;
  maxInputChars: number;
}

export interface ReaderPreferences {
  theme: Theme;
  toolbarPosition: 'left' | 'right';
  fontSize: number;
  lineHeight: number;
  columnWidth: number;
  direction: TextDirection;
}

export type ExtensionMessage =
  | { type: 'extract-article' }
  | { type: 'probe-page' }
  | { type: 'open-reader'; tabId?: number }
  | { type: 'save-current'; tabId?: number }
  | { type: 'translate'; text: string; articleId?: string; sourceLanguage?: string; targetLanguage?: string; requestId: string }
  | { type: 'ai'; text: string; articleId?: string; operation: AIOperation; requestId: string }
  | { type: 'cancel-request'; requestId: string };
