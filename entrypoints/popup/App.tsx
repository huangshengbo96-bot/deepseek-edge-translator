import { useEffect, useState } from 'react';
import { makeRequest, sendRequest } from '../../lib/messaging';
import type { AppStats, PublicSettings, TranslationRecord } from '../../lib/types';

export function App() {
  const [stats, setStats] = useState<AppStats>({ dueCount: 0, markedCount: 0, historyCount: 0 });
  const [recent, setRecent] = useState<TranslationRecord[]>([]);
  const [settings, setSettings] = useState<PublicSettings>({ hasApiKey: false, model: 'deepseek-flash' });
  const [error, setError] = useState('');

  useEffect(() => {
    void Promise.all([
      sendRequest<AppStats>(makeRequest('GET_STATS', {})),
      sendRequest<{ records: TranslationRecord[] }>(makeRequest('LIST_RECORDS', { scope: 'history', limit: 3 })),
      sendRequest<PublicSettings>(makeRequest('GET_SETTINGS', {}))
    ]).then(([nextStats, list, nextSettings]) => {
      setStats(nextStats);
      setRecent(list.records);
      setSettings(nextSettings);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : '加载失败'));
  }, []);

  const openDashboard = async () => {
    await sendRequest(makeRequest('OPEN_DASHBOARD', {}));
    window.close();
  };

  return (
    <main className="popup-shell">
      <header className="popup-header">
        <div className="logo">译</div>
        <div>
          <h1>DeepSeek 划词翻译</h1>
          <p>{settings.hasApiKey ? '服务已配置' : '尚未配置 API Key'}</p>
        </div>
        <span className={`status-dot ${settings.hasApiKey ? 'is-ready' : ''}`} aria-hidden="true" />
      </header>

      <section className="due-card">
        <div>
          <span className="eyebrow">今日待复习</span>
          <strong>{stats.dueCount}</strong>
        </div>
        <button type="button" onClick={openDashboard}>{stats.dueCount ? '开始复习' : '打开生词本'}</button>
      </section>

      <div className="stats-row">
        <span><strong>{stats.markedCount}</strong> 已标记</span>
        <span><strong>{stats.historyCount}</strong> 条历史</span>
      </div>

      <section className="recent">
        <div className="section-head"><h2>最近翻译</h2></div>
        {recent.length === 0 ? (
          <p className="empty">在网页上选中英文，点击“翻译”即可开始。</p>
        ) : recent.map((record) => (
          <div className="recent-item" key={record.id}>
            <span>{record.sourceText}</span>
            <strong>{record.result.translation}</strong>
          </div>
        ))}
      </section>

      {error && <p className="error">{error}</p>}
      <button className="settings-link" type="button" onClick={openDashboard}>
        {settings.hasApiKey ? '管理历史与设置' : '前往设置 API Key'} →
      </button>
    </main>
  );
}
