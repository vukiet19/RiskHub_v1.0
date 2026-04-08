"use client";

import { useEffect, useRef, useState, useCallback, useMemo } from "react";

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

interface LayoutNode extends ContagionNode {
  x: number;
  y: number;
  radius: number;
}

interface Props {
  nodes: ContagionNode[];
  edges: ContagionEdge[];
  selectedNodeId: string | null;
  onSelectNode: (id: string | null) => void;
}

// ── Constants ────────────────────────────────────────────────────────────

const BAND_COLORS: Record<string, string> = {
  high: "#ffb4ab",
  moderate: "#ffb59a",
  low: "#6b7280",
};

const RING_COLORS = {
  high: "#ffb4ab",    // systemic score > 70
  mid: "#ffb59a",     // 40–70
  low: "#b5c4ff",     // < 40
};

const NODE_FILL = "#31394d";
const NODE_FILL_DIM = "#1e2536";
const NODE_TEXT = "#dae2fd";
const NODE_TEXT_DIM = "#5a6177";
const EDGE_DIM = "rgba(100,100,120,0.12)";

// ── Force Layout ─────────────────────────────────────────────────────────

function computeForceLayout(
  nodes: ContagionNode[],
  edges: ContagionEdge[],
  width: number,
  height: number,
): LayoutNode[] {
  const n = nodes.length;
  if (n === 0) return [];

  // Initial positions: distribute around center with jitter
  const cx = width / 2;
  const cy = height / 2;
  const spreadRadius = Math.min(width, height) * 0.32;

  const positions = nodes.map((_, i) => {
    const angle = (i / n) * 2 * Math.PI;
    return {
      x: cx + spreadRadius * Math.cos(angle) + (Math.random() - 0.5) * 30,
      y: cy + spreadRadius * Math.sin(angle) + (Math.random() - 0.5) * 30,
      vx: 0,
      vy: 0,
    };
  });

  // Build adjacency
  const idxMap = new Map(nodes.map((n, i) => [n.id, i]));
  const edgeLinks = edges
    .map((e) => ({
      source: idxMap.get(e.source) ?? -1,
      target: idxMap.get(e.target) ?? -1,
      strength: e.abs_correlation,
    }))
    .filter((l) => l.source >= 0 && l.target >= 0);

  // Simple spring-force iterations
  const iterations = 120;
  const repulsion = 3500;
  const springLength = Math.min(width, height) * 0.22;
  const springK = 0.04;
  const damping = 0.85;
  const padding = 50;

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations;

    // Repulsion (all pairs)
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = positions[i].x - positions[j].x;
        const dy = positions[i].y - positions[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const force = (repulsion * cooling) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        positions[i].vx += fx;
        positions[i].vy += fy;
        positions[j].vx -= fx;
        positions[j].vy -= fy;
      }
    }

    // Spring attraction (edges)
    for (const link of edgeLinks) {
      const dx = positions[link.target].x - positions[link.source].x;
      const dy = positions[link.target].y - positions[link.source].y;
      const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
      const displacement = dist - springLength * (1 - link.strength * 0.3);
      const force = springK * displacement * cooling;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      positions[link.source].vx += fx;
      positions[link.source].vy += fy;
      positions[link.target].vx -= fx;
      positions[link.target].vy -= fy;
    }

    // Apply velocities with damping
    for (let i = 0; i < n; i++) {
      positions[i].x += positions[i].vx;
      positions[i].y += positions[i].vy;
      positions[i].vx *= damping;
      positions[i].vy *= damping;

      // Keep within bounds
      positions[i].x = Math.max(padding, Math.min(width - padding, positions[i].x));
      positions[i].y = Math.max(padding, Math.min(height - padding, positions[i].y));
    }
  }

  // Map back to LayoutNodes
  return nodes.map((node, i) => ({
    ...node,
    x: positions[i].x,
    y: positions[i].y,
    radius: Math.max(18, Math.min(42, 10 + node.weight_pct * 0.8)),
  }));
}

