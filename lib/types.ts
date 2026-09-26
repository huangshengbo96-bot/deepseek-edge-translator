export type TranslationKind = 'word' | 'phrase' | 'sentence';

export interface DictionaryEntry {
  partOfSpeech: string;
  meaning: string;
}

export interface KeyPhrase {
  phrase: string;
  meaning: string;
}

export interface TranslationResult {
  kind: TranslationKind;
  translation: string;
  phonetic: string;
  entries: DictionaryEntry[];
  keyPhrases: KeyPhrase[];
  grammarNote: string;
  example: {
    english: string;
    chinese: string;
  };
}

export interface SourceSnapshot {
  title: string;
  url: string;
  contextSnippet: string;
  seenAt: number;
}

export type ReviewRating = 'again' | 'hard' | 'good';

export interface ReviewState {
  intervalDays: number;
  dueAt: number;
  lapses: number;
  reviewCount: number;
  lastReviewedAt?: number;
  lastRating?: ReviewRating;
}

export interface TranslationRecord {
  id: string;
  normalizedKey: string;
  sourceText: string;
  result: TranslationResult;
  lookupCount: number;
  sources: SourceSnapshot[];
  firstSeenAt: number;
  lastSeenAt: number;
  marked: boolean;
  tags: string[];
  review?: ReviewState;
  dueAt?: number;
}

export interface AppSettings {
  apiKey: string;
  model: string;
}

export interface PublicSettings {
  hasApiKey: boolean;
  model: string;
}

export interface RecordListQuery {
  scope: 'history' | 'marked';
  search?: string;
  limit?: number;
  offset?: number;
}

export interface AppStats {
  dueCount: number;
  markedCount: number;
  historyCount: number;
}

export type ErrorCode =
  | 'API_KEY_MISSING'
  | 'INVALID_SELECTION'
  | 'UNAUTHORIZED'
  | 'INSUFFICIENT_BALANCE'
  | 'RATE_LIMITED'
  | 'TIMEOUT'
  | 'NETWORK_ERROR'
  | 'INVALID_RESPONSE'
  | 'SERVER_ERROR'
  | 'NOT_FOUND'
  | 'INVALID_IMPORT'
  | 'UNKNOWN';

export interface AppError {
  code: ErrorCode;
  message: string;
  retryable: boolean;
}

export type BackgroundRequest =
  | { type: 'TRANSLATE_SELECTION'; requestId: string; payload: { text: string; source: Omit<SourceSnapshot, 'seenAt'> } }
  | { type: 'MARK_RECORD'; requestId: string; payload: { id: string } }
  | { type: 'UNMARK_RECORD'; requestId: string; payload: { id: string } }
  | { type: 'SET_TAGS'; requestId: string; payload: { id: string; tags: string[] } }
  | { type: 'LIST_RECORDS'; requestId: string; payload: RecordListQuery }
  | { type: 'GET_DUE_RECORDS'; requestId: string; payload: { limit?: number } }
  | { type: 'GET_STATS'; requestId: string; payload: Record<string, never> }
  | { type: 'RATE_REVIEW'; requestId: string; payload: { id: string; rating: ReviewRating } }
  | { type: 'DELETE_RECORD'; requestId: string; payload: { id: string } }
  | { type: 'CLEAR_RECORDS'; requestId: string; payload: { scope: 'history' | 'marked' | 'all' } }
  | { type: 'GET_SETTINGS'; requestId: string; payload: Record<string, never> }
  | { type: 'SAVE_SETTINGS'; requestId: string; payload: { apiKey?: string; model?: string } }
  | { type: 'CLEAR_API_KEY'; requestId: string; payload: Record<string, never> }
  | { type: 'TEST_CONNECTION'; requestId: string; payload: { apiKey?: string } }
  | { type: 'EXPORT_DATA'; requestId: string; payload: { format: 'json' | 'csv' } }
  | { type: 'IMPORT_DATA'; requestId: string; payload: { data: unknown } }
  | { type: 'OPEN_DASHBOARD'; requestId: string; payload: Record<string, never> };

export type ContentCommand = { type: 'TRIGGER_TRANSLATION'; text?: string };

export type ResponseEnvelope<T = unknown> =
  | { requestId: string; ok: true; data: T }
  | { requestId: string; ok: false; error: AppError };
