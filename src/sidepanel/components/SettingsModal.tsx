import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { AppSettings, ProviderType, SettingsTab } from '../../types';
import { migrateSettings, selectProvider } from '../../services/storage';
import { TOOLS, isToolEnabled, toolLabel } from '../../services/tools';
import { i18n, tr } from '../../services/i18n';
import { LLMClient } from '../../services/llm';
import { artifactStats, pruneArtifacts, dbRequest } from '../../services/artifacts';
import { playCompletion } from '../../services/sound';
import { ModelPicker } from './ModelPicker';

interface Props { settings: AppSettings; isOpen: boolean; initialTab?: SettingsTab; onClose: () => void; onSave: (settings: AppSettings) => Promise<void> | void }
const tabs: { id: SettingsTab; ru: string; en: string }[] = [
  { id: 'models', ru: 'Модели', en: 'Models' }, { id: 'tools', ru: 'Инструменты', en: 'Tools' },
  { id: 'context', ru: 'Контекст и история', en: 'Context & history' }, { id: 'behavior', ru: 'Поведение', en: 'Behavior' },
  { id: 'interface', ru: 'Интерфейс', en: 'Interface' }, { id: 'diagnostics', ru: 'Диагностика', en: 'Diagnostics' },
];
const Row: React.FC<{ label: string; hint?: string; children: React.ReactNode }> = ({ label, hint, children }) => <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
const Toggle: React.FC<{ label: string; checked: boolean; onChange: (value: boolean) => void }> = ({ label, checked, onChange }) => <label className="toggle-row"><span>{label}</span><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} /></label>;

