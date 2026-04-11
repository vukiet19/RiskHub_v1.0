"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { NetworkOverview } from "./contagion/NetworkOverview";
import { FocusView } from "./contagion/FocusView";
import { AssetInspector } from "./AssetInspector";
import { buildApiUrl } from "../lib/riskhub-api";
import type {
  ContagionData,
  ContagionNode,
  ContagionEdge,
  ContagionCluster,
  ContagionApiResponse,
  ContagionSourceState,
  ContagionSummary,
  ContagionScope,
} from "./contagion/types";

// ── Props ────────────────────────────────────────────────────────────────

interface PortfolioContagionMapProps {
  userId: string;
  refreshToken?: number;
}

// ── Types ────────────────────────────────────────────────────────────────

type GraphView = "focus" | "overview";

// ── Helpers ──────────────────────────────────────────────────────────────

function timeAgo(isoString: string): string {
  try {
    const then = new Date(isoString).getTime();
    const now = Date.now();
    const diffMin = Math.floor((now - then) / 60000);
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return `${Math.floor(diffHrs / 24)}d ago`;
  } catch {
    return "recently";
  }
}

function riskScoreColor(score: number): string {
  if (score >= 70) return "#ffb4ab";
  if (score >= 45) return "#ffb59a";
  return "#a8efb4";
}

const SCOPE_LABELS: Record<ContagionScope, string> = {
  all: "All Exchanges",
  binance: "Binance",
  okx: "OKX",
};

function isContagionScope(value: unknown): value is ContagionScope {
  return value === "all" || value === "binance" || value === "okx";
}

function getScopeLabel(scope: ContagionScope): string {
  return SCOPE_LABELS[scope];
}

function getScopeSubtitle(scope: ContagionScope, scopeLabel: string): string {
  if (scope === "all") {
    return "Portfolio-wide cross-exchange dependency analysis";
  }

  return `${scopeLabel}-only dependency view`;
}

/**
 * Normalize the payload to fill in contract-required fields that
 * the current backend may not yet provide. This is the ONLY place
 * where frontier defaults are injected — documented as an adapter.
 */
function normalizePayload(raw: ContagionData): ContagionData {
  const display = raw.display ?? {
    default_selected_asset: raw.summary?.systemic_asset ?? null,
    overview: {
      node_ids: raw.nodes.map((n) => n.id),
      edge_ids: raw.edges
        .filter((e) => e.topology_role === "primary" || e.topology_role === "secondary")
        .map((e) => e.id),
    },
    focus: { max_primary_links: 5, max_context_links: 2 },
  };

  const clusters = Array.isArray(raw.clusters) ? raw.clusters : [];

  const edges = raw.edges.map((e) => {
    if (!e.id) {
      const pair = [e.source, e.target].sort();
      return { ...e, id: `${pair[0]}|${pair[1]}` };
    }
    return e;
  });

  const nodes = raw.nodes.map((n) => ({
    ...n,
    cluster_role: n.cluster_role || "member",
    flags: n.flags || [],
  }));

  return { ...raw, nodes, edges, clusters, display };
}

// ── Sub-components ───────────────────────────────────────────────────────

function RegimePill({ label, reason }: { label: string; reason: string }) {
  const dotColor =
    label === "stress" ? "#ffb4ab" : label === "elevated" ? "#ffb59a" : "#a8efb4";
  return (
    <span className={`regime-pill regime-${label}`} title={reason}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
      {label}
    </span>
  );
}

function SummaryMetric({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div className="contagion-metric">
      <span className="contagion-metric-label">{label}</span>
      <span className="contagion-metric-value" style={color ? { color } : undefined}>{value}</span>
      {sub && <span style={{ fontSize: 10, color: "#c3c5d7", marginTop: -2 }}>{sub}</span>}
    </div>
  );
}

