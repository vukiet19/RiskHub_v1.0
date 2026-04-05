import { LayoutDashboard, Activity, Fingerprint, History, Settings } from 'lucide-react';

export function Sidebar() {
  return (
    <aside className="w-64 glass border-r bg-white/[0.02] border-white/5 flex flex-col hidden md:flex relative z-20">
      <div className="p-8 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-[0_0_15px_rgba(26,86,219,0.5)]">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
        </div>
        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 tracking-wider">RiskHub</h1>
      </div>
      
      <nav className="flex-1 px-4 space-y-1.5 mt-4">
        <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active />
        <NavItem icon={<Activity size={18} />} label="Risk Analysis" />
        <NavItem icon={<Fingerprint size={18} />} label="SBT Identity" />
        <NavItem icon={<History size={18} />} label="Alert History" />
        <NavItem icon={<Settings size={18} />} label="Settings" />
      </nav>
      
      <div className="p-6 mt-auto">
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
          <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Live Connections</h4>
          <div className="space-y-3">
            <div className="flex justify-between items-center group cursor-pointer">
              <span className="text-sm text-gray-300 font-medium group-hover:text-white transition-colors">Binance</span>
              <div className="flex items-center gap-2 block bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                <span className="text-[9px] uppercase tracking-wider text-success font-bold">Sync</span>
              </div>
            </div>
            <div className="flex justify-between items-center group cursor-pointer">
              <span className="text-sm text-gray-300 font-medium group-hover:text-white transition-colors">OKX</span>
              <div className="flex items-center gap-2 block bg-success/10 px-2 py-0.5 rounded-full border border-success/20">
                <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse"></span>
                <span className="text-[9px] uppercase tracking-wider text-success font-bold">Sync</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function NavItem({ icon, label, active = false }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <a href="#" className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group ${active ? 'bg-gradient-to-r from-primary/20 to-primary/5 text-primary font-medium border border-primary/20 shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)] relative' : 'text-gray-400 hover:text-white hover:bg-white/[0.05]'}`}>
      {active && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full bg-primary shadow-[0_0_10px_rgba(26,86,219,0.8)]"></div>}
      <div className={`${active ? 'text-primary' : 'text-gray-500 group-hover:text-gray-300'} transition-colors`}>{icon}</div>
      <span className="tracking-wide text-sm">{label}</span>
    </a>
  );
}
