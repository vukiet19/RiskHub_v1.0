import { ScrollText } from "lucide-react";
import type { IdentityMetadata } from "../../lib/sbtIdentity";

interface SbtMetadataPreviewProps {
  metadata: IdentityMetadata;
  jsonVisible: boolean;
}

function MetadataItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/5 bg-main-bg/40 p-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-text-secondary">{label}</div>
      <div className="mt-2 break-all font-mono text-xs text-text-primary">{value}</div>
    </div>
  );
}

export function SbtMetadataPreview({ metadata, jsonVisible }: SbtMetadataPreviewProps) {
  return (
    <section className="rounded-2xl border border-white/6 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-primary-light">
        <ScrollText size={16} />
        <div className="text-[10px] font-bold uppercase tracking-[0.2em]">Technical Metadata Preview</div>
      </div>
      <p className="mt-2 text-sm leading-6 text-text-secondary">
        This section is intentionally secondary. It shows how the current demo profile maps to future SBT-style metadata fields.
      </p>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <MetadataItem label="token_id" value={metadata.token_id} />
        <MetadataItem label="owner_wallet" value={metadata.owner_wallet} />
        <MetadataItem label="identity_tier" value={metadata.identity_tier} />
        <MetadataItem label="risk_level" value={metadata.risk_level} />
        <MetadataItem label="profile_hash" value={metadata.profile_hash} />
        <MetadataItem label="metadata_uri" value={metadata.metadata_uri} />
        <MetadataItem label="issued_at" value={metadata.issued_at ?? "Pending demo issue"} />
        <MetadataItem label="review_at" value={metadata.review_at ?? "Pending review"} />
        <MetadataItem label="version" value={String(metadata.version)} />
        <MetadataItem label="revoked" value={metadata.revoked ? "true" : "false"} />
      </div>

      {jsonVisible ? (
        <pre className="mt-4 overflow-x-auto rounded-2xl border border-white/6 bg-surface-lowest/80 p-4 text-xs leading-6 text-text-primary">
          <code>{JSON.stringify(metadata, null, 2)}</code>
        </pre>
      ) : null}
    </section>
  );
}
