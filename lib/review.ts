import type { ReviewRating, ReviewState } from './types';

const DAY = 24 * 60 * 60 * 1000;
const TEN_MINUTES = 10 * 60 * 1000;

export function createReviewState(now = Date.now()): ReviewState {
  return {
    intervalDays: 0,
    dueAt: now,
    lapses: 0,
    reviewCount: 0
  };
}

export function scheduleReview(current: ReviewState | undefined, rating: ReviewRating, now = Date.now()): ReviewState {
  const previous = current ?? createReviewState(now);
  const reviewCount = previous.reviewCount + 1;

  if (rating === 'again') {
    return {
      ...previous,
      intervalDays: 0,
      dueAt: now + TEN_MINUTES,
      lapses: previous.lapses + 1,
      reviewCount,
      lastReviewedAt: now,
      lastRating: rating
    };
  }

  const intervalDays = rating === 'hard'
    ? previous.intervalDays > 0 ? Math.max(1, Math.round(previous.intervalDays * 1.5)) : 1
    : previous.intervalDays > 0 ? Math.max(3, Math.round(previous.intervalDays * 2.5)) : 3;

  return {
    ...previous,
    intervalDays,
    dueAt: now + intervalDays * DAY,
    reviewCount,
    lastReviewedAt: now,
    lastRating: rating
  };
}
