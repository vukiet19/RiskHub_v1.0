import { LayoutDashboard, Activity, Fingerprint, History, Settings, Menu } from 'lucide-react';

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  return (
    <aside
      className={`bg-surface-low flex-col hidden md:flex relative z-20 transition-all duration-300 border-r border-white/5 overflow-hidden ${
        collapsed ? 'w-20' : 'w-64'
      }`}
      style={{ willChange: 'width' }}
    >
      <div className={`flex items-center p-6 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-[0_0_15px_rgba(26,86,219,0.5)] shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 tracking-wider">RiskHub</h1>
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-gray-300 transition-all hover:bg-white/10 hover:text-white shrink-0"
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            title={collapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <Menu size={16} />
          </button>
        )}
      </div>
      
      <nav className={`flex-1 mt-2 space-y-1.5 ${collapsed ? 'px-3' : 'px-4'}`}>
        <NavItem icon={<LayoutDashboard size={18} />} label="Dashboard" active collapsed={collapsed} />
        <NavItem icon={<Activity size={18} />} label="Risk Analysis" collapsed={collapsed} />
        <NavItem icon={<Fingerprint size={18} />} label="SBT Identity" collapsed={collapsed} />
        <NavItem icon={<History size={18} />} label="Alert History" collapsed={collapsed} />
        <NavItem icon={<Settings size={18} />} label="Settings" collapsed={collapsed} />
      </nav>
      
      {!collapsed && (
        <div className="p-6 mt-auto whitespace-nowrap">
          <div className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Backend Sync Flow</h4>
            <div className="space-y-3">
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-gray-300 font-medium">Credentials</span>
                <div className="flex items-center gap-2 bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                  <span className="text-[9px] uppercase tracking-wider text-primary font-bold">Encrypted</span>
                </div>
              </div>
              <div className="flex justify-between items-center gap-4">
                <span className="text-sm text-gray-300 font-medium whitespace-nowrap">Exchange Data</span>
                <div className="flex items-center gap-2 bg-white/5 px-2 py-0.5 rounded-full border border-white/10 shrink-0">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning-accent"></span>
                  <span className="text-[9px] uppercase tracking-wider text-gray-300 font-bold whitespace-nowrap">Header Action</span>
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-text-secondary whitespace-normal">
              Use Manage Connections to save one active Binance or OKX futures account per exchange, then refresh to pull backend-managed positions, contagion inputs, and aggregated overview data.
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}

function NavItem({ icon, label, active = false, collapsed = false }: { icon: React.ReactNode; label: string; active?: boolean; collapsed?: boolean }) {
  return (
    <a href="#" className={`flex items-center py-3 transition-colors duration-300 group ${active ? 'text-text-primary font-medium relative' : 'text-text-secondary hover:text-text-primary'} ${collapsed ? 'justify-center rounded-xl hover:bg-white/5' : 'px-4 gap-3'}`} title={collapsed ? label : undefined}>
      {active && !collapsed && <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary"></div>}
      {active && collapsed && <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-md bg-primary"></div>}
      <div className={`${active ? 'text-primary' : 'text-text-secondary group-hover:text-text-primary'} transition-colors shrink-0`}>{icon}</div>
      {!collapsed && <span className="tracking-wide text-sm whitespace-nowrap overflow-hidden text-ellipsis">{label}</span>}
    </a>
  );
}
