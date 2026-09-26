import { useState } from 'react';
import type { ReviewRating, TranslationRecord } from '../lib/types';

interface ReviewCardProps {
  record: TranslationRecord;
  onRate: (rating: ReviewRating) => Promise<void> | void;
  onRefresh?: () => Promise<void> | void;
}

export function ReviewCard({ record, onRate, onRefresh }: ReviewCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const isLegacyWord = record.result.kind === 'word' && (
    record.result.wordForms === undefined || record.result.entries.some((entry) => entry.example === undefined)
  );

  const refreshDetails = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    setRefreshError('');
    try {
      await onRefresh();
    } catch (error) {
      setRefreshError(error instanceof Error ? error.message : '补充词义失败，请稍后重试');
    } finally {
      setRefreshing(false);
    }
  };

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
          {record.result.wordForms && record.result.wordForms.length > 0 && (
            <section className="review-card__section">
              <h3>词形变化与派生词</h3>
              <div className="word-form-list">
                {record.result.wordForms.map((item, index) => (
                  <span className="word-form" key={`${item.label}-${item.form}-${index}`}>
                    <small>{item.label}</small>{item.form}
                  </span>
                ))}
              </div>
            </section>
          )}
          {record.result.entries.length > 0 && (
            <section className="review-card__section">
              <h3>常用释义与例句</h3>
              <div className="sense-list">
                {record.result.entries.map((entry, index) => (
                  <div className="sense-card" key={`${entry.partOfSpeech}-${entry.meaning}-${index}`}>
                    <div className="sense-card__meaning"><span>{entry.partOfSpeech}</span>{entry.meaning}</div>
                    {entry.example && (entry.example.english || entry.example.chinese) && (
                      <div className="sense-card__example">
                        {entry.example.english && <p>{entry.example.english}</p>}
                        {entry.example.chinese && <p>{entry.example.chinese}</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
          {isLegacyWord && onRefresh && (
            <div className="legacy-details">
              <p>这是一条旧版记录，可补充多词性、词形变化和每个释义的例句。</p>
              <button className="button button--muted" type="button" disabled={refreshing} onClick={() => void refreshDetails()}>
                {refreshing ? '正在补充…' : '补充完整词义'}
              </button>
              {refreshError && <p className="refresh-error">{refreshError}</p>}
            </div>
          )}
          {record.result.example && (record.result.example.english || record.result.example.chinese) && (
            <section className="review-card__section">
              <h3>例句</h3>
              <div className="sense-card__example">
                {record.result.example.english && <p>{record.result.example.english}</p>}
                {record.result.example.chinese && <p>{record.result.example.chinese}</p>}
              </div>
            </section>
          )}
          {record.sources[0]?.contextSnippet && (
            <blockquote><strong>原文上下文</strong>{record.sources[0].contextSnippet}</blockquote>
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
