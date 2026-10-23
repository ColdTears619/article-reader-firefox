import { describe, expect, it } from 'vitest';
import { LocalAIProvider, rankSentences, splitSentences } from './local-ai';

describe('local article tools', () => {
  const passage = [
    'Local translation keeps private article text on the reader device.',
    'The language model downloads only when the language pair is used for the first time.',
    'After that download, translation can continue without an internet connection.',
    'Cloud translation can remain available as an optional provider for readers who prefer it.'
  ].join(' ');

  it('creates a readable extractive summary without an API key', async () => {
    const output = await new LocalAIProvider().run(passage, 'summarize', new AbortController().signal);
    expect(output).not.toContain('mock');
    expect(splitSentences(output).length).toBeGreaterThanOrEqual(2);
  });

  it('formats key points as a list', async () => {
    const output = await new LocalAIProvider().run(passage, 'key-points', new AbortController().signal);
    expect(output.split('\n').every(line => line.startsWith('• '))).toBe(true);
  });

  it('asks for AI settings only for generative actions', async () => {
    await expect(new LocalAIProvider().run(passage, 'explain', new AbortController().signal)).rejects.toMatchObject({ needsSettings: true });
  });

  it('ranks relevant sentences deterministically', () => {
    const sentences = splitSentences(passage);
    expect(rankSentences(sentences)).toHaveLength(sentences.length);
  });
});
