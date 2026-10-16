import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Terminal,
  MousePointer,
  Keyboard,
  Globe,
  Camera,
  Layers,
  Activity,
  CheckCircle2,
  XCircle,
  Loader2,
  Sliders,
} from 'lucide-react';
import { ToolCallRecord } from '../../types';

interface ToolStepCardProps {
  toolCall: ToolCallRecord;
}

export const ToolStepCard: React.FC<ToolStepCardProps> = ({ toolCall }) => {
  const [isOpen, setIsOpen] = useState(false);

  const getToolMeta = (name: string) => {
    switch (name) {
      case 'devtools_click_element':
        return {
          icon: <MousePointer className="w-3.5 h-3.5 text-blue-500" />,
          title: `Клик: ${toolCall.args.selector || 'элемент'}`,
        };
      case 'devtools_type_text':
        return {
          icon: <Keyboard className="w-3.5 h-3.5 text-sky-500" />,
          title: `Ввод текста: ${toolCall.args.selector || 'поле'}`,
        };
      case 'devtools_evaluate_js':
        return {
          icon: <Terminal className="w-3.5 h-3.5 text-amber-500" />,
          title: 'Выполнение JavaScript (DevTools)',
        };
      case 'devtools_get_console_logs':
        return {
          icon: <Activity className="w-3.5 h-3.5 text-rose-500" />,
          title: 'Анализ Console логов & Ошибок',
        };
      case 'devtools_get_network_requests':
        return {
          icon: <Globe className="w-3.5 h-3.5 text-indigo-500" />,
          title: 'Инспекция сетевых запросов (Network)',
        };
      case 'devtools_inspect_dom':
        return {
          icon: <Layers className="w-3.5 h-3.5 text-purple-500" />,
          title: `Инспекция DOM: ${toolCall.args.selector || 'body'}`,
        };
      case 'devtools_capture_screenshot':
        return {
          icon: <Camera className="w-3.5 h-3.5 text-slate-500" />,
          title: 'Снимок экрана (DevTools Screenshot)',
        };
      case 'devtools_scroll_page':
        return {
          icon: <Sliders className="w-3.5 h-3.5 text-teal-500" />,
          title: `Скролл страницы (${toolCall.args.direction || 'down'})`,
        };
      case 'devtools_navigate':
        return {
          icon: <Globe className="w-3.5 h-3.5 text-indigo-500" />,
          title: `Переход по URL: ${toolCall.args.url || ''}`,
        };
      default:
        return {
          icon: <Terminal className="w-3.5 h-3.5 text-agent-accent" />,
          title: toolCall.name.replace('devtools_', ''),
        };
    }
  };

  const meta = getToolMeta(toolCall.name);

  const renderResult = () => {
    if (toolCall.status === 'running') {
      return <div className="text-xs text-agent-muted italic py-1">Выполняется через Chrome DevTools...</div>;
    }
    if (toolCall.status === 'error') {
      return (
        <div className="text-xs text-rose-500 font-mono bg-rose-500/10 p-2 rounded border border-rose-500/20">
          {toolCall.error || 'Произошла ошибка выполнения'}
        </div>
      );
    }

    const res = toolCall.result;
    if (!res) return null;

    // Screenshot preview
    if (toolCall.name === 'devtools_capture_screenshot' && typeof res === 'string' && res.startsWith('data:image')) {
      return (
        <div className="mt-2">
          <img src={res} alt="Screenshot" className="rounded border border-agent-border max-h-48 w-full object-cover" />
        </div>
      );
    }

    // Console logs preview
    if (toolCall.name === 'devtools_get_console_logs' && Array.isArray(res)) {
      if (res.length === 0) {
        return <div className="text-xs text-agent-muted font-mono">Консоль чиста (нет ошибок или логов).</div>;
      }
      return (
        <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-[11px]">
          {res.map((item, idx) => (
            <div
              key={idx}
              className={`p-1.5 rounded flex items-start gap-1.5 ${
                item.type === 'error'
                  ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                  : item.type === 'warn'
                  ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                  : 'bg-agent-surface text-agent-text'
              }`}
            >
              <span className="uppercase text-[9px] px-1 py-0.5 rounded bg-black/20 font-bold flex-shrink-0">
                {item.type}
              </span>
              <span className="break-all">{item.text}</span>
            </div>
          ))}
        </div>
      );
    }

    // Network requests preview
    if (toolCall.name === 'devtools_get_network_requests' && Array.isArray(res)) {
      if (res.length === 0) {
        return <div className="text-xs text-agent-muted">Сетевых запросов пока не зафиксировано.</div>;
      }
      return (
        <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-[11px]">
          {res.slice(-10).map((req, idx) => (
            <div
              key={idx}
              className="p-1.5 rounded bg-agent-surface border border-agent-border flex items-center justify-between text-agent-text"
            >
              <div className="flex items-center gap-1.5 overflow-hidden">
                <span className="text-[10px] font-bold text-sky-500 px-1 py-0.5 bg-sky-500/10 rounded">
                  {req.method}
                </span>
                <span className="truncate max-w-[200px]" title={req.url}>
                  {req.url}
                </span>
              </div>
              {req.status && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                    req.status >= 200 && req.status < 300
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      : req.status >= 400
                      ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      : 'bg-agent-card text-agent-muted'
                  }`}
                >
                  {req.status}
                </span>
              )}
            </div>
          ))}
        </div>
      );
    }

    // General text output
    const textOutput = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
    return (
      <pre className="text-[11px] font-mono text-agent-text bg-agent-surface p-2 rounded overflow-x-auto max-h-48 border border-agent-border">
        {textOutput.slice(0, 3000)}
        {textOutput.length > 3000 ? '\n...[содержимое сокращено]' : ''}
      </pre>
    );
  };

  return (
    <div className="my-2 border border-agent-border bg-agent-card rounded-lg overflow-hidden transition-all shadow-sm">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-agent-surface transition-colors"
      >
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="p-1 rounded bg-agent-surface flex-shrink-0">{meta.icon}</div>
          <span className="text-xs font-medium text-agent-text truncate">{meta.title}</span>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          {toolCall.status === 'running' && (
            <Loader2 className="w-3.5 h-3.5 text-agent-accent animate-spin" />
          )}
          {toolCall.status === 'success' && (
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
          )}
          {toolCall.status === 'error' && (
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
          )}
          {isOpen ? (
            <ChevronDown className="w-3.5 h-3.5 text-agent-muted" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-agent-muted" />
          )}
        </div>
      </button>

      {isOpen && (
        <div className="px-3 pb-3 pt-1 border-t border-agent-border bg-agent-surface text-xs space-y-2">
          {Object.keys(toolCall.args || {}).length > 0 && (
            <div>
              <div className="text-[10px] uppercase font-semibold text-agent-muted mb-1">Параметры:</div>
              <pre className="text-[11px] font-mono text-agent-text bg-agent-card p-1.5 rounded border border-agent-border overflow-x-auto">
                {JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}

          <div>
            <div className="text-[10px] uppercase font-semibold text-agent-muted mb-1">Результат:</div>
            {renderResult()}
          </div>
        </div>
      )}
    </div>
  );
};
