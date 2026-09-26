import { browser } from 'wxt/browser';
import { makeRequest, sendRequest } from '../lib/messaging';
import { cleanSelectedText, makeContextSnippet, validateSelection } from '../lib/text';
import type { ContentCommand, TranslationRecord } from '../lib/types';

interface SelectionState {
  text: string;
  source: {
    title: string;
    url: string;
    contextSnippet: string;
  };
  rect: DOMRect;
  record?: TranslationRecord;
}

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    const ui = createTranslatorUi();
    let state: SelectionState | null = null;

    document.addEventListener('mouseup', (event) => {
      if (event.button !== 0 || event.composedPath().includes(ui.host)) return;
      window.setTimeout(() => {
        const captured = captureSelection();
        if (!captured) {
          ui.hide();
          state = null;
          return;
        }
        state = captured;
        ui.showToolbar(captured, () => translate());
      }, 20);
    }, true);

    document.addEventListener('pointerdown', (event) => {
      if (!event.composedPath().includes(ui.host)) {
        ui.hide();
      }
    }, true);

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') ui.hide();
    }, true);

    window.addEventListener('resize', ui.hide);
    window.addEventListener('blur', ui.hide);

    browser.runtime.onMessage.addListener((message: unknown) => {
      const command = message as Partial<ContentCommand>;
      if (command.type !== 'TRIGGER_TRANSLATION') return;
      const captured = captureSelection(command.text);
      if (!captured) {
        ui.showCenteredError(command.text ? validateSelection(command.text) ?? '无法读取选中文本' : '请先选择英文单词或句子');
        return;
      }
      state = captured;
      void translate();
    });

    async function translate(): Promise<void> {
      if (!state) return;
      ui.showLoading(state);
      try {
        const data = await sendRequest<{ record: TranslationRecord; cached: boolean }>(
          makeRequest('TRANSLATE_SELECTION', { text: state.text, source: state.source })
        );
        state = { ...state, record: data.record };
        ui.showResult(
          state,
          data.cached,
          () => toggleMark(),
          () => copyTranslation(),
          () => openDashboard(),
          () => translate()
        );
      } catch (error) {
        const appError = getError(error);
        ui.showError(state, appError.message, appError.code === 'API_KEY_MISSING', () => translate(), () => openDashboard());
      }
    }

    async function toggleMark(): Promise<void> {
      if (!state?.record) return;
      const type = state.record.marked ? 'UNMARK_RECORD' : 'MARK_RECORD';
      try {
        const record = await sendRequest<TranslationRecord>(makeRequest(type, { id: state.record.id }));
        state = { ...state, record };
        ui.updateMark(record.marked);
      } catch (error) {
        ui.showInlineNotice(getError(error).message);
      }
    }

    async function copyTranslation(): Promise<void> {
      if (!state?.record) return;
      try {
        await navigator.clipboard.writeText(state.record.result.translation);
        ui.showInlineNotice('译文已复制');
      } catch {
        ui.showInlineNotice('复制失败，请手动选择译文');
      }
    }

    async function openDashboard(): Promise<void> {
      await sendRequest(makeRequest('OPEN_DASHBOARD', {}));
    }
  }
});

function captureSelection(forcedText?: string): SelectionState | null {
  const selection = window.getSelection();
  const text = cleanSelectedText(forcedText ?? selection?.toString() ?? '');
  if (validateSelection(text)) return null;

  let rect = new DOMRect(window.innerWidth / 2 - 1, Math.min(160, window.innerHeight / 3), 2, 20);
  let containerText = text;
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
    const range = selection.getRangeAt(0);
    const element = getSelectionElement(range);
    if (element?.closest('input, textarea, [contenteditable="true"], [role="textbox"]')) return null;
    const selectionRect = range.getBoundingClientRect();
    if (selectionRect.width || selectionRect.height) rect = selectionRect;
    containerText = element?.innerText || element?.textContent || text;
  }

  return {
    text,
    rect,
    source: {
      title: document.title,
      url: location.href,
      contextSnippet: makeContextSnippet(containerText, text)
    }
  };
}

