"use client";

import { FormEvent, useEffect, useState } from "react";
import { KeyRound, Loader2, ShieldCheck, X } from "lucide-react";

interface ConnectBinanceTestnetModalProps {
  isOpen: boolean;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    apiKey: string;
    apiSecret: string;
    label: string;
  }) => Promise<void> | void;
}

export function ConnectBinanceTestnetModal({
  isOpen,
  isSubmitting = false,
  errorMessage = null,
  onClose,
  onSubmit,
}: ConnectBinanceTestnetModalProps) {
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [label, setLabel] = useState("Binance Testnet Futures");
  const [validationMessage, setValidationMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setApiKey("");
      setApiSecret("");
      setLabel("Binance Testnet Futures");
      setValidationMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!apiKey.trim() || !apiSecret.trim()) {
      setValidationMessage("API key and API secret are required.");
      return;
    }

    setValidationMessage(null);
    await onSubmit({
      apiKey: apiKey.trim(),
      apiSecret: apiSecret.trim(),
      label: label.trim() || "Binance Testnet Futures",
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-main-bg/80 px-4 py-6 backdrop-blur-md">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-surface-high shadow-[0_32px_120px_rgba(0,0,0,0.45)]">
        <div className="absolute inset-x-0 top-0 h-32 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.16),_transparent_60%)]" />

        <div className="relative flex items-start justify-between border-b border-white/5 px-6 pb-5 pt-6">
          <div className="max-w-md">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-primary">
              <ShieldCheck size={14} />
              Server-Managed Connection
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-text-primary">
              Connect Binance Testnet
            </h2>
            <p className="mt-2 text-sm leading-6 text-text-secondary">
              Submit your Binance Testnet Futures read-only credentials once. The backend validates,
              encrypts, stores, and refreshes dashboard data without exposing secrets back to the app.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full border border-white/10 bg-white/[0.03] p-2 text-text-secondary transition-colors hover:bg-white/[0.08] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            aria-label="Close Binance Testnet connection modal"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="relative space-y-5 px-6 py-6">
          <div className="grid gap-5 md:grid-cols-2">
            <label className="flex flex-col gap-2 md:col-span-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                Connection Label
              </span>
              <input
                value={label}
                onChange={(event) => setLabel(event.target.value)}
                placeholder="Binance Testnet Futures"
                className="rounded-xl border border-white/10 bg-surface-low px-4 py-3 text-sm text-text-primary outline-none transition-colors placeholder:text-text-secondary/60 focus:border-primary/40"
              />
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                API Key
              </span>
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-surface-low px-4 py-3 focus-within:border-primary/40">
                <KeyRound size={16} className="text-primary" />
                <input
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste Binance Testnet API key"
                  className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary/60"
                />
              </div>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                API Secret
              </span>
              <div className="rounded-xl border border-white/10 bg-surface-low px-4 py-3 focus-within:border-primary/40">
                <input
                  value={apiSecret}
                  onChange={(event) => setApiSecret(event.target.value)}
                  type="password"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder="Paste Binance Testnet API secret"
                  className="w-full bg-transparent text-sm text-text-primary outline-none placeholder:text-text-secondary/60"
                />
              </div>
            </label>
          </div>

          {(validationMessage || errorMessage) && (
            <div className="rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger-accent">
              {validationMessage || errorMessage}
            </div>
          )}

          <div className="rounded-xl border border-white/5 bg-main-bg/40 px-4 py-3 text-xs leading-6 text-text-secondary">
            The frontend sends credentials only for this submission. The backend keeps them encrypted
            and uses stored credentials for refreshes, positions, contagion, and overview data.
          </div>

          <div className="flex flex-col gap-3 border-t border-white/5 pt-5 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-xl border border-white/10 px-4 py-3 text-sm font-medium text-text-secondary transition-colors hover:bg-white/[0.04] hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/15 px-5 py-3 text-sm font-semibold text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : null}
              {isSubmitting ? "Validating and Saving..." : "Connect Binance Testnet"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
