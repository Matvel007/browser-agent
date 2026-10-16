import React, { useState } from 'react';
import { t } from '../../services/i18n';

interface ContextGaugeProps {
  usedTokens: number;
  maxTokens: number;
  messageCount: number;
  compressionThreshold?: number;
  onTriggerCompact?: () => void;
}

export const ContextGauge: React.FC<ContextGaugeProps> = ({
  usedTokens,
  maxTokens,
  messageCount,
  onTriggerCompact,
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  const safeMax = Math.max(maxTokens, 1024);
  const percentage = Math.min(100, Math.round((usedTokens / safeMax) * 100));

  // Circular progress calculation
  const radius = 9;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  // Determine color based on utilization
  const getColor = () => {
    if (percentage >= 100) return '#ef4444';
    if (percentage >= 80) return '#f59e0b';
    if (percentage >= 40) return '#3794ff';
    return '#858585';
  };

  return (
    <div className="relative flex items-center">
      <button
        type="button"
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        title={t('context_usage')}
        className="p-1 rounded hover:bg-agent-surface transition-colors flex items-center gap-1.5 text-xs text-agent-muted"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" className="rotate-[-90deg]">
          {/* Background track */}
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="opacity-20 text-agent-muted"
          />
          {/* Progress arc */}
          <circle
            cx="12"
            cy="12"
            r={radius}
            fill="none"
            stroke={getColor()}
            strokeWidth="2.5"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-300"
          />
        </svg>
        <span className="text-[11px] font-mono select-none">{percentage}%</span>
      </button>

      {/* Stats Tooltip */}
      {showTooltip && (
        <div className="absolute bottom-8 right-0 z-50 w-56 p-2.5 rounded-xl bg-agent-card border border-agent-border shadow-2xl text-agent-text text-xs space-y-1.5 select-none">
          <div className="font-semibold text-[11px] text-agent-text border-b border-agent-border pb-1 flex justify-between items-center">
            <span>{t('context_usage')}</span>
            <span className="text-agent-accent font-mono">{percentage}%</span>
          </div>
          <div className="text-[11px] text-agent-muted flex justify-between">
            <span>{t('context_messages', { count: messageCount })}</span>
          </div>
          <div className="text-[11px] text-agent-muted flex justify-between">
            <span>
              {t('context_tokens', {
                used: usedTokens,
                max: safeMax,
                percent: percentage,
              })}
            </span>
          </div>

          <div className="pt-1.5 border-t border-agent-border">
            {onTriggerCompact ? (
              <button
                type="button"
                onClick={() => {
                  setShowTooltip(false);
                  onTriggerCompact();
                }}
                className="w-full py-1 px-2 rounded-md bg-agent-surface hover:bg-agent-border border border-agent-border text-agent-accent text-[11px] font-medium flex items-center justify-center gap-1.5 transition-colors"
              >
                <span>🗜️</span>
                <span>Сжать контекст (/compact)</span>
              </button>
            ) : (
              <div className="text-[10px] text-agent-muted text-center">
                Автосжатие при заполнении лимита
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
