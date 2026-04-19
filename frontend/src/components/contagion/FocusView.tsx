"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import type { ContagionNode, ContagionEdge, LayoutNode } from "./types";
import {
  dependencyStrength,
  edgeParticleConfig,
  edgeWidthByDependency,
  resolveInfluenceDirection,
} from "./edgeVisuals";

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
const CONTEXT_EDGE_COLOR = "#8a98b1";
const PRIMARY_EDGE_OPACITY = 0.68;
const PRIMARY_EDGE_HOVER_OPACITY = 0.86;
const CONTEXT_EDGE_OPACITY = 0.48;
const CONTEXT_EDGE_HOVER_OPACITY = 0.7;

interface FocusEdges {
  primary: ContagionEdge[];
  context: ContagionEdge[];
}

interface HoveredEdgeState {
  edge: ContagionEdge;
  x: number;
  y: number;
}

interface EdgeParticlesProps {
  d: string;
  count: number;
  durationSeconds: number;
  radius: number;
  reverse: boolean;
  opacity: number;
  edgeId: string;
}

function edgeRiskColor(edge: ContagionEdge): string {
  const strength = dependencyStrength(edge);
  if (strength >= 0.85) return RISK_COLORS.extreme;
  if (strength >= 0.7) return RISK_COLORS.high;
  if (strength >= 0.4) return RISK_COLORS.moderate;
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

function selectFocusEdges(
  selectedId: string,
  edges: ContagionEdge[],
  maxPrimary: number,
  maxContext: number,
): FocusEdges {
  const directEdges = edges.filter(
    (edge) => edge.source === selectedId || edge.target === selectedId,
  );

  const sorted = [...directEdges].sort(
    (left, right) => dependencyStrength(right) - dependencyStrength(left),
  );

  const primaryCount = Math.min(sorted.length, Math.max(0, maxPrimary));
  const contextCount = Math.min(
    Math.max(sorted.length - primaryCount, 0),
    Math.max(0, maxContext),
  );

  return {
    primary: sorted.slice(0, primaryCount),
    context: sorted.slice(primaryCount, primaryCount + contextCount),
  };
}

function computeFocusLayout(
  selectedNode: ContagionNode,
  neighbourNodes: ContagionNode[],
  width: number,
  height: number,
): LayoutNode[] {
  const cx = width * 0.42;
  const cy = height * 0.5;
  const orbitRadius = Math.min(width, height) * 0.34;

  const result: LayoutNode[] = [
    {
      ...selectedNode,
      x: cx,
      y: cy,
      radius: nodeRadius(selectedNode.weight_pct),
    },
  ];

  const neighbourCount = neighbourNodes.length;
  if (neighbourCount === 0) {
    return result;
  }

  const arcSpan = Math.min(Math.PI * 1.4, Math.PI * 0.3 * neighbourCount);
  const startAngle = -arcSpan / 2;
  const sortedNeighbours = [...neighbourNodes].sort(
    (left, right) => right.systemic_score - left.systemic_score || right.weight_pct - left.weight_pct,
  );

  sortedNeighbours.forEach((node, index) => {
    const angle = startAngle + (index / Math.max(neighbourCount - 1, 1)) * arcSpan;
    const nextX = cx + orbitRadius * Math.cos(angle);
    const nextY = cy + orbitRadius * Math.sin(angle);
    const radius = nodeRadius(node.weight_pct);

    result.push({
      ...node,
      x: Math.max(radius + 4, Math.min(width - radius - 4, nextX)),
      y: Math.max(radius + 4, Math.min(height - radius - 4, nextY)),
      radius,
    });
  });

  return result;
}

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
  const nx = -dy * curvature;
  const ny = dx * curvature;
  const cpx = mx + nx;
  const cpy = my + ny;
  return `M ${sx} ${sy} Q ${cpx} ${cpy} ${tx} ${ty}`;
}

function slotCurvature(index: number, total: number, spread: number): number {
  if (total <= 1) return 0;
  return ((index - (total - 1) / 2) / Math.max(total - 1, 1)) * spread;
}

function EdgeParticles({
  d,
  count,
  durationSeconds,
  radius,
  reverse,
  opacity,
  edgeId,
}: EdgeParticlesProps) {
  return (
    <g pointerEvents="none">
      {Array.from({ length: count }).map((_, index) => {
        const offsetSeconds = Number(((durationSeconds / Math.max(count, 1)) * index).toFixed(2));
        return (
          <circle
            key={`${edgeId}-particle-${index}`}
            r={radius}
            fill="#ffffff"
            fillOpacity={opacity}
          >
            <animateMotion
              dur={`${durationSeconds}s`}
              repeatCount="indefinite"
              path={d}
              begin={`-${offsetSeconds}s`}
              calcMode="linear"
              keyPoints={reverse ? "1;0" : "0;1"}
              keyTimes="0;1"
            />
            <animate
              attributeName="opacity"
              values={`0;${opacity};${opacity};0`}
              dur={`${durationSeconds}s`}
              repeatCount="indefinite"
              begin={`-${offsetSeconds}s`}
            />
          </circle>
        );
      })}
    </g>
  );
}