// ── Component ────────────────────────────────────────────────────────────

export function ContagionCanvas({ nodes, edges, selectedNodeId, onSelectNode }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ width: 600, height: 450 });
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{
    edge: ContagionEdge;
    x: number;
    y: number;
  } | null>(null);

  // Measure container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setDims({ width, height });
        }
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Compute layout
  const layoutNodes = useMemo(
    () => computeForceLayout(nodes, edges, dims.width, dims.height),
    [nodes, edges, dims.width, dims.height],
  );

  const nodeMap = useMemo(
    () => new Map(layoutNodes.map((n) => [n.id, n])),
    [layoutNodes],
  );

  // Focused node = hovered or selected
  const focusedId = hoveredNodeId || selectedNodeId;

  // Connected edges/nodes for the focused node
  const connectedNodeIds = useMemo(() => {
    if (!focusedId) return new Set<string>();
    const ids = new Set<string>();
    for (const e of edges) {
      if (e.source === focusedId) ids.add(e.target);
      if (e.target === focusedId) ids.add(e.source);
    }
    ids.add(focusedId);
    return ids;
  }, [focusedId, edges]);

  const isNodeDimmed = useCallback(
    (id: string) => focusedId !== null && !connectedNodeIds.has(id),
    [focusedId, connectedNodeIds],
  );

  const isEdgeDimmed = useCallback(
    (e: ContagionEdge) =>
      focusedId !== null && e.source !== focusedId && e.target !== focusedId,
    [focusedId],
  );

  // Ring color based on systemic score
  const ringColor = (score: number) => {
    if (score > 70) return RING_COLORS.high;
    if (score > 40) return RING_COLORS.mid;
    return RING_COLORS.low;
  };

  // Edge thickness
  const edgeWidth = (absCorr: number) => Math.max(1.5, absCorr * 5);

  // Handle background click
  const handleBgClick = useCallback(() => {
    onSelectNode(null);
  }, [onSelectNode]);

  // Handle edge hover
  const handleEdgeEnter = useCallback(
    (e: ContagionEdge, evt: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setHoveredEdge({
        edge: e,
        x: evt.clientX - rect.left,
        y: evt.clientY - rect.top,
      });
    },
    [],
  );

  const handleEdgeLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="contagion-canvas w-full flex-1"
      style={{ minHeight: 350 }}
    >
      <svg
        ref={svgRef}
        width={dims.width}
        height={dims.height}
        viewBox={`0 0 ${dims.width} ${dims.height}`}
        onClick={handleBgClick}
        style={{ display: "block" }}
      >
        {/* ── Edges ─────────────────────────────────── */}
        <g>
          {edges.map((edge, i) => {
            const sn = nodeMap.get(edge.source);
            const tn = nodeMap.get(edge.target);
            if (!sn || !tn) return null;
            const dimmed = isEdgeDimmed(edge);

            return (
              <line
                key={`edge-${i}`}
                x1={sn.x}
                y1={sn.y}
                x2={tn.x}
                y2={tn.y}
                stroke={dimmed ? EDGE_DIM : BAND_COLORS[edge.band] || BAND_COLORS.low}
                strokeWidth={dimmed ? 1 : edgeWidth(edge.abs_correlation)}
                strokeOpacity={dimmed ? 0.3 : 0.75}
                strokeLinecap="round"
                style={{
                  transition: "stroke 0.25s, stroke-width 0.25s, stroke-opacity 0.25s",
                  cursor: "pointer",
                  filter: !dimmed && edge.band === "high"
                    ? "drop-shadow(0 0 3px rgba(255,180,171,0.4))"
                    : "none",
                }}
                onMouseEnter={(evt) => handleEdgeEnter(edge, evt)}
                onMouseLeave={handleEdgeLeave}
                onClick={(evt) => evt.stopPropagation()}
              />
            );
          })}
        </g>

        {/* ── Nodes ─────────────────────────────────── */}
        <g>
          {layoutNodes.map((node) => {
            const dimmed = isNodeDimmed(node.id);
            const isSelected = selectedNodeId === node.id;
            const isShock = node.flags.includes("shock_source");
            const rOuter = node.radius + 4;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: "pointer", transition: "opacity 0.25s" }}
                opacity={dimmed ? 0.3 : 1}
                onMouseEnter={() => setHoveredNodeId(node.id)}
                onMouseLeave={() => setHoveredNodeId(null)}
                onClick={(evt) => {
                  evt.stopPropagation();
                  onSelectNode(isSelected ? null : node.id);
                }}
              >
                {/* Pulse ring for shock sources */}
                {isShock && !dimmed && (
                  <circle
                    r={rOuter + 6}
                    fill="none"
                    stroke={RING_COLORS.high}
                    strokeWidth={2}
                    opacity={0.4}
                  >
                    <animate
                      attributeName="r"
                      from={String(rOuter + 2)}
                      to={String(rOuter + 14)}
                      dur="2s"
                      repeatCount="indefinite"
                    />
                    <animate
                      attributeName="opacity"
                      from="0.5"
                      to="0"
                      dur="2s"
                      repeatCount="indefinite"
                    />
                  </circle>
                )}

                {/* Outer ring (systemic score) */}
                <circle
                  r={rOuter}
                  fill="none"
                  stroke={dimmed ? NODE_FILL_DIM : ringColor(node.systemic_score)}
                  strokeWidth={isSelected ? 3 : 2}
                  style={{ transition: "stroke 0.25s" }}
                />

                {/* Main node circle */}
                <circle
                  r={node.radius}
                  fill={dimmed ? NODE_FILL_DIM : NODE_FILL}
                  style={{ transition: "fill 0.25s" }}
                />

                {/* Selection indicator */}
                {isSelected && (
                  <circle
                    r={rOuter + 2}
                    fill="none"
                    stroke="#b5c4ff"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    opacity={0.7}
                  />
                )}

                {/* Label */}
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fill={dimmed ? NODE_TEXT_DIM : NODE_TEXT}
                  fontSize={node.radius > 28 ? 13 : 10}
                  fontWeight={600}
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    transition: "fill 0.25s",
                    pointerEvents: "none",
                  }}
                >
                  {node.label}
                </text>

                {/* Weight % below */}
                {!dimmed && node.radius > 22 && (
                  <text
                    textAnchor="middle"
                    dy={node.radius > 28 ? "1.8em" : "1.6em"}
                    fill="#c3c5d7"
                    fontSize={9}
                    fontWeight={500}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      pointerEvents: "none",
                    }}
                  >
                    {node.weight_pct.toFixed(1)}%
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── Edge Tooltip ────────────────────────────── */}
      {hoveredEdge && (
        <div
          className="edge-tooltip"
          style={{
            left: hoveredEdge.x + 12,
            top: hoveredEdge.y - 10,
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {hoveredEdge.edge.source} ↔ {hoveredEdge.edge.target}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <span>
              Dependency:{" "}
              <span style={{ fontFamily: "var(--font-mono)", color: BAND_COLORS[hoveredEdge.edge.band] }}>
                {hoveredEdge.edge.correlation.toFixed(2)}
              </span>
            </span>
            <span>
              7D:{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: hoveredEdge.edge.delta_7d > 0 ? "#ffb4ab" : hoveredEdge.edge.delta_7d < 0 ? "#a8efb4" : "#c3c5d7",
                }}
              >
                {hoveredEdge.edge.delta_7d > 0 ? "+" : ""}
                {hoveredEdge.edge.delta_7d.toFixed(3)}
              </span>
            </span>
          </div>
          <div style={{ marginTop: 4, fontSize: 10, opacity: 0.7 }}>
            {hoveredEdge.edge.band} · {hoveredEdge.edge.trend}
          </div>
        </div>
      )}
    </div>
  );
}
