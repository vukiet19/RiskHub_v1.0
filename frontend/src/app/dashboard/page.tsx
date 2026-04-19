"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AppShell } from "../../components/AppShell";
import { Navbar } from "../../components/Navbar";
import { PortfolioCard, type ExchangeData } from "../../components/PortfolioCard";
import type { AlertData } from "../../components/AlertsPanel";
import { PositionData, OpenPositions } from "../../components/OpenPositions";
import { SpotAssets, type SpotAssetData } from "../../components/SpotAssets";
import {
  ManageConnectionsModal,
  type ExchangeConnection,
  type ManageConnectionPayload,
} from "../../components/ManageConnectionsModal";
import { useRiskWebSocket } from "../../hooks/useRiskWebSocket";
import { getExchangeMeta } from "../../lib/exchanges";
import { buildApiUrl, DEFAULT_USER_ID } from "../../lib/riskhub-api";

interface DashboardMetrics {
  by_exchange?: ExchangeData[];
  discipline_score?: {
    total?: number;
    grade?: string;
  };
  max_drawdown?: {
    value_pct?: string | number;
  };
  net_pnl_usd?: string | number;
}

interface DashboardOverview {
  total_portfolio_value: number;
  portfolio_value_by_exchange?: {
    exchange_id: string;
    portfolio_value: number;
  }[];
  total_unrealized_pnl: number;
  spot_total_value?: number;
  spot_asset_count?: number;
  spot_assets?: SpotAssetData[];
  net_pnl_usd: number;
  discipline_score: number;
  discipline_grade: string;
  max_drawdown_pct: number;
  metrics_by_exchange?: ExchangeData[];
  exchange_connections: ExchangeConnection[];
  last_refresh_at: string | null;
  data_freshness: {
    state: string;
    live_account_snapshot_at: string | null;
    metrics_calculated_at: string | null;
  };
  has_configured_exchange_connection?: boolean;
  has_live_exchange_connection: boolean;
  warnings?: string[];
}

interface DashboardRefreshResponse {
  status: string;
  warnings: string[];
  engine_status: string;
}

type PositionsSourceState =
  | "live"
  | "partial"
  | "no_connection"
  | "no_open_positions"
  | "error";

interface LivePositionsResponse {
  positions?: PositionData[];
  source_state?: PositionsSourceState;
  message?: string | null;
  warnings?: string[];
}

const SUPPRESSED_DASHBOARD_WARNING_PATTERNS = [
  /Binance Demo spot balances are simulated and isolated from Binance mainnet accounts/i,
];

function isSuppressedDashboardWarning(warning: string): boolean {
  return SUPPRESSED_DASHBOARD_WARNING_PATTERNS.some((pattern) => pattern.test(warning));
}

interface ApiAlert {
  _id?: string;
  rule_id: string;
  rule_name: string;
  severity: AlertData["severity"];
  title: string;
  message: string;
  triggered_at: string;
  is_read?: boolean;
}

