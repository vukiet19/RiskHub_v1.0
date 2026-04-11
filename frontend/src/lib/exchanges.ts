export type SupportedExchangeId = "binance" | "okx";

export interface ExchangeMeta {
  id: string;
  label: string;
  shortLabel: string;
  defaultEnvironment: "mainnet" | "testnet";
  requiresPassphrase: boolean;
  accentClassName: string;
  badgeClassName: string;
  badgeDotClassName: string;
}

const EXCHANGE_META: Record<SupportedExchangeId, ExchangeMeta> = {
  binance: {
    id: "binance",
    label: "Binance",
    shortLabel: "BIN",
    defaultEnvironment: "testnet",
    requiresPassphrase: false,
    accentClassName: "text-[#ffd76a]",
    badgeClassName: "border-[#f0b90b]/30 bg-[#f0b90b]/10 text-[#ffd76a]",
    badgeDotClassName: "bg-[#f0b90b]",
  },
  okx: {
    id: "okx",
    label: "OKX",
    shortLabel: "OKX",
    defaultEnvironment: "mainnet",
    requiresPassphrase: true,
    accentClassName: "text-sky-200",
    badgeClassName: "border-sky-400/30 bg-sky-400/10 text-sky-200",
    badgeDotClassName: "bg-sky-300",
  },
};

const UNKNOWN_EXCHANGE_META: ExchangeMeta = {
  id: "unknown",
  label: "Unknown",
  shortLabel: "UNK",
  defaultEnvironment: "mainnet",
  requiresPassphrase: false,
  accentClassName: "text-slate-200",
  badgeClassName: "border-white/15 bg-white/5 text-slate-200",
  badgeDotClassName: "bg-slate-400",
};

export const SUPPORTED_EXCHANGE_IDS = Object.keys(EXCHANGE_META) as SupportedExchangeId[];

export function getExchangeMeta(exchangeId: string | null | undefined): ExchangeMeta {
  if (!exchangeId) {
    return UNKNOWN_EXCHANGE_META;
  }

  return EXCHANGE_META[exchangeId.toLowerCase() as SupportedExchangeId] ?? UNKNOWN_EXCHANGE_META;
}

export function buildConnectionLabel(
  exchangeId: string,
  environment: string,
  marketType: string,
): string {
  const meta = getExchangeMeta(exchangeId);

  return `${meta.label} ${formatEnumLabel(environment)} ${formatEnumLabel(marketType)}`;
}

export function formatEnumLabel(value: string | null | undefined): string {
  if (!value) {
    return "Unknown";
  }

  return value
    .split(/[_-\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}
