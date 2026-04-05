export function OpenPositions() {
  const positions = [
    { symbol: 'BTCUSDT', side: 'Long', leverage: 20, pnl: 450.20, isPositive: true },
    { symbol: 'ETHUSDT', side: 'Short', leverage: 10, pnl: -120.50, isPositive: false },
    { symbol: 'SOLUSDT', side: 'Long', leverage: 15, pnl: 85.00, isPositive: true }
  ];

  return (
    <div className="glass-card flex-1 rounded-2xl p-6 shadow-xl border border-white/5 relative z-10 transition-all hover:border-white/10 group">
      <h3 className="text-lg font-semibold mb-5 text-white flex justify-between items-center">
        <span>Open Positions</span>
        <span className="text-xs bg-primary/20 text-primary px-2.5 py-1 rounded-full font-medium border border-primary/30">3 Active</span>
      </h3>
      <div className="flex flex-col gap-3">
        {positions.map((pos, i) => (
          <div key={i} className="flex justify-between items-center bg-white/[0.03] hover:bg-white/[0.06] transition-colors p-4 rounded-xl border border-white/5 backdrop-blur-sm">
            <div className="flex flex-col">
              <div className="font-bold text-sm tracking-wide text-white">{pos.symbol}</div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${pos.side === 'Long' ? 'bg-success/20 text-success border border-success/30' : 'bg-danger/20 text-danger border border-danger/30'}`}>
                  {pos.side}
                </span>
                <span className="text-[10px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-gray-300 border border-white/10">{pos.leverage}x</span>
              </div>
            </div>
            <div className="flex flex-col items-end">
              <div className={`font-mono text-base font-bold tracking-tight ${pos.isPositive ? 'text-success drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]' : 'text-danger drop-shadow-[0_0_8px_rgba(239,68,68,0.4)]'}`}>
                {pos.isPositive ? '+' : '-'}${Math.abs(pos.pnl).toFixed(2)}
              </div>
              <div className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">Unrealized PnL</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
