import React from 'react';
import { Settings2 } from 'lucide-react';
import { AppSettings } from '../../types';
import { ContextGauge } from './ContextGauge';
import { ModelPicker } from './ModelPicker';
import { tr } from '../../services/i18n';

interface Props {
  settings: AppSettings; onOpenModelSettings: () => void; onSelectModel: (model: string) => void;
  onTriggerCompact?: () => void; usedTokens: number; messageCount: number; busy?: boolean;
  costs?: Record<string, number>;
  toolCosts?: [string, number][];
}
export const ModelSelectorBar: React.FC<Props> = ({ settings, onOpenModelSettings, onSelectModel, onTriggerCompact, usedTokens, messageCount, busy, costs, toolCosts }) => <div className="model-bar">
  <span className="provider-label">{settings.provider}</span>
  <ModelPicker settings={settings} onSelect={onSelectModel} disabled={busy} direction="up" />
  <button type="button" aria-label={tr('Настройки модели', 'Model settings')} onClick={onOpenModelSettings}><Settings2 size={15} /></button>
  <ContextGauge usedTokens={usedTokens} maxTokens={settings.maxContextTokens} messageCount={messageCount} costs={costs} toolCosts={toolCosts} onTriggerCompact={busy ? undefined : onTriggerCompact} />
</div>;
