"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import {
  buildConnectionLabel,
  formatEnumLabel,
  getExchangeMeta,
  SUPPORTED_EXCHANGE_IDS,
  type SupportedExchangeId,
} from "../lib/exchanges";
import { buildApiUrl } from "../lib/riskhub-api";

export interface ExchangeConnection {
  exchange_id: string;
  label: string;
  environment: string;
  market_type: string;
  permissions_verified: string[];
  is_active: boolean;
  last_sync_at: string | null;
  last_sync_status: string;
  last_sync_error: string | null;
  added_at?: string | null;
}

export interface ManageConnectionPayload {
  exchangeId: SupportedExchangeId;
  environment: string;
  marketType: string;
  label: string;
  apiKey: string;
  apiSecret: string;
  passphrase: string | null;
}

interface ExchangeKeysListResponse {
  status: string;
  connections: ExchangeConnection[];
  count: number;
}

interface ManageConnectionsModalProps {
  isOpen: boolean;
  userId: string;
  initialConnections?: ExchangeConnection[];
  isSubmitting?: boolean;
  isRefreshing?: boolean;
  onClose: () => void;
  onSubmit: (payload: ManageConnectionPayload) => Promise<void>;
  onRefreshData: () => Promise<void>;
}

const EMPTY_FORM = {
  apiKey: "",
  apiSecret: "",
  passphrase: "",
  label: "",
};

const MARKET_TYPE_OPTIONS = [
  {
    value: "mixed",
    label: "Mixed",
    description: "Reads spot balances and futures positions from one connection.",
  },
  {
    value: "futures",
    label: "Futures",
    description: "Reads futures positions and PnL; spot balances are best-effort.",
  },
  {
    value: "spot",
    label: "Spot",
    description: "Reads spot balances only.",
  },
];

const ENVIRONMENT_OPTIONS_BY_EXCHANGE: Record<SupportedExchangeId, string[]> = {
  binance: ["mainnet", "demo", "testnet"],
  okx: ["mainnet", "testnet"],
};

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
  } catch {
    // Ignore malformed error bodies and fall back to status text.
  }

  return response.statusText || `Request failed with status ${response.status}`;
}

