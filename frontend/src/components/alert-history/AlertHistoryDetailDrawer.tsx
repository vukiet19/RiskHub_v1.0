"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  fetchAlertRelatedTrades,
  type AlertHistoryAlert,
  type AlertRelatedTrade,
} from "../../lib/alertHistory";

interface AlertHistoryDetailDrawerProps {
  userId: string;
  alert: AlertHistoryAlert | null;
  isMarkingRead: boolean;
  onClose: () => void;
  onMarkRead: (alertId: string) => void | Promise<void>;
}

function toLabel(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Unavailable";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString([], {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function contextRows(context: Record<string, unknown>): Array<{ key: string; value: string }> {
  return Object.entries(context)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim().length > 0)
    .slice(0, 12)
    .map(([key, value]) => ({
      key,
      value:
        typeof value === "string" || typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value),
    }));
}

function severityClass(severity: string): string {
  switch (severity.toLowerCase()) {
    case "critical":
      return "border-danger/30 bg-danger/10 text-danger";
    case "warning":
      return "border-warning/30 bg-warning/10 text-warning";
    case "caution":
      return "border-warning/30 bg-warning/10 text-warning";
    default:
      return "border-primary/30 bg-primary/10 text-primary-light";
  }
}

function roleLabel(role: string): string {
  if (role === "trigger_trade") return "Trigger Trade";
  if (role === "loss_trade") return "Loss Trade";
  if (role === "related_reference") return "Referenced";
  return toLabel(role);
}

function toneForPnl(pnl: string | null): string {
  if (!pnl) return "text-text-primary";
  const numeric = Number.parseFloat(pnl);
  if (Number.isNaN(numeric)) return "text-text-primary";
  if (numeric > 0) return "text-success";
  if (numeric < 0) return "text-danger";
  return "text-text-primary";
}

