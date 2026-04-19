import { ArrowRight, CheckCircle2, Route, Sparkles } from "lucide-react";

type DemoStepStatus = "done" | "active" | "pending";

export interface DemoFlowStep {
  key: string;
  label: string;
  status: DemoStepStatus;
}

interface SbtDemoFlowGuideProps {
  nextTitle: string;
  nextDetail: string;
  selectedSourceSummary: string;
  continuitySummary: string;
  identitySourceSummary: string;
  steps: DemoFlowStep[];
}

function stepTone(status: DemoStepStatus): string {
  if (status === "done") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (status === "active") return "border-primary/30 bg-primary/10 text-primary-light";
  return "border-white/8 bg-main-bg/40 text-text-secondary";
}

function statusLabel(status: DemoStepStatus): string {
  if (status === "done") return "Done";
  if (status === "active") return "Now";
  return "Later";
}

export function SbtDemoFlowGuide({
  nextTitle,
  nextDetail,
  selectedSourceSummary,
  continuitySummary,
  identitySourceSummary,
  steps,
}: SbtDemoFlowGuideProps) {
  return (
    <section className="glass-card rounded-3xl border border-white/6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-text-primary">
            <Route size={16} />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Suggested Demo Flow</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Use this strip to run a clean walkthrough: connect, save versions, compare changes, then issue from a chosen saved profile.
          </p>
        </div>
        <div className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-primary-light">
          Next: {nextTitle}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Selected Source</div>
          <div className="mt-2 text-sm font-semibold text-white">{selectedSourceSummary}</div>
        </div>
        <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Version Continuity</div>
          <div className="mt-2 text-sm font-semibold text-white">{continuitySummary}</div>
        </div>
        <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-3">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Demo Identity Source</div>
          <div className="mt-2 text-sm font-semibold text-white">{identitySourceSummary}</div>
        </div>
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary-light">
        <Sparkles size={16} className="mt-0.5 shrink-0" />
        <span>{nextDetail}</span>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-5">
        {steps.map((step, index) => (
          <div key={step.key} className={`rounded-xl border px-3 py-3 ${stepTone(step.status)}`}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em]">
                Step {index + 1}
              </div>
              <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em]">
                {step.status === "done" ? <CheckCircle2 size={12} /> : step.status === "active" ? <ArrowRight size={12} /> : null}
                <span>{statusLabel(step.status)}</span>
              </div>
            </div>
            <div className="mt-2 text-sm font-semibold">{step.label}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
