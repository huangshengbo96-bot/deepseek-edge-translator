import { useState } from 'react';
import type { ReviewRating, TranslationRecord } from '../lib/types';

interface ReviewCardProps {
  record: TranslationRecord;
  onRate: (rating: ReviewRating) => Promise<void> | void;
}

export function ReviewCard({ record, onRate }: ReviewCardProps) {
  const [revealed, setRevealed] = useState(false);

  return (
    <article className="review-card" aria-label={`复习 ${record.sourceText}`}>
      <div className="review-card__meta">
        <span>{record.result.kind === 'word' ? '单词' : record.result.kind === 'phrase' ? '短语' : '句子'}</span>
        <span>已查 {record.lookupCount} 次</span>
      </div>
      <h2>{record.sourceText}</h2>
      {!revealed ? (
        <button className="button button--primary reveal-button" type="button" onClick={() => setRevealed(true)}>
          显示答案
        </button>
      ) : (
        <div className="review-card__answer">
          <p className="review-card__translation">{record.result.translation}</p>
          {record.result.phonetic && <p className="muted">{record.result.phonetic}</p>}
          {record.sources[0]?.contextSnippet && (
            <blockquote>{record.sources[0].contextSnippet}</blockquote>
          )}
          <div className="rating-row" aria-label="复习评分">
            <button className="button button--danger" type="button" onClick={() => onRate('again')}>忘记 · 10 分钟</button>
            <button className="button button--warning" type="button" onClick={() => onRate('hard')}>模糊 · 较短</button>
            <button className="button button--success" type="button" onClick={() => onRate('good')}>记住 · 较长</button>
          </div>
        </div>
      )}
    </article>
  );
}
