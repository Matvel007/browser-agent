import React, { useEffect, useRef, useState } from 'react';
import { i18n, tr } from '../../services/i18n';
import { TOOLS, toolLabel } from '../../services/tools';

interface Props { usedTokens: number; maxTokens: number; messageCount: number; onTriggerCompact?: () => void; costs?: Record<string, number>; compressionThreshold?: number; toolCosts?: [string, number][] }
export const ContextGauge: React.FC<Props> = ({ usedTokens, maxTokens, messageCount, onTriggerCompact, costs, toolCosts }) => {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', close); return () => document.removeEventListener('pointerdown', close);
  }, [open]);
  const percent = Math.round(usedTokens / Math.max(maxTokens, 1) * 100);
  return <div className="context-gauge" ref={root} onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
    <button type="button" aria-label={tr('Контекст модели', 'Model context')} aria-expanded={open} onClick={() => setOpen(!open)} className={percent >= 90 ? 'danger' : ''}>
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity=".25" /><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray={`${Math.min(100, percent) * 0.5655} 56.55`} transform="rotate(-90 12 12)" /></svg><span>{percent}%</span>
    </button>
    {open && <div className="context-popover" onKeyDown={e => { if (e.key === 'Escape') setOpen(false); }}>
      <strong>{tr('Контекст следующего запроса', 'Next request context')}</strong>
      <p>~{usedTokens.toLocaleString()} / {maxTokens.toLocaleString()}</p>
      <p>{messageCount} {tr('сообщений в истории', 'messages in transcript')}</p>
      {costs && <dl className="metrics">{(['instructions', 'tools', 'messages', 'images', 'reserve'] as const).map((key, index) => <React.Fragment key={key}><dt>{tr(['Инструкции', 'Инструменты', 'Сообщения', 'Изображения', 'Резерв ответа'][index], key)}</dt><dd>~{(costs[key] || 0).toLocaleString()}</dd></React.Fragment>)}</dl>}
      {!!toolCosts?.length && <><small>{tr('Крупнейшие результаты в контексте', 'Largest tool results in context')}</small><dl className="metrics">{toolCosts.map(([name, tokens]) => <React.Fragment key={name}><dt>{toolLabel(TOOLS.find(tool => tool.name === name)?.title || name, i18n.getLanguage())}</dt><dd>~{tokens.toLocaleString()}</dd></React.Fragment>)}</dl></>}
      <small>{tr('Оценка; фактический usage указан у ответа, если его вернул API.', 'Estimate; actual usage is shown on responses when reported by the API.')}</small>
      <button type="button" className="button" disabled={!onTriggerCompact} onClick={() => { setOpen(false); onTriggerCompact?.(); }}>{tr('Сжать контекст', 'Compact context')}</button>
    </div>}
  </div>;
};
