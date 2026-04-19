"use client";

interface AlertHistorySummaryProps {
  unread: number;
  critical: number;
  warning: number;
  last7Days: number;
}

function SummaryCard({
  label,
  value,
  toneClass,
}: {
  label: string;
  value: number;
  toneClass: string;
}) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-text-secondary">{label}</div>
      <div className={`mt-2 font-mono text-2xl font-bold tracking-tight ${toneClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

export function AlertHistorySummary({
  unread,
  critical,
  warning,
  last7Days,
}: AlertHistorySummaryProps) {
  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <SummaryCard label="Unread" value={unread} toneClass="text-primary-light" />
      <SummaryCard label="Critical" value={critical} toneClass="text-danger" />
      <SummaryCard label="Warnings" value={warning} toneClass="text-warning" />
      <SummaryCard label="Last 7 Days" value={last7Days} toneClass="text-text-primary" />
    </section>
  );
}
