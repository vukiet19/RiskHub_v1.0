export function PortfolioCard() {
  return (
    <div className="glass-card rounded-2xl p-6 border border-white/5 shadow-xl relative overflow-hidden group hover:border-white/10 transition-colors">
      <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-40 transition-opacity">
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" className="text-primary"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
      </div>

      <h3 className="text-lg font-semibold mb-6 text-white tracking-wide">Portfolio Breakdown</h3>
      
      <div className="space-y-4 relative z-10">
        <div className="flex justify-between items-center bg-white/[0.04] p-4 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/[0.08] transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 p-[1px] shadow-[0_0_15px_rgba(234,179,8,0.2)]">
              <div className="w-full h-full bg-black/60 rounded-full flex items-center justify-center font-bold text-yellow-400">B</div>
            </div>
            <div>
              <span className="font-semibold text-white tracking-wide block">Binance</span>
              <span className="text-[10px] text-gray-400 uppercase tracking-widest">Main Account</span>
            </div>
          </div>
          <span className="font-mono text-white font-bold tracking-tight text-lg">$21,450.20</span>
        </div>
        
        <div className="flex justify-between items-center bg-white/[0.04] p-4 rounded-xl border border-white/10 backdrop-blur-md hover:bg-white/[0.08] transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 p-[1px] shadow-[0_0_15px_rgba(59,130,246,0.2)]">
              <div className="w-full h-full bg-black/60 rounded-full flex items-center justify-center font-bold text-blue-400 text-sm">O</div>
            </div>
            <div>
              <span className="font-semibold text-white tracking-wide block">OKX</span>
              <span className="text-[10px] text-gray-400 uppercase tracking-widest">Futures</span>
            </div>
          </div>
          <span className="font-mono text-white font-bold tracking-tight text-lg">$23,780.30</span>
        </div>
      </div>
      
      <div className="mt-8 pt-6 border-t border-white/10 relative z-10">
        <div className="flex justify-between items-end text-sm">
          <span className="text-gray-400 uppercase tracking-widest text-xs font-semibold">Total Unrealized PnL</span>
          <div className="flex flex-col items-end">
            <span className="text-success font-bold font-mono text-2xl drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]">+$1,240.50</span>
            <span className="text-success/80 text-xs mt-1 bg-success/10 px-2 py-0.5 rounded border border-success/20">+2.8% Today</span>
          </div>
        </div>
      </div>
    </div>
  );
}
