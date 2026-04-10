/**
 * Contagion Module — Network Overview Panel
 * ==========================================
 * Compressed topology view showing global network structure.
 * Uses deterministic radial cluster layout, NOT force simulation.
 * Renders only the sparse edge set from display.overview.edge_ids.
 *
 * Contract alignment:
 *   - node size = portfolio weight
 *   - node ring = systemic importance
 *   - edge thickness = dependency strength
 *   - edge color = risk gradient
 *   - sparse edge set only
 */

"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import type { ContagionNode, ContagionEdge, ContagionCluster, LayoutNode } from "./types";

// ── Constants ────────────────────────────────────────────────────────────

const BAND_COLORS: Record<string, string> = {
  high: "#ffb4ab",
  moderate: "#ffb59a",
  low: "#6b7280",
};

const RING_COLORS = {
  high: "#ffb4ab",
  mid: "#ffb59a",
  low: "#b5c4ff",
};

const NODE_FILL = "#31394d";
const NODE_FILL_DIM = "#1e2536";
const NODE_TEXT = "#dae2fd";
const NODE_TEXT_DIM = "#5a6177";

// ── Deterministic Cluster Layout ─────────────────────────────────────────

function computeOverviewLayout(
  nodes: ContagionNode[],
  clusters: ContagionCluster[],
  width: number,
  height: number,
): LayoutNode[] {
  const n = nodes.length;
  if (n === 0) return [];

  const cx = width / 2;
  const cy = height / 2;
  const outerRadius = Math.min(width, height) * 0.36;

  // Group nodes by cluster
  const clusterMap = new Map<string, ContagionNode[]>();
  for (const node of nodes) {
    const cid = node.cluster_id || "unclustered";
    if (!clusterMap.has(cid)) clusterMap.set(cid, []);
    clusterMap.get(cid)!.push(node);
  }

  // Sort clusters by total weight (largest cluster gets top position)
  const sortedClusters = Array.from(clusterMap.entries()).sort(
    (a, b) => {
      const wA = a[1].reduce((s, n) => s + n.weight_pct, 0);
      const wB = b[1].reduce((s, n) => s + n.weight_pct, 0);
      return wB - wA;
    }
  );

  const result: LayoutNode[] = [];
  const clusterCount = sortedClusters.length;

  sortedClusters.forEach(([, clusterNodes], ci) => {
    // Cluster center angle (distribute around circle)
    const clusterAngle = (ci / Math.max(clusterCount, 1)) * 2 * Math.PI - Math.PI / 2;
    const clusterCx = cx + outerRadius * 0.55 * Math.cos(clusterAngle);
    const clusterCy = cy + outerRadius * 0.55 * Math.sin(clusterAngle);

    // Sort nodes within cluster by systemic score (hub in center)
    const sorted = [...clusterNodes].sort(
      (a, b) => b.systemic_score - a.systemic_score
    );

    const nodeCount = sorted.length;
    const intraRadius = Math.min(outerRadius * 0.35, 30 + nodeCount * 12);

    sorted.forEach((node, ni) => {
      let nx: number, ny: number;
      if (ni === 0 && nodeCount > 1) {
        // Hub node at cluster center
        nx = clusterCx;
        ny = clusterCy;
      } else {
        // Satellite nodes around cluster center
        const slotAngle =
          ((ni - (nodeCount > 1 ? 1 : 0)) / Math.max(nodeCount - 1, 1)) *
            2 *
            Math.PI +
          clusterAngle;
        nx = clusterCx + intraRadius * Math.cos(slotAngle);
        ny = clusterCy + intraRadius * Math.sin(slotAngle);
      }

      // Clamp to viewport
      const r = nodeRadius(node.weight_pct);
      nx = Math.max(r + 4, Math.min(width - r - 4, nx));
      ny = Math.max(r + 4, Math.min(height - r - 4, ny));

      result.push({ ...node, x: nx, y: ny, radius: r });
    });
  });

  return result;
}

function nodeRadius(weightPct: number): number {
  return Math.max(10, Math.min(26, 6 + weightPct * 0.5));
}

function ringColor(score: number): string {
  if (score > 70) return RING_COLORS.high;
  if (score > 40) return RING_COLORS.mid;
  return RING_COLORS.low;
}

// ── Props ────────────────────────────────────────────────────────────────

interface Props {
  nodes: ContagionNode[];
  edges: ContagionEdge[];
  clusters: ContagionCluster[];
  overviewEdgeIds: string[];
  selectedNodeId: string | null;
  onSelectNode: (id: string) => void;
}

// ── Component ────────────────────────────────────────────────────────────

