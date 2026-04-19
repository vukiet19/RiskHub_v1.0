import { GitCompareArrows, RefreshCw, Save } from "lucide-react";
import type { ReactNode } from "react";
import {
  deriveSavedProfileCurrentness,
  formatDateTime,
  formatNumber,
  formatPercent,
  getSavedProfileCurrentnessCopy,
  type RiskProfileSnapshot,
} from "../../lib/sbtIdentity";

interface ActionButtonProps {
  label: string;
  detail: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}

function ActionButton({ label, detail, icon, disabled = false, onClick }: ActionButtonProps) {
  return (
    <button
      type="button"
      onClick={() => {
        void onClick();
      }}
      disabled={disabled}
      className="rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-4 text-left transition-all hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-45"
    >
      <div className="flex items-center gap-2 text-text-primary">
        {icon}
        <span className="text-sm font-semibold text-white">{label}</span>
      </div>
      <div className="mt-2 text-xs leading-5 text-text-secondary">{detail}</div>
    </button>
  );
}

function toneClass(tone: "neutral" | "good" | "warn") {
  if (tone === "good") return "border-emerald-400/20 bg-emerald-400/10 text-emerald-100";
  if (tone === "warn") return "border-amber-400/20 bg-amber-400/10 text-amber-100";
  return "border-white/10 bg-white/5 text-text-secondary";
}

function InfoTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-main-bg/40 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{label}</div>
      <div className="mt-2 font-mono text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs leading-5 text-text-secondary">{hint}</div>
    </div>
  );
}

interface SbtSavedProfileCardProps {
  snapshotLoading: boolean;
  savedProfile: RiskProfileSnapshot | null;
  currentProfile: RiskProfileSnapshot | null;
  isSavingProfile?: boolean;
  isRefreshingSnapshot?: boolean;
  isComparingProfile?: boolean;
  onSaveProfile: () => void | Promise<void>;
  onRefreshSnapshot: () => void | Promise<void>;
  onCompareWithSaved: () => void | Promise<void>;
}

export function SbtSavedProfileCard({
  snapshotLoading,
  savedProfile,
  currentProfile,
  isSavingProfile = false,
  isRefreshingSnapshot = false,
  isComparingProfile = false,
  onSaveProfile,
  onRefreshSnapshot,
  onCompareWithSaved,
}: SbtSavedProfileCardProps) {
  const currentness = deriveSavedProfileCurrentness({
    snapshotLoading,
    savedProfile,
    currentProfile,
  });
  const currentnessCopy = getSavedProfileCurrentnessCopy(currentness);

  return (
    <section className="glass-card rounded-3xl border border-white/6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Saved Risk Profile</div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">
            Save your current RiskHub snapshot as a reusable identity profile, then reopen and compare it against newer data.
          </p>
        </div>
        <div className={`rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${toneClass(currentnessCopy.tone)}`}>
          {currentnessCopy.label}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3 text-sm text-text-secondary">
        {currentnessCopy.detail}
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <ActionButton
          label={isSavingProfile ? "Saving profile..." : "Save Risk Profile"}
          detail="Persist the current risk profile as a versioned identity snapshot."
          icon={<Save size={16} />}
          disabled={snapshotLoading || isSavingProfile || !currentProfile}
          onClick={onSaveProfile}
        />
        <ActionButton
          label={isRefreshingSnapshot ? "Refreshing latest..." : "Refresh Latest Snapshot"}
          detail="Reload current RiskHub data before reviewing readiness or comparing."
          icon={<RefreshCw size={16} />}
          disabled={isRefreshingSnapshot}
          onClick={onRefreshSnapshot}
        />
        <ActionButton
          label={isComparingProfile ? "Comparing..." : "Compare With Saved"}
          detail="Run compare for the currently selected saved version against the latest live snapshot."
          icon={<GitCompareArrows size={16} />}
          disabled={snapshotLoading || isComparingProfile || !savedProfile}
          onClick={onCompareWithSaved}
        />
      </div>

      {savedProfile ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoTile
            label="Saved Version"
            value={`v${savedProfile.version ?? 1}`}
            hint={`Saved ${formatDateTime(savedProfile.saved_at)}`}
          />
          <InfoTile
            label="Snapshot Time"
            value={formatDateTime(savedProfile.source_snapshot_at)}
            hint="Source snapshot used when this profile was saved"
          />
          <InfoTile
            label="Identity"
            value={`${savedProfile.identity_tier ?? "Pending"} / ${savedProfile.risk_level ?? "Unrated"}`}
            hint="Tier and risk level at save time"
          />
          <InfoTile
            label="Profile Hash"
            value={savedProfile.profile_hash ? `${savedProfile.profile_hash.slice(0, 10)}...${savedProfile.profile_hash.slice(-8)}` : "--"}
            hint="Stable profile fingerprint for compare continuity"
          />
          <InfoTile
            label="Discipline"
            value={
              savedProfile.discipline_score === null || savedProfile.discipline_score === undefined
                ? "--"
                : `${savedProfile.discipline_score.toFixed(0)} (${savedProfile.discipline_grade ?? "Unrated"})`
            }
            hint="Score and grade from saved profile"
          />
          <InfoTile
            label="Risk"
            value={formatNumber(savedProfile.total_risk_score, 1)}
            hint={`Drawdown ${formatPercent(savedProfile.max_drawdown_pct, 1)}`}
          />
          <InfoTile
            label="Leverage / Contagion"
            value={`${savedProfile.leverage?.average === null || savedProfile.leverage?.average === undefined ? "--" : `${savedProfile.leverage.average.toFixed(2)}x`} / ${formatNumber(savedProfile.contagion_score, 1)}`}
            hint="Average leverage and contagion score"
          />
          <InfoTile
            label="Top Concentration"
            value={
              savedProfile.top_asset
                ? `${savedProfile.top_asset} ${formatPercent(savedProfile.top_asset_concentration_pct, 1)}`
                : "--"
            }
            hint={`${savedProfile.active_exchanges ?? 0} active exchange connection(s)`}
          />
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-4 text-sm leading-6 text-text-secondary">
          No saved profile yet. Save your current risk profile to create a reusable identity record for refresh and compare.
        </div>
      )}
    </section>
  );
}
