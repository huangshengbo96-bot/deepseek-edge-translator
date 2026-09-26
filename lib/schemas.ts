import { z } from 'zod';

export const translationResultSchema = z.object({
  kind: z.enum(['word', 'phrase', 'sentence']),
  translation: z.string().trim().min(1).max(4000),
  phonetic: z.string().trim().max(200),
  entries: z.array(z.object({
    partOfSpeech: z.string().trim().max(100),
    meaning: z.string().trim().min(1).max(1000)
  })).max(8),
  keyPhrases: z.array(z.object({
    phrase: z.string().trim().min(1).max(300),
    meaning: z.string().trim().min(1).max(1000)
  })).max(8),
  grammarNote: z.string().trim().max(1500),
  example: z.object({
    english: z.string().trim().max(1000),
    chinese: z.string().trim().max(1000)
  })
});

export const sourceSnapshotSchema = z.object({
  title: z.string().max(300),
  url: z.string().max(4000),
  contextSnippet: z.string().max(300),
  seenAt: z.number().int().nonnegative()
});

export const translationRecordSchema = z.object({
  id: z.string().min(1),
  normalizedKey: z.string().min(1).max(2000),
  sourceText: z.string().min(1).max(2000),
  result: translationResultSchema,
  lookupCount: z.number().int().positive(),
  sources: z.array(sourceSnapshotSchema).max(5),
  firstSeenAt: z.number().int().nonnegative(),
  lastSeenAt: z.number().int().nonnegative(),
  marked: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(40)).max(20),
  review: z.object({
    intervalDays: z.number().nonnegative(),
    dueAt: z.number().int().nonnegative(),
    lapses: z.number().int().nonnegative(),
    reviewCount: z.number().int().nonnegative(),
    lastReviewedAt: z.number().int().nonnegative().optional(),
    lastRating: z.enum(['again', 'hard', 'good']).optional()
  }).optional(),
  dueAt: z.number().int().nonnegative().optional()
});

export const backupSchema = z.object({
  version: z.literal(1),
  exportedAt: z.number().int().nonnegative(),
  records: z.array(translationRecordSchema).max(100000)
});
