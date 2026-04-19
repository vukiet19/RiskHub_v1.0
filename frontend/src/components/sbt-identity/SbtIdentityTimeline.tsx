import { Clock3, ShieldCheck, ShieldX } from "lucide-react";
import { formatDateTime, type TimelineEvent } from "../../lib/sbtIdentity";

interface SbtIdentityTimelineProps {
  timeline: TimelineEvent[];
}

function toneClasses(tone: TimelineEvent["tone"]) {
  if (tone === "success") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (tone === "warning") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  if (tone === "danger") return "border-rose-400/20 bg-rose-400/10 text-rose-100";
  return "border-blue-400/20 bg-blue-400/10 text-blue-100";
}

export function SbtIdentityTimeline({ timeline }: SbtIdentityTimelineProps) {
  return (
    <section className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Session History</div>
      {timeline.length > 0 ? (
        <div className="mt-4 space-y-3">
          {timeline.map((event) => (
            <div key={event.id} className="rounded-2xl border border-white/6 bg-main-bg/40 p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full border ${toneClasses(event.tone)}`}>
                      {event.tone === "success" ? <ShieldCheck size={14} /> : event.tone === "danger" ? <ShieldX size={14} /> : <Clock3 size={14} />}
                    </span>
                    <div className="text-sm font-semibold text-white">{event.title}</div>
                  </div>
                  <div className="mt-2 text-sm leading-6 text-text-secondary">{event.detail}</div>
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">{formatDateTime(event.at)}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 text-sm leading-6 text-text-secondary">
          No session actions yet. Connect a wallet, check eligibility, preview the identity, or issue the demo badge to build history.
        </div>
      )}
    </section>
  );
}
