/**
 * Contagion Module — Focus View Panel
 * =====================================
 * Ego-network around the selected node.
 * Shows only top-k primary links (curved, risk-colored) and
 * a small number of muted context links (dashed, gray).
 *
 * Contract alignment:
 *   - Primary edges: solid, risk-colored, thicker, routed with angular slots
 *   - Context edges: dashed, muted, lower opacity
 *   - No neighbour-to-neighbour full mesh
 *   - Deterministic radial layout, not force simulation
 */

"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import type { ContagionNode, ContagionEdge, LayoutNode } from "./types";

// ── Constants ────────────────────────────────────────────────────────────

const RISK_COLORS = {
  extreme: "#ff6b6b",
  high: "#ffb4ab",
  moderate: "#ffb59a",
  low: "#6b7f8a",
};

const RING_COLORS = {
  high: "#ffb4ab",
  mid: "#ffb59a",
  low: "#b5c4ff",
};

const NODE_FILL = "#31394d";
const NODE_TEXT = "#dae2fd";
const CONTEXT_EDGE_COLOR = "rgba(100, 116, 145, 0.35)";

// ── Edge Risk Color ──────────────────────────────────────────────────────

function edgeRiskColor(absCorr: number): string {
  if (absCorr >= 0.85) return RISK_COLORS.extreme;
  if (absCorr >= 0.70) return RISK_COLORS.high;
  if (absCorr >= 0.40) return RISK_COLORS.moderate;
  return RISK_COLORS.low;
}

function ringColor(score: number): string {
  if (score > 70) return RING_COLORS.high;
  if (score > 40) return RING_COLORS.mid;
  return RING_COLORS.low;
}

function nodeRadius(weightPct: number): number {
  return Math.max(16, Math.min(38, 10 + weightPct * 0.7));
}

// ── Focus Edge Selection ─────────────────────────────────────────────────

interface FocusEdges {
  primary: ContagionEdge[];
  context: ContagionEdge[];
}

function selectFocusEdges(
  selectedId: string,
  edges: ContagionEdge[],
  maxPrimary: number,
  maxContext: number,
): FocusEdges {
  // Get all edges touching the selected node
  const directEdges = edges.filter(
    (e) => e.source === selectedId || e.target === selectedId
  );

  // Sort by display_strength descending
  const sorted = [...directEdges].sort(
    (a, b) => b.display_strength - a.display_strength
  );

  const primary = sorted.slice(0, maxPrimary);
  const context = sorted.slice(maxPrimary, maxPrimary + maxContext);

  return { primary, context };
}

// ── Deterministic Radial Layout ──────────────────────────────────────────

function computeFocusLayout(
  selectedNode: ContagionNode,
  neighbourNodes: ContagionNode[],
  width: number,
  height: number,
): LayoutNode[] {
  const cx = width * 0.42;
  const cy = height * 0.5;
  const orbitRadius = Math.min(width, height) * 0.34;

  const result: LayoutNode[] = [];

  // Selected node (center-left)
  result.push({
    ...selectedNode,
    x: cx,
    y: cy,
    radius: nodeRadius(selectedNode.weight_pct),
  });

  // Neighbours evenly spaced on arc (right-side arc from -60° to +60°)
  const n = neighbourNodes.length;
  if (n === 0) return result;

  const arcSpan = Math.min(Math.PI * 1.4, Math.PI * 0.3 * n);
  const startAngle = -arcSpan / 2;

  // Sort neighbours by display strength for deterministic ordering
  const sorted = [...neighbourNodes].sort(
    (a, b) => b.systemic_score - a.systemic_score
  );

  sorted.forEach((node, i) => {
    const angle = startAngle + (i / Math.max(n - 1, 1)) * arcSpan;
    const nx = cx + orbitRadius * Math.cos(angle);
    const ny = cy + orbitRadius * Math.sin(angle);
    const r = nodeRadius(node.weight_pct);

    result.push({
      ...node,
      x: Math.max(r + 4, Math.min(width - r - 4, nx)),
      y: Math.max(r + 4, Math.min(height - r - 4, ny)),
      radius: r,
    });
  });

  return result;
}

// ── Curved Edge Path ─────────────────────────────────────────────────────

