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
    <div className="bg-surface-high hover:bg-surface-highest rounded-md p-6 relative overflow-hidden group transition-colors">
      <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
      </div>

      <h3 className="text-lg font-semibold mb-6 text-text-primary tracking-wide">Net PnL by Exchange</h3>
      
      <div className="space-y-4 relative z-10">
        {hasExchangeData ? exchanges.map((ex: ExchangeData, idx: number) => {
          const isBinance = ex.exchange_id.toLowerCase() === 'binance';
          const isOkx = ex.exchange_id.toLowerCase() === 'okx';
          const symbol = isBinance ? 'B' : isOkx ? 'O' : ex.exchange_id.charAt(0).toUpperCase();
          const pnlNum = parseFloat(ex.net_pnl_usd || '0');
          const isPositive = pnlNum >= 0;

          return (
            <div key={idx} className="flex justify-between items-center bg-surface-low p-4 rounded-md hover:bg-surface-highest transition-colors">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-full p-[1px] shadow-[0_0_15px_rgba(255,255,255,0.1)] ${isBinance ? 'bg-gradient-to-br from-yellow-400 to-yellow-600' : isOkx ? 'bg-gradient-to-br from-blue-400 to-blue-600' : 'bg-gradient-to-br from-gray-400 to-gray-600'}`}>
                  <div className={`w-full h-full bg-main-bg bg-opacity-60 rounded-full flex items-center justify-center font-bold text-sm ${isBinance ? 'text-yellow-400' : isOkx ? 'text-blue-400' : 'text-gray-400'}`}>
                    {symbol}
                  </div>
                </div>
                <div>
                  <span className="font-semibold text-text-primary tracking-wide block capitalize">{ex.exchange_id}</span>
                  <span className="text-[10px] text-text-secondary uppercase tracking-widest">{ex.trade_count ? `${ex.trade_count} Trades` : 'Account'}</span>
                </div>
              </div>
              <span className={`font-mono font-bold tracking-tight text-lg ${isPositive ? 'text-success' : 'text-danger'}`}>
                {isPositive ? '+' : ''}${Math.abs(pnlNum).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          );
        }) : (
          <div className="rounded-md border border-dashed border-white/10 bg-surface-low px-4 py-8 text-center text-sm text-text-secondary">
            {isConnected
              ? "No synced trade history is available yet. Refresh after your Binance Testnet account has recorded trades."
              : "Connect Binance Testnet to load backend-synced exchange PnL."}
          </div>
        )}
      </div>
      
      <div className="mt-8 pt-6 relative z-10">
        <div className="flex justify-between items-end text-sm">
          <span className="text-text-secondary uppercase tracking-widest text-xs font-semibold">Total Realized PnL</span>
          <div className="flex flex-col items-end">
            <span className={`font-bold font-mono text-2xl drop-shadow-[0_0_8px_rgba(16,185,129,0.3)] ${totalPnlNumber >= 0 ? 'text-success' : 'text-danger'}`}>
              {totalPnlNumber >= 0 ? '+' : ''}${Math.abs(totalPnlNumber).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
