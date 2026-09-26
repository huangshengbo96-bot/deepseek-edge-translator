import { describe, expect, it } from 'vitest';
import { createReviewState, scheduleReview } from '../lib/review';

const DAY = 24 * 60 * 60 * 1000;

describe('review scheduling', () => {
  it('makes newly marked cards due immediately', () => {
    expect(createReviewState(100).dueAt).toBe(100);
  });

  it('schedules again in ten minutes', () => {
    const next = scheduleReview(createReviewState(0), 'again', 1_000);
    expect(next.dueAt).toBe(601_000);
    expect(next.lapses).toBe(1);
  });

  it('uses one day for first hard and three days for first good', () => {
    expect(scheduleReview(undefined, 'hard', 0).dueAt).toBe(DAY);
    expect(scheduleReview(undefined, 'good', 0).dueAt).toBe(3 * DAY);
  });

  it('expands established intervals', () => {
    const current = { ...createReviewState(0), intervalDays: 4 };
    expect(scheduleReview(current, 'hard', 0).intervalDays).toBe(6);
    expect(scheduleReview(current, 'good', 0).intervalDays).toBe(10);
  });
});