function getSelectionElement(range: Range): HTMLElement | null {
  const node = range.commonAncestorContainer;
  return node instanceof HTMLElement ? node : node.parentElement;
}

function createTranslatorUi() {
  const host = document.createElement('div');
  host.dataset.deepseekTranslator = 'root';
  host.style.cssText = 'all:initial;position:fixed;z-index:2147483647;display:none;pointer-events:none;left:0;top:0;';
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .panel { pointer-events:auto; width:max-content; max-width:min(390px,calc(100vw - 24px)); color:#17213c; font:14px/1.55 Inter,"Segoe UI","Microsoft YaHei",sans-serif; background:rgba(255,255,255,.98); border:1px solid rgba(28,41,79,.12); border-radius:14px; box-shadow:0 18px 55px rgba(18,30,66,.24),0 3px 12px rgba(18,30,66,.12); overflow:hidden; backdrop-filter:blur(12px); }
    .toolbar { display:flex; align-items:center; gap:8px; padding:7px; }
    .brand { width:28px; height:28px; display:grid; place-items:center; border-radius:9px; color:white; font-weight:800; background:linear-gradient(135deg,#476bff,#7047eb); }
    button { font:inherit; border:0; cursor:pointer; }
    .primary { color:white; background:#4f63ed; border-radius:9px; padding:7px 13px; font-weight:650; }
    .primary:hover { background:#4155dc; }
    .ghost { color:#46506b; background:#f3f5fa; border-radius:9px; padding:7px 10px; }
    .ghost:hover { background:#e8ebf4; }
    .card { width:370px; max-width:calc(100vw - 24px); }
    .top { display:flex; align-items:center; gap:9px; padding:12px 13px 10px 16px; cursor:grab; user-select:none; touch-action:none; background:linear-gradient(145deg,#f7f8ff,#fff); border-bottom:1px solid #eef0f6; }
    .top:active { cursor:grabbing; }
    .source { min-width:0; flex:1; font-size:13px; color:#5e6780; overflow-wrap:anywhere; }
    .drag-hint { flex:none; padding:2px 6px; border-radius:6px; color:#8b93aa; background:#f0f2f8; font-size:10px; white-space:nowrap; }
    .kind { flex:none; height:22px; padding:1px 7px; border-radius:999px; color:#5262de; background:#e9ecff; font-size:11px; font-weight:700; text-transform:uppercase; }
    .body { padding:15px 16px 14px; max-height:min(370px,calc(100vh - 190px)); overflow-y:auto; overscroll-behavior:contain; scrollbar-width:thin; scrollbar-color:#c8cee3 transparent; }
    .body::-webkit-scrollbar { width:7px; }
    .body::-webkit-scrollbar-thumb { border:2px solid transparent; border-radius:999px; background:#c8cee3; background-clip:padding-box; }
    .translation { font-size:19px; line-height:1.45; color:#111a33; font-weight:700; overflow-wrap:anywhere; }
    .phonetic { margin-top:3px; color:#717b96; font-size:12px; }
    .section { margin-top:13px; padding-top:12px; border-top:1px solid #eef0f5; }
    .section-title { color:#8a92a8; font-size:11px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; margin-bottom:6px; }
    .item { margin:4px 0; color:#38415a; }
    .pos { display:inline-block; margin-right:6px; padding:0 5px; border-radius:5px; color:#7858c9; background:#f2edff; font-size:11px; }
    .example-en { color:#3e4965; }
    .example-zh { color:#7a8399; margin-top:2px; }
    .actions { display:flex; align-items:center; gap:7px; padding:10px 12px; border-top:1px solid #eef0f5; background:#fafbfe; }
    .actions .review { margin-left:auto; }
    .notice { min-height:18px; padding:0 15px 10px; color:#65708c; font-size:12px; background:#fafbfe; }
    .loading { width:290px; padding:17px; display:flex; align-items:center; gap:11px; }
    .spinner { width:20px; height:20px; flex:none; border:2px solid #dfe3f7; border-top-color:#5365ee; border-radius:50%; animation:spin .75s linear infinite; }
    @keyframes spin { to { transform:rotate(360deg); } }
    .error { width:340px; padding:15px; }
    .error-title { font-weight:750; color:#bd354a; margin-bottom:5px; }
    .error-text { color:#5d667d; margin-bottom:12px; overflow-wrap:anywhere; }
    .error-actions { display:flex; gap:8px; }
  `;
  const container = document.createElement('div');
  shadow.append(style, container);
  document.documentElement.append(host);
  let anchor = new DOMRect();

  function render(node: HTMLElement, rect: DOMRect, centered = false) {
    anchor = rect;
    container.replaceChildren(node);
    host.style.display = 'block';
    requestAnimationFrame(() => position(centered));
  }

  function position(centered = false) {
    const panel = container.firstElementChild as HTMLElement | null;
    if (!panel) return;
    const width = panel.offsetWidth;
    const height = panel.offsetHeight;
    const margin = 10;
    let left = centered ? (window.innerWidth - width) / 2 : anchor.left + anchor.width / 2 - width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - width - 12));
    let top = centered ? Math.min(160, (window.innerHeight - height) / 3) : anchor.bottom + margin;
    if (!centered && top + height > window.innerHeight - 12) top = Math.max(12, anchor.top - height - margin);
    host.style.left = `${Math.round(left)}px`;
    host.style.top = `${Math.round(Math.max(12, top))}px`;
  }

  function showToolbar(state: SelectionState, onTranslate: () => void) {
    const panel = element('div', 'panel toolbar');
    const brand = element('span', 'brand', '译');
    const button = element('button', 'primary', '翻译');
    button.addEventListener('click', onTranslate);
    panel.append(brand, button);
    render(panel, state.rect);
  }

  function showLoading(state: SelectionState) {
    const panel = element('div', 'panel loading');
    panel.append(element('span', 'spinner'), element('span', '', 'DeepSeek 极速翻译中…'));
    render(panel, state.rect);
  }

  function showResult(
    state: SelectionState,
    cached: boolean,
    onMark: () => void,
    onCopy: () => void,
    onReview: () => void,
    onRetry: () => void
  ) {
    if (!state.record) return;
    const record = state.record;
    const result = record.result;
    const panel = element('div', 'panel card');
    const top = element('div', 'top');
    top.title = '按住这里拖动翻译卡';
    top.setAttribute('aria-label', '拖动翻译卡');
    top.append(
      element('div', 'source', state.text),
      element('span', 'drag-hint', '⠿ 拖动'),
      element('span', 'kind', kindLabel(result.kind))
    );
    const body = element('div', 'body');
    body.append(element('div', 'translation', result.translation));
    if (result.phonetic) body.append(element('div', 'phonetic', result.phonetic));
    if (result.entries.length) body.append(section('释义', result.entries.map((entry) => {
      const row = element('div', 'item');
      row.append(element('span', 'pos', entry.partOfSpeech), document.createTextNode(entry.meaning));
      return row;
    })));
    if (result.keyPhrases.length) body.append(section('重点短语', result.keyPhrases.map((item) => element('div', 'item', `${item.phrase} · ${item.meaning}`))));
    if (result.grammarNote) body.append(section('说明', [element('div', 'item', result.grammarNote)]));
    if (result.example.english || result.example.chinese) {
      body.append(section('例句', [
        element('div', 'example-en', result.example.english),
        element('div', 'example-zh', result.example.chinese)
      ]));
    }
    const actions = element('div', 'actions');
    const mark = element('button', 'ghost mark', record.marked ? '★ 已标记' : '☆ 标记复习');
    mark.dataset.marked = String(record.marked);
    mark.addEventListener('click', onMark);
    const copy = element('button', 'ghost', '复制');
    copy.addEventListener('click', onCopy);
    const retry = element('button', 'ghost', '重新翻译');
    retry.addEventListener('click', onRetry);
    const review = element('button', 'ghost review', '生词本');
    review.addEventListener('click', onReview);
    actions.append(mark, copy, retry, review);
    const notice = element('div', 'notice', cached ? '已使用本地缓存，不会重复调用 API' : '已自动保存到翻译历史');
    notice.dataset.notice = 'true';
    panel.append(top, body, actions, notice);
    enableDragging(panel, top);
    render(panel, state.rect);
  }

  function showError(state: SelectionState, message: string, needsSettings: boolean, onRetry: () => void, onSettings: () => void) {
    const panel = errorPanel(message, needsSettings, onRetry, onSettings);
    render(panel, state.rect);
  }

  function showCenteredError(message: string) {
    render(errorPanel(message, false, () => hide(), () => hide()), new DOMRect(), true);
  }

  function errorPanel(message: string, needsSettings: boolean, onRetry: () => void, onSettings: () => void) {
    const panel = element('div', 'panel error');
    panel.append(element('div', 'error-title', '翻译失败'), element('div', 'error-text', message));
    const actions = element('div', 'error-actions');
    const retry = element('button', 'primary', needsSettings ? '打开设置' : '重试');
    retry.addEventListener('click', needsSettings ? onSettings : onRetry);
    const close = element('button', 'ghost', '关闭');
    close.addEventListener('click', hide);
    actions.append(retry, close);
    panel.append(actions);
    return panel;
  }

  function updateMark(marked: boolean) {
    const button = container.querySelector<HTMLButtonElement>('.mark');
    if (!button) return;
    button.textContent = marked ? '★ 已标记' : '☆ 标记复习';
    button.dataset.marked = String(marked);
    showInlineNotice(marked ? '已加入今日复习' : '已移出生词本');
  }

  function showInlineNotice(message: string) {
    const notice = container.querySelector<HTMLElement>('[data-notice]');
    if (!notice) return;
    notice.textContent = message;
    window.setTimeout(() => {
      if (notice.isConnected && notice.textContent === message) notice.textContent = '';
    }, 2200);
  }

  function hide() {
    host.style.display = 'none';
  }

  function enableDragging(panel: HTMLElement, handle: HTMLElement) {
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      const startRect = host.getBoundingClientRect();
      const startX = event.clientX;
      const startY = event.clientY;
      handle.setPointerCapture(event.pointerId);

      const move = (moveEvent: PointerEvent) => {
        const maxLeft = Math.max(8, window.innerWidth - panel.offsetWidth - 8);
        const maxTop = Math.max(8, window.innerHeight - panel.offsetHeight - 8);
        const left = Math.max(8, Math.min(startRect.left + moveEvent.clientX - startX, maxLeft));
        const top = Math.max(8, Math.min(startRect.top + moveEvent.clientY - startY, maxTop));
        host.style.left = `${Math.round(left)}px`;
        host.style.top = `${Math.round(top)}px`;
      };

      const stop = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', stop);
        handle.removeEventListener('pointercancel', stop);
      };

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', stop);
      handle.addEventListener('pointercancel', stop);
    });
  }

  return { host, hide, showToolbar, showLoading, showResult, showError, showCenteredError, updateMark, showInlineNotice };
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function section(title: string, items: Node[]): HTMLElement {
  const wrapper = element('div', 'section');
  wrapper.append(element('div', 'section-title', title), ...items);
  return wrapper;
}

function kindLabel(kind: TranslationRecord['result']['kind']): string {
  return kind === 'word' ? '单词' : kind === 'phrase' ? '短语' : '句子';
}

function getError(error: unknown): { code?: string; message: string } {
  if (error && typeof error === 'object' && 'appError' in error) {
    const appError = (error as { appError?: { code?: string; message?: string } }).appError;
    return { code: appError?.code, message: appError?.message ?? '发生未知错误' };
  }
  return { message: error instanceof Error ? error.message : '发生未知错误' };
}
