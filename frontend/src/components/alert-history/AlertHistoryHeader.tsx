"use client";

import { CheckCheck, RefreshCw } from "lucide-react";

interface AlertHistoryHeaderProps {
  totalFiltered: number;
  unreadCount: number;
  isRefreshing: boolean;
  isMarkingAllRead: boolean;
  onRefresh: () => void;
  onMarkAllRead: () => void;
}

export function AlertHistoryHeader({
  totalFiltered,
  unreadCount,
  isRefreshing,
  isMarkingAllRead,
  onRefresh,
  onMarkAllRead,
}: AlertHistoryHeaderProps) {
  return (
    <section className="rounded-2xl border border-white/8 bg-surface-high/70 px-5 py-5 md:px-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Alert History</h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Review past alerts by day, severity, and rule type.
          </p>
          <p className="mt-3 text-xs uppercase tracking-[0.22em] text-text-secondary">
            {totalFiltered.toLocaleString()} alert{totalFiltered === 1 ? "" : "s"} in current view
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw size={16} className={isRefreshing ? "animate-spin" : ""} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh"}</span>
          </button>

          <button
            type="button"
            onClick={onMarkAllRead}
            disabled={unreadCount === 0 || isMarkingAllRead}
            className="inline-flex items-center gap-2 rounded-xl border border-primary/35 bg-primary/15 px-4 py-2.5 text-sm font-medium text-primary-light transition hover:bg-primary/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <CheckCheck size={16} />
            <span>{isMarkingAllRead ? "Marking..." : "Mark all in view"}</span>
          </button>
        </div>
      </div>
    </section>
  );
}
