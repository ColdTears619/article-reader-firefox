declare module '@browsermt/bergamot-translator/translator.js' {
  export interface TranslatorOptions {
    cacheSize?: number;
    downloadTimeout?: number;
    pivotLanguage?: string | null;
    useNativeIntGemm?: boolean;
  }

  export class TranslatorBacking {
    options: TranslatorOptions;
    registry: Promise<Array<{ from: string; to: string; [key: string]: unknown }>>;
    constructor(options?: TranslatorOptions);
    loadWorker(): Promise<{ worker: Worker; exports: Record<string, (...args: unknown[]) => Promise<unknown>> }>;
  }

  export class LatencyOptimisedTranslator {
    constructor(options?: TranslatorOptions, backing?: TranslatorBacking);
    translate(request: { from: string; to: string; text: string; html?: boolean }, options?: { signal?: AbortSignal }): Promise<{ target: { text: string } }>;
    delete(): Promise<void>;
  }
}
