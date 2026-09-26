import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ReviewCard } from '../components/ReviewCard';
import type { TranslationRecord } from '../lib/types';

const record: TranslationRecord = {
  id: '1', normalizedKey: 'hello', sourceText: 'Hello', lookupCount: 1,
  result: { kind: 'word', translation: '你好', phonetic: '/həˈləʊ/', entries: [], keyPhrases: [], grammarNote: '', example: { english: '', chinese: '' } },
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
    fireEvent.click(screen.getByRole('button', { name: /记住/ }));
    expect(onRate).toHaveBeenCalledWith('good');
  });
});
