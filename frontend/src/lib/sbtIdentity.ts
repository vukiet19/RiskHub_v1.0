export type LoadState = "loading" | "ready" | "partial" | "error";
export type EligibilityState = "unknown" | "checking" | "eligible" | "ineligible";
export type IssuanceState =
  | "not_started"
  | "ready"
  | "issued_demo"
  | "refreshed_demo"
  | "revoked_demo";
export type TimelineTone = "info" | "success" | "warning" | "danger";
export type PrimaryActionKey = "connect" | "check" | "preview" | "issue" | "issued";

export interface ExchangeConnection {
  exchange_id?: string;
  is_active?: boolean;
  label?: string | null;
}

export interface ExchangeMetrics {
  exchange_id?: string;
  trade_count?: number;
  win_rate_pct?: string | number;
  avg_leverage?: string | number;
  net_pnl_usd?: string | number;
}

export interface DashboardOverview {
  total_portfolio_value?: number;
  total_unrealized_pnl?: number;
  net_pnl_usd?: number;
  discipline_score?: number;
  discipline_grade?: string;
  max_drawdown_pct?: number;
  metrics_by_exchange?: ExchangeMetrics[];
  exchange_connections?: ExchangeConnection[];
  last_refresh_at?: string | null;
  data_freshness?: {
    state?: string;
    live_account_snapshot_at?: string | null;
    metrics_calculated_at?: string | null;
  };
  has_configured_exchange_connection?: boolean;
  has_live_exchange_connection?: boolean;
  warnings?: string[];
}

export interface DashboardMetrics {
  calculated_at?: string | null;
  window_days?: number;
  trade_count?: number;
  discipline_score?: {
    total?: number;
    grade?: string;
    trend?: string;
    components?: {
      leverage_consistency?: number;
      trade_frequency?: number;
      post_loss_behavior?: number;
      win_rate_consistency?: number;
      drawdown_control?: number;
    };
  };
  max_drawdown?: {
    value_pct?: string | number;
  };
  win_rate?: {
    value_pct?: string | number;
    wins?: number;
    losses?: number;
    breakeven?: number;
  };
  leverage?: {
    average?: string | number;
    median?: string | number;
    max_used?: number;
    std_dev?: string | number;
    over_20x_pct?: string | number;
  };
  by_exchange?: ExchangeMetrics[];
  net_pnl_usd?: string | number;
  profit_factor?: string | number;
  sharpe_ratio?: string | number;
  active_rule_flags?: string[];
  sbt_payload_hash?: string | null;
  sbt_ready?: boolean;
  schema_version?: number;
}

export interface MetricsResponse {
  status?: string;
  data?: DashboardMetrics;
}

export interface HistoryPoint {
  calculated_at?: string;
  discipline_score?: {
    total?: number;
    grade?: string;
  };
}

export interface HistoryResponse {
  status?: string;
  data?: HistoryPoint[];
}

export interface ApiAlert {
  _id?: string;
  rule_id?: string;
  rule_name?: string;
  severity?: string;
  title?: string;
  message?: string;
  triggered_at?: string;
}

export interface AlertsResponse {
  status?: string;
  alerts?: ApiAlert[];
}

export interface ContagionRiskPair {
  source?: string | null;
  target?: string | null;
  correlation?: string | number | null;
  delta_7d?: string | number | null;
}

