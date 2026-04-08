"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { ContagionCanvas } from "./ContagionCanvas";
import { AssetInspector } from "./AssetInspector";
import { buildApiUrl } from "../lib/riskhub-api";

// ── Types ────────────────────────────────────────────────────────────────

interface ContagionNode {
  id: string;
  label: string;
  value_usd: number;
  weight_pct: number;
  daily_move_pct: number;
  systemic_score: number;
  cluster_id: string;
  flags: string[];
  top_correlations: { asset: string; correlation: number; delta_7d: number }[];
}

interface ContagionEdge {
  source: string;
  target: string;
  correlation: number;
  abs_correlation: number;
  delta_7d: number;
  band: "high" | "moderate" | "low";
  trend: "tightening" | "loosening" | "stable";
}

interface ContagionSummary {
  contagion_risk_score: number;
  contagion_risk_delta_7d: number;
  systemic_asset: string | null;
  top_risk_pair: {
    source: string;
    target: string;
    correlation: number;
    delta_7d: number;
  } | null;
  network_density: number;
  insight: string;
}

interface ContagionData {
  generated_at: string;
  window_days: number;
  regime: {
    label: "calm" | "elevated" | "stress";
    reason: string;
  };
  summary: ContagionSummary;
  nodes: ContagionNode[];
  edges: ContagionEdge[];
  _demo?: boolean;
}

type ContagionSourceState =
  | "live"
  | "demo"
  | "no_connection"
  | "insufficient_holdings"
  | "error";

interface ContagionApiResponse {
  data?: ContagionData;
  source_state?: ContagionSourceState;
  message?: string | null;
}

interface PortfolioContagionMapProps {
  userId: string;
  refreshToken?: number;
}

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

// ── Sub-components ───────────────────────────────────────────────────────

function RegimePill({ label, reason }: { label: string; reason: string }) {
  const dotColor =
    label === "stress" ? "#ffb4ab" : label === "elevated" ? "#ffb59a" : "#a8efb4";

  return (
    <span
      className={`regime-pill regime-${label}`}
      title={reason}
    >
      <span
        style={{
          width: 6, height: 6, borderRadius: "50%",
          background: dotColor, display: "inline-block",
        }}
      />
      {label}
    </span>
  );
}

function SummaryMetric({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string;
  color?: string;
  sub?: string;
}) {
  return (
    <div className="contagion-metric">
      <span className="contagion-metric-label">{label}</span>
      <span className="contagion-metric-value" style={color ? { color } : undefined}>
        {value}
      </span>
      {sub && (
        <span style={{ fontSize: 10, color: "#c3c5d7", marginTop: -2 }}>{sub}</span>
      )}
    </div>
  );
}

function ContagionLegend() {
  return (
    <div className="contagion-legend">
      <div className="contagion-legend-item">
        <svg width={16} height={16}>
          <circle cx={8} cy={8} r={4} fill="#31394d" stroke="#b5c4ff" strokeWidth={1.5} />
        </svg>
        <span>Node size = portfolio weight</span>
      </div>
      <div className="contagion-legend-item">
        <svg width={16} height={16}>
          <circle cx={8} cy={8} r={4} fill="none" stroke="#ffb4ab" strokeWidth={2} />
        </svg>
        <span>Ring = risk importance</span>
      </div>
      <div className="contagion-legend-item">
        <svg width={24} height={16}>
          <line x1={0} y1={8} x2={24} y2={8} stroke="#ffb4ab" strokeWidth={3} />
        </svg>
        <span>High dependency (≥0.70)</span>
      </div>
      <div className="contagion-legend-item">
        <svg width={24} height={16}>
          <line x1={0} y1={8} x2={24} y2={8} stroke="#ffb59a" strokeWidth={2} />
        </svg>
        <span>Moderate (0.40–0.69)</span>
      </div>
    </div>
  );
}

// ── Fallback: Concentration (< 2 assets) ────────────────────────────────

