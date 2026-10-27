import { describe, expect, it, vi } from 'vitest';
import type { AIProvider } from './index';
import { aiRequestTimeoutMs, runAIForText, splitTextIntoChunks } from './full-text-ai';

function recordingProvider(): { provider: AIProvider; run: ReturnType<typeof vi.fn> } {
  const run = vi.fn(async (text: string) => `Summary: ${text.slice(0, 12)}`);
  return { provider: { run }, run };
}

describe('full article AI processing', () => {
  const article = Array.from({ length: 12 }, (_, index) => `Section ${index + 1} contains enough article text to verify that every section is processed.`).join('\n\n');

  it('splits long text without exceeding the per-request limit', () => {
    const chunks = splitTextIntoChunks(article, 250);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every(chunk => chunk.length <= 250)).toBe(true);
    for (let index = 1; index <= 12; index += 1) expect(chunks.join(' ')).toContain(`Section ${index}`);
  });

  it('summarizes every cloud chunk and then creates a final summary', async () => {
    const { provider, run } = recordingProvider();
    const output = await runAIForText(provider, article, 'summarize', 250, true, new AbortController().signal);
    const initialChunks = splitTextIntoChunks(article, 250);
    expect(run.mock.calls.length).toBe(initialChunks.length + 1);
    expect(run.mock.calls.slice(0, initialChunks.length).map(call => call[0])).toEqual(initialChunks);
    expect(output).toContain('Summary:');
  });

  it('lets the local provider analyze the full article in one pass', async () => {
    const { provider, run } = recordingProvider();
    await runAIForText(provider, article, 'key-points', 250, false, new AbortController().signal);
    expect(run).toHaveBeenCalledTimes(1);
    expect(run).toHaveBeenCalledWith(article, 'key-points', expect.any(AbortSignal));
  });

  it('extends the overall timeout for multi-request cloud summaries', () => {
    expect(aiRequestTimeoutMs(50_000, 16_000, 30_000, true, 'summarize')).toBe(150_000);
    expect(aiRequestTimeoutMs(50_000, 16_000, 30_000, true, 'explain')).toBe(30_000);
  });
});
