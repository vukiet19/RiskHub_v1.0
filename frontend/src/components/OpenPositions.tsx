import { getExchangeMeta } from "../lib/exchanges";

export interface PositionData {
  symbol: string;
  side: string;
  leverage: number;
  unrealized_pnl: string;
  mark_price?: string;
  entry_price?: string;
  exchange_id?: string;
}

interface OpenPositionsProps {
  positions: PositionData[];
  isLoading?: boolean;
  isConnected?: boolean;
  sourceState?: "live" | "partial" | "no_connection" | "no_open_positions" | "error";
  statusMessage?: string | null;
  warnings?: string[];
}

export function OpenPositions({
  positions = [],
  isLoading = false,
  isConnected = false,
  sourceState = "live",
  statusMessage = null,
  warnings = [],
}: OpenPositionsProps) {
  const displayPositions = positions.length > 0 ? positions : [];
  const partialWarnings = warnings.filter(Boolean);
  const emptyStateMessage = !isConnected
    ? "Manage at least one connection with futures access to load live positions."
    : sourceState === "error"
      ? statusMessage || "Live positions are currently unavailable across active exchanges."
      : sourceState === "no_open_positions"
        ? "No open futures positions were found across active futures-enabled exchanges."
        : statusMessage || "No open futures positions found.";

  return (
    <div className="glass-card group relative z-10 flex h-full min-h-[280px] flex-col rounded-2xl border border-white/5 p-3 shadow-xl transition-all hover:border-white/10">
      <h3 className="mb-2 flex items-center justify-between text-sm font-semibold text-white">
        <span>Open Positions</span>
        <span className="rounded-full border border-primary/30 bg-primary/20 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-primary">
          {isLoading ? '...' : `${displayPositions.length} Active`}
        </span>
      </h3>
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto pr-1">
        {!isLoading && sourceState === "partial" && (statusMessage || partialWarnings.length > 0) ? (
          <div className="rounded-lg border border-warning-accent/30 bg-warning-accent/10 px-2.5 py-2 text-[11px] text-warning-accent">
            <div className="font-semibold tracking-wide text-white">
              {statusMessage || "Partial positions data loaded."}
            </div>
            {partialWarnings.length > 0 ? (
              <div className="mt-1 flex flex-col gap-1 text-[10px] leading-4 text-warning-accent">
                {partialWarnings.map((warning, index) => (
                  <div key={`${warning}-${index}`}>{warning}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {isLoading ? (
          <div className="py-6 text-center text-xs text-gray-500 animate-pulse">Fetching live positions...</div>
        ) : displayPositions.length === 0 ? (
          <div className="py-6 text-center text-xs italic text-gray-500">{emptyStateMessage}</div>
        ) : (
          displayPositions.map((pos, i) => {
            const pnlValue = parseFloat(pos.unrealized_pnl || '0');
            const isPositive = pnlValue >= 0;
            const exchangeMeta = getExchangeMeta(pos.exchange_id);

            return (
              <div
                key={`${pos.exchange_id ?? "unknown"}-${pos.symbol}-${pos.side}-${i}`}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-2.5 py-2 backdrop-blur-sm transition-colors hover:bg-white/[0.06]"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1">
                    <div className="truncate font-mono text-[13px] font-bold tracking-tight text-white">{pos.symbol}</div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.12em] ${exchangeMeta.badgeClassName}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${exchangeMeta.badgeDotClassName}`} />
                      {exchangeMeta.label}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-[0.14em] ${pos.side.toLowerCase() === 'long' ? 'border border-success/30 bg-success/20 text-success' : 'border border-danger/30 bg-danger/20 text-danger'}`}>
                      {pos.side}
                    </span>
                    <span className="rounded border border-white/10 bg-white/[0.08] px-1.5 py-0.5 font-mono text-[9px] text-gray-300">{pos.leverage}x</span>
                  </div>
                </div>
                <div className="ml-2.5 flex flex-col items-end text-right">
                  <div className={`font-mono text-[13px] font-bold tracking-tight ${isPositive ? 'text-success' : 'text-danger'}`}>
                    {isPositive ? '+' : ''}${Math.abs(pnlValue).toFixed(2)}
                  </div>
                  <div className="mt-0.5 text-[8px] font-semibold uppercase tracking-[0.16em] text-gray-500">UPnL</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
