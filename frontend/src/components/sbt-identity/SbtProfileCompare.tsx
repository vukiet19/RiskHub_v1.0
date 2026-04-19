import { GitCompareArrows } from "lucide-react";
import { getCompareStateCopy, type ProfileCompareTarget, type RiskProfileCompareResponse } from "../../lib/sbtIdentity";

function toneClass(tone: "neutral" | "good" | "warn") {
  if (tone === "good") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (tone === "warn") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  return "border-white/10 bg-white/5 text-text-secondary";
}

function changeClass(changeState: string | undefined) {
  if (changeState === "changed") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  if (changeState === "same") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  return "border-white/10 bg-white/5 text-text-secondary";
}

interface SbtProfileCompareProps {
  savedProfileExists: boolean;
  compareResult: RiskProfileCompareResponse | null;
  isComparing: boolean;
  selectedVersionLabel: string;
  compareTarget: ProfileCompareTarget;
  compareDisabled?: boolean;
  onSelectTarget: (target: ProfileCompareTarget) => void | Promise<void>;
  onRunCompare: () => void | Promise<void>;
}

export function SbtProfileCompare({
  savedProfileExists,
  compareResult,
  isComparing,
  selectedVersionLabel,
  compareTarget,
  compareDisabled = false,
  onSelectTarget,
  onRunCompare,
}: SbtProfileCompareProps) {
  const compareCopy = getCompareStateCopy(compareResult?.comparison_state);
  const changes = compareResult?.changes ?? [];
  const baseLabel = compareResult?.base_label ?? "Saved profile";
  const targetLabel = compareResult?.target_label ?? "Latest snapshot";
  const compareSummary =
    compareResult?.comparison_state === "up_to_date"
      ? `${baseLabel} matches ${targetLabel}.`
      : compareResult?.comparison_state === "changed_since_save"
        ? `${compareResult.changed_fields ?? 0} tracked fields changed between ${baseLabel} and ${targetLabel}.`
        : compareResult?.comparison_state === "incomplete_snapshot"
          ? `Comparison completed, but ${targetLabel.toLowerCase()} is partial so treat changes as provisional.`
          : compareResult?.comparison_state === "cannot_compare"
            ? `${targetLabel} is unavailable right now, so this comparison cannot be trusted yet.`
            : compareResult?.message ?? "Compare results are ready.";

  const compareTargets: Array<{ key: ProfileCompareTarget; label: string }> = [
    { key: "latest_snapshot", label: "Vs Latest Live" },
    { key: "latest_saved", label: "Vs Latest Saved" },
    { key: "previous_saved", label: "Vs Previous Saved" },
  ];

  return (
    <section className="glass-card rounded-3xl border border-white/6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-text-primary">
            <GitCompareArrows size={16} />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Profile Compare</span>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Compare a selected saved version with the latest live snapshot or another saved version to understand profile evolution.
          </p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${toneClass(compareCopy.tone)}`}>
          {isComparing ? "Comparing" : compareCopy.label}
        </div>
      </div>
      <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Selected base</div>
            <div className="mt-1 text-sm font-semibold text-white">{selectedVersionLabel}</div>
          </div>
          <button
            type="button"
            onClick={() => {
              void onRunCompare();
            }}
            disabled={isComparing || compareDisabled}
            className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary-light transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isComparing ? "Running compare..." : "Run Selected Compare"}
          </button>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          {compareTargets.map((target) => (
            <button
              key={target.key}
              type="button"
              onClick={() => {
                void onSelectTarget(target.key);
              }}
              disabled={isComparing || compareDisabled}
              className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                compareTarget === target.key
                  ? "border-primary/30 bg-primary/12 text-primary-light"
                  : "border-white/8 bg-main-bg/40 text-text-secondary hover:bg-white/[0.05]"
              }`}
            >
              {target.label}
            </button>
          ))}
        </div>
      </div>

      {!savedProfileExists ? (
        <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-text-secondary">
          No saved profile exists yet. Save the current profile first, then run compare.
        </div>
      ) : isComparing ? (
        <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-text-secondary">
          Running compare...
        </div>
      ) : compareResult ? (
        <>
          <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3 text-sm text-text-secondary">
            {compareSummary}
          </div>
          <div className="mt-4 grid gap-3">
            {changes.length > 0 ? (
              changes.map((change) => (
                <div key={change.key ?? change.label} className="rounded-2xl border border-white/6 bg-main-bg/40 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-white">{change.label ?? change.key}</div>
                    <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${changeClass(change.change_state)}`}>
                      {change.change_state ?? "unknown"}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{baseLabel}</div>
                      <div className="mt-1 text-sm text-white">{change.base ?? change.saved ?? "--"}</div>
                    </div>
                    <div className="rounded-xl border border-white/5 bg-white/[0.03] px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{targetLabel}</div>
                      <div className="mt-1 text-sm text-white">{change.target ?? change.current ?? "--"}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-text-secondary">
                No compare rows are available yet for this profile pair.
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-text-secondary">
          Compare has not been run yet for this session. Use compare actions in Saved Profile History to generate a concise change summary.
        </div>
      )}
    </section>
  );
}
