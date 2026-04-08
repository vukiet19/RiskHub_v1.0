import { AlertTriangle, Info, ShieldAlert } from 'lucide-react';

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
    <div className="bg-surface-high hover:bg-surface-highest rounded-md p-6 flex-1 relative overflow-hidden group transition-colors">
      
      <div className="flex justify-between items-center mb-5 relative z-10">
        <h3 className="text-lg font-semibold text-text-primary">Recent Alerts</h3>
        <span className="text-[10px] uppercase tracking-widest text-text-secondary bg-surface-lowest px-2 py-1 rounded flex items-center gap-2">
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
            let severityBorderClass = 'border-l-primary';
            let severityTextClass = 'text-primary-light';
            let IconClass = Info;

            if (isCritical) {
              severityBorderClass = 'border-l-danger-accent';
              severityTextClass = 'text-danger-accent';
              IconClass = ShieldAlert;
            } else if (isWarning || isCaution) {
              severityBorderClass = 'border-l-warning-accent';
              severityTextClass = 'text-warning-accent';
              IconClass = AlertTriangle;
            }

            const timeAgo = new Date(alert.triggered_at).toLocaleTimeString();

            return (
              <div key={alert.id || alert.triggered_at} className={`group/alert relative overflow-hidden rounded-md bg-surface-low p-4 transition-colors hover:bg-surface-highest border-l-2 ${severityBorderClass}`}>
                <div className="flex gap-4">
                  <div className={`p-2 rounded-lg h-fit ${severityTextClass}`}>
                    <IconClass size={20} />
                  </div>
                  <div className="flex-1">
                    <h4 className="text-sm font-semibold text-text-primary tracking-wide">{alert.title}</h4>
                    <p className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                      {alert.message}
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span className="text-[10px] text-text-secondary">{timeAgo}</span>
                      {!alert.is_read && (
                        <button className={`text-[10px] uppercase font-bold ${severityTextClass} hover:opacity-80 tracking-wider`}>Acknowledge</button>
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