export function AlertHistoryDetailDrawer({
  userId,
  alert,
  isMarkingRead,
  onClose,
  onMarkRead,
}: AlertHistoryDetailDrawerProps) {
  const [relatedTrades, setRelatedTrades] = useState<AlertRelatedTrade[]>([]);
  const [missingTradeIds, setMissingTradeIds] = useState<string[]>([]);
  const [relatedWarnings, setRelatedWarnings] = useState<string[]>([]);
  const [isRelatedTradesLoading, setIsRelatedTradesLoading] = useState(false);
  const [relatedTradesError, setRelatedTradesError] = useState<string | null>(null);

  const triggerContext = useMemo(
    () => alert?.trigger_context ?? {},
    [alert?.trigger_context],
  );
  const relatedTradeIds = alert?.related_trade_ids ?? [];

  const triggerRows = useMemo(() => contextRows(triggerContext), [triggerContext]);
  const lossTradeId =
    typeof triggerContext["loss_trade_id"] === "string"
      ? triggerContext["loss_trade_id"]
      : null;
  const triggerTradeId =
    typeof triggerContext["trigger_trade_id"] === "string"
      ? triggerContext["trigger_trade_id"]
      : null;
  const hasLinkedTradeReferences =
    relatedTradeIds.length > 0 ||
    Boolean(lossTradeId) ||
    Boolean(triggerTradeId);

  useEffect(() => {
    if (!alert) {
      setRelatedTrades([]);
      setMissingTradeIds([]);
      setRelatedWarnings([]);
      setRelatedTradesError(null);
      setIsRelatedTradesLoading(false);
      return;
    }

    const shouldLoadRelatedTrades = hasLinkedTradeReferences;

    if (!shouldLoadRelatedTrades) {
      setRelatedTrades([]);
      setMissingTradeIds([]);
      setRelatedWarnings([]);
      setRelatedTradesError(null);
      setIsRelatedTradesLoading(false);
      return;
    }

    const controller = new AbortController();
    setIsRelatedTradesLoading(true);
    setRelatedTradesError(null);

    void fetchAlertRelatedTrades(userId, alert.id, controller.signal)
      .then((payload) => {
        setRelatedTrades(payload.trades);
        setMissingTradeIds(payload.missing_trade_ids);
        setRelatedWarnings(payload.warnings);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Trade references are unavailable right now.";
        setRelatedTrades([]);
        setMissingTradeIds([]);
        setRelatedWarnings([]);
        setRelatedTradesError(message);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsRelatedTradesLoading(false);
        }
      });

    return () => controller.abort();
  }, [alert, hasLinkedTradeReferences, relatedTradeIds.length, userId]);

  if (!alert) {
    return null;
  }

  const copyAlertDetails = async () => {
    const detailLines = [
      `Title: ${alert.title}`,
      `Severity: ${toLabel(alert.severity)}`,
      `Category: ${toLabel(alert.category)}`,
      `Rule: ${alert.rule_name} (${alert.rule_id})`,
      `Triggered At: ${formatDateTime(alert.triggered_at)}`,
      `Read: ${alert.is_read ? "Yes" : "No"}`,
      `Exchange: ${alert.exchange_id ? toLabel(alert.exchange_id) : "Unavailable"}`,
      `Symbol: ${alert.symbol ?? "Unavailable"}`,
      "",
      "Message:",
      alert.message,
      "",
      "Recommendation:",
      alert.recommendation ?? "No recommendation provided.",
    ];

    try {
      await navigator.clipboard.writeText(detailLines.join("\n"));
      toast.success("Alert details copied.");
    } catch {
      toast.error("Copy failed. Clipboard access is unavailable.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-main-bg/65 backdrop-blur-sm">
      <button
        type="button"
        aria-label="Close alert detail"
        className="flex-1 cursor-default"
        onClick={onClose}
      />
      <aside className="relative h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-surface-low p-5 md:p-6">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/[0.03] p-2 text-text-secondary transition hover:bg-white/[0.08] hover:text-text-primary"
          aria-label="Close"
        >
          <X size={16} />
        </button>

        <div className="pr-8">
          <h2 className="text-xl font-semibold text-text-primary">{alert.title}</h2>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-full border px-2.5 py-1 font-semibold uppercase tracking-[0.12em] ${severityClass(alert.severity)}`}
            >
              {toLabel(alert.severity)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 uppercase tracking-[0.12em] text-text-secondary">
              {toLabel(alert.category)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 uppercase tracking-[0.12em] text-text-secondary">
              {alert.is_read ? "Read" : "Unread"}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          {!alert.is_read ? (
            <button
              type="button"
              onClick={() => {
                void onMarkRead(alert.id);
              }}
              disabled={isMarkingRead}
              className="inline-flex items-center gap-2 rounded-xl border border-primary/35 bg-primary/15 px-4 py-2 text-sm font-medium text-primary-light transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ShieldCheck size={15} />
              <span>{isMarkingRead ? "Marking..." : "Mark as read"}</span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void copyAlertDetails();
            }}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-white/[0.08]"
          >
            <Copy size={15} />
            <span>Copy details</span>
          </button>
        </div>

        <div className="mt-6 space-y-4">
          <section className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold text-text-primary">Details</h3>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-2">
                <dt className="uppercase tracking-[0.14em] text-text-secondary">Rule</dt>
                <dd className="text-right text-text-primary">
                  {alert.rule_name}
                  <div className="text-[11px] text-text-secondary">{alert.rule_id}</div>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-2">
                <dt className="uppercase tracking-[0.14em] text-text-secondary">Triggered</dt>
                <dd className="text-right text-text-primary">{formatDateTime(alert.triggered_at)}</dd>
              </div>
              <div className="flex items-start justify-between gap-4 border-b border-white/8 pb-2">
                <dt className="uppercase tracking-[0.14em] text-text-secondary">Exchange</dt>
                <dd className="text-right text-text-primary">
                  {alert.exchange_id ? toLabel(alert.exchange_id) : "Unavailable"}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="uppercase tracking-[0.14em] text-text-secondary">Symbol</dt>
                <dd className="text-right text-text-primary">{alert.symbol ?? "Unavailable"}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold text-text-primary">Message</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{alert.message}</p>
          </section>

          <section className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
            <h3 className="text-sm font-semibold text-text-primary">Recommendation</h3>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              {alert.recommendation ?? "No recommendation provided for this alert."}
            </p>
          </section>

          {triggerRows.length > 0 ? (
            <section className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
              <h3 className="text-sm font-semibold text-text-primary">Trigger Context</h3>
              <dl className="mt-3 space-y-2 text-xs">
                {triggerRows.map((row) => (
                  <div
                    key={row.key}
                    className="flex items-start justify-between gap-4 border-b border-white/8 pb-2 last:border-b-0 last:pb-0"
                  >
                    <dt className="uppercase tracking-[0.14em] text-text-secondary">{toLabel(row.key)}</dt>
                    <dd className="max-w-[60%] text-right text-text-primary">{row.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {hasLinkedTradeReferences ||
          relatedTrades.length > 0 ||
          missingTradeIds.length > 0 ||
          relatedWarnings.length > 0 ||
          isRelatedTradesLoading ||
          relatedTradesError ? (
            <section className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
              <h3 className="text-sm font-semibold text-text-primary">Related Trade Evidence</h3>
              <p className="mt-1 text-xs leading-5 text-text-secondary">
                Linked trade references captured when this alert was generated.
              </p>

              {isRelatedTradesLoading ? (
                <div className="mt-3 rounded-lg border border-white/8 bg-main-bg/40 px-3 py-3 text-xs text-text-secondary">
                  Loading linked trades...
                </div>
              ) : null}

              {relatedTradesError ? (
                <div className="mt-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
                  {relatedTradesError}
                </div>
              ) : null}

              {relatedTrades.length > 0 ? (
                <div className="mt-3 space-y-2.5">
                  {relatedTrades.map((trade) => (
                    <article
                      key={trade.id}
                      className="rounded-lg border border-white/10 bg-main-bg/45 p-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold text-text-primary">
                            {trade.symbol ?? "Unknown symbol"}
                          </div>
                          <div className="mt-1 text-[11px] text-text-secondary">
                            {(trade.exchange_id ? toLabel(trade.exchange_id) : "Unknown exchange")}
                            {trade.side ? ` | ${toLabel(trade.side)}` : ""}
                            {trade.leverage ? ` | ${trade.leverage}x` : ""}
                          </div>
                        </div>
                        <div className={`text-sm font-mono font-semibold ${toneForPnl(trade.realized_pnl_usd)}`}>
                          {trade.realized_pnl_usd ? `$${trade.realized_pnl_usd}` : "PnL unavailable"}
                        </div>
                      </div>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {trade.roles.map((role) => (
                          <span
                            key={`${trade.id}-${role}`}
                            className="rounded-full border border-white/15 bg-white/[0.05] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-text-secondary"
                          >
                            {roleLabel(role)}
                          </span>
                        ))}
                      </div>

                      <div className="mt-2 grid grid-cols-1 gap-1 text-[11px] text-text-secondary sm:grid-cols-2">
                        <div>Closed: {formatDateTime(trade.closed_at)}</div>
                        <div>Opened: {formatDateTime(trade.opened_at)}</div>
                        <div>
                          Notional: {trade.notional_value_usd ? `$${trade.notional_value_usd}` : "Unavailable"}
                        </div>
                        <div>Record: {trade.record_type ? toLabel(trade.record_type) : "Unknown"}</div>
                      </div>
                    </article>
                  ))}
                </div>
              ) : null}

              {missingTradeIds.length > 0 ? (
                <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  Some linked trades are no longer available in local history:{" "}
                  <span className="font-mono">{missingTradeIds.join(", ")}</span>
                </div>
              ) : null}

              {relatedWarnings.length > 0 ? (
                <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  {relatedWarnings[0]}
                </div>
              ) : null}

              {!isRelatedTradesLoading &&
              !relatedTradesError &&
              relatedTrades.length === 0 &&
              missingTradeIds.length === 0 &&
              hasLinkedTradeReferences ? (
                <div className="mt-3 rounded-lg border border-white/8 bg-main-bg/45 px-3 py-2 text-xs text-text-secondary">
                  Trade references were recorded, but no matching trade documents were returned.
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
