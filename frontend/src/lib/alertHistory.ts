import { buildApiUrl } from "./riskhub-api";

export type AlertSeverity = "critical" | "warning" | "caution" | "notice";
export type AlertCategory = "behavioral" | "liquidation" | "portfolio";
export type AlertReadStatus = "all" | "read" | "unread";

export interface AlertHistoryRuleOption {
  rule_id: string;
  rule_name: string;
  count: number;
}

export interface AlertHistoryAlert {
  id: string;
  rule_id: string;
  rule_name: string;
  severity: string;
  category: string;
  title: string;
  message: string;
  recommendation: string | null;
  triggered_at: string | null;
  is_read: boolean;
  read_at: string | null;
  is_dismissed: boolean;
  exchange_id: string | null;
  symbol: string | null;
  trigger_context: Record<string, unknown>;
  related_trade_ids: string[];
  is_partial: boolean;
  partial_missing_fields: string[];
}

export interface AlertRelatedTrade {
  id: string;
  exchange_id: string | null;
  symbol: string | null;
  side: string | null;
  leverage: number | null;
  realized_pnl_usd: string | null;
  notional_value_usd: string | null;
  opened_at: string | null;
  closed_at: string | null;
  is_win: boolean;
  pnl_category: string | null;
  record_type: string | null;
  duration_seconds: number | null;
  roles: string[];
}

export interface AlertRelatedTradesResponse {
  status: string;
  alert_id: string;
  rule_id: string | null;
  rule_name: string | null;
  trades: AlertRelatedTrade[];
  missing_trade_ids: string[];
  warnings: string[];
}

export interface AlertHistoryDayGroup {
  date: string;
  label: string;
  alert_count: number;
  severity_summary: {
    critical: number;
    warning: number;
    caution: number;
    notice: number;
  };
  alerts: AlertHistoryAlert[];
}

export interface AlertHistoryResponse {
  status: string;
  summary: {
    total_filtered: number;
    total_all: number;
    unread: number;
    critical: number;
    warning: number;
    last_7_days: number;
  };
  filters_applied: {
    from_date: string | null;
    to_date: string | null;
    severity: string[];
    category: string[];
    rule_id: string[];
    is_read: boolean | null;
    exchange_id: string[];
    search: string | null;
  };
  filters_available: {
    severity: string[];
    category: string[];
    rules: AlertHistoryRuleOption[];
    exchanges: string[];
  };
  groups: AlertHistoryDayGroup[];
  pagination: {
    page: number;
    page_size: number;
    total: number;
    total_days?: number;
    total_alerts?: number;
    total_pages: number;
    has_next: boolean;
    has_previous: boolean;
  };
  warnings: string[];
}

export interface AlertHistoryQuery {
  fromDate?: string;
  toDate?: string;
  severity?: string | null;
  category?: string | null;
  ruleId?: string | null;
  readStatus?: AlertReadStatus;
  exchangeId?: string | null;
  search?: string;
  page?: number;
  pageSize?: number;
}

function appendCsvParam(params: URLSearchParams, key: string, value?: string | null) {
  if (!value) return;
  const clean = value.trim();
  if (!clean) return;
  params.set(key, clean);
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: string };
    if (typeof payload?.detail === "string" && payload.detail.trim().length > 0) {
      return payload.detail;
    }
  } catch {
    // Ignore malformed payload and fall through to status text.
  }
  return response.statusText || `Request failed with status ${response.status}`;
}

export function buildAlertHistoryPath(userId: string, query: AlertHistoryQuery): string {
  const params = new URLSearchParams();
  if (query.fromDate) {
    params.set("from_date", query.fromDate);
  }
  if (query.toDate) {
    params.set("to_date", query.toDate);
  }

  appendCsvParam(params, "severity", query.severity);
  appendCsvParam(params, "category", query.category);
  appendCsvParam(params, "rule_id", query.ruleId);
  appendCsvParam(params, "exchange_id", query.exchangeId);

  if (query.readStatus === "read") {
    params.set("is_read", "true");
  } else if (query.readStatus === "unread") {
    params.set("is_read", "false");
  }

  const search = query.search?.trim();
  if (search) {
    params.set("search", search);
  }
  params.set("page", String(query.page ?? 1));
  params.set("page_size", String(query.pageSize ?? 50));

  const serialized = params.toString();
  return serialized.length > 0
    ? `/api/v1/dashboard/${userId}/alerts/history?${serialized}`
    : `/api/v1/dashboard/${userId}/alerts/history`;
}

function buildAlertMarkReadPath(userId: string, query?: AlertHistoryQuery): string {
  if (!query) {
    return `/api/v1/dashboard/${userId}/alerts/read`;
  }

  const params = new URLSearchParams();
  if (query.fromDate) {
    params.set("from_date", query.fromDate);
  }
  if (query.toDate) {
    params.set("to_date", query.toDate);
  }

  appendCsvParam(params, "severity", query.severity);
  appendCsvParam(params, "category", query.category);
  appendCsvParam(params, "rule_id", query.ruleId);
  appendCsvParam(params, "exchange_id", query.exchangeId);

  if (query.readStatus === "read") {
    params.set("is_read", "true");
  } else if (query.readStatus === "unread") {
    params.set("is_read", "false");
  }

  const search = query.search?.trim();
  if (search) {
    params.set("search", search);
  }

  const serialized = params.toString();
  return serialized.length > 0
    ? `/api/v1/dashboard/${userId}/alerts/read?${serialized}`
    : `/api/v1/dashboard/${userId}/alerts/read`;
}

export async function fetchAlertHistory(
  userId: string,
  query: AlertHistoryQuery,
  signal?: AbortSignal,
): Promise<AlertHistoryResponse> {
  const response = await fetch(buildApiUrl(buildAlertHistoryPath(userId, query)), {
    cache: "no-store",
    signal,
  });
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as AlertHistoryResponse;
}

export async function markAlertRead(userId: string, alertId: string): Promise<{
  status: string;
  marked_read: number;
  already_read: boolean;
  read_at?: string;
}> {
  const response = await fetch(
    buildApiUrl(`/api/v1/dashboard/${userId}/alerts/${alertId}/read`),
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as {
    status: string;
    marked_read: number;
    already_read: boolean;
    read_at?: string;
  };
}

export async function markAllAlertsRead(userId: string): Promise<{
  status: string;
  marked_read: number;
  scope?: string;
  filters_applied?: Record<string, unknown>;
}> {
  const response = await fetch(
    buildApiUrl(buildAlertMarkReadPath(userId)),
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as {
    status: string;
    marked_read: number;
    scope?: string;
    filters_applied?: Record<string, unknown>;
  };
}

export async function markFilteredAlertsRead(
  userId: string,
  query: AlertHistoryQuery,
): Promise<{
  status: string;
  marked_read: number;
  scope?: string;
  filters_applied?: Record<string, unknown>;
}> {
  const response = await fetch(
    buildApiUrl(buildAlertMarkReadPath(userId, query)),
    { method: "POST" },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as {
    status: string;
    marked_read: number;
    scope?: string;
    filters_applied?: Record<string, unknown>;
  };
}

export async function fetchAlertRelatedTrades(
  userId: string,
  alertId: string,
  signal?: AbortSignal,
): Promise<AlertRelatedTradesResponse> {
  const response = await fetch(
    buildApiUrl(`/api/v1/dashboard/${userId}/alerts/${alertId}/related-trades`),
    {
      cache: "no-store",
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return (await response.json()) as AlertRelatedTradesResponse;
}
