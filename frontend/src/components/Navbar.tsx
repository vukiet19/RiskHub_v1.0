import { Bell, Wallet } from 'lucide-react';

export function Navbar() {
  return (
    <header className="h-20 bg-main-bg flex items-center justify-between px-8 sticky top-0 z-30">
      <div className="flex items-center gap-4">
        <h2 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-text-primary to-text-secondary block md:hidden tracking-wider">RiskHub</h2>
        <div className="hidden md:flex flex-col">
          <span className="text-text-primary font-medium tracking-wide">Good evening, Alex</span>
          <span className="text-xs text-text-secondary tracking-wider">Your portfolio is relatively stable today.</span>
        </div>
      </div>
      
      <div className="flex items-center gap-8">
        <div className="flex flex-col items-end">
          <span className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-1">Total Portfolio Value</span>
          <span className="text-2xl font-bold font-mono text-white tracking-tight drop-shadow-[0_0_15px_rgba(255,255,255,0.1)]">$45,230.50</span>
        </div>
        
        <div className="h-10 w-px bg-white/10"></div>
        
        <div className="text-xs text-gray-400 flex flex-col items-end gap-1">
          <span className="font-mono bg-white/5 px-2 py-0.5 rounded border border-white/10">10:45:02</span>
          <span className="text-[10px] text-success uppercase tracking-widest font-bold flex items-center gap-1.5"><span className="w-1.5 h-1.5 bg-success rounded-full animate-pulse"></span> Last Sync</span>
        </div>
        
        <button className="relative w-10 h-10 flex items-center justify-center rounded-full bg-white/[0.03] border border-white/10 text-gray-300 hover:text-white hover:bg-white/10 transition-all shadow-[inset_0_1px_4px_rgba(255,255,255,0.1)]">
          <Bell size={18} />
          <span className="absolute top-0 right-0 w-3 h-3 bg-danger rounded-full ring-2 ring-[#0F172A] border border-white/20 shadow-[0_0_10px_rgba(239,68,68,0.8)]"></span>
        </button>
        
        <button className="hidden sm:flex items-center gap-2.5 bg-gradient-to-r from-primary/20 to-primary/10 hover:from-primary/30 hover:to-primary/20 text-sm font-medium px-5 py-2.5 rounded-xl transition-all border border-primary/30 shadow-[0_0_20px_rgba(26,86,219,0.15)] group">
          <Wallet size={16} className="text-primary group-hover:drop-shadow-[0_0_8px_rgba(26,86,219,0.8)] transition-all" />
          <span className="font-mono text-gray-200 tracking-wide">0xAbCd...EfGh</span>
        </button>
      </div>
    </header>
  );
}
