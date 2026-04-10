export interface ExchangeData {
  exchange_id: string;
  trade_count: number;
  win_rate_pct: string;
  avg_leverage: string;
  net_pnl_usd: string;
}

export interface PortfolioCardProps {
  exchanges: ExchangeData[];
  totalNetPnl: string | number;
  isConnected: boolean;
}

export function PortfolioCard({ exchanges, totalNetPnl, isConnected }: PortfolioCardProps) {
  const totalPnlNumber = typeof totalNetPnl === "number"
    ? totalNetPnl
    : parseFloat(totalNetPnl || "0");
  const hasExchangeData = exchanges.length > 0;

  return (
    <div className="compact-metric-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: hasExchangeData ? 10 : 0 }}>
        <span className="text-xs font-semibold text-text-primary tracking-wide">Net PnL by Exchange</span>
        <span className={`font-mono text-base font-bold tracking-tight ${totalPnlNumber >= 0 ? 'text-success' : 'text-danger'}`}>
          {totalPnlNumber >= 0 ? '+' : ''}${Math.abs(totalPnlNumber).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      </div>

      {hasExchangeData ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {exchanges.map((ex: ExchangeData, idx: number) => {
            const isBinance = ex.exchange_id.toLowerCase() === 'binance';
            const isOkx = ex.exchange_id.toLowerCase() === 'okx';
            const symbol = isBinance ? 'B' : isOkx ? 'O' : ex.exchange_id.charAt(0).toUpperCase();
            const pnlNum = parseFloat(ex.net_pnl_usd || '0');
            const isPositive = pnlNum >= 0;

            return (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: idx < exchanges.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div className={`w-7 h-7 rounded-full p-[1px] ${isBinance ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : isOkx ? 'bg-gradient-to-br from-blue-400 to-blue-600' : 'bg-gradient-to-br from-gray-400 to-gray-600'}`}>
                    <div className={`w-full h-full bg-main-bg bg-opacity-60 rounded-full flex items-center justify-center font-bold text-[10px] ${isBinance ? 'text-yellow-400' : isOkx ? 'text-blue-400' : 'text-gray-400'}`}>
                      {symbol}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-semibold text-text-primary capitalize">{ex.exchange_id}</span>
                    <span className="text-[9px] text-text-secondary uppercase tracking-widest ml-2">{ex.trade_count ? `${ex.trade_count}T` : ''}</span>
                  </div>
                </div>
                <span className={`font-mono font-bold text-xs ${isPositive ? 'text-success' : 'text-danger'}`}>
                  {isPositive ? '+' : ''}${Math.abs(pnlNum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-[10px] text-text-secondary" style={{ marginTop: 4 }}>
          {isConnected
            ? "No synced trade history yet."
            : "Connect exchange to load PnL data."}
        </div>
      )}
    </div>
  );
}
