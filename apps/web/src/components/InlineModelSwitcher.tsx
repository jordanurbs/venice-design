// InlineModelSwitcher — top-bar chip exposing CLI/BYOK + model picker.
//
// Lives in the entry view's sticky top-bar so users can swap between a
// local CLI and BYOK (and the active model under either) without having
// to open the full Settings dialog. The chip is intentionally narrow —
// it shows the active mode + agent/provider + model in one line and
// opens a compact popover for switching. All persistence is delegated
// upward through the same callbacks `AvatarMenu` already uses, so the
// switcher inherits autosave + daemon sync without re-implementing it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { KNOWN_PROVIDERS } from '../state/config';
import type { AgentInfo, ApiProtocol, AppConfig, ExecMode } from '../types';
import { apiProtocolLabel } from '../utils/apiProtocol';
import { AgentIcon } from './AgentIcon';
import { Icon } from './Icon';
import { renderModelOptions } from './modelOptions';

interface Props {
  config: AppConfig;
  agents: AgentInfo[];
  daemonLive: boolean;
  onModeChange: (mode: ExecMode) => void;
  onAgentChange: (id: string) => void;
  onAgentModelChange: (
    id: string,
    choice: { model?: string; reasoning?: string },
  ) => void;
  onApiProtocolChange: (protocol: ApiProtocol) => void;
  onApiModelChange: (model: string) => void;
  onOpenSettings: (
    section?:
      | 'execution'
      | 'media'
      | 'composio'
      | 'language'
      | 'appearance'
      | 'notifications'
      | 'pet'
      | 'about',
  ) => void;
}

// Venice Design fork — quick-switcher offers only Venice. One Venice
// API key covers chat + image + video + audio, so there's no reason
// to surface the upstream-style "pick a provider" pills on the chrome
// bar. Settings → BYOK is similarly Venice-only on this fork (see
// state/apiProtocols.ts).
const API_PROTOCOL_TABS: Array<{ id: ApiProtocol; title: string }> = [
  { id: 'venice', title: 'Venice' },
];

export function InlineModelSwitcher({
  config,
  agents,
  daemonLive,
  onModeChange,
  onAgentChange,
  onAgentModelChange,
  onApiProtocolChange,
  onApiModelChange,
  onOpenSettings,
}: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const installedAgents = useMemo(
    () => agents.filter((a) => a.available),
    [agents],
  );
  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );

  const currentChoice =
    (config.agentId && config.agentModels?.[config.agentId]) || {};
  const currentModelId =
    currentChoice.model ?? currentAgent?.models?.[0]?.id ?? null;
  const currentModelLabel =
    currentAgent?.models?.find((m) => m.id === currentModelId)?.label ?? null;

  const apiProtocol = config.apiProtocol ?? 'anthropic';
  const providerForProtocol = useMemo(
    () =>
      KNOWN_PROVIDERS.find(
        (p) =>
          p.protocol === apiProtocol &&
          (config.apiProviderBaseUrl
            ? p.baseUrl === config.apiProviderBaseUrl
            : false),
      ) ?? KNOWN_PROVIDERS.find((p) => p.protocol === apiProtocol),
    [apiProtocol, config.apiProviderBaseUrl],
  );
  const apiModelOptions = providerForProtocol?.models ?? [];

  // Chip text — keep it tight so the pill doesn't wrap on small viewports.
  // Venice Design fork: drop the leading "BYOK" / "CLI" mode label that
  // upstream renders. The chip icon (link glyph for BYOK, agent icon for
  // CLI) already conveys mode visually, and on the fork "BYOK · Venice"
  // is doubly redundant — the only provider configurable here is Venice.
  // Result: "Venice API · claude-sonnet-4-6" instead of the upstream
  // "BYOK · Venice API · claude-sonnet-4-6".
  const chipPrimary =
    config.mode === 'daemon'
      ? currentAgent?.name ?? t('inlineSwitcher.noAgent')
      : apiProtocolLabel(apiProtocol);
  const chipModel =
    config.mode === 'daemon'
      ? currentModelLabel && currentModelId !== 'default'
        ? currentModelLabel
        : t('inlineSwitcher.modelDefault')
      : config.model.trim() || t('inlineSwitcher.modelDefault');

  return (
    <div
      className="inline-switcher"
      ref={wrapRef}
      data-testid="inline-model-switcher"
    >
      <button
        type="button"
        className="inline-switcher__chip"
        data-testid="inline-model-switcher-chip"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('inlineSwitcher.chipTitle')}
      >
        <span className="inline-switcher__chip-icon" aria-hidden="true">
          {config.mode === 'daemon' && currentAgent ? (
            <AgentIcon id={currentAgent.id} size={18} />
          ) : (
            <span className="inline-switcher__byok-glyph">
              <Icon name="link" size={12} />
            </span>
          )}
        </span>
        <span className="inline-switcher__chip-text">
          <span className="inline-switcher__chip-primary">{chipPrimary}</span>
          <span className="inline-switcher__chip-sep" aria-hidden="true">
            ·
          </span>
          <span className="inline-switcher__chip-model">{chipModel}</span>
        </span>
        <Icon
          name="chevron-down"
          size={12}
          className="inline-switcher__chip-chevron"
        />
      </button>

      {open ? (
        <div
          className="inline-switcher__popover"
          role="menu"
          data-testid="inline-model-switcher-popover"
        >
          {/*
            Venice Design fork — simplified popover.
            Upstream renders three rows (Mode toggle, Provider pills, Model
            dropdown) plus the daemon/api branch with agent cards. On this
            fork the only meaningful pick is the Venice chat model — Mode
            and Provider are both "Venice" by definition (the fork strips
            the other API_PROTOCOL_TABS entries, and the popover surface
            isn't where users opt into Local CLI agents anyway).
            Power users who DO want Local CLI mode or non-default providers
            can flip the Mode toggle inside the full Settings dialog via
            the "Open execution settings" link below — same way upstream
            users access provider-level config.
          */}
          <div className="inline-switcher__row">
            <span className="inline-switcher__label">
              {t('inlineSwitcher.modelLabel')}
            </span>
            {apiModelOptions.length > 0 ? (
              <select
                className="inline-switcher__select"
                data-testid="inline-model-switcher-api-model"
                value={config.model}
                onChange={(e) => onApiModelChange?.(e.target.value)}
              >
                {apiModelOptions.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
                {config.model && !apiModelOptions.includes(config.model) ? (
                  <option value={config.model}>
                    {config.model} {t('inlineSwitcher.customSuffix')}
                  </option>
                ) : null}
              </select>
            ) : (
              <span className="inline-switcher__hint">
                {t('inlineSwitcher.openSettingsForModel')}
              </span>
            )}
          </div>

          {!config.apiKey ? (
            <div className="inline-switcher__warn" role="status">
              {t('inlineSwitcher.missingApiKey')}
            </div>
          ) : null}

          <button
            type="button"
            className="inline-switcher__more"
            data-testid="inline-model-switcher-open-settings"
            onClick={() => {
              setOpen(false);
              onOpenSettings?.('execution');
            }}
          >
            <Icon name="settings" size={13} />
            <span>{t('inlineSwitcher.openFullSettings')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
