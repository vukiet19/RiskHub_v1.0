import { AlertTriangle, AlertCircle } from 'lucide-react';

export function AlertsPanel() {
  return (
    <div className="glass-card rounded-2xl p-6 flex-1 border border-white/5 shadow-xl relative overflow-hidden group hover:border-white/10 transition-colors">
      <div className="absolute top-0 right-0 w-40 h-40 bg-warning/5 rounded-full blur-[50px]"></div>
      
      <div className="flex justify-between items-center mb-5 relative z-10">
        <h3 className="text-lg font-semibold text-white">Recent Alerts</h3>
        <span className="text-[10px] uppercase tracking-widest text-gray-400 bg-white/5 px-2 py-1 rounded">Live</span>
      </div>
      
      <div className="flex flex-col gap-4 relative z-10">
        {/* Danger Alert */}
        <div className="group/alert relative overflow-hidden rounded-xl bg-gradient-to-r from-danger/20 to-danger/5 border border-danger/20 p-4 transition-all hover:bg-danger/20">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-danger"></div>
          <div className="flex gap-4">
            <div className="bg-danger/10 p-2 rounded-lg h-fit border border-danger/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
              <AlertTriangle size={20} className="text-danger" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white tracking-wide">Revenge Trading Detected</h4>
              <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">
                You opened a <span className="text-white font-medium">20x BTCUSDT</span> long position 6 mins after a <span className="text-danger font-mono font-medium">$72.50</span> loss.
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-500">2 mins ago</span>
                <button className="text-[10px] uppercase font-bold text-danger hover:text-danger/80 tracking-wider">Acknowledge</button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Warning Alert */}
        <div className="group/alert relative overflow-hidden rounded-xl bg-gradient-to-r from-warning/15 to-warning/5 border border-warning/20 p-4 transition-all hover:bg-warning/20">
          <div className="absolute left-0 top-0 bottom-0 w-1 bg-warning"></div>
          <div className="flex gap-4">
            <div className="bg-warning/10 p-2 rounded-lg h-fit border border-warning/20 shadow-[0_0_15px_rgba(245,158,11,0.2)]">
              <AlertCircle size={20} className="text-warning" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white tracking-wide">High Portfolio Concentration</h4>
              <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">
                Over <span className="text-white font-medium">60%</span> of your portfolio is in <span className="text-warning font-medium">BTC</span>. Consider rebalancing.
              </p>
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[10px] text-gray-500">45 mins ago</span>
                <button className="text-[10px] uppercase font-bold text-gray-400 hover:text-white tracking-wider">Dismiss</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