function ContagionLegend() {
  return (
    <div className="contagion-legend">
      <div className="contagion-legend-item">
        <svg width={16} height={16}><circle cx={8} cy={8} r={4} fill="#31394d" stroke="#b5c4ff" strokeWidth={1.5} /></svg>
        <span>Node = weight</span>
      </div>
      <div className="contagion-legend-item">
        <svg width={16} height={16}><circle cx={8} cy={8} r={4} fill="none" stroke="#ffb4ab" strokeWidth={2} /></svg>
        <span>Ring = risk</span>
      </div>
      <div className="contagion-legend-item">
        <svg width={24} height={16}><line x1={0} y1={8} x2={24} y2={8} stroke="#ffb4ab" strokeWidth={3} /></svg>
        <span>Primary</span>
      </div>
      <div className="contagion-legend-item">
        <svg width={24} height={16}><line x1={0} y1={8} x2={24} y2={8} stroke="#647491" strokeWidth={1.5} strokeDasharray="4 3" /></svg>
        <span>Context</span>
      </div>
    </div>
  );
}

// ── View Toggle ──────────────────────────────────────────────────────────

function ViewToggle({
  view,
  onChange,
  disabled = false,
}: {
  view: GraphView;
  onChange: (v: GraphView) => void;
  disabled?: boolean;
}) {
  const disabledTitle = "Graph view not available for this state";
  return (
    // wrapper remains pointer-interactive so the title tooltip surfaces on hover
    <div
      className="view-toggle"
      style={disabled ? { opacity: 0.45 } : undefined}
      title={disabled ? disabledTitle : undefined}
    >
      <button
        type="button"
        className={`view-toggle-btn ${view === "overview" ? "active" : ""}`}
        onClick={() => onChange("overview")}
        disabled={disabled}
        aria-disabled={disabled}
        style={disabled ? { pointerEvents: "none", cursor: "not-allowed" } : undefined}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx={12} cy={12} r={3} /><circle cx={5} cy={5} r={2} /><circle cx={19} cy={5} r={2} /><circle cx={5} cy={19} r={2} /><circle cx={19} cy={19} r={2} />
        </svg>
        Overview
      </button>
      <button
        type="button"
        className={`view-toggle-btn ${view === "focus" ? "active" : ""}`}
        onClick={() => onChange("focus")}
        disabled={disabled}
        aria-disabled={disabled}
        style={disabled ? { pointerEvents: "none", cursor: "not-allowed" } : undefined}
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx={12} cy={12} r={4} /><line x1={12} y1={2} x2={12} y2={6} /><line x1={12} y1={18} x2={12} y2={22} /><line x1={2} y1={12} x2={6} y2={12} /><line x1={18} y1={12} x2={22} y2={12} />
        </svg>
        Focus
      </button>
    </div>
  );
}

// ── Scope Toggle ─────────────────────────────────────────────────────────

function ScopeToggle({ scope, onChange }: { scope: ContagionScope; onChange: (s: ContagionScope) => void }) {
  return (
    <div className="view-toggle">
      <button
        type="button"
        className={`view-toggle-btn ${scope === "all" ? "active" : ""}`}
        onClick={() => onChange("all")}
      >
        All
      </button>
      <button
        type="button"
        className={`view-toggle-btn ${scope === "binance" ? "active" : ""}`}
        onClick={() => onChange("binance")}
      >
        Binance
      </button>
      <button
        type="button"
        className={`view-toggle-btn ${scope === "okx" ? "active" : ""}`}
        onClick={() => onChange("okx")}
      >
        OKX
      </button>
    </div>
  );
}

// ── Fallbacks ────────────────────────────────────────────────────────────