export interface RiskAnalysisPayload {
  status?: string;
  source_state?: string;
  generated_at?: string | null;
  message?: string | null;
  warnings?: string[];
  risk_score_total?: string | number;
  risk_components?: {
    concentration_score?: string | number;
    leverage_score?: string | number;
    drawdown_score?: string | number;
    contagion_score?: string | number;
  };
  concentration_summary?: {
    top_asset?: string | null;
    top_asset_pct?: string | number;
    largest_cluster?: {
      label?: string | null;
      systemic_asset?: string | null;
    } | null;
    largest_cluster_pct?: string | number;
    dominant_exchange?: string | null;
    dominant_exchange_pct?: string | number;
    insight?: string | null;
  };
  leverage_summary?: {
    effective_leverage?: string | number;
    average_leverage?: string | number;
    max_leverage?: string | number;
    total_notional?: string | number;
    insight?: string | null;
  };
  drawdown_summary?: {
    current_drawdown_pct?: string | number;
    total_unrealized_pnl?: string | number;
    worst_position_symbol?: string | null;
    worst_position_pnl?: string | number;
    insight?: string | null;
  };
  contagion_summary?: {
    available?: boolean;
    source_state?: string;
    contagion_risk_score?: string | number;
    contagion_risk_delta_7d?: string | number;
    systemic_asset?: string | null;
    top_risk_pair?: string | ContagionRiskPair | null;
    largest_cluster?: string | null;
    network_density?: string | number;
    insight?: string | null;
  };
  quant_summary?: {
    available?: boolean;
    trade_count?: number;
    profit_factor?: string | number | null;
    profit_factor_display?: string | null;
    sharpe_ratio?: string | number | null;
    window_days?: number;
    insight?: string | null;
  };
  source_details?: {
    has_configured_connection?: boolean;
    holdings_count?: number;
    position_count?: number;
    market_data_source_effective?: string | null;
  };
  top_risk_contributors?: Array<Record<string, unknown>>;
  attention_items?: Array<Record<string, unknown>>;
}

export type ProfileComparisonState =
  | "up_to_date"
  | "changed_since_save"
  | "incomplete_snapshot"
  | "cannot_compare"
  | "no_saved_profile";
export type ProfileCompareTarget = "latest_snapshot" | "latest_saved" | "previous_saved" | "saved_profile";

export interface RiskProfileEligibility {
  status?: "eligible" | "ineligible";
  reason?: string;
  preview_allowed?: boolean;
  met?: string[];
  missing?: string[];
  blockers?: string[];
}

export interface RiskProfileLeverageSnapshot {
  average?: number | null;
  maximum?: number | null;
}

export interface RiskProfileSnapshot {
  _id?: string;
  profile_id?: string;
  user_id?: string;
  wallet_address?: string | null;
  saved_at?: string | null;
  version?: number | null;
  source_snapshot_at?: string | null;
  identity_tier?: string;
  risk_level?: string;
  discipline_score?: number | null;
  discipline_grade?: string;
  total_risk_score?: number | null;
  max_drawdown_pct?: number | null;
  leverage?: RiskProfileLeverageSnapshot | null;
  contagion_score?: number | null;
  top_asset?: string | null;
  top_asset_concentration_pct?: number | null;
  active_exchanges?: number;
  configured_exchanges?: number;
  trade_activity_count?: number;
  position_count?: number;
  behavior_flags_summary?: string[];
  source_state?: string;
  profile_status?: string;
  warnings?: string[];
  profile_hash?: string;
  eligibility?: RiskProfileEligibility;
  metadata?: Record<string, unknown>;
}

export interface CurrentRiskProfileResponse {
  status?: string;
  generated_at?: string;
  profile?: RiskProfileSnapshot | null;
}

export interface SavedRiskProfileResponse {
  status?: string;
  exists?: boolean;
  profile?: RiskProfileSnapshot | null;
  message?: string;
}

export interface SaveRiskProfileResponse {
  status?: string;
  profile?: RiskProfileSnapshot | null;
  message?: string;
}

export interface RiskProfileHistoryResponse {
  status?: string;
  count?: number;
  profiles?: RiskProfileSnapshot[];
  latest_profile_id?: string | null;
  message?: string;
}

export interface SingleRiskProfileResponse {
  status?: string;
  profile?: RiskProfileSnapshot | null;
  message?: string;
}

export interface RiskProfileCompareChange {
  key?: string;
  label?: string;
  base?: string;
  target?: string;
  saved?: string;
  current?: string;
  change_state?: "same" | "changed" | "unavailable";
  delta?: number | null;
}

