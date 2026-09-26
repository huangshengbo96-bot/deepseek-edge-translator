import { describe, expect, it } from 'vitest';
import { mapHttpError, parseDeepSeekResponse } from '../lib/deepseek';

const validResult = {
  kind: 'word',
  translation: '你好',
  phonetic: '/həˈləʊ/',
  entries: [{ partOfSpeech: 'int.', meaning: '你好' }],
  keyPhrases: [],
  grammarNote: '',
  example: { english: 'Hello there.', chinese: '你好。' }
};

describe('DeepSeek response handling', () => {
  it('extracts and validates structured output', () => {
    const result = parseDeepSeekResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validResult) }] }] });
    expect(result.translation).toBe('你好');
  });

  it('rejects empty or malformed output', () => {
    expect(() => parseDeepSeekResponse({ output: [] })).toThrow();
    expect(() => parseDeepSeekResponse({ output: [{ type: 'message', content: [{ type: 'output_text', text: '{}' }] }] })).toThrow();
  });

  it('maps authentication and throttling errors', async () => {
    await expect(mapHttpError(new Response('{}', { status: 401 }))).resolves.toMatchObject({ code: 'UNAUTHORIZED' });
    await expect(mapHttpError(new Response('{}', { status: 429 }))).resolves.toMatchObject({ code: 'RATE_LIMITED', retryable: true });
  });

  it('detects balance details', async () => {
    const response = new Response(JSON.stringify({ error: { code: 'insufficient_balance', message: 'Insufficient balance' } }), { status: 400 });
    await expect(mapHttpError(response)).resolves.toMatchObject({ code: 'INSUFFICIENT_BALANCE' });
  });
});
