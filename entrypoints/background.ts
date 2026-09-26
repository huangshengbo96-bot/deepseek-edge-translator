import { browser } from 'wxt/browser';
import {
  clearRecords,
  createRecord,
  deleteRecord,
  exportCsv,
  exportJson,
  findRecordByText,
  getDueRecords,
  getStats,
  importBackup,
  listRecords,
  rateRecord,
  setMarked,
  setTags,
  touchRecord
} from '../lib/db';
import { appError, DEFAULT_MODEL, isAppError, testDeepSeekConnection, translateWithDeepSeek } from '../lib/deepseek';
import { cleanSelectedText, sanitizeSource, validateSelection } from '../lib/text';
import type {
  AppError,
  AppSettings,
  BackgroundRequest,
  ContentCommand,
  PublicSettings,
  ResponseEnvelope
} from '../lib/types';

const SETTINGS_KEY = 'settings';
const MENU_ID = 'deepseek-translate-selection';

export default defineBackground(() => {
  void lockStorageAccess();
  browser.runtime.onInstalled.addListener(() => {
    void setupContextMenu();
  });
  void setupContextMenu();

  browser.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== MENU_ID || !tab?.id) return;
    void browser.tabs.sendMessage(tab.id, {
      type: 'TRIGGER_TRANSLATION',
      text: info.selectionText
    } satisfies ContentCommand).catch(() => undefined);
  });

  browser.commands.onCommand.addListener((command) => {
    if (command !== 'translate-selection') return;
    void triggerActiveTab();
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    return handleMessage(message);
  });
});

async function handleMessage(message: unknown): Promise<ResponseEnvelope> {
  const requestId = isMessage(message) ? message.requestId : 'unknown';
  if (!isMessage(message)) return failure(requestId, appError('UNKNOWN', '无效的扩展消息', false));

  try {
    switch (message.type) {
      case 'TRANSLATE_SELECTION': {
        const selectionError = validateSelection(message.payload.text);
        if (selectionError) throw appError('INVALID_SELECTION', selectionError, false);
        const settings = await getSettings();
        if (!settings.apiKey) throw appError('API_KEY_MISSING', '请先在扩展设置中填写 DeepSeek API Key', false);
        const text = cleanSelectedText(message.payload.text);
        const now = Date.now();
        const source = sanitizeSource(message.payload.source, now);
        const cached = await findRecordByText(text);
        if (cached) return success(requestId, { record: await touchRecord(cached, source, now), cached: true });
        const result = await translateWithDeepSeek(text, settings.apiKey, settings.model);
        return success(requestId, { record: await createRecord(text, result, source, now), cached: false });
      }
      case 'MARK_RECORD': {
        const record = await setMarked(message.payload.id, true);
        if (!record) throw appError('NOT_FOUND', '未找到该翻译记录', false);
        return success(requestId, record);
      }
      case 'UNMARK_RECORD': {
        const record = await setMarked(message.payload.id, false);
        if (!record) throw appError('NOT_FOUND', '未找到该翻译记录', false);
        return success(requestId, record);
      }
      case 'SET_TAGS': {
        const record = await setTags(message.payload.id, message.payload.tags);
        if (!record) throw appError('NOT_FOUND', '未找到该翻译记录', false);
        return success(requestId, record);
      }
      case 'LIST_RECORDS':
        return success(requestId, await listRecords(message.payload));
      case 'GET_DUE_RECORDS':
        return success(requestId, await getDueRecords(message.payload.limit));
      case 'GET_STATS':
        return success(requestId, await getStats());
      case 'RATE_REVIEW': {
        const record = await rateRecord(message.payload.id, message.payload.rating);
        if (!record) throw appError('NOT_FOUND', '未找到已标记的复习记录', false);
        return success(requestId, record);
      }
      case 'DELETE_RECORD':
        await deleteRecord(message.payload.id);
        return success(requestId, { deleted: 1 });
      case 'CLEAR_RECORDS':
        return success(requestId, { deleted: await clearRecords(message.payload.scope) });
      case 'GET_SETTINGS': {
        const settings = await getSettings();
        return success(requestId, { hasApiKey: Boolean(settings.apiKey), model: settings.model } satisfies PublicSettings);
      }
      case 'SAVE_SETTINGS': {
        const current = await getSettings();
        const apiKey = message.payload.apiKey?.trim() || current.apiKey;
        const model = message.payload.model?.trim() || current.model;
        await saveSettings({ apiKey, model });
        return success(requestId, { hasApiKey: Boolean(apiKey), model } satisfies PublicSettings);
      }
      case 'CLEAR_API_KEY': {
        const current = await getSettings();
        await saveSettings({ ...current, apiKey: '' });
        return success(requestId, { hasApiKey: false, model: current.model } satisfies PublicSettings);
      }
      case 'TEST_CONNECTION': {
        const settings = await getSettings();
        const apiKey = message.payload.apiKey?.trim() || settings.apiKey;
        if (!apiKey) throw appError('API_KEY_MISSING', '请先填写 DeepSeek API Key', false);
        await testDeepSeekConnection(apiKey);
        return success(requestId, { connected: true });
      }
      case 'EXPORT_DATA': {
        const date = new Date().toISOString().slice(0, 10);
        const isJson = message.payload.format === 'json';
        return success(requestId, {
          content: isJson ? await exportJson() : await exportCsv(),
          filename: `deepseek-translator-${date}.${isJson ? 'json' : 'csv'}`,
          mime: isJson ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8'
        });
      }
      case 'IMPORT_DATA':
        try {
          return success(requestId, await importBackup(message.payload.data));
        } catch {
          throw appError('INVALID_IMPORT', '备份文件格式无效或版本不受支持', false);
        }
      case 'OPEN_DASHBOARD':
        await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
        return success(requestId, { opened: true });
      default:
        return failure(requestId, appError('UNKNOWN', '不支持的操作', false));
    }
  } catch (error) {
    return failure(requestId, toAppError(error));
  }
}