interface Props {
  nodes: ContagionNode[];
  edges: ContagionEdge[];
  selectedNodeId: string;
  maxPrimaryLinks: number;
  maxContextLinks: number;
  onSelectNode: (id: string) => void;
}

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
  const [hoveredEdge, setHoveredEdge] = useState<HoveredEdgeState | null>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) setPanelWidth(width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const svgHeight = useMemo(() => {
    if (panelWidth < 340) return 300;
    if (panelWidth < 520) return 340;
    return Math.min(420, Math.max(340, panelWidth * 0.72));
  }, [panelWidth]);

  const nodeLookup = useMemo(
    () => new Map(nodes.map((node) => [node.id, node])),
    [nodes],
  );

  const { primary, context } = useMemo(
    () => selectFocusEdges(selectedNodeId, edges, maxPrimaryLinks, maxContextLinks),
    [selectedNodeId, edges, maxPrimaryLinks, maxContextLinks],
  );

  const neighbourIds = useMemo(() => {
    const ids = new Set<string>();
    for (const edge of [...primary, ...context]) {
      if (edge.source === selectedNodeId) ids.add(edge.target);
      if (edge.target === selectedNodeId) ids.add(edge.source);
    }
    return ids;
  }, [primary, context, selectedNodeId]);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.id === selectedNodeId),
    [nodes, selectedNodeId],
  );

  const neighbourNodes = useMemo(
    () => nodes.filter((node) => neighbourIds.has(node.id)),
    [nodes, neighbourIds],
  );

  const layoutNodes = useMemo(
    () =>
      selectedNode
        ? computeFocusLayout(selectedNode, neighbourNodes, panelWidth, svgHeight)
        : [],
    [selectedNode, neighbourNodes, panelWidth, svgHeight],
  );

  const nodeMap = useMemo(
    () => new Map(layoutNodes.map((node) => [node.id, node])),
    [layoutNodes],
  );

  const handleEdgeEnter = useCallback((edge: ContagionEdge, evt: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHoveredEdge({
      edge,
      x: evt.clientX - rect.left,
      y: evt.clientY - rect.top,
    });
  }, []);

  const handleEdgeLeave = useCallback(() => {
    setHoveredEdge(null);
  }, []);

  const handleNodeEnter = useCallback((id: string) => {
    setHoveredId(id);
    setHoveredEdge(null);
  }, []);

  const handleNodeLeave = useCallback(() => {
    setHoveredId(null);
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

  const hoveredDirection = hoveredEdge
    ? resolveInfluenceDirection(
        hoveredEdge.edge,
        nodeLookup.get(hoveredEdge.edge.source),
        nodeLookup.get(hoveredEdge.edge.target),
      )
    : null;

  return (
    <div
      ref={containerRef}
      className="focus-panel"
      style={{ width: "100%", position: "relative" }}
    >
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
          - {selectedNode.label} neighbourhood
        </span>
      </div>

      <svg
        width={panelWidth}
        height={svgHeight}
        viewBox={`0 0 ${panelWidth} ${svgHeight}`}
        style={{ display: "block" }}
      >
        <g>
          {context.map((edge, index) => {
            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);
            if (!sourceNode || !targetNode) return null;

            const curvature = slotCurvature(index, context.length, 0.18);
            const d = curvedEdgePath(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, curvature);
            const particleConfig = edgeParticleConfig(edge, 4);
            const direction = resolveInfluenceDirection(
              edge,
              nodeLookup.get(edge.source),
              nodeLookup.get(edge.target),
            );
            const isActive =
              hoveredEdge?.edge.id === edge.id ||
              hoveredId === edge.source ||
              hoveredId === edge.target;
            const width = Math.max(
              1.2,
              edgeWidthByDependency(edge, { min: 1.6, max: 4.2, curve: 1.15 }) * 0.58,
            );

            return (
              <g key={`ctx-${edge.id}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={CONTEXT_EDGE_COLOR}
                  strokeWidth={isActive ? width + 0.35 : width}
                  strokeDasharray="7 5"
                  strokeOpacity={isActive ? CONTEXT_EDGE_HOVER_OPACITY : CONTEXT_EDGE_OPACITY}
                  strokeLinecap="round"
                  style={{ transition: "stroke-width 0.2s, stroke-opacity 0.2s" }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(width + 10, 12)}
                  strokeLinecap="round"
                  onMouseEnter={(evt) => handleEdgeEnter(edge, evt)}
                  onMouseLeave={handleEdgeLeave}
                />
                <EdgeParticles
                  d={d}
                  count={particleConfig.count}
                  durationSeconds={Number((particleConfig.durationSeconds * 1.08).toFixed(2))}
                  radius={Math.max(1.05, Number((particleConfig.radius * 0.72).toFixed(2)))}
                  reverse={direction.fromId === edge.target}
                  opacity={isActive ? 0.76 : 0.62}
                  edgeId={`ctx-${edge.id}`}
                />
              </g>
            );
          })}
        </g>

        <g>
          {primary.map((edge, index) => {
            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);
            if (!sourceNode || !targetNode) return null;

            const curvature = slotCurvature(index, primary.length, 0.24);
            const d = curvedEdgePath(sourceNode.x, sourceNode.y, targetNode.x, targetNode.y, curvature);
            const color = edgeRiskColor(edge);
            const particleConfig = edgeParticleConfig(edge, 6);
            const direction = resolveInfluenceDirection(
              edge,
              nodeLookup.get(edge.source),
              nodeLookup.get(edge.target),
            );
            const isActive =
              hoveredEdge?.edge.id === edge.id ||
              hoveredId === edge.source ||
              hoveredId === edge.target;
            const width = edgeWidthByDependency(edge, { min: 2.2, max: 6.1, curve: 1.1 });

            return (
              <g key={`pri-${edge.id}`}>
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? width + 0.7 : width}
                  strokeOpacity={isActive ? PRIMARY_EDGE_HOVER_OPACITY : PRIMARY_EDGE_OPACITY}
                  strokeLinecap="round"
                  style={{
                    transition: "stroke-width 0.2s, stroke-opacity 0.2s",
                    filter: dependencyStrength(edge) >= 0.7 ? `drop-shadow(0 0 4px ${color}40)` : "none",
                  }}
                />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(width + 10, 12)}
                  strokeLinecap="round"
                  onMouseEnter={(evt) => handleEdgeEnter(edge, evt)}
                  onMouseLeave={handleEdgeLeave}
                />
                <EdgeParticles
                  d={d}
                  count={particleConfig.count}
                  durationSeconds={particleConfig.durationSeconds}
                  radius={particleConfig.radius}
                  reverse={direction.fromId === edge.target}
                  opacity={isActive ? 1 : 0.92}
                  edgeId={`pri-${edge.id}`}
                />
              </g>
            );
          })}
        </g>

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
                onMouseEnter={() => handleNodeEnter(node.id)}
                onMouseLeave={handleNodeLeave}
                onClick={(evt) => {
                  evt.stopPropagation();
                  onSelectNode(node.id);
                }}
              >
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

                <circle
                  r={rOuter}
                  fill="none"
                  stroke={ringColor(node.systemic_score)}
                  strokeWidth={isSelected ? 3 : 2}
                  style={{ transition: "stroke 0.2s" }}
                />

                <circle
                  r={node.radius}
                  fill={NODE_FILL}
                  style={{
                    transition: "fill 0.2s",
                    filter: isHovered ? "brightness(1.2)" : "none",
                  }}
                />

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
                      const directEdge = [...primary, ...context].find(
                        (edge) =>
                          (edge.source === node.id && edge.target === selectedNodeId) ||
                          (edge.target === node.id && edge.source === selectedNodeId),
                      );
                      return directEdge ? dependencyStrength(directEdge).toFixed(2) : "";
                    })()}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {hoveredEdge && (
        <div
          className="edge-tooltip"
          style={{
            left: Math.min(hoveredEdge.x + 12, panelWidth - 200),
            top: Math.max(hoveredEdge.y - 10, 0),
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            {hoveredDirection
              ? `${hoveredDirection.fromId} -> ${hoveredDirection.toId}`
              : `${hoveredEdge.edge.source} <-> ${hoveredEdge.edge.target}`}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            <span>
              Dep:{" "}
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  color: edgeRiskColor(hoveredEdge.edge),
                }}
              >
                {dependencyStrength(hoveredEdge.edge).toFixed(2)}
              </span>
            </span>
            <span>
              Corr:{" "}
              <span style={{ fontFamily: "var(--font-mono)" }}>
                {hoveredEdge.edge.correlation.toFixed(2)}
              </span>
            </span>
          </div>
          <div style={{ marginTop: 4, display: "flex", gap: 16 }}>
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
            <span>
              {hoveredEdge.edge.band} | {hoveredEdge.edge.trend}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
