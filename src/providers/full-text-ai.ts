import type { AIOperation } from '../types';
import type { AIProvider } from './index';

const WHOLE_ARTICLE_OPERATIONS = new Set<AIOperation>(['summarize', 'key-points']);
const MAX_REDUCTION_ROUNDS = 8;

export async function runAIForText(
  provider: AIProvider,
  text: string,
  operation: AIOperation,
  maxInputChars: number,
  useCloudChunking: boolean,
  signal: AbortSignal
): Promise<string> {
  const source = text.trim();
  if (!source) throw new Error('There is not enough readable text to analyze.');
  if (!WHOLE_ARTICLE_OPERATIONS.has(operation)) {
    return provider.run(limitSingleInput(source, maxInputChars), operation, signal);
  }
  if (!useCloudChunking || source.length <= maxInputChars) {
    return provider.run(source, operation, signal);
  }

  let parts = splitTextIntoChunks(source, maxInputChars);
  for (let round = 0; round < MAX_REDUCTION_ROUNDS; round += 1) {
    const summaries: string[] = [];
    for (const part of parts) {
      if (signal.aborted) throw signal.reason ?? new DOMException('Cancelled', 'AbortError');
      summaries.push(await provider.run(part, operation, signal));
    }
    const combined = summaries.join('\n\n---\n\n');
    if (combined.length <= maxInputChars) {
      return provider.run(combined, operation, signal);
    }
    parts = splitTextIntoChunks(combined, maxInputChars);
  }
  throw new Error('The provider could not reduce the article enough to create a final summary. Increase the maximum text per AI request and try again.');
}

export function splitTextIntoChunks(text: string, maxInputChars: number): string[] {
  const limit = Math.max(250, Math.floor(maxInputChars));
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/).map(block => block.trim()).filter(Boolean);
  const units = blocks.flatMap(block => splitOversizedBlock(block, limit));
  const chunks: string[] = [];
  let current = '';
  for (const unit of units) {
    const candidate = current ? `${current}\n\n${unit}` : unit;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    current = unit;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function aiRequestTimeoutMs(textLength: number, maxInputChars: number, baseTimeoutMs: number, useCloudChunking: boolean, operation: AIOperation): number {
  if (!useCloudChunking || !WHOLE_ARTICLE_OPERATIONS.has(operation) || textLength <= maxInputChars) return baseTimeoutMs;
  const estimatedCalls = Math.ceil(textLength / Math.max(1, maxInputChars)) + 1;
  return Math.min(300_000, Math.max(baseTimeoutMs, estimatedCalls * baseTimeoutMs));
}

function splitOversizedBlock(block: string, limit: number): string[] {
  if (block.length <= limit) return [block];
  const sentences = block.match(/[^.!?؟。！？]+(?:[.!?؟。！？]+|$)/gu)?.map(sentence => sentence.trim()).filter(Boolean) ?? [block];
  const units: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    for (const piece of splitOversizedSentence(sentence, limit)) {
      const candidate = current ? `${current} ${piece}` : piece;
      if (candidate.length <= limit) current = candidate;
      else {
        if (current) units.push(current);
        current = piece;
      }
    }
  }
  if (current) units.push(current);
  return units;
}

function splitOversizedSentence(sentence: string, limit: number): string[] {
  if (sentence.length <= limit) return [sentence];
  const words = sentence.split(/\s+/).filter(Boolean);
  const pieces: string[] = [];
  let current = '';
  for (const word of words) {
    if (word.length > limit) {
      if (current) { pieces.push(current); current = ''; }
      for (let index = 0; index < word.length; index += limit) pieces.push(word.slice(index, index + limit));
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= limit) current = candidate;
    else { pieces.push(current); current = word; }
  }
  if (current) pieces.push(current);
  return pieces;
}

function limitSingleInput(text: string, maxInputChars: number): string {
  if (text.length <= maxInputChars) return text;
  return `${text.slice(0, maxInputChars)}\n\n[Text was shortened to fit the configured input limit.]`;
}
