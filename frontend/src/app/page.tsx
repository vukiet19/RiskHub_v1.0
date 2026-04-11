"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";
import { PortfolioCard, type ExchangeData } from "../components/PortfolioCard";
import { AlertsPanel, AlertData } from "../components/AlertsPanel";
import { PositionData, OpenPositions } from "../components/OpenPositions";
import {
  ManageConnectionsModal,
  type ExchangeConnection,
  type ManageConnectionPayload,
} from "../components/ManageConnectionsModal";
import { useRiskWebSocket } from "../hooks/useRiskWebSocket";
import { getExchangeMeta } from "../lib/exchanges";
import { buildApiUrl, DEFAULT_USER_ID } from "../lib/riskhub-api";

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
  total_unrealized_pnl: number;
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
  () => import("../components/PortfolioContagionMap").then((mod) => mod.PortfolioContagionMap),
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

// ── Compact Discipline Score Card ────────────────────────────────────────

function DisciplineScoreCard({
  score,
  grade,
  isLoading,
  hasMetrics,
  isConnected,
}: {
  score: number;
  grade: string;
  isLoading: boolean;
  hasMetrics: boolean;
  isConnected: boolean;
}) {
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const offset = circumference - (circumference * score) / 100;

  return (
    <div className="compact-metric-card">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <svg width={48} height={48} viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
          <circle cx={26} cy={26} r={r} fill="none" stroke="#2d3449" strokeWidth={4} />
          <circle
            cx={26} cy={26} r={r} fill="none" stroke="#1a56db" strokeWidth={4}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" transform="rotate(-90 26 26)"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
          <text x={26} y={26} textAnchor="middle" dominantBaseline="central"
            fill="#dae2fd" fontSize={12} fontWeight={700} fontFamily="'JetBrains Mono', monospace">
            {score}
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
                  ? "Awaiting synced trades"
                  : "Connect an exchange"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Compact Drawdown Card ────────────────────────────────────────────────

function DrawdownCard({
  drawdownPct,
  hasMetrics,
  isConnected,
}: {
  drawdownPct: string | number;
  hasMetrics: boolean;
  isConnected: boolean;
}) {
  return (
    <div className="compact-metric-card">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-danger/10 flex-shrink-0">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
            <polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline>
            <polyline points="16 17 22 17 22 11"></polyline>
          </svg>
        </div>
        <div>
          <div className="text-xs font-semibold text-text-primary tracking-wide">Max Drawdown</div>
          <span className="font-mono text-lg font-bold tracking-tight text-danger">
            -{parseFloat(String(drawdownPct || "0")).toFixed(2)}%
          </span>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest">
            {hasMetrics ? "Peak-to-Trough" : isConnected ? "Awaiting trade sync" : "No synced data"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ──────────────────────────────────────────────────────

export default function Dashboard() {
  const userId = DEFAULT_USER_ID;

  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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

      let alertsPayload: AlertData[] = [];
      let nextUnreadAlertCount = 0;
      if (alertsRes.ok) {
        const alertsJson = await alertsRes.json();
        alertsPayload = (alertsJson.alerts as ApiAlert[]).map((alert, index) => ({
          id: alert._id || `${alert.rule_id}-${alert.triggered_at}-${index}`,
          rule_id: alert.rule_id,
          rule_name: alert.rule_name,
          severity: alert.severity,
          title: alert.title,
          message: alert.message,
          triggered_at: alert.triggered_at,
          is_read: alert.is_read,
        }));
        nextUnreadAlertCount =
          alertsJson.unread_total ??
          alertsPayload.filter((alert) => !alert.is_read).length;
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
        setAlerts(alertsPayload);
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
        setAlerts([]);
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

  const handleNewAlert = useCallback((newAlert: AlertData) => {
    setAlerts((previousAlerts) => [newAlert, ...previousAlerts]);
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
  const overviewWarnings = overview?.warnings ?? [];
  const exchangeBreakdown = metrics?.by_exchange ?? overview?.metrics_by_exchange ?? [];
  const activeExchangeCount =
    overview?.exchange_connections?.filter((connection) => connection.is_active).length ?? 0;
  const configuredExchangeCount = overview?.exchange_connections?.length ?? 0;

  return (
    <div className="flex h-screen overflow-hidden bg-main-bg">
      <Toaster
        position="bottom-right"
        expand={false}
        theme="dark"
        toastOptions={{
          className: "border border-surface-highest bg-main-bg/70 text-text-primary rounded-md backdrop-blur-xl",
          classNames: {
            error: "!bg-danger-container !border-danger-container !text-danger-accent shadow-[0_48px_48px_rgba(105,0,5,0.4)] drop-shadow-lg",
          },
        }}
      />
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
      <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((prev) => !prev)} />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <Navbar
          hasConfiguredExchangeConnection={hasConfiguredConnection}
          totalPortfolioValue={overview?.total_portfolio_value ?? 0}
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
        <main className="relative z-0 flex-1 overflow-y-auto p-4 md:p-5 lg:p-6">
          {overviewWarnings.length > 0 ? (
            <div className="mb-4 rounded-md border border-warning-accent/30 bg-warning-accent/10 px-4 py-3 text-sm text-warning-accent">
              {overviewWarnings[0]}
            </div>
          ) : null}

          {/* ── Compact Metrics Strip ─── */}
          <div className="metrics-strip">
            <PortfolioCard
              exchanges={exchangeBreakdown}
              totalNetPnl={netPnlUsd}
              isConnected={hasConfiguredConnection}
            />
            <DisciplineScoreCard
              score={disciplineScore}
              grade={disciplineGrade}
              isLoading={isLoading}
              hasMetrics={!!metrics}
              isConnected={hasConfiguredConnection}
            />
            <DrawdownCard
              drawdownPct={drawdownPct}
              hasMetrics={!!metrics}
              isConnected={hasConfiguredConnection}
            />
          </div>

          {/* ── Main Content: Contagion (dominant) + Right Rail ─── */}
          <div className="dashboard-body">
            {/* Contagion module — large primary workspace */}
            <div className="dashboard-contagion">
              <PortfolioContagionMap
                userId={userId}
                refreshToken={contagionRefreshToken}
              />
            </div>

            {/* Right rail — Open Positions + Alerts */}
            <div className="dashboard-rail">
              <OpenPositions
                positions={positions}
                isLoading={isPositionsLoading}
                isConnected={hasConfiguredConnection}
                sourceState={positionsSourceState}
                statusMessage={positionsStatusMessage}
                warnings={positionsWarnings}
              />
              <AlertsPanel alerts={alerts} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