async function getSettings(): Promise<AppSettings> {
  const result = await browser.storage.local.get(SETTINGS_KEY) as Record<string, unknown>;
  const stored = result[SETTINGS_KEY] as Partial<AppSettings> | undefined;
  return {
    apiKey: typeof stored?.apiKey === 'string' ? stored.apiKey : '',
    model: typeof stored?.model === 'string' && stored.model ? stored.model : DEFAULT_MODEL
  };
}

async function saveSettings(settings: AppSettings): Promise<void> {
  await browser.storage.local.set({ [SETTINGS_KEY]: settings });
}

async function lockStorageAccess(): Promise<void> {
  const storage = browser.storage.local as typeof browser.storage.local & {
    setAccessLevel?: (options: { accessLevel: 'TRUSTED_CONTEXTS' }) => Promise<void>;
  };
  await storage.setAccessLevel?.({ accessLevel: 'TRUSTED_CONTEXTS' });
}

async function setupContextMenu(): Promise<void> {
  await browser.contextMenus.remove(MENU_ID).catch(() => undefined);
  browser.contextMenus.create({
    id: MENU_ID,
    title: '使用 DeepSeek 翻译“%s”',
    contexts: ['selection']
  });
}

async function triggerActiveTab(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  await browser.tabs.sendMessage(tab.id, { type: 'TRIGGER_TRANSLATION' } satisfies ContentCommand).catch(() => undefined);
}

function isMessage(message: unknown): message is BackgroundRequest {
  return Boolean(
    message &&
    typeof message === 'object' &&
    typeof (message as { type?: unknown }).type === 'string' &&
    typeof (message as { requestId?: unknown }).requestId === 'string' &&
    (message as { payload?: unknown }).payload &&
    typeof (message as { payload?: unknown }).payload === 'object'
  );
}

function success<T>(requestId: string, data: T): ResponseEnvelope<T> {
  return { requestId, ok: true, data };
}

function failure(requestId: string, error: AppError): ResponseEnvelope {
  return { requestId, ok: false, error };
}

function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error;
  return appError('UNKNOWN', error instanceof Error ? error.message : '发生未知错误', false);
}
