"use client";

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

interface Props {
  node: ContagionNode | null;
  systemicAsset: string | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatUsd(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(1)}K`;
  return `$${val.toFixed(2)}`;
}

function trendLabel(delta: number): string {
  if (delta > 0.03) return "Tightening ↑";
  if (delta < -0.03) return "Loosening ↓";
  return "Stable →";
}

function trendColor(delta: number): string {
  if (delta > 0.03) return "#ffb4ab";
  if (delta < -0.03) return "#a8efb4";
  return "#c3c5d7";
}

function generateActionHint(node: ContagionNode, isSystemic: boolean): string {
  if (isSystemic) {
    return `${node.label} dominates portfolio contagion risk. Reducing ${node.label} concentration would lower cluster-level drawdown risk more than trimming smaller positions.`;
  }
  if (node.weight_pct > 25) {
    return `${node.label} is a significant portfolio weight. Monitor its top dependencies for signs of coordinated drawdowns.`;
  }
  if (node.systemic_score > 60) {
    return `${node.label} has high network connectivity. Its movements are likely to influence other holdings.`;
  }
  if (node.daily_move_pct < -3) {
    return `${node.label} experienced a sharp recent move. Watch for contagion spreading to connected assets.`;
  }
  return `${node.label} has moderate contagion exposure. No immediate action needed, but keep monitoring dependency changes.`;
}

// ── Systemic Score Ring ──────────────────────────────────────────────────

function SystemicRing({ score }: { score: number }) {
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (circumference * Math.min(score, 100)) / 100;
  const color = score > 70 ? "#ffb4ab" : score > 40 ? "#ffb59a" : "#b5c4ff";

  return (
    <svg width={52} height={52} viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
      <circle cx={26} cy={26} r={r} fill="none" stroke="#2d3449" strokeWidth={4} />
      <circle
        cx={26}
        cy={26}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={4}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform="rotate(-90 26 26)"
        style={{ transition: "stroke-dashoffset 0.6s ease" }}
      />
      <text
        x={26}
        y={26}
        textAnchor="middle"
        dominantBaseline="central"
        fill="#dae2fd"
        fontSize={11}
        fontWeight={700}
        fontFamily="'JetBrains Mono', monospace"
      >
        {Math.round(score)}
      </text>
    </svg>
  );
}

// ── Component ────────────────────────────────────────────────────────────

export function AssetInspector({ node, systemicAsset }: Props) {
  if (!node) {
    return (
      <div className="inspector-panel h-full flex items-center justify-center">
        <div className="text-center" style={{ maxWidth: 200 }}>
          <div
            style={{
              width: 48, height: 48, borderRadius: "50%",
              background: "rgba(45,52,73,0.6)",
              display: "flex", alignItems: "center", justifyContent: "center",
              margin: "0 auto 12px",
            }}
          >
            <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#c3c5d7" strokeWidth={2} strokeLinecap="round">
              <circle cx={11} cy={11} r={8} />
              <line x1={21} y1={21} x2={16.65} y2={16.65} />
            </svg>
          </div>
          <p style={{ color: "#c3c5d7", fontSize: 13, lineHeight: 1.5 }}>
            Click any asset node to inspect its contagion profile and dependencies.
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

  return (
    <div className="inspector-panel h-full">
      {/* Asset header */}
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <SystemicRing score={node.systemic_score} />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18, fontWeight: 700, color: "#dae2fd" }}>
              {node.label}
            </span>
            {isSystemic && (
              <span
                style={{
                  fontSize: 9, padding: "2px 7px",
                  background: "rgba(255,180,171,0.15)",
                  color: "#ffb4ab", borderRadius: 6,
                  fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Dominant Hub
              </span>
            )}
            {node.flags.includes("shock_source") && (
              <span
                style={{
                  fontSize: 9, padding: "2px 7px",
                  background: "rgba(255,180,171,0.12)",
                  color: "#ffb4ab", borderRadius: 6,
                  fontWeight: 600, textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Shock
              </span>
            )}
          </div>
          <span style={{ fontSize: 11, color: "#c3c5d7" }}>
            Risk importance: {node.systemic_score.toFixed(0)}/100
          </span>
        </div>
      </div>

      {/* Stats grid */}
      <div>
        <div className="inspector-stat">
          <span className="inspector-stat-label">Portfolio Weight</span>
          <span className="inspector-stat-value">{node.weight_pct.toFixed(1)}%</span>
        </div>
        <div className="inspector-stat">
          <span className="inspector-stat-label">Value (USD)</span>
          <span className="inspector-stat-value">{formatUsd(node.value_usd)}</span>
        </div>
        <div className="inspector-stat">
          <span className="inspector-stat-label">24h Move</span>
          <span
            className="inspector-stat-value"
            style={{
              color: node.daily_move_pct > 0 ? "#a8efb4" : node.daily_move_pct < 0 ? "#ffb4ab" : "#c3c5d7",
            }}
          >
            {node.daily_move_pct > 0 ? "+" : ""}
            {node.daily_move_pct.toFixed(2)}%
          </span>
        </div>
      </div>

      {/* Top connections */}
      {node.top_correlations.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
              color: "#c3c5d7", marginBottom: 8,
            }}
          >
            Top Connected Assets
          </div>
          {node.top_correlations.map((c, i) => (
            <div
              key={c.asset}
              style={{
                display: "flex", justifyContent: "space-between",
                alignItems: "center", padding: "6px 0",
                borderBottom: i < node.top_correlations.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
              }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: "#dae2fd" }}>
                {c.asset}
              </span>
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                    color: c.correlation >= 0.7 ? "#ffb4ab" : "#ffb59a",
                  }}
                >
                  {c.correlation.toFixed(2)}
                </span>
                <span
                  style={{
                    fontFamily: "var(--font-mono)", fontSize: 11,
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

      {/* Strongest dependency */}
      {strongestDep && (
        <div
          style={{
            background: "rgba(255,180,171,0.06)",
            border: "1px solid rgba(255,180,171,0.12)",
            borderRadius: 8, padding: "10px 14px",
          }}
        >
          <div
            style={{
              fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
              color: "#c3c5d7", marginBottom: 6,
            }}
          >
            Strongest Dependency
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: 14, fontWeight: 700, color: "#dae2fd" }}>
              {node.label} ↔ {strongestDep.asset}
            </span>
            <span
              style={{
                fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700,
                color: "#ffb4ab",
              }}
            >
              {strongestDep.correlation.toFixed(2)}
            </span>
          </div>
        </div>
      )}

      {/* 7D trend */}
      <div className="inspector-stat">
        <span className="inspector-stat-label">7D Dependency Trend</span>
        <span
          className="inspector-stat-value"
          style={{ color: trendColor(overallDelta) }}
        >
          {trendLabel(overallDelta)}
        </span>
      </div>

      {/* Action hint */}
      <div
        style={{
          background: "rgba(26,86,219,0.06)",
          border: "1px solid rgba(26,86,219,0.15)",
          borderRadius: 8, padding: "12px 14px",
          fontSize: 12, lineHeight: 1.6,
          color: "#c3c5d7",
        }}
      >
        <div
          style={{
            fontSize: 10, textTransform: "uppercase", letterSpacing: "0.1em",
            color: "#b5c4ff", marginBottom: 6, fontWeight: 600,
          }}
        >
          Action Hint
        </div>
        {generateActionHint(node, isSystemic)}
      </div>
    </div>
  );
}
