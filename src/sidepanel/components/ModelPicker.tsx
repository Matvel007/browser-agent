import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, RefreshCw } from 'lucide-react';
import { AppSettings } from '../../types';
import { LLMClient } from '../../services/llm';
import { tr } from '../../services/i18n';

export const ModelPicker: React.FC<{ settings: AppSettings; onSelect: (model: string) => void; disabled?: boolean; direction?: 'up' | 'down' }> = ({ settings, onSelect, disabled, direction = 'down' }) => {
  const [open, setOpen] = useState(false), [models, setModels] = useState<string[]>([]), [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [index, setIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null), field = useRef<HTMLInputElement>(null), generation = useRef(0);
  useEffect(() => {
    generation.current++; setModels([]); setOpen(false); setError(''); setLoading(false);
  }, [settings.provider, settings.apiKey, settings.customBaseUrl]);
  useEffect(() => () => { generation.current++; }, []);
  useEffect(() => { if (open) root.current?.querySelector('.focused')?.scrollIntoView({ block: 'nearest' }); }, [index, open]);
  useEffect(() => {
    if (!open) return;
    field.current?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const load = async () => {
    const id = ++generation.current;
    setLoading(true); setError('');
    try { const rows = await LLMClient.fetchAvailableModels(settings); if (id === generation.current) setModels(rows); }
    catch (err: any) { if (id === generation.current) setError(String(err.message)); }
    finally { if (id === generation.current) setLoading(false); }
  };
  const select = (model: string) => { onSelect(model); setOpen(false); setSearch(''); setIndex(0); };
  const filtered = models.filter(model => model.toLowerCase().includes(search.toLowerCase()));
  return <div className="model-picker" ref={root}>
    <button className="model-trigger" type="button" role="combobox" aria-label={tr('Выбрать модель', 'Select model')} aria-expanded={open} aria-controls={`models-${direction}`}
      disabled={disabled} onClick={() => { const next = !open; setOpen(next); if (next) { setSearch(''); setIndex(0); if (!models.length && !loading) void load(); } }}>
      <span>{settings.model || tr('Выбрать модель', 'Select model')}</span><ChevronDown size={14} />
    </button>
    {open && <div className={`model-menu ${direction}`}>
      <div className="toolbar"><input ref={field} aria-label={tr('Поиск или ID модели', 'Search or model ID')} value={search} placeholder={tr('Поиск или ID модели', 'Search or model ID')}
        onChange={e => { setSearch(e.target.value); setIndex(0); }} onKeyDown={event => {
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); }
          if (event.key === 'ArrowDown') { event.preventDefault(); setIndex(i => Math.min(filtered.length - 1, i + 1)); }
          if (event.key === 'ArrowUp') { event.preventDefault(); setIndex(i => Math.max(0, i - 1)); }
          if (event.key === 'Enter') { event.preventDefault(); const value = filtered[index] || search.trim(); if (value) select(value); }
        }} /><button type="button" aria-label={tr('Обновить модели', 'Refresh models')} disabled={loading} onClick={() => { void load(); }}><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button></div>
      {loading && <p className="hint" role="status">{tr('Загрузка моделей…', 'Loading models…')}</p>}
      {error && <p className="error-text" role="alert">{error}</p>}
      <div role="listbox" id={`models-${direction}`} aria-label={tr('Модели', 'Models')} className="model-options">
        {filtered.slice(0, 100).map((model, i) => <button type="button" role="option" aria-selected={settings.model === model} key={model}
          className={i === index ? 'focused' : ''} onClick={() => select(model)}>{model}</button>)}
      </div>
      {filtered.length > 100 && <p className="hint">{tr('Уточните поиск: показаны первые 100.', 'Refine your search: first 100 shown.')}</p>}
      {search.trim() && !models.includes(search.trim()) && <button className="custom-model" type="button" onClick={() => select(search.trim())}>{tr('Использовать ID', 'Use ID')}: {search.trim()}</button>}
      {!loading && !filtered.length && !search && <p className="hint">{tr('Введите ID вручную или обновите список.', 'Enter a model ID or refresh the list.')}</p>}
    </div>}
  </div>;
};
