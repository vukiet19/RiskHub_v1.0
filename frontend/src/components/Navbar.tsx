import { Bell, Link2, RefreshCw, ShieldCheck } from "lucide-react";

interface NavbarProps {
  lastRefreshAt: string | null;
  hasConfiguredExchangeConnection: boolean;
  hasLiveExchangeConnection: boolean;
  activeExchangeCount: number;
  configuredExchangeCount: number;
  statusMessage?: string | null;
  unreadAlertCount: number;
  isRefreshing?: boolean;
  onRefresh: () => void;
  onOpenConnections: () => void;
}

function formatRefreshLabel(
  value: string | null,
  hasConfiguredExchangeConnection: boolean,
): string {
  if (!value) {
    return hasConfiguredExchangeConnection ? "Ready to sync" : "Not connected";
  }

  const refreshDate = new Date(value);
  if (Number.isNaN(refreshDate.getTime())) {
    return "Unknown";
  }

  return refreshDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function Navbar({
  lastRefreshAt,
  hasConfiguredExchangeConnection,
  hasLiveExchangeConnection,
  activeExchangeCount,
  configuredExchangeCount,
  statusMessage = null,
  unreadAlertCount,
  isRefreshing = false,
  onRefresh,
  onOpenConnections,
}: NavbarProps) {
  const managedExchangeCount =
    activeExchangeCount > 0 ? activeExchangeCount : configuredExchangeCount;
  const exchangeUnit =
    managedExchangeCount === 1 ? "active connection" : "active connections";
  const connectionCopy = hasLiveExchangeConnection
    ? `Portfolio is aggregated across ${managedExchangeCount} ${exchangeUnit}.`
    : hasConfiguredExchangeConnection
      ? statusMessage || `${managedExchangeCount} ${exchangeUnit} configured. Refresh to retry live data sync.`
      : "Manage Binance and OKX connections to unlock backend-driven spot balances and futures data.";

  const refreshLabel = formatRefreshLabel(lastRefreshAt, hasConfiguredExchangeConnection);
  const refreshStatusLabel = hasLiveExchangeConnection
    ? "Last Refresh"
    : hasConfiguredExchangeConnection
      ? "Connection Saved"
      : "No Connection";
  const refreshStatusClass = hasLiveExchangeConnection
    ? "text-success"
    : hasConfiguredExchangeConnection
      ? "text-primary"
      : "text-warning-accent";
  const refreshDotClass = hasLiveExchangeConnection
    ? "animate-pulse bg-success"
    : hasConfiguredExchangeConnection
      ? "bg-primary"
      : "bg-warning-accent";

  return (
    <header className="sticky top-0 z-30 flex min-h-20 flex-wrap items-center justify-between gap-4 bg-main-bg px-5 py-4 md:px-8">
      <div className="flex items-center gap-4">
        <h2 className="block bg-gradient-to-r from-text-primary to-text-secondary bg-clip-text text-xl font-bold tracking-wider text-transparent md:hidden">
          RiskHub
        </h2>
        <div className="hidden md:flex flex-col">
          <span className="text-text-primary font-medium tracking-wide">RiskHub Dashboard</span>
          <span className="text-xs tracking-wider text-text-secondary">{connectionCopy}</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 md:gap-5">
        <div className="hidden min-w-[150px] rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-2 md:flex md:flex-col">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Active Connections
          </span>
          <span className="mt-1 font-mono text-lg font-semibold text-text-primary">
            {activeExchangeCount}
          </span>
          <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">
            {configuredExchangeCount} saved
          </span>
        </div>

        <div className="flex flex-col items-end gap-1 text-xs text-gray-400">
          <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 font-mono">
            {refreshLabel}
          </span>
          <span className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest ${refreshStatusClass}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${refreshDotClass}`} />
            {refreshStatusLabel}
          </span>
        </div>

        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-gray-300 shadow-[inset_0_1px_4px_rgba(255,255,255,0.1)] transition-all hover:bg-white/10 hover:text-white"
          aria-label="Alerts"
        >
          <Bell size={18} />
          {unreadAlertCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full border border-white/20 bg-danger px-1 text-[10px] font-bold text-white shadow-[0_0_10px_rgba(239,68,68,0.8)]">
              {Math.min(unreadAlertCount, 99)}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={!hasConfiguredExchangeConnection || isRefreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text-primary transition-all hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
          <span>{isRefreshing ? "Refreshing..." : "Refresh All Data"}</span>
        </button>

        <button
          type="button"
          onClick={onOpenConnections}
          className="group inline-flex items-center gap-2.5 rounded-xl border border-primary/30 bg-gradient-to-r from-primary/20 to-primary/10 px-4 py-2.5 text-sm font-medium transition-all hover:from-primary/30 hover:to-primary/20"
        >
          {hasConfiguredExchangeConnection ? (
            <ShieldCheck size={16} className="text-primary transition-all group-hover:drop-shadow-[0_0_8px_rgba(26,86,219,0.8)]" />
          ) : (
            <Link2 size={16} className="text-primary transition-all group-hover:drop-shadow-[0_0_8px_rgba(26,86,219,0.8)]" />
          )}
          <span className="tracking-wide text-gray-200">
            Manage Connections
          </span>
        </button>
      </div>
    </header>
  );
}
