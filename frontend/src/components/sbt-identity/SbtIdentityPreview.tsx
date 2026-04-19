import { BadgeCheck, ShieldAlert } from "lucide-react";
import { compactWallet, type IssuanceState } from "../../lib/sbtIdentity";

interface SbtIdentityPreviewProps {
  walletAddress: string | null;
  identityTier: string;
  riskLevel: string;
  issuanceState: IssuanceState;
  sourceSummary: string;
  disciplineScoreLabel: string;
  behaviorSummary: string;
  riskSummary: string;
  activitySummary: string;
}

export function SbtIdentityPreview({
  walletAddress,
  identityTier,
  riskLevel,
  issuanceState,
  sourceSummary,
  disciplineScoreLabel,
  behaviorSummary,
  riskSummary,
  activitySummary,
}: SbtIdentityPreviewProps) {
  const issued = issuanceState === "issued_demo" || issuanceState === "refreshed_demo";

  return (
    <section className="glass-card rounded-3xl border border-white/6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Identity Preview</div>
          <h3 className="mt-2 text-xl font-semibold text-white">
            {issued ? "Your demo identity is active in this session" : "This is how your identity badge would look today"}
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            This preview keeps the explanation human. It summarizes what RiskHub sees in your current profile without exposing technical token fields first.
          </p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
          issued ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-100" : "border-primary/25 bg-primary/10 text-primary-light"
        }`}>
          {issued ? "Issued in demo" : "Preview only"}
        </div>
      </div>

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[24px] border border-primary/20 bg-[linear-gradient(135deg,rgba(26,86,219,0.18),rgba(11,19,38,0.55))] p-5">
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary-light">RiskHub Identity Badge</div>
          <div className="mt-4 text-3xl font-semibold tracking-tight text-white">{identityTier}</div>
          <div className="mt-2 text-sm text-primary-light">Risk level: {riskLevel}</div>
          <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.05] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Connected wallet</div>
            <div className="mt-2 font-mono text-base text-white">{compactWallet(walletAddress)}</div>
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary">Selected source</div>
            <div className="mt-2 text-sm text-white">{sourceSummary}</div>
          </div>
          <div className="mt-4 flex items-start gap-2 text-sm leading-6 text-text-secondary">
            {issued ? <BadgeCheck size={16} className="mt-1 shrink-0 text-emerald-200" /> : <ShieldAlert size={16} className="mt-1 shrink-0 text-primary-light" />}
            <span>
              {issued
                ? "This identity exists only in the current demo session. It was not minted or written on-chain."
                : "Issuing this identity would only update local demo state. No wallet signing or blockchain transaction is performed."}
            </span>
          </div>
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Discipline</div>
            <div className="mt-2 text-sm leading-6 text-white">{disciplineScoreLabel}</div>
            <div className="mt-1 text-xs leading-5 text-text-secondary">{behaviorSummary}</div>
          </div>
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Risk</div>
            <div className="mt-2 text-sm leading-6 text-white">{riskSummary}</div>
          </div>
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Activity</div>
            <div className="mt-2 text-sm leading-6 text-white">{activitySummary}</div>
          </div>
        </div>
      </div>
    </section>
  );
}
