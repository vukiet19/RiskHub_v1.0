"use client";

import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  ChevronDown,
  ChevronRight,
  Layers3,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  Waves,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "./AppShell";
import { buildApiUrl, DEFAULT_USER_ID } from "../lib/riskhub-api";

type Mode = "all" | "spot" | "future";
type Scope = "all" | "binance" | "okx";
type ViewState = "loading" | "ready" | "partial" | "empty" | "no_connection" | "error";
type RecordValue = Record<string, unknown>;

interface Payload {
  status?: string;
  source_state?: string;
  scope_label?: string;
  mode?: string;
  mode_label?: string;
  generated_at?: string | null;
  message?: string | null;
  warnings?: unknown;
  source_details?: unknown;
  risk_score_total?: unknown;
  risk_components?: unknown;
  top_risk_contributors?: unknown;
  concentration_summary?: unknown;
  leverage_summary?: unknown;
  drawdown_summary?: unknown;
  contagion_summary?: unknown;
  quant_summary?: unknown;
  scenario_results?: unknown;
  position_risk_rows?: unknown;
  attention_items?: unknown;
}

const scopes: Array<{ value: Scope; label: string }> = [
  { value: "all", label: "All" },
  { value: "binance", label: "Binance" },
  { value: "okx", label: "OKX" },
];

const modes: Array<{ value: Mode; label: string }> = [
  { value: "all", label: "All" },
  { value: "spot", label: "Spot" },
  { value: "future", label: "Future" },
];

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") return payload.detail;
  } catch {}
  return response.statusText || `Request failed with status ${response.status}`;
}

