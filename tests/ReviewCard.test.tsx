import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewCard } from '../components/ReviewCard';
import type { TranslationRecord } from '../lib/types';

const record: TranslationRecord = {
  id: '1', normalizedKey: 'hello', sourceText: 'Hello', lookupCount: 1,
  result: {
    kind: 'word',
    translation: '你好',
    phonetic: '/həˈləʊ/',
    entries: [{
      partOfSpeech: '感叹词',
      meaning: '你好；喂',
      example: { english: 'She said hello with a smile.', chinese: '她微笑着打了招呼。' }
    }],
    wordForms: [{ label: '名词', form: 'hello' }],
    keyPhrases: [],
    grammarNote: '',
    example: { english: '', chinese: '' }
  },
  sources: [{ title: 'Page', url: 'https://example.com/', contextSnippet: 'Hello, my friend.', seenAt: 1 }],
  firstSeenAt: 1, lastSeenAt: 1, marked: true, tags: []
};

describe('ReviewCard', () => {
  it('hides the answer until revealed and submits a rating', () => {
    const onRate = vi.fn();
    render(<ReviewCard record={record} onRate={onRate} />);
    expect(screen.queryByText('你好')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    expect(screen.getByText('你好')).toBeInTheDocument();
    expect(screen.getByText('你好；喂')).toBeInTheDocument();
    expect(screen.getByText('She said hello with a smile.')).toBeInTheDocument();
    expect(screen.getByText('名词')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /记住/ }));
    expect(onRate).toHaveBeenCalledWith('good');
  });

  it('offers to enrich legacy word records', () => {
    const onRefresh = vi.fn();
    const legacyRecord: TranslationRecord = {
      ...record,
      result: {
        ...record.result,
        wordForms: undefined,
        entries: [{ partOfSpeech: '感叹词', meaning: '你好' }]
      }
    };
    render(<ReviewCard record={legacyRecord} onRate={vi.fn()} onRefresh={onRefresh} />);
    fireEvent.click(screen.getByRole('button', { name: '显示答案' }));
    fireEvent.click(screen.getByRole('button', { name: '补充完整词义' }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});