function ConcentrationFallback({
  title = "Too Few Holdings for Contagion Mapping",
  body = "Contagion mapping needs at least two meaningful holdings. Right now your risk is driven more by concentration than by cross-asset contagion.",
}: {
  title?: string;
  body?: string;
}) {
  return (
    <div className="concentration-card">
      <div
        style={{
          width: 56, height: 56, borderRadius: "50%",
          background: "rgba(181,196,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#b5c4ff" strokeWidth={2} strokeLinecap="round">
          <circle cx={12} cy={12} r={10} />
          <line x1={12} y1={8} x2={12} y2={12} />
          <line x1={12} y1={16} x2={12.01} y2={16} />
        </svg>
      </div>
      <h4 style={{ fontSize: 16, fontWeight: 600, color: "#dae2fd" }}>
        {title}
      </h4>
      <p style={{ fontSize: 13, color: "#c3c5d7", lineHeight: 1.6, maxWidth: 400 }}>
        {body}
      </p>
    </div>
  );
}

// ── Fallback: Pair Risk (exactly 2 assets) ──────────────────────────────

function PairRiskFallback({
  nodes,
  edges,
}: {
  nodes: ContagionNode[];
  edges: ContagionEdge[];
}) {
  const edge = edges[0];
  const nodeA = nodes[0];
  const nodeB = nodes[1];

  if (!edge || !nodeA || !nodeB) return <ConcentrationFallback />;

  return (
    <div className="pair-risk-card">
      <p style={{ fontSize: 13, color: "#c3c5d7", textAlign: "center", maxWidth: 380 }}>
        Your portfolio is driven by one dominant dependency pair rather than a broad contagion network.
      </p>

      <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
        {/* Node A */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "#31394d", display: "flex",
              alignItems: "center", justifyContent: "center",
              border: `2px solid ${nodeA.systemic_score > 60 ? "#ffb4ab" : "#b5c4ff"}`,
              margin: "0 auto 8px",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: "#dae2fd" }}>{nodeA.label}</span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#c3c5d7" }}>
            {nodeA.weight_pct.toFixed(1)}%
          </span>
        </div>

        {/* Connection */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 80, height: 4, borderRadius: 2,
              background: edge.band === "high" ? "#ffb4ab" : "#ffb59a",
              margin: "0 auto 8px",
            }}
          />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "#dae2fd" }}>
            {edge.correlation.toFixed(2)}
          </span>
          <div style={{ fontSize: 11, color: "#c3c5d7", marginTop: 4 }}>
            {edge.trend} · 7D: {edge.delta_7d > 0 ? "+" : ""}{edge.delta_7d.toFixed(3)}
          </div>
        </div>

        {/* Node B */}
        <div style={{ textAlign: "center" }}>
          <div
            style={{
              width: 72, height: 72, borderRadius: "50%",
              background: "#31394d", display: "flex",
              alignItems: "center", justifyContent: "center",
              border: `2px solid ${nodeB.systemic_score > 60 ? "#ffb4ab" : "#b5c4ff"}`,
              margin: "0 auto 8px",
            }}
          >
            <span style={{ fontSize: 16, fontWeight: 700, color: "#dae2fd" }}>{nodeB.label}</span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#c3c5d7" }}>
            {nodeB.weight_pct.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Loading skeleton ────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header skeleton */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ width: 220, height: 20, background: "#222a3d", borderRadius: 6 }} />
          <div style={{ width: 320, height: 14, background: "#1e2536", borderRadius: 4, marginTop: 6 }} />
        </div>
        <div style={{ width: 80, height: 28, background: "#222a3d", borderRadius: 14 }} />
      </div>
      {/* Insight skeleton */}
      <div style={{ width: "100%", height: 44, background: "#1a2236", borderRadius: 8 }} />
      {/* Metrics skeleton */}
      <div style={{ display: "flex", gap: 12 }}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} style={{ flex: 1, height: 64, background: "#1e2536", borderRadius: 10 }} />
        ))}
      </div>
      {/* Graph skeleton */}
      <div
        style={{
          flex: 1, minHeight: 280,
          background: "rgba(6,14,32,0.6)",
          borderRadius: 12,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <span style={{ color: "#c3c5d7", fontSize: 13 }}>Loading contagion data…</span>
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────

export function PortfolioContagionMap({
  userId,
  refreshToken = 0,
}: PortfolioContagionMapProps) {
  const [data, setData] = useState<ContagionData | null>(null);
  const [sourceState, setSourceState] = useState<ContagionSourceState>("live");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const loadContagion = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setSourceState("live");
      setStatusMessage(null);
      const res = await fetch(
        buildApiUrl(`/api/v1/dashboard/${userId}/contagion`),
        { cache: "no-store" }
      );
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const json = (await res.json()) as ContagionApiResponse;
      setSourceState(json.source_state ?? "live");
      setStatusMessage(json.message ?? null);
      if (json.data) {
        setData(json.data as ContagionData);
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

  useEffect(() => {
    void loadContagion();
  }, [loadContagion, refreshToken]);

  const handleSelectNode = useCallback((id: string | null) => {
    setSelectedNodeId(id);
  }, []);

  const selectedNode = useMemo(() => {
    if (!data || !selectedNodeId) return null;
    return data.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [data, selectedNodeId]);

  // ── Loading state ──────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="glass-card rounded-2xl flex-1 flex flex-col min-h-[500px] border border-white/5 shadow-2xl overflow-hidden">
        <LoadingSkeleton />
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="glass-card rounded-2xl p-6 flex-1 flex flex-col items-center justify-center min-h-[500px] border border-white/5 shadow-2xl">
        <div style={{ textAlign: "center", maxWidth: 320 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "rgba(255,180,171,0.1)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 16px",
            }}
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#ffb4ab" strokeWidth={2} strokeLinecap="round">
              <circle cx={12} cy={12} r={10} />
              <line x1={12} y1={8} x2={12} y2={12} />
              <line x1={12} y1={16} x2={12.01} y2={16} />
            </svg>
          </div>
          <p style={{ fontSize: 14, fontWeight: 600, color: "#dae2fd", marginBottom: 8 }}>
            Failed to Load Contagion Data
          </p>
          <p style={{ fontSize: 12, color: "#c3c5d7", marginBottom: 16 }}>
            {error || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => {
              void loadContagion();
            }}
            style={{
              padding: "8px 20px", borderRadius: 8,
              background: "rgba(26,86,219,0.15)",
              border: "1px solid rgba(26,86,219,0.3)",
              color: "#b5c4ff", fontSize: 13, fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const { regime, summary, nodes, edges } = data;
  const meaningfulNodes = nodes.filter((n) => n.weight_pct > 0.5);

  if (sourceState === "no_connection" || sourceState === "error") {
    const title = sourceState === "no_connection"
      ? "Connect Binance Testnet to Generate This Map"
      : "Live Holdings Are Unavailable";
    const body = statusMessage || (
      sourceState === "no_connection"
        ? "Connect Binance Testnet and refresh the dashboard to calculate cross-asset contagion from backend-managed holdings."
        : "RiskHub could not read live holdings for contagion analysis right now."
    );

    return (
      <div className="glass-card rounded-2xl p-6 flex-1 flex flex-col min-h-[500px] border border-white/5 shadow-2xl">
        <ModuleHeader regime={regime} generatedAt={data.generated_at} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ConcentrationFallback title={title} body={body} />
        </div>
      </div>
    );
  }

  // ── Concentration fallback (< 2 meaningful assets) ─────────────────
  if (meaningfulNodes.length < 2) {
    const fallbackBody = statusMessage || (
      sourceState === "insufficient_holdings"
        ? "Contagion mapping needs at least two meaningful non-stable holdings. Until then, concentration risk matters more than cross-asset contagion."
        : "Contagion mapping needs at least two meaningful holdings. Right now your risk is driven more by concentration than by cross-asset contagion."
    );

    return (
      <div className="glass-card rounded-2xl p-6 flex-1 flex flex-col min-h-[500px] border border-white/5 shadow-2xl">
        <ModuleHeader regime={regime} generatedAt={data.generated_at} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ConcentrationFallback body={fallbackBody} />
        </div>
      </div>
    );
  }

  // ── Pair risk fallback (exactly 2 assets) ──────────────────────────
  if (meaningfulNodes.length === 2) {
    return (
      <div className="glass-card rounded-2xl p-6 flex-1 flex flex-col min-h-[500px] border border-white/5 shadow-2xl">
        <ModuleHeader regime={regime} generatedAt={data.generated_at} />
        <InsightStrip insight={summary.insight} />
        <SummaryRow summary={summary} />
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <PairRiskFallback nodes={meaningfulNodes} edges={edges} />
        </div>
        <ContagionLegend />
      </div>
    );
  }

  // ── Full graph view (3+ assets) ────────────────────────────────────
  return (
    <div className="glass-card rounded-2xl flex-1 flex flex-col min-h-[500px] border border-white/5 shadow-2xl overflow-hidden">
      <div style={{ padding: "20px 24px 0" }}>
        <ModuleHeader regime={regime} generatedAt={data.generated_at} />
        <InsightStrip insight={summary.insight} />
        <SummaryRow summary={summary} />
      </div>

      {/* Main body: graph + inspector */}
      <div
        style={{
          flex: 1, display: "flex", gap: 0,
          padding: "12px 24px 0",
          minHeight: 0,
        }}
      >
        {/* Graph canvas (≈70%) */}
        <div style={{ flex: 7, display: "flex", minHeight: 0 }}>
          <ContagionCanvas
            nodes={nodes}
            edges={edges}
            selectedNodeId={selectedNodeId}
            onSelectNode={handleSelectNode}
          />
        </div>

        {/* Inspector (≈30%) */}
        <div style={{ flex: 3, minWidth: 240, maxWidth: 320, paddingLeft: 12 }}>
          <AssetInspector
            node={selectedNode}
            systemicAsset={summary.systemic_asset}
          />
        </div>
      </div>

      {/* Legend */}
      <div style={{ padding: "12px 24px 16px" }}>
        <ContagionLegend />
      </div>
    </div>
  );
}

// ── Module Header ────────────────────────────────────────────────────────

function ModuleHeader({
  regime,
  generatedAt,
}: {
  regime: { label: "calm" | "elevated" | "stress"; reason: string };
  generatedAt: string;
}) {
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between",
        alignItems: "flex-start", marginBottom: 14,
      }}
    >
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700, color: "#dae2fd", margin: 0, lineHeight: 1.3 }}>
          Portfolio Contagion Map
        </h3>
        <p style={{ fontSize: 12, color: "#c3c5d7", margin: "4px 0 0", lineHeight: 1.3 }}>
          How tightly your holdings are likely to move together under stress
        </p>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <RegimePill label={regime.label} reason={regime.reason} />
        <span
          style={{
            fontSize: 10, color: "#c3c5d7",
            whiteSpace: "nowrap",
          }}
        >
          Updated {timeAgo(generatedAt)}
        </span>
      </div>
    </div>
  );
}

// ── Insight Strip ────────────────────────────────────────────────────────

function InsightStrip({ insight }: { insight: string }) {
  return (
    <div className="contagion-insight" style={{ marginBottom: 14 }}>
      {insight}
    </div>
  );
}

// ── Summary Metrics Row ──────────────────────────────────────────────────

function SummaryRow({ summary }: { summary: ContagionSummary }) {
  const deltaStr =
    summary.contagion_risk_delta_7d > 0
      ? `+${summary.contagion_risk_delta_7d.toFixed(1)}`
      : summary.contagion_risk_delta_7d.toFixed(1);

  const deltaColor =
    summary.contagion_risk_delta_7d > 0
      ? "#ffb4ab"
      : summary.contagion_risk_delta_7d < 0
        ? "#a8efb4"
        : "#c3c5d7";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, 1fr)",
        gap: 10,
        marginBottom: 14,
      }}
    >
      <SummaryMetric
        label="Contagion Risk"
        value={`${summary.contagion_risk_score.toFixed(0)}`}
        color={riskScoreColor(summary.contagion_risk_score)}
        sub="out of 100"
      />
      <SummaryMetric
        label="7D Change"
        value={deltaStr}
        color={deltaColor}
      />
      <SummaryMetric
        label="Most Connected"
        value={summary.systemic_asset || "—"}
        color="#dae2fd"
        sub="dominant risk source"
      />
      <SummaryMetric
        label="Top Risk Pair"
        value={
          summary.top_risk_pair
            ? `${summary.top_risk_pair.source}↔${summary.top_risk_pair.target}`
            : "—"
        }
        color="#dae2fd"
        sub={
          summary.top_risk_pair
            ? `${summary.top_risk_pair.correlation.toFixed(2)} dep.`
            : undefined
        }
      />
    </div>
  );
}