export interface RiskProfileCompareResponse {
  status?: string;
  has_saved_profile?: boolean;
  comparison_state?: ProfileComparisonState;
  message?: string;
  current_profile?: RiskProfileSnapshot | null;
  saved_profile?: RiskProfileSnapshot | null;
  base_profile?: RiskProfileSnapshot | null;
  target_profile?: RiskProfileSnapshot | null;
  base_profile_id?: string | null;
  target_profile_id?: string | null;
  base_label?: string;
  target_label?: string;
  target_kind?: ProfileCompareTarget | string;
  matches_saved_hash?: boolean;
  changed_fields?: number;
  changes?: RiskProfileCompareChange[];
}

export interface EligibilityResult {
  status: "eligible" | "ineligible";
  met: string[];
  missing: string[];
  blockers: string[];
  previewAllowed: boolean;
  reason: string;
}

export interface IdentityRecord {
  tokenId: string;
  ownerWallet: string;
  issuedAt: string;
  reviewAt: string;
  version: number;
  revoked: boolean;
  sourceProfileId?: string | null;
  sourceProfileVersion?: number | null;
  sourceProfileHash?: string | null;
  sourceIdentityTier?: string | null;
  sourceRiskLevel?: string | null;
  sourceLabel?: string | null;
}

export interface TimelineEvent {
  id: string;
  title: string;
  detail: string;
  at: string;
  tone: TimelineTone;
}

export interface BehaviorFlag {
  key: string;
  label: string;
  state: "flagged" | "clear" | "unavailable";
  detail: string;
}

export interface IdentityMetadata {
  token_id: string;
  owner_wallet: string;
  identity_tier: string;
  risk_level: string;
  profile_hash: string;
  metadata_uri: string;
  issued_at: string | null;
  review_at: string | null;
  version: number;
  revoked: boolean;
}

export interface SummaryMetric {
  label: string;
  value: string;
  hint: string;
}

export interface SummaryGroup {
  key: "discipline" | "risk" | "activity";
  title: string;
  description: string;
  metrics: SummaryMetric[];
}

export const MOCK_WALLETS = [
  "0x4B61C6A220fB0A9D26B2Aa90E7465Af0C8A96210",
  "0x81D86ecA2a8EbD7A94A14a6387BbF91D92f1B6C4",
  "0xF2170D6D1f9a893CA9d5A4f5C1a5F0238A40bE71",
];

export function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function toStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

