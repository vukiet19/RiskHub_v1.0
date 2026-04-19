import { BadgeCheck, Fingerprint, Link2, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import type { PrimaryActionKey } from "../../lib/sbtIdentity";

interface ActionCardProps {
  title: string;
  detail: string;
  icon: ReactNode;
  disabled?: boolean;
  highlighted?: boolean;
  onClick: () => void | Promise<void>;
}

function ActionCard({ title, detail, icon, disabled = false, highlighted = false, onClick }: ActionCardProps) {
  return (
    <button
      type="button"
      onClick={() => {
        void onClick();
      }}
      disabled={disabled}
      className={`flex min-h-32 flex-col items-start rounded-3xl border px-5 py-5 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
        highlighted
          ? "border-primary/30 bg-primary/15 shadow-[0_18px_48px_rgba(26,86,219,0.18)]"
          : "border-white/8 bg-white/[0.03] hover:bg-white/[0.05]"
      }`}
    >
      <div className={`rounded-2xl border p-3 ${highlighted ? "border-primary/30 bg-primary/10 text-primary-light" : "border-white/10 bg-white/5 text-text-primary"}`}>
        {icon}
      </div>
      <div className="mt-4 text-base font-semibold text-white">{title}</div>
      <div className="mt-2 text-sm leading-6 text-text-secondary">{detail}</div>
    </button>
  );
}

interface SbtPrimaryActionsProps {
  snapshotLoading?: boolean;
  recommendedAction: PrimaryActionKey;
  walletConnected: boolean;
  previewEnabled: boolean;
  issueEnabled: boolean;
  checkingEligibility?: boolean;
  onConnectWallet: () => void | Promise<void>;
  onCheckEligibility: () => void | Promise<void>;
  onPreviewIdentity: () => void | Promise<void>;
  onIssueIdentity: () => void | Promise<void>;
}

export function SbtPrimaryActions({
  snapshotLoading = false,
  recommendedAction,
  walletConnected,
  previewEnabled,
  issueEnabled,
  checkingEligibility = false,
  onConnectWallet,
  onCheckEligibility,
  onPreviewIdentity,
  onIssueIdentity,
}: SbtPrimaryActionsProps) {
  return (
    <section className="glass-card rounded-3xl border border-white/6 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-text-secondary">Primary Actions</div>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            {snapshotLoading
              ? "Core actions stay neutral until the identity snapshot finishes loading."
              : "Follow the guided flow below. Everything else lives in Advanced details so the first experience stays focused."}
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">
          {snapshotLoading ? "Snapshot loading" : `Recommended: ${recommendedAction}`}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <ActionCard
          title={walletConnected ? "Demo wallet connected" : "Connect Demo Wallet"}
          detail={walletConnected ? "A mock wallet is already connected. You can move to the next step." : "Attach a realistic mock wallet so the identity flow has a destination."}
          icon={<Link2 size={18} />}
          disabled={walletConnected}
          highlighted={!snapshotLoading && recommendedAction === "connect"}
          onClick={onConnectWallet}
        />
        <ActionCard
          title={checkingEligibility ? "Checking Eligibility..." : "Check Eligibility"}
          detail={
            snapshotLoading
              ? "Eligibility becomes available after the current identity snapshot finishes loading."
              : "Review your current snapshot and confirm whether the demo identity can move forward."
          }
          icon={<ShieldCheck size={18} />}
          disabled={snapshotLoading || checkingEligibility}
          highlighted={!snapshotLoading && recommendedAction === "check"}
          onClick={onCheckEligibility}
        />
        <ActionCard
          title="Preview Identity"
          detail={
            snapshotLoading
              ? "The preview opens after RiskHub has a resolved snapshot to work from."
              : "Open a newcomer-friendly preview of what your identity badge would say today."
          }
          icon={<Fingerprint size={18} />}
          disabled={snapshotLoading || !previewEnabled}
          highlighted={!snapshotLoading && recommendedAction === "preview"}
          onClick={onPreviewIdentity}
        />
        <ActionCard
          title="Issue Demo Identity"
          detail={
            snapshotLoading
              ? "Issue stays locked until the snapshot is loaded and the eligibility check has passed."
              : "Create the demo identity badge in local app state only. No blockchain action takes place."
          }
          icon={<BadgeCheck size={18} />}
          disabled={snapshotLoading || !issueEnabled}
          highlighted={!snapshotLoading && recommendedAction === "issue"}
          onClick={onIssueIdentity}
        />
      </div>
    </section>
  );
}
