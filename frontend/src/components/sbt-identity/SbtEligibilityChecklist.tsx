import { CheckCircle2, Circle, ShieldAlert, WandSparkles } from "lucide-react";
import type { EligibilityResult } from "../../lib/sbtIdentity";

interface SbtEligibilityChecklistProps {
  loading?: boolean;
  result: EligibilityResult;
  nextStepTitle: string;
  nextStepDetail: string;
}

function ChecklistColumn({
  title,
  items,
  kind,
  emptyLabel,
}: {
  title: string;
  items: string[];
  kind: "ready" | "missing" | "blocking";
  emptyLabel: string;
}) {
  const icon =
    kind === "ready" ? <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-300" /> :
    kind === "blocking" ? <ShieldAlert size={15} className="mt-0.5 shrink-0 text-amber-300" /> :
    <Circle size={15} className="mt-0.5 shrink-0 text-text-secondary" />;

  const titleClass =
    kind === "ready" ? "text-emerald-200" :
    kind === "blocking" ? "text-amber-200" :
    "text-text-primary";

  return (
    <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
      <div className={`text-[10px] font-bold uppercase tracking-[0.2em] ${titleClass}`}>{title}</div>
      <div className="mt-3 space-y-2 text-sm text-text-secondary">
        {items.length > 0 ? (
          items.map((item) => (
            <div key={item} className="flex items-start gap-2">
              {icon}
              <span>{item}</span>
            </div>
          ))
        ) : (
          <div className="text-text-secondary">{emptyLabel}</div>
        )}
      </div>
    </div>
  );
}

export function SbtEligibilityChecklist({
  loading = false,
  result,
  nextStepTitle,
  nextStepDetail,
}: SbtEligibilityChecklistProps) {
  return (
    <section className="glass-card rounded-3xl border border-white/6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">
            Readiness Checklist
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            {loading
              ? "Loading identity snapshot... Eligibility will be evaluated once your profile data is ready."
              : "This checklist explains what is ready, what is still missing, and whether the preview or issue steps are available."}
          </p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
          loading
            ? "border-white/10 bg-white/5 text-text-secondary"
            : result.previewAllowed
              ? "border-primary/25 bg-primary/10 text-primary-light"
              : "border-white/10 bg-white/5 text-text-secondary"
        }`}>
          {loading ? "Snapshot loading" : result.previewAllowed ? "Preview allowed" : "Preview blocked"}
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] p-5">
          <div className="text-sm font-semibold text-white">Loading identity snapshot...</div>
          <div className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            RiskHub is still collecting the discipline, risk, and activity inputs needed for an honest readiness decision. The checklist will
            switch to ready, missing, and blocking items once the snapshot finishes loading.
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-3">
          <ChecklistColumn
            title="Ready now"
            items={result.met}
            kind="ready"
            emptyLabel="RiskHub has not confirmed any readiness items yet."
          />
          <ChecklistColumn
            title="Still needed"
            items={result.missing}
            kind="missing"
            emptyLabel="Nothing else is missing right now."
          />
          <ChecklistColumn
            title="Blocking demo issue"
            items={result.blockers}
            kind="blocking"
            emptyLabel="There are no active blockers to issuing the demo identity."
          />
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-4">
        <div className="flex items-center gap-2 text-primary-light">
          <WandSparkles size={16} />
          <span className="text-[10px] font-bold uppercase tracking-[0.2em]">Next best step</span>
        </div>
        <div className="mt-2 text-base font-semibold text-white">{nextStepTitle}</div>
        <div className="mt-1 text-sm leading-6 text-text-secondary">{nextStepDetail}</div>
      </div>
    </section>
  );
}
