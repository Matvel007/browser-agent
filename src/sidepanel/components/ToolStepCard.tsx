import React, { useEffect, useState } from 'react';
import { ToolCallRecord } from '../../types';
import { TOOLS, toolLabel } from '../../services/tools';
import { getArtifact } from '../../services/artifacts';
import { projectValue } from '../../services/budget';
import { i18n, tr } from '../../services/i18n';

export const ToolStepCard: React.FC<{ toolCall: ToolCallRecord; sessionId?: string }> = ({ toolCall: call, sessionId = '' }) => {
  const [open, setOpen] = useState(false), [url, setUrl] = useState(''), [preview, setPreview] = useState(''), [error, setError] = useState('');
  const artifact = call.result?.artifact;
  useEffect(() => {
    if (!open || !artifact) return;
    let disposed = false, objectUrl = '';
    setError('');
    void getArtifact(artifact.id, sessionId).then(async row => {
      if (disposed) return;
      objectUrl = URL.createObjectURL(row.blob); setUrl(objectUrl);
      if (/text|json|javascript|xml/.test(row.mime)) {
        const text = await row.blob.slice(0, 40000).text();
        if (!disposed) setPreview(text + (row.bytes > 40000 ? '\n… ' + tr('Скачайте файл для полного содержимого.', 'Download the file for the full content.') : ''));
      }
    }).catch(err => { if (!disposed) setError(err.message); });
    return () => { disposed = true; if (objectUrl) URL.revokeObjectURL(objectUrl); setUrl(''); setPreview(''); };
  }, [open, artifact?.id, sessionId]);
  const title = toolLabel(TOOLS.find(tool => tool.name === call.name)?.title || call.name, i18n.getLanguage());
  const status = ({ pending: tr('ожидание', 'pending'), running: tr('выполняется', 'running'), success: tr('готово', 'done'), error: tr('ошибка', 'error'), cancelled: tr('остановлено', 'stopped') })[call.status];
  return <section className={`tool-card ${call.status}`}>
    <button type="button" className="tool-card-toggle" aria-expanded={open} onClick={() => setOpen(!open)}><span>{title}</span><small>{status}{call.result?.tokens_est != null ? ` · ${call.result.profile} · ~${call.result.tokens_est} tok` : ''}</small></button>
    {open && <div className="tool-card-content">
      <small>{call.name}</small>
      <details><summary>{tr('Аргументы', 'Arguments')}</summary><pre>{JSON.stringify(projectValue(call.args, 'balanced').data, null, 2)}</pre></details>
      {call.error && <p className="error-text">{call.error}</p>}
      {call.result && <>
        <p>{call.result.summary}</p>
        {call.result.truncated && <p className="hint">{tr('Показана часть данных.', 'Partial data shown.')} {(call.result.truncation || []).join('; ')}</p>}
        <pre>{JSON.stringify(call.result.data ?? call.result, null, 2)}</pre>
        {call.result.next && <small>{call.result.next}</small>}
      </>}
      {artifact && <div className="artifact"><p>{artifact.name} · {(artifact.bytes / 1024).toFixed(1)} KiB</p>
        {url && <><a className="button" href={url} download={artifact.name}>{tr('Скачать файл', 'Download file')}</a>{artifact.mime.startsWith('image/') && <img src={url} alt={tr('Снимок страницы', 'Page screenshot')} loading="lazy" />}</>}
        {preview && <details><summary>{tr('Просмотр файла', 'Preview file')}</summary><pre>{preview}</pre></details>}
        {error && <p className="error-text">{error}</p>}
      </div>}
    </div>}
  </section>;
};
