"use client";

import { startTransition, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { BadgeCheck, Fingerprint, RefreshCw, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "../AppShell";
import { buildApiUrl, DEFAULT_USER_ID } from "../../lib/riskhub-api";
import {
  compactWallet,
  formatDateTime,
  formatNumber,
  formatPercent,
  MOCK_WALLETS,
  type CurrentRiskProfileResponse,
  type IdentityRecord,
  type IssuanceState,
  type LoadState,
  type RiskProfileHistoryResponse,
  type RiskProfileSnapshot,
  type SaveRiskProfileResponse,
  type SingleRiskProfileResponse,
} from "../../lib/sbtIdentity";
import { SbtProfileHistory, type HistoryTimeOrder } from "./SbtProfileHistory";

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const payload = await response.json();
    if (typeof payload?.detail === "string") {
      return payload.detail;
    }
  } catch {
    // Ignore malformed error payloads.
  }

  return response.statusText || `Request failed with status ${response.status}`;
}

async function requestJson<T>(
  path: string,
  options?: {
    allow404?: boolean;
    method?: "GET" | "POST";
    body?: unknown;
  },
): Promise<T | null> {
  const response = await fetch(buildApiUrl(path), {
    cache: "no-store",
    method: options?.method ?? "GET",
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  if (options?.allow404 && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }

  return (await response.json()) as T;
}

function InfoTile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/[0.03] p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{label}</div>
      <div className="mt-2 text-base font-semibold text-white">{value}</div>
      <div className="mt-1 text-xs text-text-secondary">{hint}</div>
    </div>
  );
}

