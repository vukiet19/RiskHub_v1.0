/**
 * Contagion Module — Shared Types
 * ================================
 * Aligned with the Integration Brief contract.
 * These types are the single source of truth for the frontend contagion module.
 */

// ── Node ──────────────────────────────────────────────────────────────────

export interface ContagionNode {
  id: string;
  label: string;
  value_usd: number;
  weight_pct: number;
  daily_move_pct: number;
  systemic_score: number;
  cluster_id: string;
  cluster_role: "hub" | "core" | "bridge" | "peripheral" | "member";
  flags: string[];
  top_correlations: TopCorrelation[];
  /** Optional backend display priority (lower = more important). */
  display_priority?: number;
}

export interface TopCorrelation {
  asset: string;
  correlation: number;
  delta_7d: number;
  band?: "high" | "moderate" | "low";
  trend?: "tightening" | "loosening" | "stable";
}

// ── Edge ──────────────────────────────────────────────────────────────────

export interface ContagionEdge {
  id: string;
  source: string;
  target: string;
  correlation: number;
  abs_correlation: number;
  delta_7d: number;
  band: "high" | "moderate" | "low";
  trend: "tightening" | "loosening" | "stable";
  display_strength: number;
  topology_role: "primary" | "secondary" | "context" | "hidden_candidate";
  /** Whether the backend explicitly marks this edge for overview rendering. */
  overview_visible?: boolean;
  /** Whether this edge is a candidate for focus rendering. */
  focus_candidate?: boolean;
  /** Combined portfolio weight of both endpoints. */
  combined_weight_pct?: number;
}

// ── Cluster ───────────────────────────────────────────────────────────────

export interface ContagionCluster {
  id: string;
  label: string;
  members: string[];
  member_count: number;
  total_weight_pct: number;
  systemic_asset: string;
  risk_level: "high" | "elevated" | "moderate" | "low";
}

// ── Summary ───────────────────────────────────────────────────────────────

export interface LargestClusterSummary {
  cluster_id: string;
  label: string;
  member_count: number;
  total_weight_pct: number;
  systemic_asset: string;
}

export interface ContagionSummary {
  contagion_risk_score: number;
  contagion_risk_delta_7d: number;
  systemic_asset: string | null;
  top_risk_pair: {
    source: string;
    target: string;
    correlation: number;
    delta_7d: number;
  } | null;
  largest_cluster: LargestClusterSummary | string | null;
  network_density: number;
  insight: string;
}

// ── Display Guidance ──────────────────────────────────────────────────────

export interface DisplayGuidance {
  default_selected_asset: string | null;
  overview: {
    node_ids: string[];
    edge_ids: string[];
    note?: string;
  };
  focus: {
    max_primary_links: number;
    max_context_links: number;
  };
}

// ── Top-Level Payload ─────────────────────────────────────────────────────

export interface ContagionData {
  generated_at: string;
  window_days: number;
  regime: {
    label: "calm" | "elevated" | "stress";
    reason: string;
  };
  summary: ContagionSummary;
  nodes: ContagionNode[];
  edges: ContagionEdge[];
  clusters: ContagionCluster[];
  display: DisplayGuidance;
  _demo?: boolean;
}

// ── API Response Envelope ─────────────────────────────────────────────────

export type ContagionScope = "all" | "binance" | "okx";
export type ContagionMode = "all" | "spot" | "future";

export type ContagionSourceState =
  | "live"
  | "demo"
  | "no_connection"
  | "insufficient_holdings"
  | "error";

export interface ContagionApiResponse {
  status?: string;
  scope?: ContagionScope;
  scope_label?: string;
  mode?: ContagionMode;
  mode_label?: string;
  market_data_source?: string | null;
  data?: ContagionData;
  source_state?: ContagionSourceState;
  message?: string | null;
  warnings?: string[];
}

// ── Layout helpers ────────────────────────────────────────────────────────

export interface LayoutNode extends ContagionNode {
  x: number;
  y: number;
  radius: number;
}
