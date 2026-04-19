import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

interface SbtAdvancedDetailsProps {
  summary: string;
  sourceNotes: string[];
  secondaryActions: ReactNode;
  metadataPreview: ReactNode;
  timeline: ReactNode;
}

export function SbtAdvancedDetails({
  summary,
  sourceNotes,
  secondaryActions,
  metadataPreview,
  timeline,
}: SbtAdvancedDetailsProps) {
  return (
    <details className="glass-card rounded-3xl border border-white/6 p-5">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Advanced Details</div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{summary}</p>
        </div>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-text-primary">
          <ChevronDown size={16} />
        </span>
      </summary>

      <div className="mt-5 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Secondary Actions</div>
            <div className="mt-4 grid gap-3">{secondaryActions}</div>
          </section>

          <section className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Source Notes</div>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              RiskHub still surfaces partial-data and backend caveats honestly here, but keeps them out of the primary newcomer flow.
            </p>
            <div className="mt-3 space-y-2 text-sm leading-6 text-text-secondary">
              {sourceNotes.length > 0 ? (
                sourceNotes.map((note, index) => (
                  <div key={`${note}-${index}`} className="rounded-xl border border-white/5 bg-main-bg/40 px-3 py-2">
                    {note}
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-white/5 bg-main-bg/40 px-3 py-2">
                  No active backend caveats are being reported right now.
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          {metadataPreview}
          {timeline}
        </div>
      </div>
    </details>
  );
}
