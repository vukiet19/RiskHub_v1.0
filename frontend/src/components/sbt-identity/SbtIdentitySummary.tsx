import type { SummaryGroup } from "../../lib/sbtIdentity";

interface SbtIdentitySummaryProps {
  groups: SummaryGroup[];
}

export function SbtIdentitySummary({ groups }: SbtIdentitySummaryProps) {
  return (
    <section className="glass-card rounded-3xl border border-white/6 p-5">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Profile Summary</div>
        <p className="mt-2 text-sm leading-6 text-text-secondary">
          A calmer snapshot of the three things that matter most for identity readiness: discipline, risk, and activity.
        </p>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-3">
        {groups.map((group) => (
          <div key={group.key} className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
            <div className="text-sm font-semibold text-white">{group.title}</div>
            <p className="mt-1 text-xs leading-5 text-text-secondary">{group.description}</p>
            <div className="mt-4 space-y-3">
              {group.metrics.map((metric) => (
                <div key={`${group.key}-${metric.label}`} className="rounded-xl border border-white/5 bg-main-bg/40 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{metric.label}</div>
                  <div className="mt-2 font-mono text-lg font-semibold text-white">{metric.value}</div>
                  <div className="mt-1 text-xs leading-5 text-text-secondary">{metric.hint}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
