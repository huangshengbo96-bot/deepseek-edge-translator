import Dexie, { type EntityTable } from 'dexie';
import { backupSchema } from './schemas';
import { createReviewState, scheduleReview } from './review';
import { escapeCsv, normalizeText, sanitizeSource } from './text';
import type {
  RecordListQuery,
  ReviewRating,
  SourceSnapshot,
  TranslationRecord,
  TranslationResult
} from './types';

class TranslatorDatabase extends Dexie {
  records!: EntityTable<TranslationRecord, 'id'>;

  constructor() {
    super('deepseek-edge-translator');
    this.version(1).stores({
      records: '&id,&normalizedKey,lastSeenAt,dueAt,*tags'
    });
  }
}

export const db = new TranslatorDatabase();

export async function findRecordByText(text: string): Promise<TranslationRecord | undefined> {
  return db.records.where('normalizedKey').equals(normalizeText(text)).first();
}

export async function touchRecord(
  record: TranslationRecord,
  source: SourceSnapshot,
  now = Date.now()
): Promise<TranslationRecord> {
  const sources = mergeSources(record.sources, source);
  const updated: TranslationRecord = {
    ...record,
    lookupCount: record.lookupCount + 1,
    lastSeenAt: now,
    sources
  };
  await db.records.put(updated);
  return updated;
}

export async function createRecord(
  sourceText: string,
  result: TranslationResult,
  source: SourceSnapshot,
  now = Date.now()
): Promise<TranslationRecord> {
  const record: TranslationRecord = {
    id: crypto.randomUUID(),
    normalizedKey: normalizeText(sourceText),
    sourceText,
    result,
    lookupCount: 1,
    sources: [source],
    firstSeenAt: now,
    lastSeenAt: now,
    marked: false,
    tags: []
  };
  await db.records.add(record);
  return record;
}

export async function setMarked(id: string, marked: boolean, now = Date.now()): Promise<TranslationRecord | undefined> {
  const record = await db.records.get(id);
  if (!record) return undefined;
  const review = marked ? record.review ?? createReviewState(now) : record.review;
  const updated: TranslationRecord = {
    ...record,
    marked,
    review,
    dueAt: marked ? review?.dueAt : undefined
  };
  await db.records.put(updated);
  return updated;
}

export async function setTags(id: string, tags: string[]): Promise<TranslationRecord | undefined> {
  const record = await db.records.get(id);
  if (!record) return undefined;
  const normalizedTags = [...new Set(tags.map((tag) => tag.trim().slice(0, 40)).filter(Boolean))].slice(0, 20);
  const updated = { ...record, tags: normalizedTags };
  await db.records.put(updated);
  return updated;
}

export async function rateRecord(id: string, rating: ReviewRating, now = Date.now()): Promise<TranslationRecord | undefined> {
  const record = await db.records.get(id);
  if (!record || !record.marked) return undefined;
  const review = scheduleReview(record.review, rating, now);
  const updated = { ...record, review, dueAt: review.dueAt };
  await db.records.put(updated);
  return updated;
}

export async function listRecords(query: RecordListQuery): Promise<{ records: TranslationRecord[]; total: number }> {
  const search = normalizeText(query.search ?? '');
  const all = await db.records.orderBy('lastSeenAt').reverse().toArray();
  const filtered = all.filter((record) => {
    if (query.scope === 'marked' && !record.marked) return false;
    if (!search) return true;
    const haystack = normalizeText([
      record.sourceText,
      record.result.translation,
      ...record.tags,
      ...record.result.entries.map((entry) => `${entry.partOfSpeech} ${entry.meaning}`)
    ].join(' '));
    return haystack.includes(search);
  });
  const offset = Math.max(0, query.offset ?? 0);
  const limit = Math.min(500, Math.max(1, query.limit ?? 100));
  return { records: filtered.slice(offset, offset + limit), total: filtered.length };
}

export async function getDueRecords(limit = 100, now = Date.now()): Promise<TranslationRecord[]> {
  const all = await db.records.toArray();
  return all
    .filter((record) => record.marked && (record.dueAt ?? 0) <= now)
    .sort((a, b) => (a.dueAt ?? 0) - (b.dueAt ?? 0))
    .slice(0, Math.min(500, Math.max(1, limit)));
}

export async function getStats(now = Date.now()): Promise<{ dueCount: number; markedCount: number; historyCount: number }> {
  const all = await db.records.toArray();
  return {
    historyCount: all.length,
    markedCount: all.filter((record) => record.marked).length,
    dueCount: all.filter((record) => record.marked && (record.dueAt ?? 0) <= now).length
  };
}

