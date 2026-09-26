import type { SourceSnapshot } from './types';

export const MAX_SELECTION_LENGTH = 2000;
export const MAX_CONTEXT_LENGTH = 300;

export function normalizeText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

export function cleanSelectedText(text: string): string {
  return text.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

export function validateSelection(text: string): string | null {
  const cleaned = cleanSelectedText(text);
  if (!cleaned) return '请先选择英文单词或句子';
  if (cleaned.length > MAX_SELECTION_LENGTH) return `选中文本不能超过 ${MAX_SELECTION_LENGTH} 个字符`;
  if (!/[A-Za-z]/.test(cleaned)) return '选中的内容不包含英文文本';
  return null;
}

export function makeContextSnippet(containerText: string, selectedText: string): string {
  const container = containerText.replace(/\s+/g, ' ').trim();
  const selected = cleanSelectedText(selectedText);
  if (!container) return selected.slice(0, MAX_CONTEXT_LENGTH);

  const index = container.toLocaleLowerCase().indexOf(selected.toLocaleLowerCase());
  if (index < 0) return container.slice(0, MAX_CONTEXT_LENGTH);

  const remaining = Math.max(0, MAX_CONTEXT_LENGTH - selected.length);
  const before = Math.floor(remaining / 2);
  const start = Math.max(0, index - before);
  const end = Math.min(container.length, start + MAX_CONTEXT_LENGTH);
  let snippet = container.slice(Math.max(0, end - MAX_CONTEXT_LENGTH), end);
  if (start > 0) snippet = `…${snippet.slice(1)}`;
  if (end < container.length) snippet = `${snippet.slice(0, -1)}…`;
  return snippet;
}

export function sanitizeSource(source: Omit<SourceSnapshot, 'seenAt'>, now = Date.now()): SourceSnapshot {
  let safeUrl = '';
  try {
    const parsed = new URL(source.url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') safeUrl = parsed.href;
  } catch {
    safeUrl = '';
  }

  return {
    title: source.title.trim().slice(0, 300),
    url: safeUrl,
    contextSnippet: source.contextSnippet.trim().slice(0, MAX_CONTEXT_LENGTH),
    seenAt: now
  };
}

export function escapeCsv(value: string | number | boolean | undefined): string {
  const text = value == null ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}
