"use client";

import { Coins } from "lucide-react";
import { getExchangeMeta } from "../lib/exchanges";

export interface SpotAssetData {
  asset: string;
  total: string | number;
  free?: string | number;
  used?: string | number;
  usd_value?: string | number;
  last_price_usd?: string | number | null;
  pricing_status?: string;
  is_stable?: boolean;
  exchange_id?: string;
  connection_label?: string | null;
}

interface SpotAssetsProps {
  assets?: SpotAssetData[];
  totalSpotValue?: number;
  isLoading?: boolean;
  isConnected?: boolean;
  warnings?: string[];
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  return Number.parseFloat(value || "0");
}

export function SpotAssets({
  assets = [],
  totalSpotValue = 0,
  isLoading = false,
  isConnected = false,
  warnings = [],
}: SpotAssetsProps) {
  const partialWarnings = warnings.filter(Boolean);
  const emptyStateMessage = !isConnected
    ? "Manage at least one Binance or OKX connection to load live spot assets."
    : partialWarnings[0] || "No live spot assets were found across active exchanges.";

  return (
    <div className="glass-card relative z-10 rounded-2xl border border-white/5 p-6 shadow-xl transition-all hover:border-white/10 group">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Coins size={18} className="text-primary" />
          <span>Spot Assets</span>
        </h3>
        <div className="text-right">
          <div className="font-mono text-base font-bold tracking-tight text-white">
            ${totalSpotValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-text-secondary">
            {isLoading ? "Loading..." : `${assets.length} assets`}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {!isLoading && partialWarnings.length > 0 && assets.length > 0 ? (
          <div className="rounded-xl border border-warning-accent/30 bg-warning-accent/10 px-4 py-3 text-sm text-warning-accent">
            {partialWarnings[0]}
          </div>
        ) : null}

        {isLoading ? (
          <div className="py-10 text-center text-sm text-gray-500 animate-pulse">
            Fetching live spot assets...
          </div>
        ) : assets.length === 0 ? (
          <div className="py-10 text-center text-sm italic text-gray-500">{emptyStateMessage}</div>
        ) : (
          assets.map((asset, index) => {
            const exchangeMeta = getExchangeMeta(asset.exchange_id);
            const usdValue = toNumber(asset.usd_value);
            const total = toNumber(asset.total);
            const free = toNumber(asset.free);
            const used = toNumber(asset.used);
            const lastPrice =
              asset.last_price_usd === null || asset.last_price_usd === undefined || asset.last_price_usd === ""
                ? null
                : toNumber(asset.last_price_usd);

            return (
              <div
                key={`${asset.exchange_id ?? "unknown"}-${asset.asset}-${index}`}
                className="rounded-xl border border-white/5 bg-white/[0.03] p-4 backdrop-blur-sm transition-colors hover:bg-white/[0.06]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="font-bold tracking-wide text-white">{asset.asset}</div>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${exchangeMeta.badgeClassName}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${exchangeMeta.badgeDotClassName}`} />
                        {exchangeMeta.label}
                      </span>
                      {asset.is_stable ? (
                        <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-text-secondary">
                          Stable
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-text-secondary">
                      <span>{total.toLocaleString(undefined, { maximumFractionDigits: 8 })} total</span>
                      {free > 0 ? <span>{free.toLocaleString(undefined, { maximumFractionDigits: 8 })} free</span> : null}
                      {used > 0 ? <span>{used.toLocaleString(undefined, { maximumFractionDigits: 8 })} locked</span> : null}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-base font-bold tracking-tight text-white">
                      ${usdValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-text-secondary">
                      {lastPrice !== null && Number.isFinite(lastPrice)
                        ? `$${lastPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 })}`
                        : asset.pricing_status === "unpriced"
                          ? "Price unavailable"
                          : "USD value"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
