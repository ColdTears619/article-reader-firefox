import type { AIOperation } from '../types';
import { ProviderConfigurationError } from './errors';
import type { AIProvider } from './index';

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'been', 'but', 'by', 'for', 'from', 'had', 'has', 'have', 'he', 'her', 'his', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'more', 'not', 'of', 'on', 'or', 'our', 'she', 'so', 'that', 'the', 'their', 'them', 'there', 'they', 'this', 'to', 'was', 'we', 'were', 'what', 'when', 'which', 'who', 'will', 'with', 'you', 'your',
  'از', 'است', 'این', 'آن', 'با', 'برای', 'به', 'بود', 'را', 'در', 'شد', 'که', 'می', 'یک', 'و', 'یا', 'اما', 'اگر', 'تا', 'روی', 'خود', 'های', 'هم'
]);

interface RankedSentence {
  index: number;
  sentence: string;
  score: number;
}

export class LocalAIProvider implements AIProvider {
  async run(text: string, operation: AIOperation, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
    if (operation !== 'summarize' && operation !== 'key-points') {
      throw new ProviderConfigurationError('This action needs an AI provider. Add an OpenAI-compatible API key in Settings, or use the free local Summary and Key points tools.');
    }

    const sentences = splitSentences(text);
    if (!sentences.length) throw new Error('There is not enough readable text to summarize.');
    const ranked = rankSentences(sentences);
    const desired = operation === 'key-points'
      ? Math.min(7, Math.max(3, Math.ceil(sentences.length * 0.12)))
      : Math.min(5, Math.max(2, Math.ceil(sentences.length * 0.08)));
    const selected = ranked.slice(0, Math.min(desired, ranked.length));

    if (operation === 'key-points') return selected.map(item => `• ${item.sentence}`).join('\n');
    return selected.sort((a, b) => a.index - b.index).map(item => item.sentence).join(' ');
  }
}

export function splitSentences(text: string): string[] {
  return (text.replace(/\s+/g, ' ').match(/[^.!?؟。！？]+(?:[.!?؟。！？]+|$)/gu) ?? [])
    .map(sentence => sentence.trim())
    .filter(sentence => sentence.length >= 24);
}

export function rankSentences(sentences: string[]): RankedSentence[] {
  const tokensBySentence = sentences.map(tokenize);
  const frequency = new Map<string, number>();
  for (const tokens of tokensBySentence) {
    for (const token of new Set(tokens)) frequency.set(token, (frequency.get(token) ?? 0) + 1);
  }

  return sentences.map((sentence, index) => {
    const tokens = tokensBySentence[index];
    const distinct = [...new Set(tokens)];
    const relevance = distinct.reduce((sum, token) => sum + Math.log(1 + sentences.length / (frequency.get(token) ?? 1)), 0);
    const positionBonus = index === 0 ? 1.22 : index < 3 ? 1.1 : 1;
    const lengthBalance = Math.min(1, sentence.length / 80) * Math.min(1, 260 / Math.max(sentence.length, 1));
    return { index, sentence, score: relevance * positionBonus * lengthBalance };
  }).sort((a, b) => b.score - a.score || a.index - b.index);
}

function tokenize(text: string): string[] {
  return (text.toLocaleLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? []).filter(token => !STOP_WORDS.has(token));
}
