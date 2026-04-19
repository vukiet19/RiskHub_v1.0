import type { ContagionEdge, ContagionNode } from "./types";

interface EdgeWidthConfig {
  min: number;
  max: number;
  curve?: number;
}

interface ParticleConfig {
  count: number;
  durationSeconds: number;
  radius: number;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function safeNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

export function dependencyStrength(edge: ContagionEdge): number {
  const displayStrength = safeNumber(edge.display_strength);
  const absCorrelation = safeNumber(edge.abs_correlation) ?? 0;
  const correlation = Math.abs(safeNumber(edge.correlation) ?? 0);
  return clamp01(Math.max(displayStrength ?? 0, absCorrelation, correlation));
}

export function edgeWidthByDependency(edge: ContagionEdge, config: EdgeWidthConfig): number {
  const strength = dependencyStrength(edge);
  const curve = config.curve ?? 1.2;
  const eased = Math.pow(strength, curve);
  return config.min + eased * (config.max - config.min);
}

export function edgeParticleConfig(edge: ContagionEdge, maxParticles: number): ParticleConfig {
  const strength = dependencyStrength(edge);
  const count = Math.max(1, Math.min(maxParticles, 1 + Math.round(strength * (maxParticles - 1))));
  const durationSeconds = Number((4.8 - strength * 2.6).toFixed(2));
  const radius = Number((1.3 + strength * 1.6).toFixed(2));
  return { count, durationSeconds, radius };
}

function hasNodeFlag(node: ContagionNode | undefined, flag: string): boolean {
  if (!node) return false;
  return Array.isArray(node.flags) && node.flags.includes(flag);
}

export function resolveInfluenceDirection(
  edge: ContagionEdge,
  sourceNode?: ContagionNode,
  targetNode?: ContagionNode,
): { fromId: string; toId: string } {
  if (!sourceNode || !targetNode) {
    return { fromId: edge.source, toId: edge.target };
  }

  const sourceShock = hasNodeFlag(sourceNode, "shock_source");
  const targetShock = hasNodeFlag(targetNode, "shock_source");
  if (sourceShock !== targetShock) {
    return sourceShock
      ? { fromId: sourceNode.id, toId: targetNode.id }
      : { fromId: targetNode.id, toId: sourceNode.id };
  }

  const sourceHub = hasNodeFlag(sourceNode, "dominant_hub");
  const targetHub = hasNodeFlag(targetNode, "dominant_hub");
  if (sourceHub !== targetHub) {
    return sourceHub
      ? { fromId: sourceNode.id, toId: targetNode.id }
      : { fromId: targetNode.id, toId: sourceNode.id };
  }

  const systemicDelta = sourceNode.systemic_score - targetNode.systemic_score;
  if (Math.abs(systemicDelta) >= 0.5) {
    return systemicDelta > 0
      ? { fromId: sourceNode.id, toId: targetNode.id }
      : { fromId: targetNode.id, toId: sourceNode.id };
  }

  const moveDelta = Math.abs(sourceNode.daily_move_pct) - Math.abs(targetNode.daily_move_pct);
  if (Math.abs(moveDelta) >= 0.15) {
    return moveDelta > 0
      ? { fromId: sourceNode.id, toId: targetNode.id }
      : { fromId: targetNode.id, toId: sourceNode.id };
  }

  const weightDelta = sourceNode.weight_pct - targetNode.weight_pct;
  if (Math.abs(weightDelta) >= 0.2) {
    return weightDelta > 0
      ? { fromId: sourceNode.id, toId: targetNode.id }
      : { fromId: targetNode.id, toId: sourceNode.id };
  }

  return { fromId: edge.source, toId: edge.target };
}