export function formatDateTime(value: string | null | undefined, fallback = "Not available"): string {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatCurrency(value: unknown, fallback = "--"): string {
  const numeric = toNumber(value);
  if (numeric === null) return fallback;
  return `$${numeric.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatPercent(value: unknown, digits = 1, fallback = "--"): string {
  const numeric = toNumber(value);
  if (numeric === null) return fallback;
  return `${numeric.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}%`;
}

export function formatNumber(value: unknown, digits = 1, fallback = "--"): string {
  const numeric = toNumber(value);
  if (numeric === null) return fallback;
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function compactWallet(value: string | null): string {
  if (!value) return "Not connected";
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function formatContagionRiskPair(value: unknown, fallback = "No dominant pair returned."): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const pair = value as ContagionRiskPair;
  const source = typeof pair.source === "string" ? pair.source.trim() : "";
  const target = typeof pair.target === "string" ? pair.target.trim() : "";

  if (!source || !target) {
    return fallback;
  }

  const parts = [`${source}/${target}`];
  const correlation = toNumber(pair.correlation);
  const delta7d = toNumber(pair.delta_7d);

  if (correlation !== null) {
    parts.push(`corr ${correlation.toFixed(2)}`);
  }

  if (delta7d !== null) {
    parts.push(`7d ${delta7d >= 0 ? "+" : ""}${delta7d.toFixed(1)}`);
  }

  return parts.join(" | ");
}

export function simpleHash(input: string): string {
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return `demo_${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createTimelineEvent(title: string, detail: string, tone: TimelineTone): TimelineEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    detail,
    tone,
    at: new Date().toISOString(),
  };
}

export function deriveDisciplineTrend(history: HistoryPoint[], fallback?: string | null): string {
  if (fallback && fallback.trim().length > 0) {
    return fallback;
  }
  if (history.length < 2) return "stable";
  const latest = toNumber(history[history.length - 1]?.discipline_score?.total);
  const previous = toNumber(history[history.length - 2]?.discipline_score?.total);
  if (latest === null || previous === null) return "stable";
  if (latest - previous >= 3) return "improving";
  if (previous - latest >= 3) return "declining";
  return "stable";
}

export function buildBehaviorFlags(
  activeFlags: string[],
  alerts: ApiAlert[],
  hasAnyBehaviorData: boolean,
): BehaviorFlag[] {
  const matches = (pattern: RegExp) =>
    activeFlags.some((flag) => pattern.test(flag)) ||
    alerts.some((alert) =>
      pattern.test(
        `${alert.rule_id ?? ""} ${alert.rule_name ?? ""} ${alert.title ?? ""} ${alert.message ?? ""}`,
      ),
    );

  const unavailableDetail = "RiskHub has not returned enough behavior data yet.";

  return [
    {
      key: "revenge",
      label: "Revenge trading",
      state: !hasAnyBehaviorData ? "unavailable" : matches(/revenge|rq-?001/i) ? "flagged" : "clear",
      detail: !hasAnyBehaviorData
        ? unavailableDetail
        : matches(/revenge|rq-?001/i)
          ? "Recent signals suggest loss-chasing or immediate re-entry after a setback."
          : "No revenge-trading signal is active in the current snapshot.",
    },
    {
      key: "overtrading",
      label: "Overtrading",
      state: !hasAnyBehaviorData ? "unavailable" : matches(/overtrading|trade frequency|rq-?002/i) ? "flagged" : "clear",
      detail: !hasAnyBehaviorData
        ? unavailableDetail
        : matches(/overtrading|trade frequency|rq-?002/i)
          ? "Current signals point to elevated trade frequency pressure."
          : "No overtrading signal is active in the current snapshot.",
    },
    {
      key: "excessive_leverage",
      label: "Excessive leverage",
      state: !hasAnyBehaviorData ? "unavailable" : matches(/excessive leverage|high leverage|over_20x|rq-?003/i) ? "flagged" : "clear",
      detail: !hasAnyBehaviorData
        ? unavailableDetail
        : matches(/excessive leverage|high leverage|over_20x|rq-?003/i)
          ? "RiskHub is seeing leverage usage outside the safer operating range."
          : "No excessive-leverage signal is active in the current snapshot.",
    },
  ];
}

export function deriveRiskLevel(riskScore: number | null): string {
  if (riskScore === null) return "Unrated";
  if (riskScore >= 75) return "Critical";
  if (riskScore >= 55) return "Elevated";
  if (riskScore >= 30) return "Moderate";
  return "Low";
}

export function deriveIdentityTier(
  disciplineScore: number | null,
  riskScore: number | null,
  flaggedCount: number,
  previewAllowed: boolean,
): string {
  if (!previewAllowed || disciplineScore === null) return "Pending";
  if (disciplineScore >= 85 && (riskScore ?? 100) <= 35 && flaggedCount === 0) return "Verified";
  if (disciplineScore >= 70 && (riskScore ?? 100) <= 55) return "Qualified";
  if (disciplineScore >= 55 && (riskScore ?? 100) <= 75) return "Conditional";
  return "Restricted";
}

export function evaluateEligibility(args: {
  hasConnection: boolean;
  sourceState: string;
  freshnessState: string;
  disciplineScore: number | null;
  hasActivity: boolean;
}): EligibilityResult {
  const met: string[] = [];
  const missing: string[] = [];
  const blockers: string[] = [];

  if (args.hasConnection) {
    met.push("Your trading account is connected to RiskHub.");
  } else {
    missing.push("Connect at least one exchange account so RiskHub can read your profile.");
  }

  if (!["error", "no_connection"].includes(args.sourceState)) {
    met.push("RiskHub can read a usable snapshot of your current profile.");
  } else {
    missing.push("RiskHub cannot read a usable profile snapshot yet.");
  }

  if (args.disciplineScore !== null) {
    met.push("A discipline score is available for this profile.");
  } else {
    missing.push("RiskHub still needs a discipline score before it can issue an identity.");
  }

  if (args.hasActivity) {
    met.push("There is enough recent activity or live exposure to form a profile.");
  } else {
    missing.push("More activity or live exposure is needed before an identity can be formed.");
  }

  if (args.sourceState === "partial") {
    blockers.push("Some of your profile data is only partially available, so demo issue stays blocked for now.");
  }

  if (["limited", "unavailable"].includes(args.freshnessState)) {
    blockers.push("The current snapshot is too limited to support a full demo identity issue.");
  }

  const previewAllowed =
    args.hasConnection &&
    !["error", "no_connection"].includes(args.sourceState) &&
    args.disciplineScore !== null &&
    args.hasActivity;
  const eligible = previewAllowed && blockers.length === 0;

  return {
    status: eligible ? "eligible" : "ineligible",
    met,
    missing,
    blockers,
    previewAllowed,
    reason: eligible
      ? "Your current profile is ready for a demo identity badge."
      : blockers[0] ?? missing[0] ?? "Your profile is not ready for a demo identity badge yet.",
  };
}

export function getIssuanceStatusLabel(issuanceState: IssuanceState, eligibilityState: EligibilityState): string {
  if (issuanceState === "issued_demo" || issuanceState === "refreshed_demo") return "Issued (Demo)";
  if (issuanceState === "revoked_demo") return "Revoked (Demo)";
  if (eligibilityState === "eligible") return "Eligible";
  if (eligibilityState === "ineligible") return "Not eligible";
  if (eligibilityState === "checking") return "Checking";
  return "Not checked";
}

export function getHeroDescription(args: {
  loadState: LoadState;
  issuanceState: IssuanceState;
  eligibilityState: EligibilityState;
  previewAllowed: boolean;
  walletAddress: string | null;
  hasConnection: boolean;
}): string {
  if (args.loadState === "loading") {
    return "Loading identity snapshot... Eligibility will be evaluated once your profile data is ready.";
  }

  if (args.loadState === "error") {
    return "RiskHub could not build a complete readiness view right now. You can still inspect the page, but refresh the snapshot before acting.";
  }

  if (!args.hasConnection) {
    return "This page shows whether your current trading profile is ready for an identity badge. Connect your trading data first to get a real answer.";
  }

  if (args.issuanceState === "issued_demo" || args.issuanceState === "refreshed_demo") {
    return "Your current trading profile is strong enough for a demo identity badge. This result stays inside the app and does not trigger any blockchain action.";
  }

  if (args.issuanceState === "revoked_demo") {
    return "This demo identity was revoked in the current session. You can review the profile again and re-run the guided flow when ready.";
  }

  if (!args.walletAddress) {
    return "Your readiness is based on trading discipline, portfolio risk, and profile completeness. Connect a demo wallet when you want to walk through the guided flow.";
  }

  if (args.eligibilityState === "eligible") {
    return "Your current profile looks ready for a demo identity badge. Review the preview, then issue it when you are comfortable.";
  }

  if (args.previewAllowed) {
    return "RiskHub has enough information to preview your identity, but a final eligibility check still needs to run.";
  }

  return "Your profile is not ready yet. Use the checklist below to see what is missing and what to do next.";
}

export function getGuidedNextStep(args: {
  walletAddress: string | null;
  eligibilityState: EligibilityState;
  previewAllowed: boolean;
  previewVisible: boolean;
  canIssueDemo: boolean;
  issuanceState: IssuanceState;
}): { key: PrimaryActionKey; title: string; detail: string } {
  if (args.issuanceState === "issued_demo" || args.issuanceState === "refreshed_demo") {
    return {
      key: "issued",
      title: "Demo identity already issued",
      detail: "You have completed the guided flow for this session. Advanced details now contain the technical preview and lifecycle controls.",
    };
  }

  if (!args.walletAddress) {
    return {
      key: "connect",
      title: "Connect a demo wallet",
      detail: "Start by attaching a mock wallet so RiskHub has a destination for the guided identity flow.",
    };
  }

  if (args.eligibilityState !== "eligible") {
    return {
      key: "check",
      title: "Run the eligibility check",
      detail: "RiskHub will review your latest snapshot and explain whether the demo identity can be issued.",
    };
  }

  if (!args.previewVisible && args.previewAllowed) {
    return {
      key: "preview",
      title: "Preview your identity",
      detail: "Open the user-friendly preview to see how your current profile would be represented.",
    };
  }

  if (args.canIssueDemo) {
    return {
      key: "issue",
      title: "Issue the demo identity",
      detail: "You have passed the checks. The issue action will only update local demo state inside the app.",
    };
  }

  return {
    key: "check",
    title: "Review the checklist",
    detail: "The current snapshot still has blockers. Check the readiness section to see what needs attention.",
  };
}

export function buildMetadata(args: {
  identityRecord: IdentityRecord | null;
  walletAddress: string | null;
  profileHash: string;
  identityTier: string;
  riskLevel: string;
  metricsPayloadHash: string | null | undefined;
  reviewAt: string | null | undefined;
}): IdentityMetadata {
  return {
    token_id: args.identityRecord?.tokenId ?? `preview_${args.profileHash.slice(-8)}`,
    owner_wallet: args.identityRecord?.ownerWallet ?? args.walletAddress ?? "wallet_not_connected",
    identity_tier: args.identityTier,
    risk_level: args.riskLevel,
    profile_hash: args.metricsPayloadHash ?? args.profileHash,
    metadata_uri: args.identityRecord
      ? `riskhub://identity/demo/${args.identityRecord.tokenId.toLowerCase()}`
      : `riskhub://identity/preview/${args.profileHash.slice(-8)}`,
    issued_at: args.identityRecord?.issuedAt ?? null,
    review_at: args.identityRecord?.reviewAt ?? args.reviewAt ?? null,
    version: args.identityRecord?.version ?? 1,
    revoked: args.identityRecord?.revoked ?? false,
  };
}

export function buildSummaryGroups(args: {
  disciplineScore: number | null;
  disciplineGrade: string;
  behaviorFlags: BehaviorFlag[];
  riskScore: number | null;
  drawdownPct: unknown;
  leverageAverage: number | null;
  contagionScore: unknown;
  activeExchangeCount: number;
  configuredExchangeCount: number;
  tradeCount: number | null;
  positionCount: number | null;
  topAsset: string | null | undefined;
  topAssetPct: unknown;
}): SummaryGroup[] {
  const flagged = args.behaviorFlags.filter((flag) => flag.state === "flagged");
  const flaggedSummary =
    flagged.length > 0
      ? flagged.map((flag) => flag.label).join(", ")
      : args.behaviorFlags.some((flag) => flag.state === "clear")
        ? "No active behavior flags"
        : "Behavior flags unavailable";

  return [
    {
      key: "discipline",
      title: "Discipline",
      description: "How steady and rules-based your trading behavior looks right now.",
      metrics: [
        {
          label: "Score",
          value: args.disciplineScore === null ? "--" : args.disciplineScore.toFixed(0),
          hint: "Trading discipline score",
        },
        {
          label: "Grade",
          value: args.disciplineGrade,
          hint: "Current discipline grade",
        },
        {
          label: "Flags",
          value: flagged.length > 0 ? `${flagged.length} active` : "Clear",
          hint: flaggedSummary,
        },
      ],
    },
    {
      key: "risk",
      title: "Risk",
      description: "The main portfolio risks that shape identity readiness.",
      metrics: [
        {
          label: "Total risk",
          value: formatNumber(args.riskScore, 1),
          hint: "Combined risk score",
        },
        {
          label: "Drawdown",
          value: formatPercent(args.drawdownPct, 1),
          hint: "Peak-to-trough drawdown",
        },
        {
          label: "Leverage",
          value: args.leverageAverage === null ? "--" : `${args.leverageAverage.toFixed(2)}x`,
          hint: "Average leverage in the snapshot",
        },
        {
          label: "Contagion",
          value: formatNumber(args.contagionScore, 1),
          hint: "Cross-asset dependency score",
        },
      ],
    },
    {
      key: "activity",
      title: "Activity",
      description: "How much recent trading data is available to support the profile.",
      metrics: [
        {
          label: "Exchanges",
          value: `${args.activeExchangeCount}`,
          hint: `${args.configuredExchangeCount} configured connection${args.configuredExchangeCount === 1 ? "" : "s"}`,
        },
        {
          label: "Trade activity",
          value: `${args.tradeCount ?? 0}`,
          hint: `${args.positionCount ?? 0} live position${args.positionCount === 1 ? "" : "s"}`,
        },
        {
          label: "Top concentration",
          value: args.topAsset ? `${args.topAsset} ${formatPercent(args.topAssetPct, 1)}` : "--",
          hint: "Largest single-asset concentration",
        },
      ],
    },
  ];
}

export type SavedProfileCurrentness =
  | "loading"
  | "missing"
  | "up_to_date"
  | "changed"
  | "incomplete"
  | "cannot_compare"
  | "unknown";

export function deriveSavedProfileCurrentness(args: {
  snapshotLoading: boolean;
  savedProfile: RiskProfileSnapshot | null;
  currentProfile: RiskProfileSnapshot | null;
}): SavedProfileCurrentness {
  if (args.snapshotLoading) return "loading";
  if (!args.savedProfile) return "missing";
  if (!args.currentProfile) return "unknown";

  const currentStatus = String(args.currentProfile.profile_status ?? "").toLowerCase();
  if (["error", "no_connection"].includes(currentStatus)) return "cannot_compare";
  if (currentStatus === "partial") return "incomplete";

  const savedHash = args.savedProfile.profile_hash ?? null;
  const currentHash = args.currentProfile.profile_hash ?? null;
  if (!savedHash || !currentHash) return "unknown";
  return savedHash === currentHash ? "up_to_date" : "changed";
}

export function getSavedProfileCurrentnessCopy(state: SavedProfileCurrentness): {
  label: string;
  detail: string;
  tone: "neutral" | "good" | "warn";
} {
  if (state === "loading") {
    return {
      label: "Snapshot loading",
      detail: "RiskHub is still refreshing the latest snapshot before currentness can be assessed.",
      tone: "neutral",
    };
  }
  if (state === "missing") {
    return {
      label: "No saved profile",
      detail: "Save your current snapshot to create a reusable identity profile record.",
      tone: "neutral",
    };
  }
  if (state === "up_to_date") {
    return {
      label: "Up to date",
      detail: "Saved profile matches the latest RiskHub snapshot.",
      tone: "good",
    };
  }
  if (state === "changed") {
    return {
      label: "Changed since save",
      detail: "Latest snapshot differs from the saved profile version.",
      tone: "warn",
    };
  }
  if (state === "incomplete") {
    return {
      label: "Comparison limited",
      detail: "Latest snapshot is partial, so compare signals should be treated as provisional.",
      tone: "warn",
    };
  }
  if (state === "cannot_compare") {
    return {
      label: "Cannot compare",
      detail: "RiskHub cannot build a usable latest snapshot yet.",
      tone: "warn",
    };
  }
  return {
    label: "Comparison pending",
    detail: "Refresh or run compare when both saved and latest snapshots are available.",
    tone: "neutral",
  };
}

export function getCompareStateCopy(state: ProfileComparisonState | undefined): {
  label: string;
  tone: "neutral" | "good" | "warn";
} {
  if (state === "up_to_date") return { label: "Up to date", tone: "good" };
  if (state === "changed_since_save") return { label: "Changed since save", tone: "warn" };
  if (state === "incomplete_snapshot") return { label: "Incomplete snapshot", tone: "warn" };
  if (state === "cannot_compare") return { label: "Cannot compare", tone: "warn" };
  if (state === "no_saved_profile") return { label: "No saved profile", tone: "neutral" };
  return { label: "Compare ready", tone: "neutral" };
}
