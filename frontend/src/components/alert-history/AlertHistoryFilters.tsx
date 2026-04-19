"use client";

import { RotateCcw, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type {
  AlertHistoryRuleOption,
  AlertReadStatus,
} from "../../lib/alertHistory";

export type DatePreset = "today" | "yesterday" | "last7" | "last30" | "custom";

interface AlertHistoryFiltersProps {
  fromDate: string;
  toDate: string;
  datePreset: DatePreset;
  severity: string;
  category: string;
  ruleId: string;
  readStatus: AlertReadStatus;
  exchangeId: string;
  search: string;
  severityOptions: string[];
  categoryOptions: string[];
  ruleOptions: AlertHistoryRuleOption[];
  exchangeOptions: string[];
  onDatePresetChange: (preset: DatePreset) => void;
  onFromDateChange: (value: string) => void;
  onToDateChange: (value: string) => void;
  onSeverityChange: (value: string) => void;
  onCategoryChange: (value: string) => void;
  onRuleChange: (value: string) => void;
  onReadStatusChange: (value: AlertReadStatus) => void;
  onExchangeChange: (value: string) => void;
  onSearchChange: (value: string) => void;
  onReset: () => void;
}

const PRESET_LABELS: Array<{ id: DatePreset; label: string }> = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "last7", label: "Last 7 days" },
  { id: "last30", label: "Last 30 days" },
];

function toTitleCase(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function AlertHistoryFilters({
  fromDate,
  toDate,
  datePreset,
  severity,
  category,
  ruleId,
  readStatus,
  exchangeId,
  search,
  severityOptions,
  categoryOptions,
  ruleOptions,
  exchangeOptions,
  onDatePresetChange,
  onFromDateChange,
  onToDateChange,
  onSeverityChange,
  onCategoryChange,
  onRuleChange,
  onReadStatusChange,
  onExchangeChange,
  onSearchChange,
  onReset,
}: AlertHistoryFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <section className="rounded-2xl border border-white/8 bg-surface-high/65 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-text-secondary">
          Filter History
        </h2>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((current) => !current)}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-white/[0.08] hover:text-text-primary"
          >
            <SlidersHorizontal size={14} />
            <span>{showAdvanced ? "Hide advanced" : "Show advanced"}</span>
          </button>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-text-secondary transition hover:bg-white/[0.08] hover:text-text-primary"
          >
            <RotateCcw size={14} />
            <span>Reset</span>
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {PRESET_LABELS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => onDatePresetChange(preset.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              datePreset === preset.id
                ? "border-primary/40 bg-primary/20 text-primary-light"
                : "border-white/10 bg-white/[0.03] text-text-secondary hover:bg-white/[0.08] hover:text-text-primary"
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-6">
        <label className="flex flex-col gap-1 xl:col-span-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">From</span>
          <input
            type="date"
            value={fromDate}
            onChange={(event) => onFromDateChange(event.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary/40"
          />
        </label>

        <label className="flex flex-col gap-1 xl:col-span-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">To</span>
          <input
            type="date"
            value={toDate}
            onChange={(event) => onToDateChange(event.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary/40"
          />
        </label>

        <label className="flex flex-col gap-1 xl:col-span-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">Severity</span>
          <select
            value={severity}
            onChange={(event) => onSeverityChange(event.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary/40"
          >
            <option value="">All severities</option>
            {severityOptions.map((option) => (
              <option key={option} value={option}>
                {toTitleCase(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 xl:col-span-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">Category</span>
          <select
            value={category}
            onChange={(event) => onCategoryChange(event.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary/40"
          >
            <option value="">All categories</option>
            {categoryOptions.map((option) => (
              <option key={option} value={option}>
                {toTitleCase(option)}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 xl:col-span-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">Rule</span>
          <select
            value={ruleId}
            onChange={(event) => onRuleChange(event.target.value)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary/40"
          >
            <option value="">All rules</option>
            {ruleOptions.map((option) => (
              <option key={option.rule_id} value={option.rule_id}>
                {option.rule_name} ({option.rule_id})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 xl:col-span-1">
          <span className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">Status</span>
          <select
            value={readStatus}
            onChange={(event) => onReadStatusChange(event.target.value as AlertReadStatus)}
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary/40"
          >
            <option value="all">All</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </label>
      </div>

      {showAdvanced ? (
        <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-white/8 bg-main-bg/40 p-3 md:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">Exchange</span>
            <select
              value={exchangeId}
              onChange={(event) => onExchangeChange(event.target.value)}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none transition focus:border-primary/40"
            >
              <option value="">All exchanges</option>
              {exchangeOptions.map((option) => (
                <option key={option} value={option}>
                  {toTitleCase(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.18em] text-text-secondary">Search</span>
            <input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search title, message, or rule..."
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-text-primary outline-none transition placeholder:text-text-secondary/70 focus:border-primary/40"
            />
          </label>
        </div>
      ) : null}
    </section>
  );
}
