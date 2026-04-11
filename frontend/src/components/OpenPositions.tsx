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
    ? "Manage at least one futures connection to load live positions."
    : sourceState === "error"
      ? statusMessage || "Live positions are currently unavailable across active exchanges."
      : sourceState === "no_open_positions"
        ? "No open futures positions were found across active exchanges."
        : statusMessage || "No open futures positions found.";

  return (
    <div className="glass-card rounded-2xl p-6 shadow-xl border border-white/5 relative z-10 transition-all hover:border-white/10 group">
      <h3 className="text-lg font-semibold mb-5 text-white flex justify-between items-center">
        <span>Open Positions</span>
        <span className="text-xs bg-primary/20 text-primary px-2.5 py-1 rounded-full font-medium border border-primary/30">
          {isLoading ? '...' : `${displayPositions.length} Active`}
        </span>
      </h3>
      <div className="flex flex-col gap-3">
        {!isLoading && sourceState === "partial" && (statusMessage || partialWarnings.length > 0) ? (
          <div className="rounded-xl border border-warning-accent/30 bg-warning-accent/10 px-4 py-3 text-sm text-warning-accent">
            <div className="font-semibold tracking-wide text-white">
              {statusMessage || "Partial positions data loaded."}
            </div>
            {partialWarnings.length > 0 ? (
              <div className="mt-2 flex flex-col gap-1 text-xs leading-5 text-warning-accent">
                {partialWarnings.map((warning, index) => (
                  <div key={`${warning}-${index}`}>{warning}</div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {isLoading ? (
          <div className="text-gray-500 text-sm animate-pulse text-center py-10">Fetching live positions...</div>
        ) : displayPositions.length === 0 ? (
          <div className="text-gray-500 text-sm text-center py-10 italic">{emptyStateMessage}</div>
        ) : (
          displayPositions.map((pos, i) => {
            const pnlValue = parseFloat(pos.unrealized_pnl || '0');
            const isPositive = pnlValue >= 0;
            const exchangeMeta = getExchangeMeta(pos.exchange_id);

            return (
              <div key={`${pos.exchange_id ?? "unknown"}-${pos.symbol}-${pos.side}-${i}`} className="flex justify-between items-center bg-white/[0.03] hover:bg-white/[0.06] transition-colors p-4 rounded-xl border border-white/5 backdrop-blur-sm">
                <div className="flex flex-col">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="font-bold text-sm tracking-wide text-white">{pos.symbol}</div>
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${exchangeMeta.badgeClassName}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${exchangeMeta.badgeDotClassName}`}
                      />
                      {exchangeMeta.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${pos.side.toLowerCase() === 'long' ? 'bg-success/20 text-success border border-success/30' : 'bg-danger/20 text-danger border border-danger/30'}`}>
                      {pos.side}
                    </span>
                    <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-gray-300 border border-white/10">{pos.leverage}x</span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <div className={`font-mono text-base font-bold tracking-tight ${isPositive ? 'text-success drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'text-danger drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}>
                    {isPositive ? '+' : ''}${Math.abs(pnlValue).toFixed(2)}
                  </div>
                  <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">Unrealized PnL</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