function ActionButton({
  icon,
  label,
  detail,
  disabled = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  detail: string;
  disabled?: boolean;
  onClick: () => void | Promise<void>;
}) {
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

export function SbtIdentityExperience() {
  const requestIdRef = useRef(0);
  const selectedProfileIdRef = useRef<string | null>(null);
  const walletIndexRef = useRef(0);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [backendIssues, setBackendIssues] = useState<string[]>([]);
  const [currentProfile, setCurrentProfile] = useState<RiskProfileSnapshot | null>(null);
  const [savedProfileHistory, setSavedProfileHistory] = useState<RiskProfileSnapshot[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<RiskProfileSnapshot | null>(null);
  const [demoIdentitySourceProfile, setDemoIdentitySourceProfile] = useState<RiskProfileSnapshot | null>(null);
  const [historyTimeOrder, setHistoryTimeOrder] = useState<HistoryTimeOrder>("newest");
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [identityRecord, setIdentityRecord] = useState<IdentityRecord | null>(null);
  const [issuanceState, setIssuanceState] = useState<IssuanceState>("not_started");
  const [isRefreshingCurrent, setIsRefreshingCurrent] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isIssuingIdentity, setIsIssuingIdentity] = useState(false);
  const [isSelectingSavedProfile, setIsSelectingSavedProfile] = useState(false);

  useEffect(() => {
    selectedProfileIdRef.current = selectedProfileId;
  }, [selectedProfileId]);

  const loadIdentityData = useCallback(async (mode: "initial" | "manual" = "initial") => {
    const requestId = ++requestIdRef.current;
    if (mode === "manual") {
      setIsRefreshingCurrent(true);
    } else {
      setLoadState("loading");
    }

    try {
      const [currentProfileResult, historyResult] = await Promise.allSettled([
        requestJson<CurrentRiskProfileResponse>(`/api/v1/sbt-identity/${DEFAULT_USER_ID}/profile/current`, { allow404: true }),
        requestJson<RiskProfileHistoryResponse>(`/api/v1/sbt-identity/${DEFAULT_USER_ID}/profile/history?limit=50`, { allow404: true }),
      ]);

      if (requestId !== requestIdRef.current) return;

      const nextIssues: string[] = [];
      const nextCurrentProfile = currentProfileResult.status === "fulfilled" ? currentProfileResult.value?.profile ?? null : null;
      const nextHistory = historyResult.status === "fulfilled" ? historyResult.value?.profiles ?? [] : [];

      if (currentProfileResult.status === "rejected") {
        nextIssues.push(`Current profile unavailable: ${currentProfileResult.reason instanceof Error ? currentProfileResult.reason.message : "Unknown error"}`);
      }
      if (historyResult.status === "rejected") {
        nextIssues.push(`Saved history unavailable: ${historyResult.reason instanceof Error ? historyResult.reason.message : "Unknown error"}`);
      }

      const nextLoadState: LoadState =
        !nextCurrentProfile && nextHistory.length === 0
          ? "error"
          : nextIssues.length > 0
            ? "partial"
            : "ready";

      const selectedFromHistory =
        nextHistory.find((profile) => profile.profile_id === selectedProfileIdRef.current) ??
        nextHistory[0] ??
        null;

      startTransition(() => {
        setCurrentProfile(nextCurrentProfile);
        setSavedProfileHistory(nextHistory);
        setSelectedProfile(selectedFromHistory);
        setSelectedProfileId(selectedFromHistory?.profile_id ?? null);
        setDemoIdentitySourceProfile((current) => {
          if (!current?.profile_id) return current;
          return nextHistory.find((profile) => profile.profile_id === current.profile_id) ?? null;
        });
        setBackendIssues(nextIssues);
        setLoadState(nextLoadState);
      });

      if (mode === "manual") {
        if (nextLoadState === "error") {
          toast.error("Current profile refresh failed.");
        } else if (nextLoadState === "partial") {
          toast.message("Current profile refreshed with partial data.");
        } else {
          toast.success("Current profile refreshed.");
        }
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      const message = error instanceof Error ? error.message : "Failed to load SBT profile data.";
      setCurrentProfile(null);
      setSavedProfileHistory([]);
      setSelectedProfile(null);
      setSelectedProfileId(null);
      setDemoIdentitySourceProfile(null);
      setBackendIssues([message]);
      setLoadState("error");
      toast.error(message);
    } finally {
      if (mode === "manual") {
        setIsRefreshingCurrent(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadIdentityData("initial");
  }, [loadIdentityData]);

  const snapshotLoading = loadState === "loading";
  const issueSourceProfile = demoIdentitySourceProfile ?? currentProfile ?? null;
  const selectedSourceSummary =
    demoIdentitySourceProfile?.version
      ? `Selected source: saved profile v${demoIdentitySourceProfile.version}`
      : "Selected source: latest current profile";
  const identityStatusLabel =
    issuanceState === "issued_demo" || issuanceState === "refreshed_demo"
      ? "Issued (Demo)"
      : issuanceState === "revoked_demo"
        ? "Revoked (Demo)"
        : "Not Issued";
  const issueButtonLabel =
    issuanceState === "issued_demo" || issuanceState === "refreshed_demo"
      ? "Re-Issue Demo Identity"
      : "Issue Demo Identity";
  const sourceStateLabel = currentProfile?.source_state ?? currentProfile?.profile_status ?? "unknown";

  const handleRefreshCurrentProfile = useCallback(async () => {
    await loadIdentityData("manual");
  }, [loadIdentityData]);

  const handleSaveRiskProfile = useCallback(async () => {
    if (!currentProfile || snapshotLoading) {
      toast.message("Current profile is still loading.");
      return;
    }

    setIsSavingProfile(true);
    try {
      const payload = await requestJson<SaveRiskProfileResponse>(
        `/api/v1/sbt-identity/${DEFAULT_USER_ID}/profile/save`,
        {
          method: "POST",
          body: { wallet_address: walletAddress },
        },
      );
      const nextSavedProfile = payload?.profile ?? null;
      if (!nextSavedProfile) {
        throw new Error("Save succeeded but no profile payload was returned.");
      }

      setSavedProfileHistory((current) => {
        const withoutDuplicate = current.filter((profile) => profile.profile_id !== nextSavedProfile.profile_id);
        return [nextSavedProfile, ...withoutDuplicate];
      });
      setSelectedProfile(nextSavedProfile);
      setSelectedProfileId(nextSavedProfile.profile_id ?? null);
      toast.success(`Saved risk profile v${nextSavedProfile.version ?? "?"}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save risk profile.";
      toast.error(message);
    } finally {
      setIsSavingProfile(false);
    }
  }, [currentProfile, snapshotLoading, walletAddress]);

  const handleSelectSavedVersion = useCallback(async (profileId: string) => {
    if (!profileId || profileId === selectedProfileId) return;

    setIsSelectingSavedProfile(true);
    try {
      const quickProfile = savedProfileHistory.find((profile) => profile.profile_id === profileId) ?? null;
      if (quickProfile) {
        setSelectedProfile(quickProfile);
        setSelectedProfileId(profileId);
      }

      const payload = await requestJson<SingleRiskProfileResponse>(
        `/api/v1/sbt-identity/${DEFAULT_USER_ID}/profile/saved/${encodeURIComponent(profileId)}`,
        { allow404: true },
      );
      const fullProfile = payload?.profile ?? quickProfile;
      if (!fullProfile) {
        throw new Error("Could not load the selected saved version.");
      }

      setSelectedProfile(fullProfile);
      setSelectedProfileId(fullProfile.profile_id ?? profileId);
      setSavedProfileHistory((current) =>
        current.map((entry) => (entry.profile_id === fullProfile.profile_id ? fullProfile : entry)),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to select saved version.";
      toast.error(message);
    } finally {
      setIsSelectingSavedProfile(false);
    }
  }, [savedProfileHistory, selectedProfileId]);

  const handleUseSelectedVersionForDemoIdentity = useCallback(() => {
    if (!selectedProfile?.profile_id) {
      toast.message("Select a saved version first.");
      return;
    }
    setDemoIdentitySourceProfile(selectedProfile);
    toast.success(`Demo identity source set to v${selectedProfile.version ?? "?"}.`);
  }, [selectedProfile]);

  const handleIssueDemoIdentity = useCallback(() => {
    const sourceProfile = issueSourceProfile;
    if (!sourceProfile) {
      toast.message("Current profile is not ready yet.");
      return;
    }

    setIsIssuingIdentity(true);
    try {
      let ownerWallet = walletAddress;
      if (!ownerWallet) {
        ownerWallet = MOCK_WALLETS[walletIndexRef.current % MOCK_WALLETS.length];
        walletIndexRef.current += 1;
        setWalletAddress(ownerWallet);
      }

      const now = new Date().toISOString();
      const tokenId = `RHSBT-${now.replace(/\D/g, "").slice(-12)}`;
      const sourceLabel = sourceProfile.version ? `saved profile v${sourceProfile.version}` : "latest current profile";
      const nextVersion = identityRecord ? identityRecord.version + 1 : 1;
      setIdentityRecord({
        tokenId,
        ownerWallet: ownerWallet,
        issuedAt: now,
        reviewAt: now,
        version: nextVersion,
        revoked: false,
        sourceProfileId: sourceProfile.profile_id ?? null,
        sourceProfileVersion: sourceProfile.version ?? null,
        sourceProfileHash: sourceProfile.profile_hash ?? null,
        sourceIdentityTier: sourceProfile.identity_tier ?? null,
        sourceRiskLevel: sourceProfile.risk_level ?? null,
        sourceLabel,
      });
      setIssuanceState("issued_demo");
      toast.success(`Demo identity issued from ${sourceLabel}.`);
    } finally {
      setIsIssuingIdentity(false);
    }
  }, [identityRecord, issueSourceProfile, walletAddress]);

  return (
    <AppShell
      header={
        <header className="sticky top-0 z-30 border-b border-white/5 bg-main-bg/90 px-5 py-4 backdrop-blur-xl md:px-8">
          <div className="max-w-5xl">
            <div className="flex items-center gap-2 text-primary-light">
              <Fingerprint size={18} />
              <span className="text-[11px] font-bold uppercase tracking-[0.22em]">Risk Profile Identity</span>
            </div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight text-white">Save and issue your demo identity from risk profile data</h2>
            <p className="mt-2 text-sm text-text-secondary">Current profile first, actions second, version history third.</p>
          </div>
        </header>
      }
    >
      <div className="flex flex-col gap-4">
        <section className="glass-card rounded-3xl border border-white/6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Current Risk Profile</div>
              <p className="mt-2 text-sm text-text-secondary">
                This is the profile that will be saved or used for demo identity issuance.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">
              {snapshotLoading ? "Loading" : loadState === "error" ? "Unavailable" : loadState === "partial" ? "Partial" : "Ready"}
            </div>
          </div>

          {currentProfile ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <InfoTile
                label="Identity"
                value={`${currentProfile.identity_tier ?? "Pending"} / ${currentProfile.risk_level ?? "Unrated"}`}
                hint="Tier and risk level in the current snapshot"
              />
              <InfoTile
                label="Discipline"
                value={currentProfile.discipline_score === null || currentProfile.discipline_score === undefined
                  ? "--"
                  : `${currentProfile.discipline_score.toFixed(0)} (${currentProfile.discipline_grade ?? "Unrated"})`}
                hint="Discipline score and grade"
              />
              <InfoTile
                label="Total Risk"
                value={formatNumber(currentProfile.total_risk_score, 1)}
                hint={`Max drawdown ${formatPercent(currentProfile.max_drawdown_pct, 1)}`}
              />
              <InfoTile
                label="Leverage"
                value={currentProfile.leverage?.average === null || currentProfile.leverage?.average === undefined
                  ? "--"
                  : `${currentProfile.leverage.average.toFixed(2)}x`}
                hint={`Max ${currentProfile.leverage?.maximum === null || currentProfile.leverage?.maximum === undefined ? "--" : `${currentProfile.leverage.maximum.toFixed(2)}x`}`}
              />
              <InfoTile
                label="Contagion"
                value={formatNumber(currentProfile.contagion_score, 1)}
                hint="Cross-asset dependency risk"
              />
              <InfoTile
                label="Top Concentration"
                value={currentProfile.top_asset ? `${currentProfile.top_asset} ${formatPercent(currentProfile.top_asset_concentration_pct, 1)}` : "--"}
                hint="Largest concentration in this snapshot"
              />
              <InfoTile
                label="Snapshot Time"
                value={formatDateTime(currentProfile.source_snapshot_at)}
                hint="Source timestamp for this profile"
              />
              <InfoTile
                label="Source State"
                value={sourceStateLabel}
                hint="Current profile data quality state"
              />
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-4 text-sm text-text-secondary">
              {snapshotLoading
                ? "Loading current risk profile..."
                : "Current risk profile is unavailable right now. Refresh and try again."}
            </div>
          )}

          {backendIssues.length > 0 ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-100">
              {backendIssues[0]}
            </div>
          ) : null}
        </section>

        <section className="glass-card rounded-3xl border border-white/6 p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Demo Actions</div>
              <p className="mt-2 text-sm text-text-secondary">
                Save the profile, optionally refresh current data, and issue demo identity.
              </p>
            </div>
            <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">
              {identityStatusLabel}
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <ActionButton
              icon={<Save size={16} />}
              label={isSavingProfile ? "Saving Risk Profile..." : "Save Risk Profile"}
              detail="Persist the current risk profile as a new version."
              disabled={snapshotLoading || !currentProfile || isSavingProfile}
              onClick={handleSaveRiskProfile}
            />
            <ActionButton
              icon={<BadgeCheck size={16} />}
              label={isIssuingIdentity ? "Issuing Demo Identity..." : issueButtonLabel}
              detail="Issue demo identity from selected source (local demo state only)."
              disabled={!issueSourceProfile || isIssuingIdentity}
              onClick={handleIssueDemoIdentity}
            />
            <ActionButton
              icon={<RefreshCw size={16} />}
              label={isRefreshingCurrent ? "Refreshing Current Profile..." : "Refresh Current Profile"}
              detail="Reload latest current profile before save or issue."
              disabled={isRefreshingCurrent}
              onClick={handleRefreshCurrentProfile}
            />
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3 text-sm text-text-secondary">
              {selectedSourceSummary}
            </div>
            <div className="rounded-2xl border border-white/6 bg-white/[0.03] px-4 py-3 text-sm text-text-secondary">
              Demo wallet: {walletAddress ? compactWallet(walletAddress) : "auto-assigned on issue"}
            </div>
          </div>
        </section>

        <SbtProfileHistory
          profiles={savedProfileHistory}
          selectedProfileId={selectedProfileId}
          selectedProfile={selectedProfile}
          demoSourceProfileId={demoIdentitySourceProfile?.profile_id ?? identityRecord?.sourceProfileId ?? null}
          loading={snapshotLoading}
          selecting={isSelectingSavedProfile}
          timeOrder={historyTimeOrder}
          onChangeTimeOrder={setHistoryTimeOrder}
          onSelectProfile={handleSelectSavedVersion}
          onUseForDemoIdentity={handleUseSelectedVersionForDemoIdentity}
        />
      </div>
    </AppShell>
  );
}
