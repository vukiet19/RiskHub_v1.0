"use client";

import {
  AlertTriangle,
  BellRing,
  CircleDot,
  ShieldAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  AlertHistoryAlert,
  AlertHistoryDayGroup,
} from "../../lib/alertHistory";

interface AlertHistoryDayGroupListProps {
  groups: AlertHistoryDayGroup[];
  selectedAlertId: string | null;
  onSelectAlert: (alert: AlertHistoryAlert) => void;
}

function formatTriggerTime(value: string | null): string {
  if (!value) {
    return "Unknown time";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function severityBadge(severity: string): {
  label: string;
  className: string;
  icon: ReactNode;
} {
  switch (severity.toLowerCase()) {
    case "critical":
      return {
        label: "Critical",
        className: "border-danger/30 bg-danger/10 text-danger",
        icon: <ShieldAlert size={14} />,
      };
    case "warning":
      return {
        label: "Warning",
        className: "border-warning/30 bg-warning/10 text-warning",
        icon: <AlertTriangle size={14} />,
      };
    case "caution":
      return {
        label: "Caution",
        className: "border-warning/30 bg-warning/10 text-warning",
        icon: <AlertTriangle size={14} />,
      };
    default:
      return {
        label: "Notice",
        className: "border-primary/30 bg-primary/10 text-primary-light",
        icon: <BellRing size={14} />,
      };
  }
}

function toLabel(value: string | null): string {
  if (!value) return "Unknown";
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AlertHistoryDayGroupList({
  groups,
  selectedAlertId,
  onSelectAlert,
}: AlertHistoryDayGroupListProps) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section
          key={`${group.date}-${group.label}`}
          className="rounded-2xl border border-white/8 bg-surface-high/55 p-4 md:p-5"
        >
          <header className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-white/6 pb-3">
            <div>
              <h3 className="text-base font-semibold text-text-primary">{group.label}</h3>
              <p className="text-xs text-text-secondary">
                {group.alert_count} alert{group.alert_count === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-text-secondary">
              {group.severity_summary.critical > 0 ? (
                <span>{group.severity_summary.critical} critical</span>
              ) : null}
              {group.severity_summary.warning > 0 ? (
                <span>{group.severity_summary.warning} warning</span>
              ) : null}
              {group.severity_summary.caution > 0 ? (
                <span>{group.severity_summary.caution} caution</span>
              ) : null}
            </div>
          </header>

          <div className="space-y-2.5">
            {group.alerts.map((alert) => {
              const badge = severityBadge(alert.severity);
              const isSelected = selectedAlertId === alert.id;
              return (
                <button
                  key={alert.id}
                  type="button"
                  onClick={() => onSelectAlert(alert)}
                  className={`w-full rounded-xl border p-3 text-left transition ${
                    isSelected
                      ? "border-primary/40 bg-primary/10"
                      : "border-white/10 bg-main-bg/45 hover:border-white/20 hover:bg-main-bg/65"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${badge.className}`}
                        >
                          {badge.icon}
                          {badge.label}
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">
                          {toLabel(alert.category)}
                        </span>
                        {!alert.is_read ? (
                          <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.18em] text-primary-light">
                            <CircleDot size={12} />
                            Unread
                          </span>
                        ) : null}
                      </div>
                      <h4 className="mt-2 text-sm font-semibold text-text-primary">{alert.title}</h4>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-text-secondary">
                        {alert.message}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-secondary">
                        <span>{formatTriggerTime(alert.triggered_at)}</span>
                        <span>{alert.rule_name || alert.rule_id}</span>
                        {alert.exchange_id ? <span>{toLabel(alert.exchange_id)}</span> : null}
                        {alert.symbol ? <span>{alert.symbol}</span> : null}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
