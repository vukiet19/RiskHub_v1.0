import { getExchangeMeta } from "../lib/exchanges";

export interface ExchangeData {
  exchange_id: string;
  trade_count: number;
  win_rate_pct?: string | number;
  avg_leverage?: string | number;
  net_pnl_usd: string | number;
}

export interface PortfolioCardProps {
  exchanges: ExchangeData[];
  totalNetPnl: string | number;
  isConnected: boolean;
}

function toNumber(value: string | number | undefined): number {
  if (typeof value === "number") {
    return value;
  }

  return Number.parseFloat(value || "0");
}

export function PortfolioCard({
  exchanges,
  totalNetPnl,
  isConnected,
}: PortfolioCardProps) {
  const totalPnlNumber = toNumber(totalNetPnl);
  const hasExchangeData = exchanges.length > 0;

  return (
    <div className="compact-metric-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <span className="text-xs font-semibold tracking-wide text-text-primary">
            Net PnL by Exchange
          </span>
          <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-text-secondary">
            Portfolio-wide realized summary
          </p>
        </div>
        <span
          className={`font-mono text-base font-bold tracking-tight ${
            totalPnlNumber >= 0 ? "text-success" : "text-danger"
          }`}
        >
          {totalPnlNumber >= 0 ? "+" : ""}$
          {Math.abs(totalPnlNumber).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>

      {hasExchangeData ? (
        <div className="flex flex-col divide-y divide-white/5">
          {exchanges.map((exchangeRow) => {
            const exchangeMeta = getExchangeMeta(exchangeRow.exchange_id);
            const pnlNumber = toNumber(exchangeRow.net_pnl_usd);
            const winRate = toNumber(exchangeRow.win_rate_pct);
            const avgLeverage = toNumber(exchangeRow.avg_leverage);
            const hasSubMetrics =
              exchangeRow.win_rate_pct !== undefined ||
              exchangeRow.avg_leverage !== undefined;

            return (
              <div
                key={exchangeRow.exchange_id}
                className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${exchangeMeta.badgeClassName}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${exchangeMeta.badgeDotClassName}`}
                      />
                      {exchangeMeta.label}
                    </span>
                    <span className="text-[11px] font-medium text-text-secondary">
                      {exchangeRow.trade_count} closed positions
                    </span>
                  </div>
                  {hasSubMetrics ? (
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-secondary">
                      {exchangeRow.win_rate_pct !== undefined ? (
                        <span>{winRate.toFixed(0)}% win rate</span>
                      ) : null}
                      {exchangeRow.avg_leverage !== undefined ? (
                        <span>{avgLeverage.toFixed(1)}x avg leverage</span>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="text-right">
                  <div
                    className={`font-mono text-sm font-bold ${
                      pnlNumber >= 0 ? "text-success" : "text-danger"
                    }`}
                  >
                    {pnlNumber >= 0 ? "+" : ""}$
                    {Math.abs(pnlNumber).toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-text-secondary">
                    Net PnL
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mt-1 text-[11px] text-text-secondary">
          {isConnected
            ? "No synced closed-position history is available for active exchanges yet."
            : "Manage connections to load by-exchange PnL rows."}
        </div>
      )}
    </div>
  );
}
