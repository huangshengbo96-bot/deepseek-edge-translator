import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRecord, db, exportJson, importBackup, replaceRecordResult, setMarked, touchRecord } from '../lib/db';
import type { SourceSnapshot, TranslationResult } from '../lib/types';

const result: TranslationResult = {
  kind: 'word', translation: '测试', phonetic: '', entries: [], keyPhrases: [], grammarNote: '', example: { english: '', chinese: '' }
};
const source: SourceSnapshot = { title: 'Page', url: 'https://example.com/', contextSnippet: 'a test word', seenAt: 100 };

describe('local database', () => {
  beforeEach(async () => {
    await db.open();
    await db.records.clear();
  });

  afterEach(async () => {
    await db.records.clear();
  });

  it('creates, touches and marks a record', async () => {
    const created = await createRecord('Test', result, source, 100);
    const touched = await touchRecord(created, { ...source, seenAt: 200 }, 200);
    expect(touched.lookupCount).toBe(2);
    const marked = await setMarked(created.id, true, 300);
    expect(marked?.marked).toBe(true);
    expect(marked?.dueAt).toBe(300);
  });

  it('imports a backup and merges duplicate normalized text', async () => {
    const existing = await createRecord('Hello', result, source, 100);
    const backup = JSON.parse(await exportJson(200));
    backup.records[0].id = 'another-id';
    backup.records[0].sourceText = '  HELLO ';
    backup.records[0].lookupCount = 7;
    const merged = await importBackup(backup);
    expect(merged).toEqual({ imported: 0, merged: 1 });
    expect(await db.records.count()).toBe(1);
    expect((await db.records.get(existing.id))?.lookupCount).toBe(7);
  });

  it('refreshes dictionary details without losing review state', async () => {
    const created = await createRecord('Test', result, source, 100);
    const marked = await setMarked(created.id, true, 300);
    const refreshed = await replaceRecordResult(created.id, {
      ...result,
      entries: [{
        partOfSpeech: '动词',
        meaning: '测试',
        example: { english: 'We test the feature.', chinese: '我们测试这个功能。' }
      }],
      wordForms: [{ label: '过去式', form: 'tested' }]
    });
    expect(refreshed?.marked).toBe(true);
    expect(refreshed?.review).toEqual(marked?.review);
    expect(refreshed?.result.wordForms?.[0]?.form).toBe('tested');
  });
});