function curvedEdgePath(
  sx: number,
  sy: number,
  tx: number,
  ty: number,
  curvature: number,
): string {
  const mx = (sx + tx) / 2;
  const my = (sy + ty) / 2;
  const dx = tx - sx;
  const dy = ty - sy;
  // Perpendicular offset for curvature
  const nx = -dy * curvature;
  const ny = dx * curvature;
  const cpx = mx + nx;
  const cpy = my + ny;
  return `M ${sx} ${sy} Q ${cpx} ${cpy} ${tx} ${ty}`;
}

// ── Props ────────────────────────────────────────────────────────────────

interface Props {
  nodes: ContagionNode[];
  edges: ContagionEdge[];
  selectedNodeId: string;
  maxPrimaryLinks: number;
  maxContextLinks: number;
  onSelectNode: (id: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────

export function FocusView({
  nodes,
  edges,
  selectedNodeId,
  maxPrimaryLinks,
  maxContextLinks,
  onSelectNode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(420);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{
    edge: ContagionEdge;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) setPanelWidth(width);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const svgH = useMemo(() => {
    if (panelWidth < 340) return 300;
    if (panelWidth < 520) return 340;
    return Math.min(420, Math.max(340, panelWidth * 0.72));
  }, [panelWidth]);

  // Select focus edges
  const { primary, context } = useMemo(
    () => selectFocusEdges(selectedNodeId, edges, maxPrimaryLinks, maxContextLinks),
    [selectedNodeId, edges, maxPrimaryLinks, maxContextLinks]
  );

  // Collect neighbour node IDs from focus edges
  const neighbourIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of [...primary, ...context]) {
      if (e.source !== selectedNodeId) ids.add(e.source);
      if (e.target !== selectedNodeId) ids.add(e.target);
    }
    return ids;
  }, [primary, context, selectedNodeId]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId),
    [nodes, selectedNodeId]
  );

  const neighbourNodes = useMemo(
    () => nodes.filter((n) => neighbourIds.has(n.id)),
    [nodes, neighbourIds]
  );

  // Layout
  const layoutNodes = useMemo(
    () =>
      selectedNode
        ? computeFocusLayout(selectedNode, neighbourNodes, panelWidth, svgH)
        : [],
    [selectedNode, neighbourNodes, panelWidth, svgH]
  );

  const nodeMap = useMemo(
    () => new Map(layoutNodes.map((n) => [n.id, n])),
    [layoutNodes]
  );

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
    []
  );

  const handleEdgeLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  if (!selectedNode) {
    return (
      <div className="focus-panel" style={{ width: "100%" }}>
        <div className="panel-label">Focus View</div>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#c3c5d7",
            fontSize: 13,
          }}
        >
          Select a node to focus
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="focus-panel"
      style={{ width: "100%", position: "relative" }}
    >
      {/* Panel label */}
      <div className="panel-label">
        Focus View
        <span
          style={{
            marginLeft: 8,
            fontSize: 10,
            color: "#c3c5d7",
            fontWeight: 400,
          }}
        >
          — {selectedNode.label} neighbourhood
        </span>
      </div>

      <svg
        width={panelWidth}
        height={svgH}
        viewBox={`0 0 ${panelWidth} ${svgH}`}
        style={{ display: "block" }}
      >
        {/* ── Context Edges (dashed, muted) ─── */}
        <g>
          {context.map((edge, i) => {
            const sn = nodeMap.get(edge.source);
            const tn = nodeMap.get(edge.target);
            if (!sn || !tn) return null;

            const curvature = 0.08 + i * 0.04;
            const d = curvedEdgePath(sn.x, sn.y, tn.x, tn.y, curvature);

            return (
              <path
                key={`ctx-${edge.id}`}
                d={d}
                fill="none"
                stroke={CONTEXT_EDGE_COLOR}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                strokeOpacity={0.5}
                strokeLinecap="round"
                style={{ transition: "stroke-opacity 0.2s" }}
                onMouseEnter={(evt) => handleEdgeEnter(edge, evt)}
                onMouseLeave={handleEdgeLeave}
              />
            );
          })}
        </g>

        {/* ── Primary Edges (curved, risk-colored) ─── */}
        <g>
          {primary.map((edge, i) => {
            const sn = nodeMap.get(edge.source);
            const tn = nodeMap.get(edge.target);
            if (!sn || !tn) return null;

            // Angular slot curvature to separate edges visually
            const n = primary.length;
            const curvature =
              n <= 1 ? 0 : ((i - (n - 1) / 2) / Math.max(n - 1, 1)) * 0.25;

            const d = curvedEdgePath(sn.x, sn.y, tn.x, tn.y, curvature);
            const color = edgeRiskColor(edge.abs_correlation);
            const width = Math.max(2, edge.abs_correlation * 4.5);

            const isHovered =
              hoveredId === edge.source || hoveredId === edge.target;

            return (
              <path
                key={`pri-${edge.id}`}
                d={d}
                fill="none"
                stroke={color}
                strokeWidth={isHovered ? width + 1.5 : width}
                strokeOpacity={isHovered ? 1 : 0.8}
                strokeLinecap="round"
                style={{
                  transition: "stroke-width 0.2s, stroke-opacity 0.2s",
                  filter:
                    edge.abs_correlation >= 0.7
                      ? `drop-shadow(0 0 4px ${color}40)`
                      : "none",
                  cursor: "pointer",
                }}
                onMouseEnter={(evt) => handleEdgeEnter(edge, evt)}
                onMouseLeave={handleEdgeLeave}
              />
            );
          })}
        </g>

        {/* ── Nodes ─── */}
        <g>
          {layoutNodes.map((node) => {
            const isSelected = node.id === selectedNodeId;
            const isHovered = hoveredId === node.id;
            const rOuter = node.radius + (isSelected ? 5 : 3);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(evt) => {
                  evt.stopPropagation();
                  onSelectNode(node.id);
                }}
              >
                {/* Selected node glow */}
                {isSelected && (
                  <>
                    <circle
                      r={rOuter + 4}
                      fill="none"
                      stroke="#b5c4ff"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      opacity={0.6}
                    />
                    <circle
                      r={rOuter + 8}
                      fill="none"
                      stroke="rgba(181, 196, 255, 0.08)"
                      strokeWidth={6}
                    />
                  </>
                )}

                {/* Systemic ring */}
                <circle
                  r={rOuter}
                  fill="none"
                  stroke={ringColor(node.systemic_score)}
                  strokeWidth={isSelected ? 3 : 2}
                  style={{ transition: "stroke 0.2s" }}
                />

                {/* Node fill */}
                <circle
                  r={node.radius}
                  fill={NODE_FILL}
                  style={{
                    transition: "fill 0.2s",
                    filter: isHovered ? "brightness(1.2)" : "none",
                  }}
                />

                {/* Label */}
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fill={NODE_TEXT}
                  fontSize={node.radius > 24 ? 13 : 11}
                  fontWeight={isSelected ? 700 : 600}
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    pointerEvents: "none",
                  }}
                >
                  {node.label}
                </text>

                {/* Weight % below node */}
                {node.radius > 18 && (
                  <text
                    textAnchor="middle"
                    dy={node.radius > 24 ? "1.8em" : "1.6em"}
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

                {/* Correlation label on hover (for non-selected nodes) */}
                {isHovered && !isSelected && (
                  <text
                    textAnchor="middle"
                    y={-(node.radius + 10)}
                    fill="#dae2fd"
                    fontSize={10}
                    fontWeight={600}
                    style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      pointerEvents: "none",
                    }}
                  >
                    {(() => {
                      const edge = [...primary, ...context].find(
                        (e) =>
                          (e.source === node.id && e.target === selectedNodeId) ||
                          (e.target === node.id && e.source === selectedNodeId)
                      );
                      return edge ? edge.correlation.toFixed(2) : "";
                    })()}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ── Edge Tooltip ─── */}
      {hoveredEdge && (
        <div
          className="edge-tooltip"
          style={{
            left: Math.min(hoveredEdge.x + 12, panelWidth - 180),
            top: Math.max(hoveredEdge.y - 10, 0),
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {hoveredEdge.edge.source} ↔ {hoveredEdge.edge.target}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <span>
              Dep:{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: edgeRiskColor(hoveredEdge.edge.abs_correlation),
                }}
              >
                {hoveredEdge.edge.correlation.toFixed(2)}
              </span>
            </span>
            <span>
              7D:{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color:
                    hoveredEdge.edge.delta_7d > 0
                      ? "#ffb4ab"
                      : hoveredEdge.edge.delta_7d < 0
                        ? "#a8efb4"
                        : "#c3c5d7",
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