function ConcentrationFallback({
  title = "Too Few Holdings for Contagion Mapping",
  body = "Contagion mapping needs at least two meaningful holdings. Right now your risk is driven more by concentration than by cross-asset contagion.",
}: { title?: string; body?: string }) {
  return (
    <div className="concentration-card">
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(181,196,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#b5c4ff" strokeWidth={2} strokeLinecap="round">
          <circle cx={12} cy={12} r={10} /><line x1={12} y1={8} x2={12} y2={12} /><line x1={12} y1={16} x2={12.01} y2={16} />
        </svg>
      </div>
      <h4 style={{ fontSize: 16, fontWeight: 600, color: "#dae2fd" }}>{title}</h4>
      <p style={{ fontSize: 13, color: "#c3c5d7", lineHeight: 1.6, maxWidth: 400 }}>{body}</p>
    </div>
  );
}

function PairRiskFallback({ nodes, edge }: { nodes: ContagionNode[]; edge: ContagionEdge }) {
  const nodeA = nodes[0];
  const nodeB = nodes[1];
  if (!nodeA || !nodeB) return <ConcentrationFallback />;
  return (
    <div className="pair-risk-card">
      <p style={{ fontSize: 13, color: "#c3c5d7", textAlign: "center", maxWidth: 380 }}>
        Your portfolio is driven by one dominant dependency pair rather than a broad contagion network.
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#31394d", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${nodeA.systemic_score > 60 ? "#ffb4ab" : "#b5c4ff"}`, margin: "0 auto 8px" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#dae2fd" }}>{nodeA.label}</span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#c3c5d7" }}>{nodeA.weight_pct.toFixed(1)}%</span>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 80, height: 4, borderRadius: 2, background: edge.band === "high" ? "#ffb4ab" : "#ffb59a", margin: "0 auto 8px" }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "#dae2fd" }}>{edge.correlation.toFixed(2)}</span>
          <div style={{ fontSize: 11, color: "#c3c5d7", marginTop: 4 }}>{edge.trend} · 7D: {edge.delta_7d > 0 ? "+" : ""}{edge.delta_7d.toFixed(3)}</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#31394d", display: "flex", alignItems: "center", justifyContent: "center", border: `2px solid ${nodeB.systemic_score > 60 ? "#ffb4ab" : "#b5c4ff"}`, margin: "0 auto 8px" }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#dae2fd" }}>{nodeB.label}</span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#c3c5d7" }}>{nodeB.weight_pct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

function LowSignalFallback({ nodes }: { nodes: ContagionNode[] }) {
  return (
    <div className="concentration-card">
      <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(181,196,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#b5c4ff" strokeWidth={2} strokeLinecap="round">
          <circle cx={12} cy={12} r={3} /><circle cx={5} cy={12} r={2} /><circle cx={19} cy={12} r={2} />
        </svg>
      </div>
      <h4 style={{ fontSize: 16, fontWeight: 600, color: "#dae2fd" }}>Weak or Unstable Dependencies</h4>
      <p style={{ fontSize: 13, color: "#c3c5d7", lineHeight: 1.6, maxWidth: 400 }}>
        Your {nodes.length} holdings do not have strong enough correlations to form a meaningful contagion map right now.
      </p>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div><div style={{ width: 200, height: 18, background: "#222a3d", borderRadius: 6 }} /></div>
        <div style={{ width: 80, height: 26, background: "#222a3d", borderRadius: 14 }} />
      </div>
      <div style={{ width: "100%", height: 40, background: "#1a2236", borderRadius: 8 }} />
      <div style={{ display: "flex", gap: 8 }}>
        {[1, 2, 3, 4, 5].map((i) => (<div key={i} style={{ flex: 1, height: 56, background: "#1e2536", borderRadius: 8 }} />))}
      </div>
      <div style={{ display: "flex", gap: 10, flex: 1, minHeight: 300 }}>
        <div style={{ flex: 7, background: "rgba(6,14,32,0.6)", borderRadius: 12 }} />
        <div style={{ flex: 3, background: "rgba(6,14,32,0.6)", borderRadius: 12 }} />
      </div>
    </div>
  );
}

// ── Module Header ────────────────────────────────────────────────────────

function ModuleHeader({
  regime,
  generatedAt,
  graphView,
  onViewChange,
  showToggle,
  viewToggleDisabled,
  scope,
  scopeLabel,
  onScopeChange,
  marketDataNote,
}: {
  regime: { label: "calm" | "elevated" | "stress"; reason: string };
  generatedAt: string;
  graphView?: GraphView;
  onViewChange?: (v: GraphView) => void;
  showToggle?: boolean;
  /** When true, the ViewToggle renders but is visually disabled — used in fallback states. */
  viewToggleDisabled?: boolean;
  scope?: ContagionScope;
  scopeLabel?: string;
  onScopeChange?: (s: ContagionScope) => void;
  marketDataNote?: string | null;
}) {
  const activeScope = scope ?? "all";
  const activeScopeLabel = scopeLabel || getScopeLabel(activeScope);
  const subtitle = getScopeSubtitle(activeScope, activeScopeLabel);

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#dae2fd", margin: 0, lineHeight: 1.3 }}>
          Portfolio Contagion Map
        </h3>
        <p style={{ fontSize: 11, color: "#c3c5d7", margin: "2px 0 0", lineHeight: 1.3 }}>
          {subtitle}
        </p>
        {marketDataNote ? (
          <p style={{ fontSize: 10, color: "#b5c4ff", margin: "4px 0 0", lineHeight: 1.3 }}>
            {marketDataNote}
          </p>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
        {/* ViewToggle: always render when showToggle=true so the header stays stable.
            In fallback states, graphView/onViewChange may not be meaningful, so we
            render it disabled to preserve layout without implying it works. */}
        {showToggle && graphView !== undefined && onViewChange !== undefined && (
          <ViewToggle view={graphView} onChange={onViewChange} disabled={viewToggleDisabled} />
        )}
        {showToggle && scope !== undefined && onScopeChange && (
          <ScopeToggle scope={scope} onChange={onScopeChange} />
        )}
        <RegimePill label={regime.label} reason={regime.reason} />
        <span style={{ fontSize: 9, color: "#c3c5d7", whiteSpace: "nowrap" }}>
          {timeAgo(generatedAt)}
        </span>
      </div>
    </div>
  );
}

function InsightStrip({ insight }: { insight: string }) {
  return <div className="contagion-insight" style={{ marginBottom: 10 }}>{insight}</div>;
}

function HoldingsWarningBanner({
  title,
  warnings,
}: {
  title: string;
  warnings: string[];
}) {
  return (
    <div
      style={{
        marginBottom: 10,
        borderRadius: 10,
        border: "1px solid rgba(255, 181, 154, 0.24)",
        background: "rgba(255, 181, 154, 0.1)",
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: "#ffd0c0",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
        {warnings.map((warning, index) => (
          <div key={`${warning}-${index}`} style={{ fontSize: 12, color: "#ffd8cc", lineHeight: 1.55 }}>
            {warning}
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ summary, clusters }: { summary: ContagionSummary; clusters: ContagionCluster[] }) {
  const deltaStr = summary.contagion_risk_delta_7d > 0
    ? `+${summary.contagion_risk_delta_7d.toFixed(1)}`
    : summary.contagion_risk_delta_7d.toFixed(1);
  const deltaColor = summary.contagion_risk_delta_7d > 0 ? "#ffb4ab" : summary.contagion_risk_delta_7d < 0 ? "#a8efb4" : "#c3c5d7";

  let largestClusterLabel = "—";
  if (summary.largest_cluster) {
    if (typeof summary.largest_cluster === "string") {
      const resolved = clusters.find((c) => c.id === summary.largest_cluster);
      largestClusterLabel = resolved?.label || String(summary.largest_cluster);
    } else {
      largestClusterLabel = summary.largest_cluster.label;
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8, marginBottom: 10 }}>
      <SummaryMetric label="Contagion Risk" value={`${summary.contagion_risk_score.toFixed(0)}`} color={riskScoreColor(summary.contagion_risk_score)} sub="out of 100" />
      <SummaryMetric label="7D Change" value={deltaStr} color={deltaColor} />
      <SummaryMetric label="Systemic Asset" value={summary.systemic_asset || "—"} color="#dae2fd" sub="dominant risk source" />
      <SummaryMetric label="Top Risk Pair" value={summary.top_risk_pair ? `${summary.top_risk_pair.source}↔${summary.top_risk_pair.target}` : "—"} color="#dae2fd" sub={summary.top_risk_pair ? `${summary.top_risk_pair.correlation.toFixed(2)} dep.` : undefined} />
      <SummaryMetric label="Largest Cluster" value={largestClusterLabel} color="#dae2fd" />
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export function PortfolioContagionMap({ userId, refreshToken = 0 }: PortfolioContagionMapProps) {
  const [data, setData] = useState<ContagionData | null>(null);
  const [sourceState, setSourceState] = useState<ContagionSourceState>("live");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphView, setGraphView] = useState<GraphView>("focus");
  const [scope, setScope] = useState<ContagionScope>("all");
  const [responseScope, setResponseScope] = useState<ContagionScope>("all");
  const [scopeLabel, setScopeLabel] = useState<string>(getScopeLabel("all"));
  const [marketDataSource, setMarketDataSource] = useState<string | null>(null);

  const loadContagion = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSourceState("live");
      setStatusMessage(null);
      setWarnings([]);
      setResponseScope(scope);
      setScopeLabel(getScopeLabel(scope));
      setMarketDataSource(null);

      const query = new URLSearchParams({ scope });
      const res = await fetch(buildApiUrl(`/api/v1/dashboard/${userId}/contagion?${query.toString()}`), { cache: "no-store" });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = (await res.json()) as ContagionApiResponse;
      const nextScope = isContagionScope(json.scope) ? json.scope : scope;
      const nextScopeLabel =
        typeof json.scope_label === "string" && json.scope_label.trim().length > 0
          ? json.scope_label.trim()
          : getScopeLabel(nextScope);

      setResponseScope(nextScope);
      setScopeLabel(nextScopeLabel);
      setMarketDataSource(
        typeof json.market_data_source === "string" && json.market_data_source.trim().length > 0
          ? json.market_data_source.trim()
          : null,
      );
      setSourceState(json.source_state ?? "live");
      setStatusMessage(json.message ?? null);
      setWarnings(
        Array.isArray(json.warnings)
          ? json.warnings.filter((warning): warning is string => typeof warning === "string" && warning.length > 0)
          : [],
      );
      if (json.data) {
        const normalized = normalizePayload(json.data as ContagionData);
        setData(normalized);
        setSelectedNodeId(current => {
          if (current && normalized.nodes.some(n => n.id === current)) return current;
          return normalized.display?.default_selected_asset ?? normalized.summary?.systemic_asset ?? null;
        });
      } else {
        setData(null);
      }
    } catch (err) {
      console.error("Failed to fetch contagion data:", err);
      setSourceState("error");
      setStatusMessage(err instanceof Error ? err.message : "Failed to load contagion data");
      setWarnings([]);
      setResponseScope(scope);
      setScopeLabel(getScopeLabel(scope));
      setMarketDataSource(null);
      setError(err instanceof Error ? err.message : "Failed to load contagion data");
    } finally {
      setIsLoading(false);
    }
  }, [userId, scope]);

  useEffect(() => { void loadContagion(); }, [loadContagion, refreshToken]);

  const handleSelectNode = useCallback((id: string) => { setSelectedNodeId(id); }, []);

  const selectedNode = useMemo(() => {
    if (!data || !selectedNodeId) return null;
    return data.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [data, selectedNodeId]);

  const liveWarningItems = useMemo(() => {
    const merged = [
      statusMessage,
      ...warnings,
    ].filter((value): value is string => typeof value === "string" && value.length > 0);

    return merged.filter((warning, index) => merged.indexOf(warning) === index);
  }, [statusMessage, warnings]);

  const activeScope = responseScope;
  const activeScopeLabel = scopeLabel || getScopeLabel(activeScope);
  const marketDataNote = useMemo(() => {
    if (!marketDataSource) {
      return null;
    }

    const normalized = marketDataSource
      .split(/[_-\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

    return `Market Data Source: ${normalized}`;
  }, [marketDataSource]);

  // ── Loading ───────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="glass-card rounded-2xl flex flex-col border border-white/5 shadow-2xl overflow-hidden">
        <LoadingSkeleton />
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────
  if (error || !data) {
    const errorTitle =
      activeScope === "all"
        ? "Failed to Load Contagion Data"
        : `Failed to Load ${activeScopeLabel} Contagion Data`;
    const errorBody =
      error ||
      (activeScope === "all"
        ? "RiskHub could not load the portfolio-wide contagion view."
        : `RiskHub could not load the ${activeScopeLabel} contagion view.`);

    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
        {/* Same control row structure as all other fallback branches */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#dae2fd", margin: 0, lineHeight: 1.3 }}>
              Portfolio Contagion Map
            </h3>
            <p style={{ fontSize: 11, color: "#c3c5d7", margin: "2px 0 0", lineHeight: 1.3 }}>
              {getScopeSubtitle(activeScope, activeScopeLabel)}
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0, flexWrap: "wrap" }}>
            <ViewToggle view={graphView} onChange={setGraphView} disabled />
            <ScopeToggle scope={scope} onChange={setScope} />
          </div>
        </div>
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ textAlign: "center", maxWidth: 320 }}>
            <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,180,171,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffb4ab" strokeWidth={2} strokeLinecap="round"><circle cx={12} cy={12} r={10} /><line x1={12} y1={8} x2={12} y2={12} /><line x1={12} y1={16} x2={12.01} y2={16} /></svg>
            </div>
            <p style={{ fontSize: 14, fontWeight: 600, color: "#dae2fd", marginBottom: 8 }}>{errorTitle}</p>
            <p style={{ fontSize: 12, color: "#c3c5d7", marginBottom: 16 }}>{errorBody}</p>
            <button onClick={() => { void loadContagion(); }} style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(26,86,219,0.15)", border: "1px solid rgba(26,86,219,0.3)", color: "#b5c4ff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Retry</button>
          </div>
        </div>
      </div>
    );
  }

  const { regime, summary, nodes, edges, clusters, display } = data;
  // For scoped exchange views (binance / okx), the backend already pre-filters to
  // that exchange's holdings, so a 0.5 % threshold can silently drop valid small
  // positions and make a renderable 4-asset graph look like a concentration fallback.
  // Threshold: 0 % in scoped mode (all backend nodes are intentional), 0.5 % in
  // All-scope mode to filter out dust/stablecoin noise across exchanges.
  const meaningfulThreshold = activeScope === "all" ? 0.5 : 0;
  const meaningfulNodes = nodes.filter((n) => n.weight_pct > meaningfulThreshold);
  const shouldShowLiveWarningBanner =
    (sourceState === "live" || sourceState === "demo") &&
    liveWarningItems.length > 0;

  // ── Source state fallbacks ─────────────────────────────────────────
  if (sourceState === "no_connection" || sourceState === "error") {
    const title = sourceState === "no_connection"
      ? activeScope === "all"
        ? "Connect an Exchange to Generate This Map"
        : `Connect ${activeScopeLabel} to Generate This Map`
      : "Live Holdings Are Unavailable";
    const body = sourceState === "no_connection"
      ? (activeScope === "all"
          ? "Manage connections and refresh the dashboard to calculate a portfolio-wide contagion map from backend-managed holdings."
          : `Make sure you have an active ${activeScopeLabel} connection to view this contagion scope.`)
      : statusMessage || "RiskHub could not read live holdings for contagion analysis right now.";
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
        <ModuleHeader
          regime={regime}
          generatedAt={data.generated_at}
          graphView={graphView}
          onViewChange={setGraphView}
          viewToggleDisabled
          scope={scope}
          scopeLabel={activeScopeLabel}
          onScopeChange={setScope}
          marketDataNote={marketDataNote}
          showToggle
        />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><ConcentrationFallback title={title} body={body} /></div>
      </div>
    );
  }

  // ── < 2 meaningful assets ──────────────────────────────────────────
  if (meaningfulNodes.length < 2) {
    const fallbackBody = statusMessage || (sourceState === "insufficient_holdings"
      ? activeScope === "all"
        ? "Contagion mapping needs at least two meaningful non-stable holdings across active exchanges."
        : `Contagion mapping needs at least two meaningful non-stable holdings in ${activeScopeLabel}.`
      : "Contagion mapping needs at least two meaningful holdings.");
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
        <ModuleHeader
          regime={regime}
          generatedAt={data.generated_at}
          graphView={graphView}
          onViewChange={setGraphView}
          viewToggleDisabled
          scope={scope}
          scopeLabel={activeScopeLabel}
          onScopeChange={setScope}
          marketDataNote={marketDataNote}
          showToggle
        />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><ConcentrationFallback body={fallbackBody} /></div>
      </div>
    );
  }

  // ── No edges → low signal ─────────────────────────────────────────
  if (edges.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
        <ModuleHeader
          regime={regime}
          generatedAt={data.generated_at}
          graphView={graphView}
          onViewChange={setGraphView}
          viewToggleDisabled
          scope={scope}
          scopeLabel={activeScopeLabel}
          onScopeChange={setScope}
          marketDataNote={marketDataNote}
          showToggle
        />
        <InsightStrip insight={summary.insight} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><LowSignalFallback nodes={nodes} /></div>
      </div>
    );
  }

  // ── Pair risk fallback ────────────────────────────────────────────
  if (meaningfulNodes.length === 2) {
    const meaningfulIds = new Set(meaningfulNodes.map((n) => n.id));
    const pairEdge = edges.find((e) => meaningfulIds.has(e.source) && meaningfulIds.has(e.target));
    if (pairEdge) {
      return (
        <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
          <ModuleHeader
            regime={regime}
            generatedAt={data.generated_at}
            graphView={graphView}
            onViewChange={setGraphView}
            viewToggleDisabled
            scope={scope}
            scopeLabel={activeScopeLabel}
            onScopeChange={setScope}
            marketDataNote={marketDataNote}
            showToggle
          />
          {shouldShowLiveWarningBanner ? (
            <HoldingsWarningBanner
              title="Live Holdings Warning"
              warnings={liveWarningItems}
            />
          ) : null}
          <InsightStrip insight={summary.insight} />
          <SummaryRow summary={summary} clusters={clusters} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}><PairRiskFallback nodes={meaningfulNodes} edge={pairEdge} /></div>
          <ContagionLegend />
        </div>
      );
    }
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
        <ModuleHeader
          regime={regime}
          generatedAt={data.generated_at}
          graphView={graphView}
          onViewChange={setGraphView}
          viewToggleDisabled
          scope={scope}
          scopeLabel={activeScopeLabel}
          onScopeChange={setScope}
          marketDataNote={marketDataNote}
          showToggle
        />
        <InsightStrip insight={summary.insight} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><LowSignalFallback nodes={nodes} /></div>
      </div>
    );
  }

  // ── Full graph view (3+ assets with edges) ────────────────────────
  const effectiveSelectedId = selectedNodeId || display.default_selected_asset || nodes[0]?.id;

  return (
    <div className="glass-card rounded-2xl flex flex-col border border-white/5 shadow-2xl overflow-hidden">
      <div style={{ padding: "16px 20px 0" }}>
        <ModuleHeader
          regime={regime}
          generatedAt={data.generated_at}
          graphView={graphView}
          onViewChange={setGraphView}
          scope={scope}
          scopeLabel={activeScopeLabel}
          onScopeChange={setScope}
          marketDataNote={marketDataNote}
          showToggle
        />
        {shouldShowLiveWarningBanner ? (
          <HoldingsWarningBanner
            title="Live Holdings Warning"
            warnings={liveWarningItems}
          />
        ) : null}
        <InsightStrip insight={summary.insight} />
        <SummaryRow summary={summary} clusters={clusters} />
      </div>

      {/* ── Graph + Inspector two-panel ─── */}
      <div className="contagion-two-panel">
        {/* Graph pane (~70%) */}
        <div className="contagion-panel-graph">
          {graphView === "overview" ? (
            <NetworkOverview
              nodes={nodes}
              edges={edges}
              clusters={clusters}
              overviewEdgeIds={display.overview.edge_ids}
              selectedNodeId={effectiveSelectedId}
              onSelectNode={handleSelectNode}
            />
          ) : (
            effectiveSelectedId && (
              <FocusView
                nodes={nodes}
                edges={edges}
                selectedNodeId={effectiveSelectedId}
                maxPrimaryLinks={display.focus.max_primary_links}
                maxContextLinks={display.focus.max_context_links}
                onSelectNode={handleSelectNode}
              />
            )
          )}
        </div>

        {/* Inspector pane (~30%) */}
        <div className="contagion-panel-inspector">
          <AssetInspector
            node={selectedNode || (effectiveSelectedId ? nodes.find((n) => n.id === effectiveSelectedId) || null : null)}
            systemicAsset={summary.systemic_asset}
            clusters={clusters}
            largestCluster={summary.largest_cluster}
          />
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding: "6px 20px 12px" }}>
        <ContagionLegend />
      </div>
    </div>
  );
}
