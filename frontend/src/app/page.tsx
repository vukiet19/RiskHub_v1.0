"use client";

import dynamic from "next/dynamic";
import { startTransition, useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";
import { PortfolioCard } from "../components/PortfolioCard";
import { AlertsPanel, AlertData } from "../components/AlertsPanel";
import { PositionData, OpenPositions } from "../components/OpenPositions";
import { ConnectBinanceTestnetModal } from "../components/ConnectBinanceTestnetModal";
import { useRiskWebSocket } from "../hooks/useRiskWebSocket";
import { buildApiUrl, DEFAULT_USER_ID } from "../lib/riskhub-api";

interface DashboardMetrics {
  by_exchange?: {
    exchange_id: string;
    trade_count: number;
    win_rate_pct: string;
    avg_leverage: string;
    net_pnl_usd: string;
  }[];
  discipline_score?: {
    total?: number;
    grade?: string;
  };
  max_drawdown?: {
    value_pct?: string;
  };
  net_pnl_usd?: string;
}

interface DashboardOverview {
  total_portfolio_value: number;
  total_unrealized_pnl: number;
  net_pnl_usd: number;
  discipline_score: number;
  discipline_grade: string;
  max_drawdown_pct: number;
  exchange_connections: {
    exchange_id: string;
    label: string;
    environment: string;
    market_type: string;
    permissions_verified: string[];
    is_active: boolean;
    last_sync_at: string | null;
    last_sync_status: string;
    last_sync_error: string | null;
    added_at: string | null;
  }[];
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
  | "no_connection"
  | "no_open_positions"
  | "error";

interface LivePositionsResponse {
  positions?: PositionData[];
  source_state?: PositionsSourceState;
  message?: string | null;
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
  const [isLoading, setIsLoading] = useState(true);
  const [isPositionsLoading, setIsPositionsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isConnectModalOpen, setIsConnectModalOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [contagionRefreshToken, setContagionRefreshToken] = useState(0);

  const loadDashboardData = useCallback(async (options?: { showSkeleton?: boolean }) => {
    const showSkeleton = options?.showSkeleton ?? false;

    if (showSkeleton) {
      setIsLoading(true);
      setIsPositionsLoading(true);
    }

    try {
      const [overviewRes, metricsRes, alertsRes, positionsRes] = await Promise.all([
        fetch(buildApiUrl(`/api/v1/dashboard/${userId}/overview`), {
          cache: "no-store",
        }),
        fetch(buildApiUrl(`/api/v1/dashboard/${userId}/metrics`), {
          cache: "no-store",
        }),
        fetch(buildApiUrl(`/api/v1/dashboard/${userId}/alerts?unread_only=true`), {
          cache: "no-store",
        }),
        fetch(buildApiUrl(`/api/v1/dashboard/${userId}/positions`), {
          cache: "no-store",
        }),
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
      if (positionsRes.ok) {
        const positionsJson = (await positionsRes.json()) as LivePositionsResponse;
        positionsPayload = Array.isArray(positionsJson.positions)
          ? positionsJson.positions
          : [];
        nextPositionsSourceState = positionsJson.source_state ?? "live";
        nextPositionsStatusMessage = positionsJson.message ?? null;
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

  const handleConnectSubmit = useCallback(async (payload: {
    apiKey: string;
    apiSecret: string;
    label: string;
  }) => {
    setIsConnecting(true);
    setConnectError(null);

    try {
      const connectResponse = await fetch(
        buildApiUrl(`/api/v1/exchange-keys/${userId}/binance-testnet/connect`),
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: payload.apiKey,
            api_secret: payload.apiSecret,
            label: payload.label,
          }),
        }
      );

      if (!connectResponse.ok) {
        throw new Error(await readErrorMessage(connectResponse));
      }

      setIsConnectModalOpen(false);
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
            ? "Binance Testnet connected. Data refreshed with warnings."
            : "Binance Testnet connected."
        );

        if (refreshPayload.warnings.length > 0) {
          toast.message("Refresh details", {
            description: refreshPayload.warnings[0],
          });
        }
      } catch (refreshError) {
        console.error("Initial dashboard refresh failed after connect:", refreshError);
        toast.message("Binance Testnet connected. Initial refresh needs attention.", {
          description:
            refreshError instanceof Error
              ? refreshError.message
              : "The connection was saved, but the first refresh failed.",
        });
      }

      await loadDashboardData();
      setContagionRefreshToken((currentToken) => currentToken + 1);
    } catch (error) {
      console.error("Binance Testnet connect failed:", error);
      setConnectError(
        error instanceof Error
          ? error.message
          : "Failed to connect Binance Testnet."
      );
    } finally {
      setIsConnecting(false);
    }
  }, [loadDashboardData, userId]);

  const hasConfiguredConnection =
    overview?.has_configured_exchange_connection ??
    Boolean(overview?.exchange_connections?.some((connection) => connection.is_active));
  const overviewWarnings = overview?.warnings ?? [];

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
      <ConnectBinanceTestnetModal
        isOpen={isConnectModalOpen}
        isSubmitting={isConnecting}
        errorMessage={connectError}
        onClose={() => {
          if (!isConnecting) {
            setIsConnectModalOpen(false);
            setConnectError(null);
          }
        }}
        onSubmit={handleConnectSubmit}
      />
      <Sidebar />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        <Navbar
          hasConfiguredExchangeConnection={hasConfiguredConnection}
          totalPortfolioValue={overview?.total_portfolio_value ?? 0}
          lastRefreshAt={overview?.last_refresh_at ?? null}
          hasLiveExchangeConnection={overview?.has_live_exchange_connection ?? false}
          statusMessage={overviewWarnings[0] ?? null}
          unreadAlertCount={unreadAlertCount}
          isRefreshing={isRefreshing}
          onRefresh={handleRefresh}
          onOpenConnect={() => {
            setConnectError(null);
            setIsConnectModalOpen(true);
          }}
        />
        <main className="relative z-0 flex-1 overflow-y-auto p-4 md:p-6 lg:p-8">
          {overviewWarnings.length > 0 ? (
            <div className="mb-6 rounded-md border border-warning-accent/30 bg-warning-accent/10 px-4 py-3 text-sm text-warning-accent">
              {overviewWarnings[0]}
            </div>
          ) : null}
          <div className="grid h-full grid-cols-1 gap-6 lg:grid-cols-12">
            <div className="flex flex-col gap-6 lg:col-span-3">
              <PortfolioCard
                exchanges={metrics?.by_exchange || []}
                totalNetPnl={netPnlUsd}
                isConnected={hasConfiguredConnection}
              />
              <div className="relative overflow-hidden rounded-md bg-surface-high p-6 transition-all duration-300 hover:bg-surface-highest">
                <h3 className="mb-6 flex items-center justify-between text-lg font-semibold text-text-primary">
                  <span>Discipline Score</span>
                  <span className="rounded-md bg-surface-lowest px-2 py-1 text-xs text-text-secondary">
                    Trailing 30d
                  </span>
                </h3>
                <div className="flex items-center justify-center py-4">
                  <div className="relative flex h-36 w-36 items-center justify-center rounded-full">
                    <div className="absolute inset-0 rounded-full border-2 border-surface-highest" />
                    <svg className="h-full w-full -rotate-90 transform" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" className="fill-transparent stroke-surface-highest stroke-[8px]" />
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        className="fill-transparent stroke-primary stroke-[8px]"
                        strokeDasharray="283"
                        strokeDashoffset={`${283 - (283 * disciplineScore) / 100}`}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center justify-center">
                      <span className="font-mono text-4xl font-bold tracking-tight text-text-primary">{disciplineScore}</span>
                      <span className="mt-1 text-xs font-medium tracking-wide text-primary">GRADE: {disciplineGrade}</span>
                    </div>
                  </div>
                </div>
                <div className="mt-4 text-center">
                  <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${metrics ? "border-success/20 bg-success/10 text-success" : "border-warning-accent/20 bg-warning-accent/10 text-warning-accent"}`}>
                    <div className={`h-1.5 w-1.5 rounded-full ${metrics ? "bg-success" : "bg-warning-accent"}`} />
                    {isLoading
                      ? "Loading..."
                      : metrics
                        ? `Grade: ${disciplineGrade}`
                        : hasConfiguredConnection
                          ? "Awaiting synced trades"
                          : "Connect an exchange"}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2 (wide) — Portfolio Contagion Map */}
            <div className="flex flex-col gap-6 lg:col-span-6">
              <PortfolioContagionMap
                userId={userId}
                refreshToken={contagionRefreshToken}
              />
            </div>

            {/* Column 3 (narrow) */}
            <div className="flex flex-col gap-6 lg:col-span-3">
              <OpenPositions
                positions={positions}
                isLoading={isPositionsLoading}
                isConnected={hasConfiguredConnection}
                sourceState={positionsSourceState}
                statusMessage={positionsStatusMessage}
              />
              <AlertsPanel alerts={alerts} />
              <div className="glass-card rounded-2xl p-5 transition-colors duration-300 hover:border-danger/30">
                <h3 className="mb-3 text-base font-semibold text-white">Drawdown Impact</h3>
                <div className="flex items-center justify-between rounded-xl border border-danger/30 bg-gradient-to-r from-danger/20 to-danger/5 p-4 shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)]">
                  <div className="flex flex-col">
                    <span className="font-mono text-xl font-bold tracking-tight text-danger">
                      -{parseFloat(drawdownPct || "0").toFixed(2)}%
                    </span>
                    <span className="mt-1 text-[10px] uppercase tracking-wider text-danger/70">
                      {metrics ? "Peak-to-Trough" : hasConfiguredConnection ? "Awaiting trade sync" : "No synced drawdown yet"}
                    </span>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-danger/10 shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger">
                      <polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline>
                      <polyline points="16 17 22 17 22 11"></polyline>
                    </svg>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
