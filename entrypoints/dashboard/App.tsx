import { useCallback, useEffect, useRef, useState } from 'react';
import { ReviewCard } from '../../components/ReviewCard';
import { makeRequest, sendRequest } from '../../lib/messaging';
import type {
  AppStats,
  PublicSettings,
  ReviewRating,
  TranslationRecord
} from '../../lib/types';

type Tab = 'review' | 'marked' | 'history' | 'settings';

const tabs: Array<{ id: Tab; label: string; icon: string }> = [
  { id: 'review', label: '今日复习', icon: '◫' },
  { id: 'marked', label: '生词本', icon: '★' },
  { id: 'history', label: '全部历史', icon: '◷' },
  { id: 'settings', label: '设置', icon: '⚙' }
];

export function App() {
  const [tab, setTab] = useState<Tab>('review');
  const [stats, setStats] = useState<AppStats>({ dueCount: 0, markedCount: 0, historyCount: 0 });
  const [records, setRecords] = useState<TranslationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [due, setDue] = useState<TranslationRecord[]>([]);
  const [settings, setSettings] = useState<PublicSettings>({ hasApiKey: false, model: 'deepseek-flash' });
  const [search, setSearch] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const showNotice = useCallback((message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice((current) => current === message ? '' : current), 3000);
  }, []);

  const refreshStats = useCallback(async () => {
    setStats(await sendRequest<AppStats>(makeRequest('GET_STATS', {})));
  }, []);

  const loadTab = useCallback(async () => {
    if (tab === 'review') {
      setDue(await sendRequest<TranslationRecord[]>(makeRequest('GET_DUE_RECORDS', { limit: 100 })));
    } else if (tab === 'marked' || tab === 'history') {
      const list = await sendRequest<{ records: TranslationRecord[]; total: number }>(
        makeRequest('LIST_RECORDS', { scope: tab, search, limit: 500 })
      );
      setRecords(list.records);
      setTotal(list.total);
    } else {
      setSettings(await sendRequest<PublicSettings>(makeRequest('GET_SETTINGS', {})));
    }
  }, [search, tab]);

  useEffect(() => {
    void Promise.all([refreshStats(), loadTab()]).catch((error) => showNotice(getMessage(error)));
  }, [loadTab, refreshStats, showNotice]);

  const rate = async (record: TranslationRecord, rating: ReviewRating) => {
    await sendRequest(makeRequest('RATE_REVIEW', { id: record.id, rating }));
    setDue((current) => current.filter((item) => item.id !== record.id));
    await refreshStats();
    showNotice(rating === 'again' ? '10 分钟后再复习' : rating === 'hard' ? '已安排较短间隔' : '做得好，已延长复习间隔');
  };

  const toggleMarked = async (record: TranslationRecord) => {
    const updated = await sendRequest<TranslationRecord>(makeRequest(record.marked ? 'UNMARK_RECORD' : 'MARK_RECORD', { id: record.id }));
    if (tab === 'marked' && !updated.marked) setRecords((current) => current.filter((item) => item.id !== record.id));
    else setRecords((current) => current.map((item) => item.id === record.id ? updated : item));
    await refreshStats();
    showNotice(updated.marked ? '已加入生词本' : '已移出生词本');
  };

  const saveTags = async (record: TranslationRecord, tags: string[]) => {
    const updated = await sendRequest<TranslationRecord>(makeRequest('SET_TAGS', { id: record.id, tags }));
    setRecords((current) => current.map((item) => item.id === record.id ? updated : item));
    showNotice('标签已保存');
  };

  const remove = async (record: TranslationRecord) => {
    if (!window.confirm(`确定删除“${record.sourceText.slice(0, 40)}”及其复习记录吗？`)) return;
    await sendRequest(makeRequest('DELETE_RECORD', { id: record.id }));
    setRecords((current) => current.filter((item) => item.id !== record.id));
    await refreshStats();
    showNotice('记录已删除');
  };

  const saveSettings = async () => {
    if (!keyInput.trim()) {
      showNotice('请输入新的 DeepSeek API Key');
      return;
    }
    setBusy(true);
    try {
      const updated = await sendRequest<PublicSettings>(makeRequest('SAVE_SETTINGS', { apiKey: keyInput.trim(), model: settings.model }));
      setSettings(updated);
      setKeyInput('');
      showNotice('API Key 已保存到本机');
    } catch (error) {
      showNotice(getMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const testConnection = async () => {
    setBusy(true);
    try {
      await sendRequest(makeRequest('TEST_CONNECTION', { apiKey: keyInput.trim() || undefined }));
      showNotice('连接成功，DeepSeek API 可用');
    } catch (error) {
      showNotice(getMessage(error));
    } finally {
      setBusy(false);
    }
  };

  const clearKey = async () => {
    if (!window.confirm('确定清除本机保存的 API Key 吗？')) return;
    const updated = await sendRequest<PublicSettings>(makeRequest('CLEAR_API_KEY', {}));
    setSettings(updated);
    setKeyInput('');
    showNotice('API Key 已清除');
  };

  const exportData = async (format: 'json' | 'csv') => {
    const file = await sendRequest<{ content: string; filename: string; mime: string }>(makeRequest('EXPORT_DATA', { format }));
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = file.filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    showNotice(`${format.toUpperCase()} 已导出`);
  };

  const importData = async (file: File) => {
    setBusy(true);
    try {
      const raw = JSON.parse(await file.text()) as unknown;
      const result = await sendRequest<{ imported: number; merged: number }>(makeRequest('IMPORT_DATA', { data: raw }));
      await Promise.all([refreshStats(), loadTab()]);
      showNotice(`导入完成：新增 ${result.imported} 条，合并 ${result.merged} 条`);
    } catch (error) {
      showNotice(getMessage(error));
    } finally {
      setBusy(false);
      if (importRef.current) importRef.current.value = '';
    }
  };

  const clearAll = async () => {
    if (!window.confirm('确定清空所有翻译、来源和复习记录吗？此操作不可撤销，请先导出 JSON 备份。')) return;
    await sendRequest(makeRequest('CLEAR_RECORDS', { scope: 'all' }));
    setRecords([]);
    setDue([]);
    await refreshStats();
    showNotice('本地记录已清空');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="logo">译</div>
          <div><strong>DeepSeek</strong><span>翻译生词本</span></div>
        </div>
        <nav aria-label="主要导航">
          {tabs.map((item) => (
            <button className={tab === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => setTab(item.id)}>
              <span className="nav-icon">{item.icon}</span>{item.label}
              {item.id === 'review' && stats.dueCount > 0 && <em>{stats.dueCount}</em>}
            </button>
          ))}
        </nav>
        <div className="sidebar-tip">
          <span>快捷翻译</span>
          <kbd>Alt</kbd> + <kbd>Shift</kbd> + <kbd>T</kbd>
        </div>
        <p className="sidebar-version">本地优先 · v0.1.1</p>
      </aside>

      <main className="main-content">
        {tab === 'review' && (
          <Page title="今日复习" subtitle={`${stats.dueCount} 张卡片等待复习`}>
            {due.length ? (
              <div className="review-stack">
                <ReviewCard key={due[0]!.id} record={due[0]!} onRate={(rating) => rate(due[0]!, rating)} />
                {due.length > 1 && <p className="queue-note">完成后还有 {due.length - 1} 张</p>}
              </div>
            ) : (
              <Empty icon="✓" title="今天的复习完成了" text="继续在网页中标记有价值的单词和句子，它们会出现在这里。" />
            )}
          </Page>
        )}

        {(tab === 'marked' || tab === 'history') && (
          <Page
            title={tab === 'marked' ? '生词本' : '全部历史'}
            subtitle={tab === 'marked' ? `${stats.markedCount} 条已标记内容` : `${stats.historyCount} 条翻译记录`}
            action={<input className="search" type="search" placeholder="搜索原文、译文或标签" value={search} onChange={(event) => setSearch(event.target.value)} />}
          >
            <div className="list-summary">显示 {records.length} / {total} 条</div>
            {records.length ? (
              <div className="record-list">
                {records.map((record) => (
                  <RecordRow key={record.id} record={record} onToggle={() => toggleMarked(record)} onTags={(tags) => saveTags(record, tags)} onDelete={() => remove(record)} />
                ))}
              </div>
            ) : (
              <Empty icon={search ? '⌕' : '☆'} title={search ? '没有匹配结果' : tab === 'marked' ? '生词本还是空的' : '还没有翻译历史'} text={search ? '换个关键词再试试。' : '在网页上选中英文并点击翻译即可开始。'} />
            )}
          </Page>
        )}

        {tab === 'settings' && (
          <Page title="设置与数据" subtitle="API Key 仅保存在当前浏览器的扩展本地存储中">
            <section className="settings-grid">
              <div className="settings-card settings-card--wide">
                <div className="settings-card__head"><div><h2>DeepSeek API</h2><p>默认使用 {settings.model}</p></div><span className={`connection-badge ${settings.hasApiKey ? 'ready' : ''}`}>{settings.hasApiKey ? '已配置' : '未配置'}</span></div>
                <label htmlFor="api-key">{settings.hasApiKey ? '替换 API Key' : 'API Key'}</label>
                <div className="key-row">
                  <input id="api-key" type={showKey ? 'text' : 'password'} autoComplete="off" value={keyInput} onChange={(event) => setKeyInput(event.target.value)} placeholder={settings.hasApiKey ? '已保存；输入新 Key 可替换' : 'sk-...'} />
                  <button className="button button--muted" type="button" onClick={() => setShowKey((value) => !value)}>{showKey ? '隐藏' : '显示'}</button>
                </div>
                <p className="security-note">扩展不会将 Key 发送给网页或包含在备份中，但本机持久存储无法防止具有本机访问权的人通过扩展调试工具读取。</p>
                <div className="button-row">
                  <button className="button button--primary" type="button" disabled={busy} onClick={saveSettings}>保存 Key</button>
                  <button className="button button--muted" type="button" disabled={busy || (!settings.hasApiKey && !keyInput.trim())} onClick={testConnection}>测试连接</button>
                  {settings.hasApiKey && <button className="button button--text-danger" type="button" disabled={busy} onClick={clearKey}>清除 Key</button>}
                </div>
              </div>

              <div className="settings-card">
                <h2>备份与迁移</h2>
                <p>JSON 可完整恢复复习状态；CSV 适合在 Excel 中查看。</p>
                <div className="button-stack">
                  <button className="button button--muted" type="button" onClick={() => exportData('json')}>导出 JSON 备份</button>
                  <button className="button button--muted" type="button" onClick={() => exportData('csv')}>导出 CSV</button>
                  <button className="button button--muted" type="button" disabled={busy} onClick={() => importRef.current?.click()}>导入 JSON</button>
                  <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => event.target.files?.[0] && void importData(event.target.files[0])} />
                </div>
              </div>

              <div className="settings-card danger-card">
                <h2>本地数据</h2>
                <p>当前保存 {stats.historyCount} 条历史、{stats.markedCount} 条生词。</p>
                <button className="button button--danger-outline" type="button" onClick={clearAll}>清空全部记录</button>
              </div>
            </section>
          </Page>
        )}
      </main>
      {notice && <div className="toast" role="status">{notice}</div>}
    </div>
  );
}

function Page({ title, subtitle, action, children }: { title: string; subtitle: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <><header className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header><div className="page-body">{children}</div></>;
}

function Empty({ icon, title, text }: { icon: string; title: string; text: string }) {
  return <div className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{text}</p></div>;
}

function RecordRow({ record, onToggle, onTags, onDelete }: { record: TranslationRecord; onToggle: () => void; onTags: (tags: string[]) => void; onDelete: () => void }) {
  const [tags, setTags] = useState(record.tags.join(', '));
  const source = record.sources[0];
  return (
    <article className="record-row">
      <div className="record-main">
        <div className="record-title"><span className="kind-pill">{record.result.kind === 'word' ? '单词' : record.result.kind === 'phrase' ? '短语' : '句子'}</span><h2>{record.sourceText}</h2></div>
        <p className="record-translation">{record.result.translation}</p>
        {record.result.entries.length > 0 && <p className="record-detail">{record.result.entries.map((entry) => `${entry.partOfSpeech} ${entry.meaning}`).join(' · ')}</p>}
        {source?.contextSnippet && <blockquote>{source.contextSnippet}</blockquote>}
        <div className="record-source">
          <span>{new Date(record.lastSeenAt).toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })} · 查询 {record.lookupCount} 次</span>
          {source?.url && <a href={source.url} target="_blank" rel="noreferrer">{source.title || new URL(source.url).hostname} ↗</a>}
        </div>
      </div>
      <div className="record-actions">
        <button className={`star-button ${record.marked ? 'marked' : ''}`} type="button" onClick={onToggle} title={record.marked ? '取消标记' : '标记复习'}>{record.marked ? '★' : '☆'}</button>
        <button className="delete-button" type="button" onClick={onDelete}>删除</button>
      </div>
      <div className="tag-editor">
        <input aria-label="标签，以逗号分隔" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="添加标签，以逗号分隔" />
        <button type="button" onClick={() => onTags(tags.split(/[,，]/))}>保存标签</button>
      </div>
    </article>
  );
}

function getMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'appError' in error) {
    return (error as { appError?: { message?: string } }).appError?.message ?? '操作失败';
  }
  return error instanceof Error ? error.message : '操作失败';
}
