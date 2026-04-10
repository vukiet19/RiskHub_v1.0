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

function ViewToggle({ view, onChange }: { view: GraphView; onChange: (v: GraphView) => void }) {
  return (
    <div className="view-toggle">
      <button
        type="button"
        className={`view-toggle-btn ${view === "overview" ? "active" : ""}`}
        onClick={() => onChange("overview")}
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
      >
        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <circle cx={12} cy={12} r={4} /><line x1={12} y1={2} x2={12} y2={6} /><line x1={12} y1={18} x2={12} y2={22} /><line x1={2} y1={12} x2={6} y2={12} /><line x1={18} y1={12} x2={22} y2={12} />
        </svg>
        Focus
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
}: {
  regime: { label: "calm" | "elevated" | "stress"; reason: string };
  generatedAt: string;
  graphView?: GraphView;
  onViewChange?: (v: GraphView) => void;
  showToggle?: boolean;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
      <div style={{ minWidth: 0 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: "#dae2fd", margin: 0, lineHeight: 1.3 }}>
          Portfolio Contagion Map
        </h3>
        <p style={{ fontSize: 11, color: "#c3c5d7", margin: "2px 0 0", lineHeight: 1.3 }}>
          Cross-asset dependency analysis
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
        {showToggle && graphView && onViewChange && (
          <ViewToggle view={graphView} onChange={onViewChange} />
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
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [graphView, setGraphView] = useState<GraphView>("focus");

  const loadContagion = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSourceState("live");
      setStatusMessage(null);
      const res = await fetch(buildApiUrl(`/api/v1/dashboard/${userId}/contagion`), { cache: "no-store" });
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const json = (await res.json()) as ContagionApiResponse;
      setSourceState(json.source_state ?? "live");
      setStatusMessage(json.message ?? null);
      if (json.data) {
        const normalized = normalizePayload(json.data as ContagionData);
        setData(normalized);
        const defaultAsset = normalized.display?.default_selected_asset ?? normalized.summary?.systemic_asset ?? null;
        setSelectedNodeId(defaultAsset);
      } else {
        setData(null);
      }
    } catch (err) {
      console.error("Failed to fetch contagion data:", err);
      setSourceState("error");
      setStatusMessage(err instanceof Error ? err.message : "Failed to load contagion data");
      setError(err instanceof Error ? err.message : "Failed to load contagion data");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => { void loadContagion(); }, [loadContagion, refreshToken]);

  const handleSelectNode = useCallback((id: string) => { setSelectedNodeId(id); }, []);

  const selectedNode = useMemo(() => {
    if (!data || !selectedNodeId) return null;
    return data.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [data, selectedNodeId]);

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
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col items-center justify-center min-h-[400px] border border-white/5 shadow-2xl">
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", background: "rgba(255,180,171,0.1)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffb4ab" strokeWidth={2} strokeLinecap="round"><circle cx={12} cy={12} r={10} /><line x1={12} y1={8} x2={12} y2={12} /><line x1={12} y1={16} x2={12.01} y2={16} /></svg>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#dae2fd", marginBottom: 8 }}>Failed to Load Contagion Data</p>
          <p style={{ fontSize: 12, color: "#c3c5d7", marginBottom: 16 }}>{error || "An unexpected error occurred."}</p>
          <button onClick={() => { void loadContagion(); }} style={{ padding: "8px 20px", borderRadius: 8, background: "rgba(26,86,219,0.15)", border: "1px solid rgba(26,86,219,0.3)", color: "#b5c4ff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Retry</button>
        </div>
      </div>
    );
  }

  const { regime, summary, nodes, edges, clusters, display } = data;
  const meaningfulNodes = nodes.filter((n) => n.weight_pct > 0.5);

  // ── Source state fallbacks ─────────────────────────────────────────
  if (sourceState === "no_connection" || sourceState === "error") {
    const title = sourceState === "no_connection" ? "Connect Binance Testnet to Generate This Map" : "Live Holdings Are Unavailable";
    const body = statusMessage || (sourceState === "no_connection"
      ? "Connect Binance Testnet and refresh the dashboard to calculate cross-asset contagion from backend-managed holdings."
      : "RiskHub could not read live holdings for contagion analysis right now.");
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
        <ModuleHeader regime={regime} generatedAt={data.generated_at} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><ConcentrationFallback title={title} body={body} /></div>
      </div>
    );
  }

  // ── < 2 meaningful assets ──────────────────────────────────────────
  if (meaningfulNodes.length < 2) {
    const fallbackBody = statusMessage || (sourceState === "insufficient_holdings"
      ? "Contagion mapping needs at least two meaningful non-stable holdings."
      : "Contagion mapping needs at least two meaningful holdings.");
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
        <ModuleHeader regime={regime} generatedAt={data.generated_at} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><ConcentrationFallback body={fallbackBody} /></div>
      </div>
    );
  }

  // ── No edges → low signal ─────────────────────────────────────────
  if (edges.length === 0) {
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
        <ModuleHeader regime={regime} generatedAt={data.generated_at} />
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
          <ModuleHeader regime={regime} generatedAt={data.generated_at} />
          <InsightStrip insight={summary.insight} />
          <SummaryRow summary={summary} clusters={clusters} />
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}><PairRiskFallback nodes={meaningfulNodes} edge={pairEdge} /></div>
          <ContagionLegend />
        </div>
      );
    }
    return (
      <div className="glass-card rounded-2xl p-6 flex flex-col min-h-[400px] border border-white/5 shadow-2xl">
        <ModuleHeader regime={regime} generatedAt={data.generated_at} />
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
          showToggle
        />
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
