import { AlertTriangle, AlertCircle, Info, ShieldAlert } from 'lucide-react';

export interface AlertData {
  id: string; // or _id
  rule_id: string;
  rule_name: string;
  severity: "critical" | "warning" | "caution" | "notice";
  title: string;
  message: string;
  triggered_at: string;
  is_read?: boolean;
}

export interface AlertsPanelProps {
  alerts: AlertData[];
}

export function AlertsPanel({ alerts }: AlertsPanelProps) {
  return (
    <div className="glass-card rounded-2xl p-6 flex-1 border border-white/5 shadow-xl relative overflow-hidden group hover:border-white/10 transition-colors">
      <div className="absolute top-0 right-0 w-40 h-40 bg-warning/5 rounded-full blur-[50px]"></div>
      
      <div className="flex justify-between items-center mb-5 relative z-10">
        <h3 className="text-lg font-semibold text-white">Recent Alerts</h3>
        <span className="text-[10px] uppercase tracking-widest text-gray-400 bg-white/5 px-2 py-1 rounded flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-danger animate-pulse block"></span> Live
        </span>
      </div>
      
      <div className="flex flex-col gap-4 relative z-10 overflow-y-auto max-h-[300px] pr-2 custom-scrollbar">
        {alerts.length === 0 ? (
          <div className="text-center text-gray-500 text-sm mt-4">No recent alerts. Healthy!</div>
        ) : (
          alerts.map((alert) => {
            const isCritical = alert.severity === 'critical';
            const isWarning = alert.severity === 'warning';
            const isCaution = alert.severity === 'caution';
            
            // Choose color scheme based on severity
            let colorFrom = 'from-blue-500/10';
            let colorTo = 'to-blue-500/5';
            let colorBgHover = 'hover:bg-blue-500/20';
            let colorBorder = 'border-blue-500/20';
            let colorSolid = 'bg-blue-500';
            let colorText = 'text-blue-500';
            let colorIconBg = 'bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.2)]';
            let IconClass = Info;

            if (isCritical) {
              colorFrom = 'from-danger/20';
              colorTo = 'to-danger/5';
              colorBgHover = 'hover:bg-danger/20';
              colorBorder = 'border-danger/20';
              colorSolid = 'bg-danger';
              colorText = 'text-danger';
              colorIconBg = 'bg-danger/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]';
              IconClass = ShieldAlert;
            } else if (isWarning) {
              colorFrom = 'from-warning/20';
              colorTo = 'to-warning/5';
              colorBgHover = 'hover:bg-warning/20';
              colorBorder = 'border-warning/20';
              colorSolid = 'bg-warning';
              colorText = 'text-warning';
              colorIconBg = 'bg-warning/10 shadow-[0_0_15px_rgba(245,158,11,0.2)]';
              IconClass = AlertTriangle;
            } else if (isCaution) {
              colorFrom = 'from-yellow-500/20';
              colorTo = 'to-yellow-500/5';
              colorBgHover = 'hover:bg-yellow-500/20';
              colorBorder = 'border-yellow-500/20';
              colorSolid = 'bg-yellow-500';
              colorText = 'text-yellow-500';
              colorIconBg = 'bg-yellow-500/10 shadow-[0_0_15px_rgba(234,179,8,0.2)]';
              IconClass = AlertCircle;
            }

            const timeAgo = new Date(alert.triggered_at).toLocaleTimeString();

            return (
              <div key={alert.id || alert.triggered_at} className={`group/alert relative overflow-hidden rounded-xl bg-gradient-to-r ${colorFrom} ${colorTo} border ${colorBorder} p-4 transition-all ${colorBgHover}`}>
                <div className={`absolute left-0 top-0 bottom-0 w-1 ${colorSolid}`}></div>
                <div className="flex gap-4">
                  <div className={`p-2 rounded-lg h-fit border ${colorBorder} ${colorIconBg}`}>
                    <IconClass size={20} className={colorText} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-white tracking-wide">{alert.title}</h4>
                    <p className="text-xs text-gray-300 mt-1.5 leading-relaxed">
                      {alert.message}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] text-gray-500">{timeAgo}</span>
                      {!alert.is_read && (
                        <button className={`text-[10px] uppercase font-bold ${colorText} hover:opacity-80 tracking-wider`}>Acknowledge</button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
