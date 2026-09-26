import { describe, expect, it } from 'vitest';
import { mapHttpError, outputTokenLimit, parseDeepSeekResponse, translateWithDeepSeek } from '../lib/deepseek';

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

  it('disables reasoning and keeps short translations concise', async () => {
    let requestBody = '';
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = String(init?.body ?? '');
      return new Response(JSON.stringify({
        output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(validResult) }] }]
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    };

    await translateWithDeepSeek('hello', 'test-key', 'deepseek-flash', fetcher as typeof fetch);
    const body = JSON.parse(requestBody) as { reasoning: { effort: string }; max_output_tokens: number; temperature: number };
    expect(body.reasoning).toEqual({ effort: 'none' });
    expect(body.temperature).toBe(0.2);
    expect(body.max_output_tokens).toBe(600);
  });

  it('raises the output limit only for longer selections', () => {
    expect(outputTokenLimit('short')).toBe(600);
    expect(outputTokenLimit('a'.repeat(2000))).toBe(1550);
    expect(outputTokenLimit('a'.repeat(5000))).toBe(1600);
  });
});
