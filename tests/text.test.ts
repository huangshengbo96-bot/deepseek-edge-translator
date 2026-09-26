import { describe, expect, it } from 'vitest';
import { cleanSelectedText, makeContextSnippet, normalizeText, sanitizeSource, validateSelection } from '../lib/text';

describe('text helpers', () => {
  it('normalizes spacing, width, and English case', () => {
    expect(normalizeText('  Ｈello\n  WORLD  ')).toBe('hello world');
    expect(cleanSelectedText('  Hello\n  WORLD  ')).toBe('Hello WORLD');
  });

  it('validates English selections and length', () => {
    expect(validateSelection('hello')).toBeNull();
    expect(validateSelection('你好')).toContain('不包含英文');
    expect(validateSelection('a'.repeat(2001))).toContain('2000');
  });

  it('builds a bounded context around the selection', () => {
    const snippet = makeContextSnippet(`${'before '.repeat(50)}target phrase${' after'.repeat(50)}`, 'target phrase');
    expect(snippet).toContain('target phrase');
    expect(snippet.length).toBeLessThanOrEqual(301);
  });

  it('rejects unsafe source protocols', () => {
    expect(sanitizeSource({ title: 'x', url: 'javascript:alert(1)', contextSnippet: 'test' }, 10)).toEqual({
      title: 'x', url: '', contextSnippet: 'test', seenAt: 10
    });
  });
});