function formatSyncTime(value: string | null): string {
  if (!value) {
    return "Not synced yet";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusTone(status: string) {
  switch (status.toLowerCase()) {
    case "ok":
      return "border-success/20 bg-success/10 text-success";
    case "rate_limited":
      return "border-warning-accent/30 bg-warning-accent/10 text-warning-accent";
    case "error":
      return "border-danger/25 bg-danger/10 text-danger";
    default:
      return "border-white/10 bg-white/5 text-text-secondary";
  }
}

export function ManageConnectionsModal({
  isOpen,
  userId,
  initialConnections = [],
  isSubmitting = false,
  isRefreshing = false,
  onClose,
  onSubmit,
  onRefreshData,
}: ManageConnectionsModalProps) {
  const [connections, setConnections] = useState<ExchangeConnection[]>(initialConnections);
  const [isLoadingConnections, setIsLoadingConnections] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [selectedExchangeId, setSelectedExchangeId] =
    useState<SupportedExchangeId>("binance");
  const [environment, setEnvironment] = useState<string>(
    getExchangeMeta("binance").defaultEnvironment,
  );
  const [marketType, setMarketType] = useState<string>("mixed");
  const [label, setLabel] = useState(EMPTY_FORM.label);
  const [apiKey, setApiKey] = useState(EMPTY_FORM.apiKey);
  const [apiSecret, setApiSecret] = useState(EMPTY_FORM.apiSecret);
  const [passphrase, setPassphrase] = useState(EMPTY_FORM.passphrase);
  const [deletingConnectionKey, setDeletingConnectionKey] = useState<string | null>(null);

  const selectedExchangeMeta = getExchangeMeta(selectedExchangeId);
  const environmentOptions =
    ENVIRONMENT_OPTIONS_BY_EXCHANGE[selectedExchangeId] ?? [selectedExchangeMeta.defaultEnvironment];
  const activeConnections = connections.filter((connection) => connection.is_active);
  const selectedExchangeConnection = activeConnections.find(
    (connection) =>
      connection.exchange_id.toLowerCase() === selectedExchangeId &&
      (connection.environment || "").toLowerCase() === environment.toLowerCase(),
  );

  const loadConnections = useCallback(async () => {
    setIsLoadingConnections(true);
    setLoadError(null);

    try {
      const response = await fetch(buildApiUrl(`/api/v1/exchange-keys/${userId}`), {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as ExchangeKeysListResponse;
      setConnections(Array.isArray(payload.connections) ? payload.connections : []);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : "Failed to load current exchange connections.",
      );
    } finally {
      setIsLoadingConnections(false);
    }
  }, [userId]);

  function resetSensitiveFields(nextExchangeId: SupportedExchangeId = "binance") {
    setSelectedExchangeId(nextExchangeId);
    setEnvironment(getExchangeMeta(nextExchangeId).defaultEnvironment);
    setMarketType("mixed");
    setLabel(EMPTY_FORM.label);
    setApiKey(EMPTY_FORM.apiKey);
    setApiSecret(EMPTY_FORM.apiSecret);
    setPassphrase(EMPTY_FORM.passphrase);
    setFormError(null);
  }

  function prepareConnectionUpdate(connection: ExchangeConnection) {
    const normalizedExchangeId =
      connection.exchange_id.toLowerCase() === "okx" ? "okx" : "binance";
    setSelectedExchangeId(normalizedExchangeId);
    setEnvironment(connection.environment || getExchangeMeta(normalizedExchangeId).defaultEnvironment);
    setMarketType(connection.market_type || "mixed");
    setLabel(connection.label || "");
    setApiKey("");
    setApiSecret("");
    setPassphrase("");
    setFormError(null);
  }

  useEffect(() => {
    if (!isOpen) {
      resetSensitiveFields();
      setConnections(initialConnections);
      setLoadError(null);
      return;
    }

    setConnections(initialConnections);
    void loadConnections();
  }, [initialConnections, isOpen, loadConnections]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!apiKey.trim() || !apiSecret.trim()) {
      setFormError("API key and API secret are required.");
      return;
    }

    if (selectedExchangeMeta.requiresPassphrase && !passphrase.trim()) {
      setFormError("OKX requires an API passphrase for this flow.");
      return;
    }

    setFormError(null);

    try {
      await onSubmit({
        exchangeId: selectedExchangeId,
        environment,
        marketType,
        label:
          label.trim() ||
          buildConnectionLabel(selectedExchangeId, environment, marketType),
        apiKey: apiKey.trim(),
        apiSecret: apiSecret.trim(),
        passphrase: selectedExchangeMeta.requiresPassphrase ? passphrase.trim() : null,
      });

      await loadConnections();
      setApiKey("");
      setApiSecret("");
      setPassphrase("");
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to save the exchange connection.",
      );
    }
  }

  async function handleDeleteConnection(connection: ExchangeConnection) {
    const exchangeId = connection.exchange_id.toLowerCase();
    const nextEnvironment = (connection.environment || "mainnet").toLowerCase();
    const connectionKey = `${exchangeId}:${nextEnvironment}`;

    const shouldDelete = window.confirm(
      `Delete saved API credentials for ${formatEnumLabel(exchangeId)} ${formatEnumLabel(nextEnvironment)}?`,
    );
    if (!shouldDelete) {
      return;
    }

    setDeletingConnectionKey(connectionKey);
    setFormError(null);

    try {
      const response = await fetch(
        buildApiUrl(
          `/api/v1/exchange-keys/${userId}/connection?exchange_id=${encodeURIComponent(exchangeId)}&environment=${encodeURIComponent(nextEnvironment)}`,
        ),
        { method: "DELETE" },
      );
      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      await onRefreshData();
      await loadConnections();
    } catch (error) {
      setFormError(
        error instanceof Error ? error.message : "Failed to delete the selected connection.",
      );
    } finally {
      setDeletingConnectionKey(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-main-bg/85 px-4 py-6 backdrop-blur-md">
      <div className="relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-white/10 bg-surface-high shadow-[0_40px_160px_rgba(0,0,0,0.55)]">
        <div className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(circle_at_top,_rgba(26,86,219,0.22),_transparent_62%)]" />

        <div className="relative flex flex-wrap items-start justify-between gap-4 border-b border-white/5 px-6 pb-6 pt-6 md:px-8">
          <div className="max-w-3xl">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              <ShieldCheck size={14} />
              Server-Managed Connections
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
              Manage Connections
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              Save one active Binance or OKX connection per exchange. The frontend
              submits credentials only during save, while the backend validates,
              encrypts, stores, and refreshes spot balances plus futures data.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                void (async () => {
                  await onRefreshData();
                  await loadConnections();
                })();
              }}
              disabled={activeConnections.length === 0 || isRefreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
              <span>{isRefreshing ? "Refreshing..." : "Refresh All Data"}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-text-secondary transition-colors hover:bg-white/[0.08] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Close connection manager"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="relative grid flex-1 gap-6 overflow-y-auto px-6 py-6 md:grid-cols-[1.05fr_0.95fr] md:px-8">
          <section className="flex min-h-[440px] flex-col rounded-2xl border border-white/8 bg-main-bg/45 p-5">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-text-primary">
                  Current Exchange State
                </h3>
                <p className="mt-1 text-sm text-text-secondary">
                  {activeConnections.length} active connection
                  {activeConnections.length === 1 ? "" : "s"} across Binance and OKX.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  void loadConnections();
                }}
                disabled={isLoadingConnections}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw size={14} className={isLoadingConnections ? "animate-spin" : ""} />
                Reload Status
              </button>
            </div>

            {loadError ? (
              <div className="mb-4 rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
                {loadError}
              </div>
            ) : null}

            <div className="flex flex-1 flex-col gap-3">
              {isLoadingConnections && connections.length === 0 ? (
                <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] text-sm text-text-secondary">
                  Loading saved connections...
                </div>
              ) : connections.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 text-center">
                  <div className="rounded-full border border-white/10 bg-white/[0.03] p-3 text-text-secondary">
                    <ShieldCheck size={20} />
                  </div>
                  <p className="mt-4 text-base font-medium text-text-primary">
                    No exchange connections saved yet
                  </p>
                  <p className="mt-2 max-w-md text-sm leading-6 text-text-secondary">
                    Add a Binance or OKX connection to unlock aggregated spot
                    balances, by-exchange PnL rows, and live positions.
                  </p>
                </div>
              ) : (
                connections.map((connection) => {
                  const exchangeMeta = getExchangeMeta(connection.exchange_id);
                  const statusTone = getStatusTone(connection.last_sync_status || "unknown");

                  return (
                    <article
                      key={`${connection.exchange_id}-${connection.label}-${connection.environment}`}
                      className="rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${exchangeMeta.badgeClassName}`}
                            >
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${exchangeMeta.badgeDotClassName}`}
                              />
                              {exchangeMeta.label}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                              {formatEnumLabel(connection.environment)}
                            </span>
                            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                              {formatEnumLabel(connection.market_type)}
                            </span>
                            {connection.is_active ? (
                              <span className="rounded-full border border-success/20 bg-success/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-success">
                                Active
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-3 truncate text-base font-semibold text-text-primary">
                            {connection.label || exchangeMeta.label}
                          </p>
                          <p className="mt-2 text-sm text-text-secondary">
                            Permissions:{" "}
                            {connection.permissions_verified.length > 0
                              ? connection.permissions_verified.join(", ")
                              : "Not reported"}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => prepareConnectionUpdate(connection)}
                            className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-text-primary transition-colors hover:bg-white/[0.06]"
                          >
                            Replace Credentials
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              void handleDeleteConnection(connection);
                            }}
                            disabled={deletingConnectionKey === `${connection.exchange_id.toLowerCase()}:${(connection.environment || "mainnet").toLowerCase()}`}
                            className="inline-flex items-center gap-1.5 rounded-xl border border-danger/30 bg-danger/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-danger transition-colors hover:bg-danger/15 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-[auto_auto_1fr]">
                        <div className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${statusTone}`}>
                          <span>{formatEnumLabel(connection.last_sync_status || "unknown")}</span>
                        </div>
                        <div className="rounded-xl border border-white/8 bg-main-bg/40 px-3 py-2 text-xs text-text-secondary">
                          Last Sync: {formatSyncTime(connection.last_sync_at)}
                        </div>
                        <div className="rounded-xl border border-white/8 bg-main-bg/40 px-3 py-2 text-xs text-text-secondary">
                          {connection.last_sync_error || "No backend sync error reported."}
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/8 bg-main-bg/45 p-5">
            <div className="mb-5">
              <h3 className="text-lg font-semibold text-text-primary">
                Add or Update a Connection
              </h3>
              <p className="mt-1 text-sm text-text-secondary">
                One active connection per exchange and environment. Saving the same
                venue + environment again replaces that connection.
              </p>
            </div>

            <div className="mb-5 grid gap-3 sm:grid-cols-2">
              {SUPPORTED_EXCHANGE_IDS.map((exchangeId) => {
                const meta = getExchangeMeta(exchangeId);
                const isSelected = exchangeId === selectedExchangeId;

                return (
                  <button
                    key={exchangeId}
                    type="button"
                    onClick={() => {
                      resetSensitiveFields(exchangeId);
                    }}
                    className={`rounded-2xl border px-4 py-4 text-left transition-colors ${
                      isSelected
                        ? "border-primary/35 bg-primary/10"
                        : "border-white/10 bg-white/[0.03] hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${meta.badgeClassName}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${meta.badgeDotClassName}`} />
                        {meta.label}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                        {meta.requiresPassphrase ? "Passphrase" : "Key + Secret"}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-text-secondary">
                      {meta.requiresPassphrase
                        ? "API key, secret, and passphrase"
                        : "API key and secret"}
                    </p>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid gap-5 md:grid-cols-2">
                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                    Environment
                  </span>
                  <select
                    value={environment}
                    onChange={(event) => setEnvironment(event.target.value)}
                    className="rounded-xl border border-white/10 bg-surface-low px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-primary/40"
                  >
                    {environmentOptions.map((value) => (
                      <option key={value} value={value}>
                        {formatEnumLabel(value)}
                      </option>
                    ))}
                  </select>
                  {selectedExchangeId === "binance" && environment === "testnet" ? (
                    <span className="text-xs leading-5 text-warning-accent">
                      Binance Spot Testnet is isolated from Binance mainnet balances.
                    </span>
                  ) : null}
                  {selectedExchangeId === "binance" && environment === "demo" ? (
                    <span className="text-xs leading-5 text-primary-light">
                      Use API keys generated from demo.binance.com for this environment.
                    </span>
                  ) : null}
                </label>

                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                    Market Type
                  </span>
                  <select
                    value={marketType}
                    onChange={(event) => setMarketType(event.target.value)}
                    className="rounded-xl border border-white/10 bg-surface-low px-4 py-3 text-sm text-text-primary outline-none transition-colors focus:border-primary/40"
                  >
                    {MARKET_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-xs leading-5 text-text-secondary">
                    {MARKET_TYPE_OPTIONS.find((option) => option.value === marketType)?.description}
                  </span>
                </div>

                <label className="flex flex-col gap-2 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                    Connection Label
                  </span>
                  <input
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    placeholder={buildConnectionLabel(selectedExchangeId, environment, marketType)}
                    className="rounded-xl border border-white/10 bg-surface-low px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/60 focus:border-primary/40"
                  />
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                    API Key
                  </span>
                  <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-low px-4 py-3 focus-within:border-primary/40">
                    <KeyRound size={16} className="text-primary" />
                    <input
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={`Paste ${selectedExchangeMeta.label} API key`}
                      className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary/60"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                    API Secret
                  </span>
                  <div className="rounded-xl border border-white/10 bg-surface-low px-4 py-3 focus-within:border-primary/40">
                    <input
                      value={apiSecret}
                      onChange={(event) => setApiSecret(event.target.value)}
                      type="password"
                      autoComplete="new-password"
                      spellCheck={false}
                      placeholder={`Paste ${selectedExchangeMeta.label} API secret`}
                      className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary/60"
                    />
                  </div>
                </label>

                {selectedExchangeMeta.requiresPassphrase ? (
                  <label className="flex flex-col gap-2 md:col-span-2">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                      API Passphrase
                    </span>
                    <div className="rounded-xl border border-white/10 bg-surface-low px-4 py-3 focus-within:border-primary/40">
                      <input
                        value={passphrase}
                        onChange={(event) => setPassphrase(event.target.value)}
                        type="password"
                        autoComplete="new-password"
                        spellCheck={false}
                        placeholder="Paste OKX API passphrase"
                        className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary/60"
                      />
                    </div>
                  </label>
                ) : null}
              </div>

              {selectedExchangeConnection ? (
                <div className="rounded-xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary-light">
                  Saving {selectedExchangeMeta.label} {formatEnumLabel(environment)} again
                  replaces the current active connection for that environment.
                </div>
              ) : null}

              {formError ? (
                <div className="rounded-xl border border-danger/25 bg-danger/10 px-4 py-3 text-sm text-danger">
                  {formError}
                </div>
              ) : null}

              <div className="rounded-xl border border-white/5 bg-main-bg/40 px-4 py-3 text-xs leading-6 text-text-secondary">
                Connection metadata is rendered from backend responses. Deleting a
                connection removes the stored encrypted API credentials for that
                exchange + environment.
              </div>

              <div className="flex flex-col gap-3 border-t border-white/5 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <button
                  type="button"
                  onClick={() => resetSensitiveFields(selectedExchangeId)}
                  disabled={isSubmitting}
                  className="rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Clear Credentials
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/15 px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
                  {isSubmitting
                    ? "Validating and Saving..."
                    : selectedExchangeConnection
                      ? `Replace ${selectedExchangeMeta.label} ${formatEnumLabel(environment)} Connection`
                      : `Add ${selectedExchangeMeta.label} Connection`}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
