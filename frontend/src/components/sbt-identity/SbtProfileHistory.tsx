import { Clock3, History } from "lucide-react";
import { formatDateTime, formatNumber, formatPercent, type RiskProfileSnapshot } from "../../lib/sbtIdentity";

export type HistoryTimeOrder = "newest" | "oldest";

interface SbtProfileHistoryProps {
  profiles: RiskProfileSnapshot[];
  selectedProfileId: string | null;
  selectedProfile: RiskProfileSnapshot | null;
  demoSourceProfileId: string | null;
  loading?: boolean;
  selecting?: boolean;
  timeOrder: HistoryTimeOrder;
  onChangeTimeOrder: (order: HistoryTimeOrder) => void;
  onSelectProfile: (profileId: string) => void | Promise<void>;
  onUseForDemoIdentity: () => void | Promise<void>;
}

function orderButtonClass(active: boolean): string {
  return active
    ? "border-primary/30 bg-primary/10 text-primary-light"
    : "border-white/8 bg-main-bg/40 text-text-secondary hover:bg-white/[0.05]";
}

function profileLabel(profile: RiskProfileSnapshot): string {
  return `v${profile.version ?? 1} | ${profile.identity_tier ?? "Pending"} / ${profile.risk_level ?? "Unrated"}`;
}

function getSortTimestamp(profile: RiskProfileSnapshot): number {
  const source = profile.saved_at ?? profile.source_snapshot_at ?? null;
  if (!source) return 0;
  const parsed = Date.parse(source);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function SbtProfileHistory({
  profiles,
  selectedProfileId,
  selectedProfile,
  demoSourceProfileId,
  loading = false,
  selecting = false,
  timeOrder,
  onChangeTimeOrder,
  onSelectProfile,
  onUseForDemoIdentity,
}: SbtProfileHistoryProps) {
  const sortedProfiles = [...profiles].sort((left, right) => {
    const byTime = getSortTimestamp(right) - getSortTimestamp(left);
    if (byTime !== 0) {
      return timeOrder === "newest" ? byTime : -byTime;
    }
    const byVersion = (right.version ?? 0) - (left.version ?? 0);
    return timeOrder === "newest" ? byVersion : -byVersion;
  });

  return (
    <section className="glass-card rounded-3xl border border-white/6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-text-primary">
            <History size={16} />
            <span className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Saved Profile History</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Browse previously saved profile versions over time and reopen one as the demo identity source.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onChangeTimeOrder("newest");
            }}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${orderButtonClass(timeOrder === "newest")}`}
          >
            Newest First
          </button>
          <button
            type="button"
            onClick={() => {
              onChangeTimeOrder("oldest");
            }}
            className={`rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${orderButtonClass(timeOrder === "oldest")}`}
          >
            Oldest First
          </button>
        </div>
      </div>

      {loading ? (
        <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-4 text-sm text-text-secondary">
          Loading saved profile history...
        </div>
      ) : sortedProfiles.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-4 text-sm text-text-secondary">
          No saved versions yet. Save the current profile to create your first history entry.
        </div>
      ) : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Version List</div>
            <div className="mt-3 space-y-2">
              {sortedProfiles.map((profile) => {
                const profileId = profile.profile_id ?? "";
                const isSelected = selectedProfileId !== null && selectedProfileId === profileId;
                const isDemoSource = demoSourceProfileId !== null && demoSourceProfileId === profileId;
                return (
                  <button
                    key={profileId || `${profile.version}-${profile.saved_at}`}
                    type="button"
                    onClick={() => {
                      void onSelectProfile(profileId);
                    }}
                    disabled={selecting || !profileId}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                      isSelected ? "border-primary/30 bg-primary/10" : "border-white/8 bg-main-bg/40 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-white">{profileLabel(profile)}</div>
                        <div className="mt-1 flex items-center gap-1 text-xs text-text-secondary">
                          <Clock3 size={12} />
                          <span>Saved {formatDateTime(profile.saved_at)}</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        {isSelected ? (
                          <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-primary-light">
                            Selected
                          </span>
                        ) : null}
                        {isDemoSource ? (
                          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.15em] text-emerald-100">
                            Demo Source
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
            {selectedProfile ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">Selected Version</div>
                    <div className="mt-2 text-lg font-semibold text-white">Saved profile v{selectedProfile.version ?? 1}</div>
                    <div className="mt-1 text-sm text-text-secondary">
                      Saved {formatDateTime(selectedProfile.saved_at)} from snapshot {formatDateTime(selectedProfile.source_snapshot_at)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void onUseForDemoIdentity();
                    }}
                    disabled={!selectedProfile.profile_id}
                    className="rounded-xl border border-primary/25 bg-primary/10 px-3 py-2 text-xs font-semibold text-primary-light transition-all hover:bg-primary/15 disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {demoSourceProfileId === selectedProfile.profile_id ? "Using This Version" : "Use For Demo Identity"}
                  </button>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="rounded-xl border border-white/5 bg-main-bg/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary">Identity</div>
                    <div className="mt-2 text-sm font-semibold text-white">{selectedProfile.identity_tier ?? "Pending"} / {selectedProfile.risk_level ?? "Unrated"}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-main-bg/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary">Discipline</div>
                    <div className="mt-2 text-sm font-semibold text-white">
                      {selectedProfile.discipline_score === null || selectedProfile.discipline_score === undefined
                        ? "--"
                        : `${selectedProfile.discipline_score.toFixed(0)} (${selectedProfile.discipline_grade ?? "Unrated"})`}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-main-bg/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary">Risk</div>
                    <div className="mt-2 text-sm font-semibold text-white">{formatNumber(selectedProfile.total_risk_score, 1)} / DD {formatPercent(selectedProfile.max_drawdown_pct, 1)}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-main-bg/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary">Leverage / Contagion</div>
                    <div className="mt-2 text-sm font-semibold text-white">
                      {selectedProfile.leverage?.average === null || selectedProfile.leverage?.average === undefined
                        ? "--"
                        : `${selectedProfile.leverage.average.toFixed(2)}x`} / {formatNumber(selectedProfile.contagion_score, 1)}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-main-bg/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary">Top Concentration</div>
                    <div className="mt-2 text-sm font-semibold text-white">
                      {selectedProfile.top_asset
                        ? `${selectedProfile.top_asset} ${formatPercent(selectedProfile.top_asset_concentration_pct, 1)}`
                        : "--"}
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-main-bg/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-text-secondary">Saved At</div>
                    <div className="mt-2 text-sm font-semibold text-white">{formatDateTime(selectedProfile.saved_at)}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-white/6 bg-main-bg/40 px-4 py-4 text-sm text-text-secondary">
                Select a saved version to inspect it.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