export async function deleteRecord(id: string): Promise<void> {
  await db.records.delete(id);
}

export async function clearRecords(scope: 'history' | 'marked' | 'all'): Promise<number> {
  if (scope === 'all' || scope === 'history') {
    const count = await db.records.count();
    await db.records.clear();
    return count;
  }
  const marked = await db.records.filter((record) => record.marked).primaryKeys();
  await db.records.bulkDelete(marked);
  return marked.length;
}

export async function exportJson(now = Date.now()): Promise<string> {
  const records = await db.records.toArray();
  return JSON.stringify({ version: 1, exportedAt: now, records }, null, 2);
}

export async function exportCsv(): Promise<string> {
  const records = await db.records.orderBy('lastSeenAt').reverse().toArray();
  const header = ['原文', '译文', '类型', '标签', '已标记', '查询次数', '最近时间', '来源标题', '来源网址'];
  const rows = records.map((record) => {
    const source = record.sources[0];
    return [
      record.sourceText,
      record.result.translation,
      record.result.kind,
      record.tags.join('|'),
      record.marked,
      record.lookupCount,
      new Date(record.lastSeenAt).toISOString(),
      source?.title ?? '',
      source?.url ?? ''
    ].map(escapeCsv).join(',');
  });
  return `\uFEFF${[header.map(escapeCsv).join(','), ...rows].join('\r\n')}`;
}

export async function importBackup(raw: unknown): Promise<{ imported: number; merged: number }> {
  const backup = backupSchema.parse(raw);
  let imported = 0;
  let merged = 0;

  await db.transaction('rw', db.records, async () => {
    for (const incoming of backup.records) {
      const normalizedKey = normalizeText(incoming.sourceText);
      const existing = await db.records.where('normalizedKey').equals(normalizedKey).first();
      const safeSources = incoming.sources.map((source) => sanitizeSource(source, source.seenAt));
      if (!existing) {
        const idCollision = await db.records.get(incoming.id);
        const review = incoming.marked ? incoming.review ?? createReviewState(incoming.lastSeenAt) : incoming.review;
        await db.records.add({
          ...incoming,
          id: idCollision ? crypto.randomUUID() : incoming.id,
          normalizedKey,
          sources: safeSources,
          tags: [...new Set(incoming.tags.map((tag) => tag.slice(0, 40)))].slice(0, 20),
          review,
          dueAt: incoming.marked ? review?.dueAt : undefined
        });
        imported += 1;
        continue;
      }

      const incomingReview = incoming.marked ? incoming.review ?? createReviewState(incoming.lastSeenAt) : incoming.review;
      const existingReview = existing.marked ? existing.review ?? createReviewState(existing.lastSeenAt) : existing.review;
      const incomingReviewTime = incomingReview?.lastReviewedAt ?? 0;
      const existingReviewTime = existingReview?.lastReviewedAt ?? 0;
      const useIncomingReview = incomingReviewTime > existingReviewTime;
      const review = useIncomingReview ? incomingReview : existingReview;
      const marked = existing.marked || incoming.marked;
      const sources = [...safeSources, ...existing.sources]
        .sort((a, b) => b.seenAt - a.seenAt)
        .filter((source, index, array) => array.findIndex((other) => other.url === source.url && other.contextSnippet === source.contextSnippet) === index)
        .slice(0, 5);
      await db.records.put({
        ...existing,
        result: incoming.lastSeenAt > existing.lastSeenAt ? incoming.result : existing.result,
        sourceText: incoming.lastSeenAt > existing.lastSeenAt ? incoming.sourceText : existing.sourceText,
        lookupCount: Math.max(existing.lookupCount, incoming.lookupCount),
        firstSeenAt: Math.min(existing.firstSeenAt, incoming.firstSeenAt),
        lastSeenAt: Math.max(existing.lastSeenAt, incoming.lastSeenAt),
        marked,
        tags: [...new Set([...existing.tags, ...incoming.tags].map((tag) => tag.slice(0, 40)))].slice(0, 20),
        sources,
        review,
        dueAt: marked ? (review ?? createReviewState(Math.min(existing.lastSeenAt, incoming.lastSeenAt))).dueAt : undefined
      });
      merged += 1;
    }
  });

  return { imported, merged };
}

function mergeSources(sources: SourceSnapshot[], incoming: SourceSnapshot): SourceSnapshot[] {
  return [incoming, ...sources]
    .filter((source, index, array) => array.findIndex((other) => other.url === source.url && other.contextSnippet === source.contextSnippet) === index)
    .sort((a, b) => b.seenAt - a.seenAt)
    .slice(0, 5);
}
