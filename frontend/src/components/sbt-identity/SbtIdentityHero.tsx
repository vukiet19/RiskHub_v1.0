import { Clock3, Fingerprint, Link2, ShieldAlert, ShieldCheck } from "lucide-react";
import { compactWallet, formatDateTime, getIssuanceStatusLabel, type EligibilityState, type IssuanceState, type LoadState } from "../../lib/sbtIdentity";

interface SbtIdentityHeroProps {
  loadState: LoadState;
  walletAddress: string | null;
  eligibilityState: EligibilityState;
  issuanceState: IssuanceState;
  identityTier: string;
  riskLevel: string;
  reviewedAt: string | null | undefined;
  description: string;
}

function badgeClass(kind: "neutral" | "good" | "warn") {
  if (kind === "good") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (kind === "warn") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  return "border-white/10 bg-white/5 text-text-primary";
}

export function SbtIdentityHero({
  loadState,
  walletAddress,
  eligibilityState,
  issuanceState,
  identityTier,
  riskLevel,
  reviewedAt,
  description,
}: SbtIdentityHeroProps) {
  const readinessLabel = loadState === "loading" ? "Loading snapshot" : getIssuanceStatusLabel(issuanceState, eligibilityState);
  const readinessKind =
    loadState === "loading"
      ? "neutral"
      : issuanceState === "issued_demo" || issuanceState === "refreshed_demo" || eligibilityState === "eligible"
      ? "good"
      : eligibilityState === "ineligible" || issuanceState === "revoked_demo"
        ? "warn"
        : "neutral";
  const eligibilityLabel = loadState === "loading" ? "Waiting for data" : eligibilityState.replace("_", " ");

  return (
    <section className="glass-card rounded-[28px] border border-white/8 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.35)] md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-primary-light">
            <Fingerprint size={18} />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Identity Readiness</span>
          </div>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
            {readinessLabel}
          </h3>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-text-secondary">{description}</p>
          <div className="mt-4 rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary-light">
            No blockchain actions happen in this demo. Wallet, preview, issue, refresh, and revoke all stay local to the app.
          </div>
        </div>

        <div className={`rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.2em] ${badgeClass(readinessKind)}`}>
          {readinessLabel}
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <Link2 size={14} />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Wallet</span>
          </div>
          <div className="mt-3 font-mono text-base font-semibold text-white">
            {walletAddress ? compactWallet(walletAddress) : "Not connected"}
          </div>
        </div>

        <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 text-text-secondary">
            {eligibilityState === "eligible" ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Eligibility</span>
          </div>
          <div className="mt-3 text-base font-semibold capitalize text-white">{eligibilityLabel}</div>
        </div>

        <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Identity Tier</div>
          <div className="mt-3 text-base font-semibold text-white">{identityTier}</div>
        </div>

        <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Risk Level</div>
          <div className="mt-3 text-base font-semibold text-white">{riskLevel}</div>
        </div>

        <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
          <div className="flex items-center gap-2 text-text-secondary">
            <Clock3 size={14} />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]">Last Reviewed</span>
          </div>
          <div className="mt-3 text-base font-semibold text-white">{formatDateTime(reviewedAt)}</div>
        </div>
      </div>
    </section>
  );
}
