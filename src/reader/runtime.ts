import type { Article } from '../types';

let compatibleArticle: Article | undefined;

export function setCompatibleArticle(article: Article): void {
  compatibleArticle = article;
}

export function getCompatibleArticle(): Article | undefined {
  return compatibleArticle;
}

export function isCompatibleReader(): boolean {
  return compatibleArticle !== undefined;
}