export function NetworkOverview({
  nodes,
  edges,
  clusters,
  overviewEdgeIds,
  selectedNodeId,
  onSelectNode,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(280);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

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

  const svgHeight = useMemo(() => {
    if (panelWidth < 240) return 240;
    if (panelWidth < 320) return 270;
    return Math.min(320, Math.max(280, panelWidth * 0.82));
  }, [panelWidth]);

  const layoutNodes = useMemo(
    () => computeOverviewLayout(nodes, clusters, panelWidth, svgHeight),
    [nodes, clusters, panelWidth, svgHeight]
  );

  const nodeMap = useMemo(
    () => new Map(layoutNodes.map((n) => [n.id, n])),
    [layoutNodes]
  );

  // Filter edges to only those in the overview set
  const overviewEdgeSet = useMemo(
    () => new Set(overviewEdgeIds),
    [overviewEdgeIds]
  );

  const visibleEdges = useMemo(
    () => {
      if (overviewEdgeSet.size > 0) {
        return edges.filter((e) => overviewEdgeSet.has(e.id));
      }
      // Fallback: if no guidance, use primary and secondary
      return edges.filter(
        (e) => e.topology_role === "primary" || e.topology_role === "secondary"
      );
    },
    [edges, overviewEdgeSet]
  );

  // Edge styling
  const edgeWidth = (absCorr: number) => Math.max(1, absCorr * 3);

  const handleNodeClick = useCallback(
    (id: string, evt: React.MouseEvent) => {
      evt.stopPropagation();
      onSelectNode(id);
    },
    [onSelectNode]
  );

  return (
    <div
      ref={containerRef}
      className="overview-panel"
      style={{ width: "100%" }}
    >
      {/* Panel label */}
      <div className="panel-label">Network Overview</div>

      <svg
        width={panelWidth}
        height={svgHeight}
        viewBox={`0 0 ${panelWidth} ${svgHeight}`}
        style={{ display: "block" }}
      >
        {/* Edges */}
        <g>
          {visibleEdges.map((edge) => {
            const sn = nodeMap.get(edge.source);
            const tn = nodeMap.get(edge.target);
            if (!sn || !tn) return null;

            const isHighlighted =
              hoveredId === edge.source ||
              hoveredId === edge.target ||
              selectedNodeId === edge.source ||
              selectedNodeId === edge.target;

            return (
              <line
                key={edge.id}
                x1={sn.x}
                y1={sn.y}
                x2={tn.x}
                y2={tn.y}
                stroke={BAND_COLORS[edge.band] || BAND_COLORS.low}
                strokeWidth={isHighlighted ? edgeWidth(edge.abs_correlation) + 1 : edgeWidth(edge.abs_correlation)}
                strokeOpacity={isHighlighted ? 0.85 : 0.4}
                strokeLinecap="round"
                style={{ transition: "stroke-opacity 0.2s, stroke-width 0.2s" }}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {layoutNodes.map((node) => {
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredId === node.id;
            const dimmed = hoveredId !== null && !isHovered && selectedNodeId !== node.id;
            const rOuter = node.radius + 2;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: "pointer", transition: "opacity 0.2s" }}
                opacity={dimmed ? 0.35 : 1}
                onMouseEnter={() => setHoveredId(node.id)}
                onMouseLeave={() => setHoveredId(null)}
                onClick={(evt) => handleNodeClick(node.id, evt)}
              >
                {/* Selection ring */}
                {isSelected && (
                  <circle
                    r={rOuter + 3}
                    fill="none"
                    stroke="#b5c4ff"
                    strokeWidth={1.5}
                    strokeDasharray="3 2"
                    opacity={0.8}
                  />
                )}

                {/* Systemic importance ring */}
                <circle
                  r={rOuter}
                  fill="none"
                  stroke={dimmed ? NODE_FILL_DIM : ringColor(node.systemic_score)}
                  strokeWidth={isSelected ? 2 : 1.5}
                  style={{ transition: "stroke 0.2s" }}
                />

                {/* Node circle */}
                <circle
                  r={node.radius}
                  fill={dimmed ? NODE_FILL_DIM : NODE_FILL}
                  style={{ transition: "fill 0.2s" }}
                />

                {/* Label */}
                <text
                  textAnchor="middle"
                  dy="0.35em"
                  fill={dimmed ? NODE_TEXT_DIM : NODE_TEXT}
                  fontSize={node.radius > 16 ? 9 : 7}
                  fontWeight={600}
                  style={{
                    fontFamily: "'Inter', system-ui, sans-serif",
                    pointerEvents: "none",
                    transition: "fill 0.2s",
                  }}
                >
                  {node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}
