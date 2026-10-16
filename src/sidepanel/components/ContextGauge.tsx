import React, { useState } from 'react';
import { t } from '../../services/i18n';

interface ContextGaugeProps {
  usedTokens: number;
  maxTokens: number;
  messageCount: number;
  compressionThreshold: number;
}

export const ContextGauge: React.FC<ContextGaugeProps> = ({
  usedTokens,
  maxTokens,
  messageCount,
  compressionThreshold,
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
    if (percentage > compressionThreshold) return '#ff4444';
    if (percentage > 70) return '#e5a50a';
    if (percentage > 40) return '#3794ff';
    return '#858585';
  };

  const isCompressed = percentage >= compressionThreshold;

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
        <div className="absolute bottom-8 right-0 z-50 w-52 p-2.5 rounded-lg bg-agent-card border border-agent-border shadow-xl text-agent-text text-xs space-y-1.5 select-none pointer-events-none">
          <div className="font-semibold text-[11px] text-agent-text border-b border-agent-border pb-1">
            {t('context_usage')}
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
          <div className="text-[11px] flex justify-between pt-0.5 border-t border-agent-border">
            <span className="text-agent-muted">{t('context_usage')}:</span>
            <span
              className={`font-semibold ${
                isCompressed ? 'text-amber-500' : 'text-agent-muted'
              }`}
            >
              {isCompressed ? t('compression_active') : t('compression_idle')}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