function rec(value: unknown): RecordValue | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as RecordValue) : null;
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function txt(value: unknown, fallback = "—"): string {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function num(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function money(value: unknown): string {
  const n = num(value);
  if (n === null) return "—";
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(value: unknown, digits = 1): string {
  const n = num(value);
  if (n === null) return "—";
  return `${n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

function ts(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) return "Not generated yet";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function pretty(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (Array.isArray(value)) return `${value.length} item${value.length === 1 ? "" : "s"}`;
  const objectValue = rec(value);
  if (objectValue) {
    return Object.entries(objectValue)
      .slice(0, 3)
      .map(([key, entryValue]) => `${key.replace(/[_-]/g, " ")}: ${pretty(entryValue)}`)
      .join(" • ");
  }
  return String(value);
}

function label(row: RecordValue, fallback: string): string {
  return txt(row.label ?? row.title ?? row.name ?? row.symbol ?? row.asset ?? row.id, fallback);
}

function baseAssetFromSymbol(symbol: string): string {
  const clean = symbol.split(":")[0] ?? symbol;
  if (clean.includes("/")) return clean.split("/")[0] ?? clean;
  for (const suffix of ["USDT", "USDC", "BUSD", "FDUSD", "USD", "BTC", "ETH"]) {
    if (clean.endsWith(suffix) && clean.length > suffix.length) {
      return clean.slice(0, -suffix.length);
    }
  }
  return clean;
}

function stateFor(payload: Payload): ViewState {
  const sourceState = txt(payload.source_state, "").toLowerCase();
  if (sourceState === "error") return "error";
  if (sourceState === "no_connection") return "no_connection";
  if (sourceState === "partial") return "partial";
  if (sourceState === "no_data") return "empty";
  const hasRows =
    arr(payload.top_risk_contributors).length > 0 ||
    arr(payload.position_risk_rows).length > 0 ||
    arr(payload.scenario_results).length > 0 ||
    arr(payload.attention_items).length > 0 ||
    Boolean(rec(payload.risk_components));
  if (sourceState === "limited") return hasRows ? "partial" : "empty";
  return hasRows ? "ready" : "empty";
}

function Card({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="glass-card rounded-2xl border border-white/5 p-5 shadow-xl">
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-primary">{icon}</span>
            <h3 className="text-base font-semibold tracking-wide text-white">{title}</h3>
          </div>
          <p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-text-secondary">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyState({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center">
      <div className="rounded-full border border-white/10 bg-white/5 p-3 text-text-secondary">{icon}</div>
      <div className="text-sm font-semibold text-white">{title}</div>
      <div className="max-w-md text-xs leading-6 text-text-secondary">{body}</div>
    </div>
  );
}

function Stat({ label, value, detail, accent = "text-white" }: { label: string; value: string; detail: string; accent?: string }) {
  return (
    <div className="compact-metric-card min-w-0">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-bold tracking-tight ${accent}`}>{value}</div>
      <div className="mt-1 text-xs text-text-secondary">{detail}</div>
    </div>
  );
}

function SummaryItem({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{label}</div>
      <div className="mt-2 font-mono text-lg font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-text-secondary">{detail}</div>
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/5 pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs uppercase tracking-[0.2em] text-text-secondary">{label}</span>
      <span className="max-w-[65%] text-right text-xs text-text-primary">{value}</span>
    </div>
  );
}

function stateCopy(state: ViewState, noun: string, fallback?: string | null): string {
  if (fallback) return fallback;
  if (state === "no_connection") return `No ${noun} is available because the current mode has no active exchange connection.`;
  if (state === "partial") return `The backend returned partial ${noun}; inspect warnings before acting on the analysis.`;
  if (state === "empty") return `The backend returned no ${noun} for this mode.`;
  if (state === "error") return `Risk analysis could not load ${noun} for this mode.`;
  return `Waiting for ${noun} from the backend.`;
}

export function RiskAnalysisScreen() {
  const [scope, setScope] = useState<Scope>("all");
  const [mode, setMode] = useState<Mode>("all");
  const [payload, setPayload] = useState<Payload | null>(null);
  const [viewState, setViewState] = useState<ViewState>("loading");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [expandedContributorIds, setExpandedContributorIds] = useState<Record<string, boolean>>({});
  const requestIdRef = useRef(0);
  const payloadRef = useRef<Payload | null>(null);

  useEffect(() => {
    payloadRef.current = payload;
  }, [payload]);

  const load = useCallback(async (nextScope: Scope, nextMode: Mode) => {
    const requestId = ++requestIdRef.current;
    if (payloadRef.current) {
      setIsRefreshing(true);
    } else {
      setViewState("loading");
    }
    try {
      const response = await fetch(buildApiUrl(`/api/v1/risk-analysis/${DEFAULT_USER_ID}/overview?scope=${nextScope}&mode=${nextMode}`), { cache: "no-store" });
      if (!response.ok) throw new Error(await readErrorMessage(response));
      const nextPayload = (await response.json()) as Payload;
      if (requestId !== requestIdRef.current) return;
      startTransition(() => {
        setPayload(nextPayload);
        setErrorMessage(null);
        setExpandedContributorIds({});
        setViewState(stateFor(nextPayload));
      });
      const nextWarnings = arr(nextPayload.warnings).filter((warning): warning is string => typeof warning === "string" && warning.length > 0);
      if (nextWarnings.length > 0) {
        toast.message("Risk analysis refreshed with warnings.", { description: nextWarnings[0] });
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : "Failed to load risk analysis data.";
      startTransition(() => {
        setPayload(null);
        setViewState("error");
        setErrorMessage(message);
        setExpandedContributorIds({});
      });
      toast.error(message);
    } finally {
      if (requestId === requestIdRef.current) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(scope, mode);
  }, [load, scope, mode]);

  const warnings = arr(payload?.warnings).filter((warning): warning is string => typeof warning === "string" && warning.length > 0);
  const rawContributors = arr(payload?.top_risk_contributors).map(rec).filter((row): row is RecordValue => Boolean(row));
  const scenarios = arr(payload?.scenario_results).map(rec).filter((row): row is RecordValue => Boolean(row));
  const positions = arr(payload?.position_risk_rows).map(rec).filter((row): row is RecordValue => Boolean(row));
  const attention = arr(payload?.attention_items).map(rec).filter((row): row is RecordValue => Boolean(row));
  const components = rec(payload?.risk_components);
  const concentrationSummary = rec(payload?.concentration_summary);
  const leverageSummary = rec(payload?.leverage_summary);
  const drawdownSummary = rec(payload?.drawdown_summary);
  const contagionSummary = rec(payload?.contagion_summary);
  const quantSummary = rec(payload?.quant_summary);
  const sourceDetails = rec(payload?.source_details);
  const generatedAt = ts(payload?.generated_at);
  const scopeLabel = txt(payload?.scope_label, scope);
  const modeLabel = txt(payload?.mode_label, mode);
  const message = errorMessage || txt(payload?.message, "");
  const riskValue = num(payload?.risk_score_total);
  const riskAccent = riskValue === null ? "text-white" : riskValue >= 70 ? "text-danger" : riskValue >= 45 ? "text-warning" : "text-success";
  const profitFactorDisplay = txt(quantSummary?.profit_factor_display, "");
  const profitFactorValue = num(quantSummary?.profit_factor);
  const sharpeValue = num(quantSummary?.sharpe_ratio);
  const sharpeWindowDays = num(quantSummary?.window_days);
  const quantTradeCount = num(quantSummary?.trade_count);
  const quantScopeAlignment = txt(quantSummary?.scope_alignment, "");
  const quantInsight = txt(quantSummary?.insight, "");
  const hasProfitFactor = profitFactorValue !== null || profitFactorDisplay.length > 0;
  const quantHasGap = !hasProfitFactor || sharpeValue === null;
  const quantDetail = `${sharpeWindowDays !== null ? `${Math.round(sharpeWindowDays)}d` : "Latest"} closed-position snapshot${quantTradeCount !== null ? ` • ${Math.round(quantTradeCount)} positions` : ""}${quantScopeAlignment === "portfolio_wide" ? " (portfolio-wide)" : ""}`;
  const profitFactorDetail = hasProfitFactor
    ? quantDetail
    : `Unavailable for ${modeLabel}`;
  const sharpeDetail = sharpeValue !== null
    ? quantDetail
    : `Unavailable for ${modeLabel}`;
  const assetContributorByLabel = rawContributors.reduce<Record<string, RecordValue>>((acc, row) => {
    if (txt(row.type, "").toLowerCase() === "asset") {
      acc[txt(row.label, "")] = row;
    }
    return acc;
  }, {});
  const contributors = rawContributors
    .filter((row) => {
      if (txt(row.type, "").toLowerCase() !== "asset") return true;
      const assetLabel = txt(row.label, "");
      return !rawContributors.some((candidate) => (
        txt(candidate.type, "").toLowerCase() === "position" &&
        baseAssetFromSymbol(txt(candidate.label ?? candidate.symbol, "")) === assetLabel
      ));
    })
    .map((row) => {
      const rowType = txt(row.type, "").toLowerCase();
      const baseAsset = rowType === "position"
        ? baseAssetFromSymbol(txt(row.label ?? row.symbol, ""))
        : txt(row.label, "");
      const underlyingExposure = rowType === "position"
        ? rec(row.underlying_exposure) ?? assetContributorByLabel[baseAsset] ?? null
        : null;
      return { row, rowType, baseAsset, underlyingExposure };
    });
  const bannerTitle =
    viewState === "error"
      ? "Risk analysis unavailable"
      : viewState === "no_connection"
        ? "No exchange connection"
        : viewState === "partial"
          ? "Partial risk analysis"
          : viewState === "empty"
            ? "Not enough live risk data"
            : "Risk analysis loaded";
  const toggleContributor = (contributorId: string) => {
    setExpandedContributorIds((current) => ({
      ...current,
      [contributorId]: !current[contributorId],
    }));
  };

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-4 border-b border-white/5 bg-main-bg/90 px-5 py-4 backdrop-blur-xl md:px-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text text-xl font-bold tracking-wider text-transparent">Risk Analysis</h2>
              <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{txt(payload?.source_state, viewState)}</span>
            </div>
            <p className="mt-1 text-xs tracking-wide text-text-secondary">
              Deep portfolio-risk decomposition for <span className="text-text-primary">{scopeLabel}</span> in <span className="text-text-primary">{modeLabel}</span> mode.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <div className="view-toggle">
              {scopes.map((option) => (
                <button key={option.value} type="button" onClick={() => setScope(option.value)} aria-pressed={scope === option.value} className={`view-toggle-btn ${scope === option.value ? "active" : ""}`}>
                  {option.label}
                </button>
              ))}
            </div>
            <div className="view-toggle">
              {modes.map((option) => (
                <button key={option.value} type="button" onClick={() => setMode(option.value)} aria-pressed={mode === option.value} className={`view-toggle-btn ${mode === option.value ? "active" : ""}`}>
                  {option.label}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => void load(scope, mode)} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/[0.08]">
              <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
              <span>{isRefreshing ? "Refreshing..." : "Refresh Filters"}</span>
            </button>
          </div>
        </header>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/5 bg-white/[0.03] px-5 py-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Portfolio Risk Snapshot</div>
              <div className="mt-2 text-sm leading-6 text-text-secondary">{message || "Risk analysis is sourced from the dedicated backend overview payload."}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Generated</div>
              <div className="mt-1 font-mono text-sm text-text-primary">{generatedAt}</div>
            </div>
          </div>
          {viewState !== "ready" || warnings.length > 0 ? (
            <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${viewState === "error" ? "border-danger-container/40 bg-danger-container/10 text-danger" : "border-warning-accent/30 bg-warning-accent/10 text-warning-accent"}`}>
              <div className="font-semibold text-white">{bannerTitle}</div>
              {message ? <div className="mt-1 leading-6 text-text-secondary">{message}</div> : null}
              {warnings.length > 0 ? <div className="mt-2 space-y-1 text-xs leading-5">{warnings.map((warning, index) => <div key={`${warning}-${index}`}>{warning}</div>)}</div> : null}
            </div>
          ) : null}
        </div>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-7">
          <Stat label="Total Risk" value={riskValue === null ? "—" : riskValue.toFixed(1)} detail="Weighted heuristic score" accent={riskAccent} />
          <Stat label="Concentration" value={num(components?.concentration_score)?.toFixed(1) ?? "—"} detail={`Top asset ${txt(concentrationSummary?.top_asset, "—")} at ${pct(concentrationSummary?.top_asset_pct, 1)}`} />
          <Stat label="Leverage" value={num(components?.leverage_score)?.toFixed(1) ?? "—"} detail={`Effective leverage ${num(leverageSummary?.effective_leverage)?.toFixed(2) ?? "—"}x`} />
          <Stat label="Drawdown" value={num(components?.drawdown_score)?.toFixed(1) ?? "—"} detail={`${pct(drawdownSummary?.current_drawdown_pct, 1)} current drawdown`} />
          <Stat label="Contagion" value={num(components?.contagion_score)?.toFixed(1) ?? "—"} detail={`Systemic asset ${txt(contagionSummary?.systemic_asset, "—")}`} />
          <Stat label="Profit Factor" value={profitFactorDisplay || (profitFactorValue === null ? "—" : profitFactorValue.toFixed(2))} detail={profitFactorDetail} />
          <Stat label="Sharpe Ratio" value={sharpeValue === null ? "—" : sharpeValue.toFixed(2)} detail={sharpeDetail} />
        </section>

        {quantHasGap && quantInsight ? (
          <div className="rounded-2xl border border-warning-accent/30 bg-warning-accent/10 px-5 py-4 text-sm">
            <div className="font-semibold text-white">Quant snapshot warning</div>
            <div className="mt-1 leading-6 text-text-secondary">{quantInsight}</div>
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <Card title="Top Risk Contributors" subtitle="Largest current drivers of portfolio risk" icon={<ArrowUpRight size={16} />}>
            {contributors.length > 0 ? contributors.map(({ row, rowType, underlyingExposure }, index) => {
              const contributorId = txt(row.id, `${rowType}-${index}`);
              const score = num(row.contributor_score) ?? 0;
              const maxScore = Math.max(...contributors.map((item) => num(item.row.contributor_score) ?? 0), 1);
              const flags = arr(row.flags).filter((flag): flag is string => typeof flag === "string" && flag.length > 0);
              const isExpanded = Boolean(expandedContributorIds[contributorId]);
              const underlyingFlags = arr(underlyingExposure?.flags).filter((flag): flag is string => typeof flag === "string" && flag.length > 0);
              return (
                <div key={`${contributorId}-${index}`} className="mb-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 last:mb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-semibold text-white">{txt(row.label, `Contributor ${index + 1}`)}</div>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary">{txt(row.type, "driver")}</span>
                        {rowType === "position" && underlyingExposure ? (
                          <button
                            type="button"
                            onClick={() => toggleContributor(contributorId)}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-primary-light"
                          >
                            {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                            Underlying
                          </button>
                        ) : null}
                      </div>
                      <div className="mt-1 text-xs leading-5 text-text-secondary">{txt(row.why, "No explanation provided by backend.")}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm font-semibold text-white">{score.toFixed(1)}</div>
                      <div className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Risk score</div>
                    </div>
                  </div>
                  <div className="mt-3 h-2 rounded-full bg-white/5"><div className="h-2 rounded-full bg-gradient-to-r from-primary to-primary-light" style={{ width: `${Math.max(4, (score / maxScore) * 100)}%` }} /></div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                    <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Weight {pct(row.weight_pct, 1)}</span>
                    {"exchange_id" in row ? <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">{txt(row.exchange_id, "unknown")}</span> : null}
                    {flags.map((flag) => <span key={flag} className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-primary-light">{flag.replace(/_/g, " ")}</span>)}
                  </div>
                  {rowType === "position" && underlyingExposure && isExpanded ? (
                    <div className="mt-3 rounded-xl border border-white/5 bg-main-bg/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Underlying Exposure</div>
                          <div className="mt-1 font-semibold text-white">{txt(underlyingExposure.label, "Underlying")}</div>
                          <div className="mt-1 text-xs leading-5 text-text-secondary">{txt(underlyingExposure.why, "No underlying exposure explanation returned.")}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-sm font-semibold text-white">{num(underlyingExposure.contributor_score)?.toFixed(1) ?? "—"}</div>
                          <div className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">Exposure risk</div>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-text-secondary">
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Weight {pct(underlyingExposure.weight_pct, 1)}</span>
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-1">Value {money(underlyingExposure.value_usd)}</span>
                        {underlyingFlags.map((flag) => <span key={flag} className="rounded-full border border-primary/20 bg-primary/10 px-2 py-1 text-primary-light">{flag.replace(/_/g, " ")}</span>)}
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            }) : <EmptyState icon={<ShieldCheck size={18} />} title="No contributors returned" body={stateCopy(viewState, "contributors", payload?.message)} />}
          </Card>

          <Card title="Concentration / Dependency Analysis" subtitle="How the scoped book is concentrated and connected" icon={<Layers3 size={16} />}>
            <div className="space-y-3">
              <SummaryItem label="Top Asset" value={`${txt(concentrationSummary?.top_asset, "—")} · ${pct(concentrationSummary?.top_asset_pct, 1)}`} detail={txt(concentrationSummary?.insight, "No concentration explanation returned.")} />
              <SummaryItem label="Largest Cluster" value={`${txt(rec(concentrationSummary?.largest_cluster)?.label, "—")} · ${pct(concentrationSummary?.largest_cluster_pct, 1)}`} detail={`Systemic asset ${txt(rec(concentrationSummary?.largest_cluster)?.systemic_asset, "—")}`} />
              <SummaryItem label="Dominant Exchange" value={`${txt(concentrationSummary?.dominant_exchange, "—")} · ${pct(concentrationSummary?.dominant_exchange_pct, 1)}`} detail={`Effective leverage ${num(leverageSummary?.effective_leverage)?.toFixed(2) ?? "—"}x`} />
              <SummaryItem label="Contagion Linkage" value={`${num(contagionSummary?.contagion_risk_score)?.toFixed(1) ?? "—"} · ${txt(contagionSummary?.systemic_asset, "—")}`} detail={txt(contagionSummary?.insight, "No contagion explanation returned.")} />
              {sourceDetails ? <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3"><div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Source Details</div><div className="mt-2 grid gap-2 text-sm">{Object.entries(sourceDetails).slice(0, 6).map(([key, value]) => <div key={key} className="flex items-start justify-between gap-4"><span className="text-text-secondary">{key.replace(/[_-]/g, " ")}</span><span className="max-w-[60%] text-right font-mono text-xs text-text-primary">{pretty(value)}</span></div>)}</div></div> : null}
            </div>
          </Card>
        </section>

        <section className="grid gap-4 xl:grid-cols-2">
          <Card title="Scenario / Stress Panel" subtitle="Deterministic shocks returned by the backend" icon={<Waves size={16} />}>
            {scenarios.length > 0 ? <div className="space-y-3">{scenarios.map((row, index) => <div key={`${txt(row.scenario_id, txt(row.name, "scenario"))}-${index}`} className="rounded-xl border border-white/5 bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-white">{txt(row.name, `Scenario ${index + 1}`)}</div><div className="mt-1 text-xs leading-5 text-text-secondary">{txt(row.description, "Stress result from the current scope")}</div></div><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-text-primary">{txt(row.severity, "info")}</span></div><div className="mt-3 grid gap-3 md:grid-cols-2"><SummaryItem label="Estimated PnL Impact" value={money(row.estimated_pnl_impact)} detail="Absolute stress impact" /><SummaryItem label="Impact vs Portfolio" value={pct(row.impact_pct_of_portfolio, 1)} detail="Relative impact of this scenario" /></div></div>)}</div> : <EmptyState icon={<TriangleAlert size={18} />} title="No stress results returned" body={stateCopy(viewState, "stress results", payload?.message)} />}
          </Card>

          <Card title="Action / Attention Panel" subtitle="What deserves attention first" icon={<ShieldAlert size={16} />}>
            {attention.length > 0 || warnings.length > 0 ? <div className="space-y-3">{attention.map((row, index) => <div key={`${txt(row.title, label(row, "Attention"))}-${index}`} className="rounded-xl border border-white/5 bg-white/[0.03] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="font-semibold text-white">{txt(row.title, `Attention ${index + 1}`)}</div><div className="mt-1 text-sm text-text-secondary">{txt(row.detail, "Review this item in context of the current scope.")}</div></div><span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-text-primary">{txt(row.severity, "info")}</span></div></div>)}{warnings.length > 0 ? <div className="rounded-xl border border-warning-accent/30 bg-warning-accent/10 p-3 text-sm text-warning-accent"><div className="font-semibold text-white">Backend warnings</div><div className="mt-2 space-y-1 text-xs leading-5">{warnings.map((warning, index) => <div key={`${warning}-${index}`}>{warning}</div>)}</div></div> : null}</div> : <EmptyState icon={<AlertTriangle size={18} />} title="No actions pending" body="The current payload does not flag any attention items." />}
          </Card>
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/5 bg-white/[0.03] shadow-xl">
          <div className="flex items-start justify-between gap-4 border-b border-white/5 px-5 py-4">
            <div><div className="flex items-center gap-2"><BarChart3 size={16} className="text-primary" /><h3 className="text-base font-semibold tracking-wide text-white">Position Risk Table</h3></div><p className="mt-1 text-[11px] uppercase tracking-[0.22em] text-text-secondary">Row-level risk detail for the current scope</p></div>
            <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{positions.length} rows</span>
          </div>
          {positions.length > 0 ? <div className="overflow-x-auto"><table className="min-w-full divide-y divide-white/5 text-left text-sm"><thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-text-secondary"><tr><th className="px-5 py-3 font-semibold">Position</th><th className="px-5 py-3 font-semibold">Exchange</th><th className="px-5 py-3 font-semibold">Exposure</th><th className="px-5 py-3 font-semibold">Unrealized PnL</th><th className="px-5 py-3 font-semibold">Risk</th><th className="px-5 py-3 font-semibold">Explanation</th></tr></thead><tbody className="divide-y divide-white/5">{positions.map((row, index) => <tr key={`${txt(row.symbol, label(row, "Position"))}-${index}`} className="transition-colors hover:bg-white/[0.04]"><td className="px-5 py-4"><div className="font-semibold text-white">{txt(row.symbol, `Position ${index + 1}`)}</div><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-secondary"><span>{txt(row.side, "Unspecified")}</span><span>·</span><span>{num(row.leverage)?.toFixed(2) ?? "—"}x</span>{arr(row.risk_flags).map((flag) => typeof flag === "string" ? <span key={flag} className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-primary-light">{flag.replace(/_/g, " ")}</span> : null)}</div></td><td className="px-5 py-4 text-text-primary">{txt(row.exchange_id, "—")}</td><td className="px-5 py-4 font-mono text-text-primary">{money(row.exposure_usd)}</td><td className="px-5 py-4 font-mono text-text-primary">{money(row.unrealized_pnl)}</td><td className="px-5 py-4"><div className="font-mono text-text-primary">{num(row.risk_score)?.toFixed(1) ?? "—"}</div><div className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">{pct(row.risk_contribution_pct, 1)} contribution</div></td><td className="px-5 py-4 text-xs leading-5 text-text-secondary">{txt(row.explanation, "No explanation returned.")}</td></tr>)}</tbody></table></div> : <div className="px-5 py-10"><EmptyState icon={<Activity size={18} />} title="No position risk rows" body={stateCopy(viewState, "position risk rows", payload?.message)} /></div>}
        </section>

        <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <Card title="Risk Component Details" subtitle="Component scores returned by the backend" icon={<SlidersHorizontal size={16} />}>
            {components ? <div className="grid gap-3 md:grid-cols-2">{Object.entries(components).map(([key, value]) => <SummaryItem key={key} label={key.replace(/_/g, " ")} value={num(value)?.toFixed(1) ?? "—"} detail="Component score in the 0-100 heuristic model" />)}</div> : <EmptyState icon={<SlidersHorizontal size={18} />} title="No risk components returned" body="The backend did not include risk component scores for this scope snapshot." />}
          </Card>

          <Card title="Snapshot Meta" subtitle="Mode provenance and source-state detail" icon={<ShieldCheck size={16} />}>
            <div className="space-y-3 text-sm text-text-primary">
              <MetaRow label="Scope" value={scopeLabel} />
              <MetaRow label="Mode" value={modeLabel} />
              <MetaRow label="Status" value={txt(payload?.status, viewState)} />
              <MetaRow label="Source State" value={txt(payload?.source_state, viewState)} />
              <MetaRow label="Generated" value={generatedAt} />
              <MetaRow label="Message" value={message || "No backend message"} />
              {sourceDetails ? Object.entries(sourceDetails).map(([key, value]) => <MetaRow key={key} label={key.replace(/_/g, " ")} value={txt(value, typeof value === "number" ? String(value) : "—")} />) : null}
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  );
}