export const SettingsModal: React.FC<Props> = ({ settings, isOpen, initialTab = 'models', onClose, onSave }) => {
  const [form, setForm] = useState(settings), [active, setActive] = useState<SettingsTab>(initialTab), [error, setError] = useState(''), [saving, setSaving] = useState(false);
  const [query, setQuery] = useState(''), [expanded, setExpanded] = useState(''), [testing, setTesting] = useState(false), [diagnostic, setDiagnostic] = useState('');
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const testAbort = useRef<AbortController>();
  useEffect(() => {
    if (isOpen) { setForm(settings); setActive(initialTab === 'general' || initialTab === 'hotkey' ? 'interface' : initialTab); setError(''); setDiagnostic(''); }
    else testAbort.current?.abort();
  }, [isOpen, initialTab]);
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.activeElement as HTMLElement;
    panel.current?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key === 'Tab') {
        const nodes = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea,select,[tabindex="0"]') || [])];
        const first = nodes[0], last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('keydown', key); previous?.focus(); testAbort.current?.abort(); };
  }, [isOpen]);
  const patch = (value: Partial<AppSettings>) => setForm(current => ({ ...current, ...value }));
  if (!isOpen) return null;
  const numeric = (key: keyof AppSettings, min: number, max: number, step = 1) => <input type="number" min={min} max={max} step={step} value={Number(form[key])}
    onChange={e => patch({ [key]: e.target.value === '' ? 0 : Number(e.target.value) })} />;
  const testConnection = async () => {
    testAbort.current?.abort(); const controller = new AbortController(); testAbort.current = controller;
    setTesting(true); setDiagnostic('');
    try {
      const response = await LLMClient.chat({ ...migrateSettings(form), maxOutputTokens: 64 }, [{ id: 'test', role: 'user', content: 'Reply briefly: connection works.', timestamp: Date.now() }], {}, controller.signal, { tools: false });
      if (!controller.signal.aborted) setDiagnostic(response.content || tr('Соединение установлено, ответ пуст.', 'Connected, but the response was empty.'));
    } catch (err: any) { if (!controller.signal.aborted) setDiagnostic(err.message); }
    finally { if (testAbort.current === controller) setTesting(false); }
  };
  const groups = [...new Set(TOOLS.map(tool => tool.group))];
  return <div className="modal-root" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="settings-panel" role="dialog" aria-modal="true" aria-labelledby="settings-title" ref={panel} tabIndex={-1}>
      <div className="settings-header"><h2 id="settings-title">{tr('Настройки', 'Settings')}</h2><button type="button" aria-label={tr('Закрыть настройки', 'Close settings')} onClick={onClose}><X size={18} /></button></div>
      <nav className="settings-tabs" aria-label={tr('Разделы настроек', 'Settings sections')}>{tabs.map(tab => <button key={tab.id} type="button" aria-current={active === tab.id ? 'page' : undefined} onClick={() => setActive(tab.id)}>{tr(tab.ru, tab.en)}</button>)}</nav>
      <div className="settings-content">
        {active === 'models' && <>
          <Row label={tr('Провайдер', 'Provider')}><select value={form.provider} onChange={e => { setForm(selectProvider(form, e.target.value as ProviderType)); setDiagnostic(''); }}>
            {(['routerai', 'aitunnel', 'openai', 'deepseek', 'gemini', 'anthropic', 'custom'] as const).map(p => <option key={p} value={p}>{({ routerai: 'RouterAI', aitunnel: 'AItunnel', openai: 'OpenAI', deepseek: 'DeepSeek', gemini: 'Google Gemini', anthropic: 'Anthropic', custom: 'Custom / OpenAI compatible' })[p]}</option>)}
          </select></Row>
          <Row label="API key" hint={tr('Ключ хранится локально и не передаётся в историю чата.', 'Stored locally; never included in chat history.')}><input type="password" autoComplete="off" value={form.apiKey} onChange={e => patch({ apiKey: e.target.value })} /></Row>
          {form.provider === 'custom' && <Row label="Base URL"><input type="url" placeholder="http://localhost:11434/v1" value={form.customBaseUrl || ''} onChange={e => patch({ customBaseUrl: e.target.value })} /></Row>}
          <Row label={tr('ID модели', 'Model ID')}><input value={form.model} placeholder="provider/model" onChange={e => patch({ model: e.target.value })} /></Row>
          <div className="field"><span>{tr('Список моделей', 'Model list')}</span><ModelPicker settings={form} onSelect={model => patch({ model })} /></div>
          <Toggle label={tr('Модель поддерживает изображения (vision)', 'Model supports images (vision)')} checked={form.supportsVision} onChange={supportsVision => patch({ supportsVision })} />
          <button type="button" className="button" disabled={testing || !form.model} onClick={() => { void testConnection(); }}>{testing ? tr('Проверка…', 'Testing…') : tr('Проверить подключение · API-запрос', 'Test connection · API request')}</button>
          {diagnostic && <p className="notice" role="status">{diagnostic}</p>}
        </>}
        {active === 'tools' && <>
          <h3>{tr('Веб-поиск', 'Web search')}</h3>
          <Toggle label={tr('Включить поиск и чтение ссылок', 'Enable search and URL reading')} checked={form.searchEnabled} onChange={searchEnabled => patch({ searchEnabled })} />
          <Row label={tr('Поисковый сервис', 'Search provider')}><select value={form.searchProvider} onChange={e => patch({ searchProvider: e.target.value as AppSettings['searchProvider'] })}><option value="duckduckgo">DuckDuckGo</option><option value="tavily">Tavily</option></select></Row>
          {form.searchProvider === 'tavily' && <Row label="Tavily API key"><input type="password" autoComplete="off" value={form.tavilyApiKey} onChange={e => patch({ tavilyApiKey: e.target.value })} /></Row>}
          <p className="hint">{tr('Поиск не переключает вкладку. DuckDuckGo может потребовать CAPTCHA; в этом случае будет показана ошибка.', 'Search does not navigate tabs. DuckDuckGo may return a CAPTCHA; this is reported as an error.')}</p>
          <h3>{tr('Каталог', 'Catalog')} · {TOOLS.filter(tool => isToolEnabled(form, tool.name)).length}/{TOOLS.length}</h3>
          <p className="hint">{tr('Изменения вступают в силу после сохранения. JS/CDP дают широкий доступ независимо от отдельных высокоуровневых инструментов.', 'Changes apply after saving. JS/CDP grant broad access independently of individual high-level tools.')}</p>
          <input aria-label={tr('Найти инструмент', 'Find tool')} placeholder={tr('Найти инструмент', 'Find tool')} value={query} onChange={e => setQuery(e.target.value)} />
          {groups.map(group => {
            const rows = TOOLS.filter(tool => tool.group === group && `${toolLabel(tool.title, i18n.getLanguage())} ${tool.name} ${tool.description}`.toLowerCase().includes(query.toLowerCase()));
            return rows.length ? <section className="tool-group" key={group}><h4>{toolLabel(group, i18n.getLanguage())}</h4>{rows.map(tool => <div className="tool-row" key={tool.name}>
              <div className="tool-row-header"><button type="button" aria-expanded={expanded === tool.name} onClick={() => setExpanded(expanded === tool.name ? '' : tool.name)}><strong>{toolLabel(tool.title, i18n.getLanguage())}</strong><small>{tool.description}</small></button>
                <input type="checkbox" aria-label={`${tr('Включить', 'Enable')} ${tool.name}`} checked={isToolEnabled(form, tool.name)} disabled={!form.searchEnabled && ['web_search', 'web_read'].includes(tool.name)} onChange={e => patch({ disabledTools: e.target.checked ? form.disabledTools.filter(n => n !== tool.name) : [...new Set([...form.disabledTools, tool.name])] })} /></div>
              {expanded === tool.name && <div className="tool-details"><code>{tool.name}</code><p>{tool.details}</p><pre>{JSON.stringify(tool.parameters, null, 2)}</pre></div>}
            </div>)}</section> : null;
          })}
        </>}
        {active === 'context' && <>
          <Row label={tr('Окно контекста модели, токены', 'Model context window, tokens')} hint={tr('Укажите реальный лимит выбранной модели. Включает инструкции, инструменты, изображения и резерв ответа.', 'Use the actual model limit. Includes instructions, tools, images and output reserve.')}>{numeric('maxContextTokens', 4096, 2000000, 1000)}</Row>
          <Row label={tr('Резерв ответа, токены', 'Output reserve, tokens')}>{numeric('maxOutputTokens', 256, 32768, 256)}</Row>
          <Row label={tr('Автосжатие при заполнении, %', 'Auto-compact threshold, %')}>{numeric('compressionThreshold', 40, 90)}</Row>
          <Row label={tr('Порог числа сообщений для сжатия', 'Message count compaction threshold')}>{numeric('maxHistoryMessages', 4, 200)}</Row>
          <Row label={tr('Детализация результатов', 'Tool output profile')}><select value={form.toolProfile} onChange={e => patch({ toolProfile: e.target.value as AppSettings['toolProfile'] })}><option value="lean">Lean</option><option value="balanced">Balanced</option><option value="full">Full · artifacts</option></select></Row>
          <Toggle label={tr('Сохранять историю локально', 'Save history locally')} checked={form.saveSessionHistory} onChange={saveSessionHistory => patch({ saveSessionHistory })} />
          <p className="hint">{tr('Сжатие меняет только контекст модели. Вся переписка остаётся видимой. Артефакты: до 8 МиБ каждый, 64 МиБ суммарно, срок хранения 7 дней.', 'Compression only changes the model context. The full transcript remains visible. Artifacts: 8 MiB each, 64 MiB total, retained for 7 days.')}</p>
          <button type="button" className="button" onClick={() => { void pruneArtifacts().then(() => setDiagnostic(tr('Просроченные артефакты удалены.', 'Expired artifacts removed.'))).catch(err => setError(err.message)); }}>{tr('Очистить просроченные артефакты', 'Remove expired artifacts')}</button>
          {diagnostic && <p className="hint">{diagnostic}</p>}
        </>}
        {active === 'behavior' && <>
          <Row label={tr('Дополнительные инструкции', 'Additional instructions')} hint={tr('Основной нейтральный промпт встроен. Каталог инструментов в этот текст добавлять не нужно.', 'Neutral core instructions are built in. Do not duplicate the tool catalog here.')}><textarea rows={7} value={form.systemPrompt || ''} onChange={e => patch({ systemPrompt: e.target.value })} /></Row>
          <Row label={tr('Температура', 'Temperature')}>{numeric('temperature', 0, 2, 0.1)}</Row>
          <Toggle label={tr('Ограничивать шаги задачи', 'Limit task steps')} checked={form.maxStepsEnabled} onChange={maxStepsEnabled => patch({ maxStepsEnabled })} />
          {form.maxStepsEnabled && <Row label={tr('Максимум шагов задачи', 'Maximum task steps')}>{numeric('maxSteps', 1, 200)}</Row>}
          <Toggle label={tr('Подключать CDP при обращении к инструменту', 'Connect CDP when a tool needs it')} checked={form.autoAttachDebugger} onChange={autoAttachDebugger => patch({ autoAttachDebugger })} />
          <Toggle label={tr('Спрашивать перед опасными действиями', 'Ask before dangerous actions')} checked={form.confirmDangerousActions} onChange={confirmDangerousActions => patch({ confirmDangerousActions })} />
          <p className="hint">{tr('Клики, ввод, отправка форм, переходы, JS/CDP и изменения хранилища будут ждать подтверждения. Это защищает от случайных покупок и удалений.', 'Clicks, typing, form submission, navigation, JS/CDP and storage changes will wait for confirmation. This protects against accidental purchases and deletions.')}</p>
          <p className="hint">{form.maxStepsEnabled ? tr('По достижении лимита агент формирует итог. Отправленные браузеру действия не повторяются автоматически.', 'At the limit the agent summarizes the outcome. Browser actions are not automatically retried.') : tr('Агент выполняет шаги до полного решения задачи или ручной остановки.', 'The agent runs steps until the task is complete or manually stopped.')}</p>
        </>}
        {active === 'interface' && <>
          <Row label={tr('Тема', 'Theme')}><select value={form.theme} onChange={e => patch({ theme: e.target.value as AppSettings['theme'] })}><option value="system">{tr('Системная', 'System')}</option><option value="light">{tr('Светлая', 'Light')}</option><option value="dark">{tr('Тёмная', 'Dark')}</option></select></Row>
          <Row label={tr('Язык', 'Language')}><select value={form.language} onChange={e => patch({ language: e.target.value as AppSettings['language'] })}><option value="auto">{tr('Автоматически', 'Automatic')}</option><option value="ru">Русский</option><option value="en">English</option></select></Row>
          <Toggle label={tr('Плавающая кнопка на страницах', 'Floating page button')} checked={form.widgetEnabled} onChange={widgetEnabled => patch({ widgetEnabled })} />
          <Toggle label={tr('Звук завершения', 'Completion sound')} checked={form.soundEnabled} onChange={soundEnabled => patch({ soundEnabled })} />
          <p className="hint">{tr('Версия', 'Version')}: {__APP_VERSION__}</p>
          <Row label={tr('Громкость', 'Volume')}><input type="range" min="0" max="1" step="0.05" value={form.soundVolume} onChange={e => patch({ soundVolume: Number(e.target.value) })} /></Row>
          <button type="button" className="button" onClick={() => { void playCompletion(form.soundVolume); }}>{tr('Прослушать сигнал', 'Preview sound')}</button>
          <p className="hint">{tr('Горячая клавиша задаётся браузером. По умолчанию Alt+C.', 'The browser manages the shortcut. Default: Alt+C.')}</p>
          <button type="button" className="button" onClick={() => { void chrome.runtime.sendMessage({ action: 'OPEN_SHORTCUTS_SETTINGS' }).catch(err => setError(err.message)); }}>{tr('Настроить горячую клавишу', 'Configure shortcut')}</button>
        </>}
        {active === 'diagnostics' && <>
          <dl className="metrics"><dt>{tr('Версия', 'Version')}</dt><dd>{__APP_VERSION__}</dd></dl>
          <p>{tr('Возможности текущего браузера', 'Current browser capabilities')}</p>
          <dl className="metrics"><dt>chrome.debugger</dt><dd>{String(typeof chrome !== 'undefined' && Boolean(chrome.debugger))}</dd><dt>sidePanel</dt><dd>{String(typeof chrome !== 'undefined' && Boolean(chrome.sidePanel))}</dd><dt>IndexedDB</dt><dd>{String(typeof indexedDB !== 'undefined')}</dd></dl>
          <button type="button" className="button" onClick={() => { void artifactStats().then(stats => setDiagnostic(`${stats.count} artifacts · ${(stats.bytes / 1048576).toFixed(2)} MiB`)).catch(err => setError(err.message)); }}>{tr('Проверить хранилище', 'Inspect storage')}</button>
          <button type="button" className="button" onClick={() => {
            const blob = new Blob([JSON.stringify({ extensionVersion: __APP_VERSION__, schemaVersion: 2, provider: form.provider, model: form.model, profile: form.toolProfile, disabledTools: form.disabledTools,
              debugger: typeof chrome !== 'undefined' && Boolean(chrome.debugger), sidePanel: typeof chrome !== 'undefined' && Boolean(chrome.sidePanel) }, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'browser-agent-diagnostics.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}>{tr('Скачать диагностику без ключей', 'Download diagnostics without keys')}</button>
          <button type="button" className="button danger" onClick={() => { if (confirm(tr('Удалить все артефакты? Переписка останется.', 'Delete all artifacts? The transcript will remain.'))) void dbRequest('artifacts', 'readwrite', store => store.clear()).then(() => setDiagnostic(tr('Артефакты удалены.', 'Artifacts deleted.'))).catch(err => setError(err.message)); }}>{tr('Удалить все артефакты', 'Delete all artifacts')}</button>
          {diagnostic && <p className="notice" role="status">{diagnostic}</p>}
          <p className="hint">{tr('Прямые интеграции Gemini/Anthropic требуют собственных ключей. Проверка подключения выполняется явно на вкладке «Модели».', 'Direct Gemini/Anthropic integrations require their own keys. Run an explicit connection test in Models.')}</p>
        </>}
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      <footer className="settings-footer"><button className="button" type="button" onClick={onClose}>{tr('Отмена', 'Cancel')}</button><button className="button primary" type="button" disabled={saving} onClick={async () => {
        setError(''); setSaving(true);
        try { await onSave(migrateSettings(form)); onClose(); } catch (err: any) { setError(err.message); } finally { setSaving(false); }
      }}>{saving ? tr('Сохранение…', 'Saving…') : tr('Сохранить', 'Save')}</button></footer>
    </div>
  </div>;
};