const PortfolioContagionMap = dynamic(
  () => import("../../components/PortfolioContagionMap").then((mod) => mod.PortfolioContagionMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        Loading contagion map...
      </div>
    ),
  }
);

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
  } catch {
    // Ignore malformed error bodies and fall back to status text.
  }

  return response.statusText || `Request failed with status ${response.status}`;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }
  const parsed = Number.parseFloat(value ?? "0");
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number): string {
  return toNumber(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function PortfolioValueCard({
  totalValue,
  binanceValue,
  okxValue,
  isConnected,
}: {
  totalValue: number;
  binanceValue: number;
  okxValue: number;
  isConnected: boolean;
}) {
  return (
    <div className="compact-metric-card">
      <div className="text-xs font-semibold tracking-wide text-text-primary">
        Total Portfolio Value
      </div>
      <div className="mt-2 font-mono text-2xl font-bold tracking-tight text-white">
        ${formatCurrency(totalValue)}
      </div>
      <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-[0.18em] text-text-secondary">Binance</span>
          <span className="font-mono font-semibold text-text-primary">${formatCurrency(binanceValue)}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-[0.18em] text-text-secondary">OKX</span>
          <span className="font-mono font-semibold text-text-primary">${formatCurrency(okxValue)}</span>
        </div>
      </div>
      <div className="mt-3 text-[10px] uppercase tracking-widest text-text-secondary">
        {isConnected ? "Live exchange aggregation" : "Connect exchanges to load live portfolio values"}
      </div>
    </div>
  );
}

function DisciplineDrawdownCard({
  score,
  grade,
  drawdownPct,
  isLoading,
  hasMetrics,
  isConnected,
}: {
  score: number;
  grade: string;
  drawdownPct: string | number;
  isLoading: boolean;
  hasMetrics: boolean;
  isConnected: boolean;
}) {
  const safeScore = Math.max(0, Math.min(100, toNumber(score)));
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (circumference * safeScore) / 100;
  const drawdownValue = Math.abs(toNumber(drawdownPct));

  return (
    <div className="compact-metric-card">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width={48} height={48} viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
          <circle cx={26} cy={26} r={r} fill="none" stroke="#2d3449" strokeWidth={4} />
          <circle
            cx={26}
            cy={26}
            r={r}
            fill="none"
            stroke="#1a56db"
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
            fontSize={12}
            fontWeight={700}
            fontFamily="'JetBrains Mono', monospace"
          >
            {Math.round(safeScore)}
          </text>
        </svg>
        <div>
          <div className="text-xs font-semibold text-text-primary tracking-wide">Discipline Score</div>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest">
            {isLoading
              ? "Loading..."
              : hasMetrics
                ? `Grade: ${grade} · 30d`
                : isConnected
                  ? "Awaiting synced closed positions"
                  : "Connect an exchange"}
          </div>
        </div>
      </div>
      <div className="my-3 border-t border-white/10" />
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-danger/10">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-danger"
          >
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7" />
            <polyline points="16 17 22 17 22 11" />
          </svg>
        </div>
        <div>
          <div className="text-xs font-semibold text-text-primary tracking-wide">Max Drawdown</div>
          <span className="font-mono text-lg font-bold tracking-tight text-danger">
            -{drawdownValue.toFixed(2)}%
          </span>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest">
            {hasMetrics
              ? "Peak-to-Trough"
              : isConnected
                ? "Awaiting closed-position sync"
                : "No synced data"}
          </div>
        </div>
      </div>
    </div>
  );
}

// Main dashboard

export default function Dashboard() {
  const userId = DEFAULT_USER_ID;

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [unreadAlertCount, setUnreadAlertCount] = useState(0);
  const [positions, setPositions] = useState<PositionData[]>([]);
  const [positionsSourceState, setPositionsSourceState] =
    useState<PositionsSourceState>("live");
  const [positionsStatusMessage, setPositionsStatusMessage] = useState<string | null>(null);
  const [positionsWarnings, setPositionsWarnings] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPositionsLoading, setIsPositionsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isManageConnectionsOpen, setIsManageConnectionsOpen] = useState(false);
  const [isSavingConnection, setIsSavingConnection] = useState(false);
  const [contagionRefreshToken, setContagionRefreshToken] = useState(0);
  const loadDashboardData = useCallback(async (options?: { showSkeleton?: boolean }) => {
    const showSkeleton = options?.showSkeleton ?? false;

    if (showSkeleton) {
      setIsLoading(true);
      setIsPositionsLoading(true);
    }

    try {
      const [overviewRes, metricsRes, alertsRes, positionsRes] = await Promise.all([
        fetch(buildApiUrl(`/api/v1/dashboard/${userId}/overview`), { cache: "no-store" }),
        fetch(buildApiUrl(`/api/v1/dashboard/${userId}/metrics`), { cache: "no-store" }),
        fetch(buildApiUrl(`/api/v1/dashboard/${userId}/alerts?unread_only=true`), { cache: "no-store" }),
        fetch(buildApiUrl(`/api/v1/dashboard/${userId}/positions`), { cache: "no-store" }),
      ]);

      if (!overviewRes.ok) {
        throw new Error(await readErrorMessage(overviewRes));
      }

      const overviewPayload = (await overviewRes.json()) as DashboardOverview;

      let metricsPayload: DashboardMetrics | null = null;
      if (metricsRes.ok) {
        const metricsJson = await metricsRes.json();
        metricsPayload = metricsJson.data as DashboardMetrics;
      } else if (metricsRes.status !== 404) {
        console.error("Metrics fetch failed:", await readErrorMessage(metricsRes));
      }

      let nextUnreadAlertCount = 0;
      if (alertsRes.ok) {
        const alertsJson = await alertsRes.json();
        nextUnreadAlertCount =
          alertsJson.unread_total ??
          ((alertsJson.alerts as ApiAlert[] | undefined) ?? []).filter((alert) => !alert.is_read).length;
      } else {
        console.error("Alerts fetch failed:", await readErrorMessage(alertsRes));
      }

      let positionsPayload: PositionData[] = [];
      let nextPositionsSourceState: PositionsSourceState = "live";
      let nextPositionsStatusMessage: string | null = null;
      let nextPositionsWarnings: string[] = [];
      if (positionsRes.ok) {
        const positionsJson = (await positionsRes.json()) as LivePositionsResponse;
        positionsPayload = Array.isArray(positionsJson.positions)
          ? positionsJson.positions
          : [];
        nextPositionsSourceState = positionsJson.source_state ?? "live";
        nextPositionsStatusMessage = positionsJson.message ?? null;
        nextPositionsWarnings = Array.isArray(positionsJson.warnings)
          ? positionsJson.warnings.filter((warning): warning is string => typeof warning === "string" && warning.length > 0)
          : [];
      } else {
        console.error("Positions fetch failed:", await readErrorMessage(positionsRes));
      }

      startTransition(() => {
        setOverview(overviewPayload);
        setMetrics(metricsPayload);
        setUnreadAlertCount(nextUnreadAlertCount);
        setPositions(positionsPayload);
        setPositionsSourceState(nextPositionsSourceState);
        setPositionsStatusMessage(nextPositionsStatusMessage);
        setPositionsWarnings(nextPositionsWarnings);
      });
    } catch (error) {
      console.error("Dashboard data fetch error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load dashboard data.");
      startTransition(() => {
        setOverview(null);
        setMetrics(null);
        setUnreadAlertCount(0);
        setPositions([]);
        setPositionsSourceState("error");
        setPositionsStatusMessage("Failed to load dashboard data.");
        setPositionsWarnings([]);
      });
    } finally {
      if (showSkeleton) {
        setIsLoading(false);
        setIsPositionsLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    void loadDashboardData({ showSkeleton: true });
  }, [loadDashboardData]);

  const disciplineScore =
    metrics?.discipline_score?.total ?? overview?.discipline_score ?? 0;
  const disciplineGrade =
    metrics?.discipline_score?.grade ?? overview?.discipline_grade ?? "N/A";
  const drawdownPct =
    metrics?.max_drawdown?.value_pct ?? `${overview?.max_drawdown_pct ?? 0}`;
  const netPnlUsd = metrics?.net_pnl_usd ?? overview?.net_pnl_usd ?? 0;
  const exchangePortfolioValues = (overview?.portfolio_value_by_exchange ?? []).reduce<Record<string, number>>(
    (accumulator, row) => {
      const exchangeId = String(row.exchange_id || "").trim().toLowerCase();
      if (!exchangeId) {
        return accumulator;
      }
      accumulator[exchangeId] = (accumulator[exchangeId] ?? 0) + toNumber(row.portfolio_value);
      return accumulator;
    },
    {},
  );
  const binancePortfolioValue = exchangePortfolioValues.binance ?? 0;
  const okxPortfolioValue = exchangePortfolioValues.okx ?? 0;

  const handleNewAlert = useCallback((newAlert: AlertData) => {
    void newAlert;
    setUnreadAlertCount((currentCount) => currentCount + 1);
  }, []);

  useRiskWebSocket({
    userId,
    onNewAlert: handleNewAlert,
  });

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);

    try {
      const response = await fetch(buildApiUrl(`/api/v1/dashboard/${userId}/refresh`), {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error(await readErrorMessage(response));
      }

      const payload = (await response.json()) as DashboardRefreshResponse;
      if (payload.status === "partial" && payload.warnings.length > 0) {
        toast.message("Dashboard refreshed with warnings.", {
          description: payload.warnings[0],
        });
      } else {
        toast.success("Dashboard refreshed.");
      }

      await loadDashboardData();
      setContagionRefreshToken((currentToken) => currentToken + 1);
    } catch (error) {
      console.error("Dashboard refresh failed:", error);
      toast.error(error instanceof Error ? error.message : "Dashboard refresh failed.");
      await loadDashboardData();
    } finally {
      setIsRefreshing(false);
    }
  }, [loadDashboardData, userId]);

  const handleConnectionSubmit = useCallback(async (payload: ManageConnectionPayload) => {
    setIsSavingConnection(true);

    try {
      const connectResponse = await fetch(
        buildApiUrl(`/api/v1/exchange-keys/${userId}/connect`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            exchange_id: payload.exchangeId,
            environment: payload.environment,
            market_type: payload.marketType,
            label: payload.label,
            api_key: payload.apiKey,
            api_secret: payload.apiSecret,
            passphrase: payload.passphrase,
          }),
        },
      );

      if (!connectResponse.ok) {
        throw new Error(await readErrorMessage(connectResponse));
      }

      const exchangeMeta = getExchangeMeta(payload.exchangeId);

      try {
        const refreshResponse = await fetch(buildApiUrl(`/api/v1/dashboard/${userId}/refresh`), {
          method: "POST",
        });

        if (!refreshResponse.ok) {
          throw new Error(await readErrorMessage(refreshResponse));
        }

        const refreshPayload = (await refreshResponse.json()) as DashboardRefreshResponse;

        toast.success(
          refreshPayload.status === "partial"
            ? `${exchangeMeta.label} connection saved. Portfolio refreshed with warnings.`
            : `${exchangeMeta.label} connection saved.`,
        );

        if (refreshPayload.warnings.length > 0) {
          toast.message("Refresh details", {
            description: refreshPayload.warnings[0],
          });
        }
      } catch (refreshError) {
        console.error("Initial dashboard refresh failed after connection save:", refreshError);
        toast.message(`${exchangeMeta.label} connection saved. Initial refresh needs attention.`, {
          description:
            refreshError instanceof Error
              ? refreshError.message
              : "The connection was saved, but the first refresh failed.",
        });
      }

      await loadDashboardData();
      setContagionRefreshToken((currentToken) => currentToken + 1);
    } catch (error) {
      console.error("Exchange connection save failed:", error);
      throw (
        error instanceof Error
          ? error
          : new Error("Failed to save the exchange connection.")
      );
    } finally {
      setIsSavingConnection(false);
    }
  }, [loadDashboardData, userId]);

  const hasConfiguredConnection =
    overview?.has_configured_exchange_connection ??
    Boolean(overview?.exchange_connections?.some((connection) => connection.is_active));
  const overviewWarnings = (overview?.warnings ?? []).filter(
    (warning) => !isSuppressedDashboardWarning(warning),
  );
  const spotWarnings = overviewWarnings.filter((warning) => /spot|pricing/i.test(warning));
  const exchangeBreakdown = metrics?.by_exchange ?? overview?.metrics_by_exchange ?? [];
  const activeExchangeCount =
    overview?.exchange_connections?.filter((connection) => connection.is_active).length ?? 0;
  const configuredExchangeCount = overview?.exchange_connections?.length ?? 0;

  return (
    <AppShell
      header={
        <Navbar
          hasConfiguredExchangeConnection={hasConfiguredConnection}
          lastRefreshAt={overview?.last_refresh_at ?? null}
          hasLiveExchangeConnection={overview?.has_live_exchange_connection ?? false}
          activeExchangeCount={activeExchangeCount}
          configuredExchangeCount={configuredExchangeCount}
          statusMessage={overviewWarnings[0] ?? null}
          unreadAlertCount={unreadAlertCount}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          onOpenConnections={() => {
            setIsManageConnectionsOpen(true);
          }}
        />
      }
    >
      <ManageConnectionsModal
        isOpen={isManageConnectionsOpen}
        userId={userId}
        initialConnections={overview?.exchange_connections ?? []}
        isSubmitting={isSavingConnection}
        isRefreshing={isRefreshing}
        onClose={() => {
          if (!isSavingConnection) {
            setIsManageConnectionsOpen(false);
          }
        }}
        onSubmit={handleConnectionSubmit}
        onRefreshData={handleRefresh}
      />
      <div className="relative z-0 flex-1 overflow-y-auto p-4 md:p-5 lg:p-6">
          {overviewWarnings.length > 0 ? (
            <div className="mb-4 rounded-md border border-warning-accent/30 bg-warning-accent/10 px-4 py-3 text-sm text-warning-accent">
              {overviewWarnings[0]}
            </div>
          ) : null}

          {/* Compact metrics strip */}
          <div className="metrics-strip">
            <PortfolioCard
              exchanges={exchangeBreakdown}
              totalNetPnl={netPnlUsd}
              isConnected={hasConfiguredConnection}
            />
            <PortfolioValueCard
              totalValue={overview?.total_portfolio_value ?? 0}
              binanceValue={binancePortfolioValue}
              okxValue={okxPortfolioValue}
              isConnected={hasConfiguredConnection}
            />
            <DisciplineDrawdownCard
              score={disciplineScore}
              grade={disciplineGrade}
              drawdownPct={drawdownPct}
              isLoading={isLoading}
              hasMetrics={!!metrics}
              isConnected={hasConfiguredConnection}
            />
          </div>

          {/* Main content: contagion (dominant) + right rail */}
          <div className="dashboard-body">
            {/* Contagion module - primary workspace */}
            <div className="dashboard-contagion">
              <PortfolioContagionMap
                userId={userId}
                refreshToken={contagionRefreshToken}
              />
            </div>

            {/* Right workspace - compact operational inventory */}
            <div className="dashboard-rail">
              <div className="dashboard-operations">
                <OpenPositions
                  positions={positions}
                  isLoading={isPositionsLoading}
                  isConnected={hasConfiguredConnection}
                  sourceState={positionsSourceState}
                  statusMessage={positionsStatusMessage}
                  warnings={positionsWarnings}
                />
                <SpotAssets
                  assets={overview?.spot_assets ?? []}
                  totalSpotValue={overview?.spot_total_value ?? 0}
                  isLoading={isLoading}
                  isConnected={hasConfiguredConnection}
                  warnings={spotWarnings}
                />
              </div>
            </div>
          </div>
        </div>
    </AppShell>
  );
}

