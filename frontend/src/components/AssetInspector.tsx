"use client";

import { useState } from "react";
import type { ContagionNode, ContagionCluster, LargestClusterSummary } from "./contagion/types";

// ── Props ────────────────────────────────────────────────────────────────

interface Props {
  node: ContagionNode | null;
  systemicAsset: string | null;
  clusters: ContagionCluster[];
  largestCluster: LargestClusterSummary | string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatUsd(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function trendColor(delta: number): string {
  if (delta > 0.03) return "#ffb4ab";
  if (delta < -0.03) return "#a8efb4";
  return "#c3c5d7";
}

function roleLabel(role: string): string {
  switch (role) {
    case "hub":
      return "Hub";
    case "core":
      return "Core";
    case "bridge":
      return "Bridge";
    case "peripheral":
      return "Peripheral";
    default:
      return "Member";
  }
}

function generateActionHint(node: ContagionNode, isSystemic: boolean): string {
  if (isSystemic) {
    return `${node.label} is the dominant dependency hub in this portfolio. Reducing ${node.label} overlap would lower cluster-level concentration risk more than trimming smaller positions.`;
  }
  if (node.weight_pct > 25) {
    return `${node.label} is a significant portfolio weight. Consider whether its top dependencies are moving together — high overlap reduces the diversification benefit of holding multiple assets.`;
  }
  if (node.systemic_score > 60) {
    return `${node.label} is tightly connected to several other holdings. A broad tightening of dependencies in this cluster could reduce the cushion between positions.`;
  }
  if (node.daily_move_pct < -3) {
    return `${node.label} had a sharp recent move. Assets with strong dependency scores tend to move together, so closely connected holdings may show similar pressure.`;
  }
  return `${node.label} has moderate dependency exposure within this portfolio. No immediate action indicated, but monitor whether dependency scores tighten further over the next 7 days.`;
}

// ── Compact Systemic Ring ────────────────────────────────────────────────

function SystemicRing({ score }: { score: number }) {
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (circumference * Math.min(score, 100)) / 100;
  const color = score > 70 ? "#ffb4ab" : score > 40 ? "#ffb59a" : "#b5c4ff";

  return (
    <svg width={40} height={40} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
      <circle cx={20} cy={20} r={r} fill="none" stroke="#2d3449" strokeWidth={3} />
      <circle
        cx={20}
        cy={20}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={3}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 20 20)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x={20}
        y={20}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#dae2fd"
        fontSize={10}
        fontWeight={700}
        fontFamily="'JetBrains Mono', monospace"
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

// ── Compact Stat Cell ────────────────────────────────────────────────────

function StatCell({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <span
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "#c3c5d7",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 12,
          fontWeight: 600,
          color: color || "#dae2fd",
        }}
      >
        {value}
      </span>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export function AssetInspector({ node, systemicAsset, clusters, largestCluster }: Props) {
  const [showDetails, setShowDetails] = useState(false);

  if (!node) {
    return (
      <div className="inspector-panel-compact" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div className="text-center" style={{ maxWidth: 180 }}>
          <div
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: "rgba(45,52,73,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 10px",
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#c3c5d7" strokeWidth={2} strokeLinecap="round">
              <circle cx={11} cy={11} r={8} />
              <line x1={21} y1={21} x2={16.65} y2={16.65} />
            </svg>
          </div>
          <p style={{ color: "#c3c5d7", fontSize: 12, lineHeight: 1.5 }}>
            Click any asset node to inspect its dependency profile.
          </p>
        </div>
      </div>
    );
  }

  const isSystemic = node.id === systemicAsset;
  const strongestDep = node.top_correlations.length > 0 ? node.top_correlations[0] : null;
  const overallDelta = node.top_correlations.length > 0
    ? node.top_correlations.reduce((sum, c) => sum + c.delta_7d, 0) / node.top_correlations.length
    : 0;

  // Find the cluster this node belongs to
  const nodeCluster = clusters.find((c) => c.id === node.cluster_id);

  // Top 3 connections only
  const visibleConnections = node.top_correlations.slice(0, 3);

  return (
    <div className="inspector-panel-compact">
      {/* Panel label */}
      <div className="panel-label" style={{ padding: "8px 12px 2px" }}>Asset Inspector</div>

      {/* Asset header — compact */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 12px" }}>
        <SystemicRing score={node.systemic_score} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#dae2fd", wordBreak: "break-word" }}>
              {node.label}
            </span>
            {isSystemic && (
              <span
                style={{
                  fontSize: 8, padding: "1px 5px",
                  background: "rgba(255,180,171,0.15)",
                  color: "#ffb4ab", borderRadius: 4,
                  fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.05em", whiteSpace: "nowrap"
                }}
              >
                Hub
              </span>
            )}
            {node.flags.includes("shock_source") && (
              <span
                style={{
                  fontSize: 8, padding: "1px 5px",
                  background: "rgba(255,180,171,0.12)",
                  color: "#ffb4ab", borderRadius: 4,
                  fontWeight: 600, textTransform: "uppercase", whiteSpace: "nowrap"
                }}
              >
                Shock
              </span>
            )}
          </div>
          <div style={{ fontSize: 10, color: "#c3c5d7", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {roleLabel(node.cluster_role)} · Score {node.systemic_score.toFixed(0)}/100
          </div>
        </div>
      </div>

      {/* Compact 2x2 stats grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "6px 12px",
          padding: "0 12px",
          background: "rgba(34,42,61,0.3)",
          borderRadius: 8,
          margin: "0 12px",
          paddingTop: 8,
          paddingBottom: 8,
        }}
      >
        <StatCell label="Weight" value={`${node.weight_pct.toFixed(1)}%`} />
        <StatCell label="Value" value={formatUsd(node.value_usd)} />
        <StatCell
          label="24h Move"
          value={`${node.daily_move_pct > 0 ? "+" : ""}${node.daily_move_pct.toFixed(2)}%`}
          color={node.daily_move_pct > 0 ? "#a8efb4" : node.daily_move_pct < 0 ? "#ffb4ab" : "#c3c5d7"}
        />
        <StatCell
          label="7D Trend"
          value={overallDelta > 0.03 ? "Tightening ↑" : overallDelta < -0.03 ? "Loosening ↓" : "Stable →"}
          color={trendColor(overallDelta)}
        />
      </div>

      {/* Cluster membership — compact */}
      {nodeCluster && (
        <div
          style={{
            background: "rgba(181,196,255,0.05)",
            border: "1px solid rgba(181,196,255,0.1)",
            borderRadius: 6, padding: "6px 10px",
            margin: "0 12px",
            fontSize: 11,
            wordBreak: "break-word",
          }}
        >
          <span style={{ color: "#b5c4ff", fontWeight: 600 }}>{nodeCluster.label}</span>
          <span style={{ color: "#c3c5d7" }}> · {nodeCluster.member_count} assets · {nodeCluster.total_weight_pct.toFixed(1)}%</span>
        </div>
      )}

      {/* Top connections — max 3 */}
      {visibleConnections.length > 0 && (
        <div style={{ padding: "0 12px" }}>
          <div
            style={{
              fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em",
              color: "#c3c5d7", marginBottom: 4,
            }}
          >
            Top Dependencies
          </div>
          {visibleConnections.map((c, i) => (
            <div
              key={c.asset}
              style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", padding: "3px 0", gap: 8,
                borderBottom: i < visibleConnections.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 600, color: "#dae2fd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                {c.asset}
              </span>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
                    color: c.correlation >= 0.7 ? "#ffb4ab" : "#ffb59a",
                  }}
                >
                  {c.correlation.toFixed(2)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 10,
                    color: trendColor(c.delta_7d),
                  }}
                >
                  {c.delta_7d > 0 ? "+" : ""}{c.delta_7d.toFixed(3)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Strongest dependency highlight */}
      {strongestDep && (
        <div
          style={{
            background: "rgba(255,180,171,0.05)",
            border: "1px solid rgba(255,180,171,0.1)",
            borderRadius: 6, padding: "6px 10px",
            margin: "0 12px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#dae2fd", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
              {node.label} ↔ {strongestDep.asset}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                color: "#ffb4ab", flexShrink: 0
              }}
            >
              {strongestDep.correlation.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* Expandable details */}
      <div style={{ padding: "0 12px" }}>
        <button
          onClick={() => setShowDetails(!showDetails)}
          style={{
            background: "none", border: "none",
            color: "#b5c4ff", fontSize: 10,
            cursor: "pointer", padding: 0,
            fontWeight: 600, letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {showDetails ? "▲ Hide Details" : "▼ More Details"}
        </button>

        {showDetails && (
          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
            {/* Action hint */}
            <div
              style={{
                background: "rgba(26,86,219,0.05)",
                border: "1px solid rgba(26,86,219,0.12)",
                borderRadius: 6, padding: "8px 10px",
                fontSize: 11, lineHeight: 1.5,
                color: "#c3c5d7",
                wordBreak: "break-word",
              }}
            >
              <div
                style={{
                  fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em",
                  color: "#b5c4ff", marginBottom: 4, fontWeight: 600,
                }}
              >
                Action Hint
              </div>
              {generateActionHint(node, isSystemic)}
            </div>

            {/* Largest cluster */}
            {largestCluster && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, gap: 8 }}>
                <span style={{ color: "#c3c5d7", flexShrink: 0 }}>Largest Cluster</span>
                <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "#dae2fd", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textAlign: "right" }}>
                  {typeof largestCluster === "string"
                    ? (clusters.find((c) => c.id === largestCluster)?.label || largestCluster)
                    : largestCluster.label}
                </span>
              </div>
            )}

            {/* Extra connections beyond top 3 */}
            {node.top_correlations.length > 3 && (
              <div>
                <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.08em", color: "#c3c5d7", marginBottom: 3 }}>
                  Other Connections
                </div>
                {node.top_correlations.slice(3).map((c, i) => (
                  <div
                    key={c.asset}
                    style={{
                      display: "flex", justifyContent: "space-between",
                      alignItems: "center", padding: "2px 0", gap: 8,
                      borderBottom: i < node.top_correlations.length - 4 ? "1px solid rgba(255,255,255,0.03)" : "none",
                    }}
                  >
                    <span style={{ fontSize: 11, color: "#dae2fd", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{c.asset}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#c3c5d7", flexShrink: 0 }}>
                      {c.correlation.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
