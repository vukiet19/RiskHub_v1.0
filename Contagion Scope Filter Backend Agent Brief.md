# RiskHub Contagion Scope Filter Backend Agent Brief

## Objective
Implement the backend changes required to support contagion scope filtering for:

- `all`
- `binance`
- `okx`

This work must stay aligned with the approved RiskHub multi-exchange MVP:

- Support `Binance` + `OKX`
- Keep `1 active account per exchange`
- Prioritize `futures`
- Keep the dashboard `globally aggregated`
- Keep contagion `asset-level aggregated`
- Do **not** split contagion nodes into `asset@exchange`

This is a backend implementation brief only. Do not redefine frontend semantics locally.

## Current Code Context
Read these files before changing anything:

- `backend/api/dashboard.py`
- `backend/services/exchange_key_service.py`
- `backend/services/exchange_service.py`
- `backend/engine/correlation_engine.py`
- `Multi-Exchange Integration Brief.md`

Important current-state observations:

- The contagion endpoint is currently portfolio-wide
- Live holdings are already aggregated across active exchanges
- The multi-exchange dashboard foundation already exists
- Contagion currently does not distinguish `All` vs exchange-specific scopes

## Approved Product Semantics

### 1. Scope meanings
Backend must support:

- `scope=all`
- `scope=binance`
- `scope=okx`

Meaning:

- `all`: merge holdings from all active exchanges
- `binance`: use only holdings from the active Binance connection
- `okx`: use only holdings from the active OKX connection

### 2. Asset-level graph stays intact
Within each scope, contagion remains asset-level.

Examples:

- `scope=all`: BTC exposure from Binance + OKX merges into one BTC node
- `scope=binance`: BTC is one node for Binance exposure only
- `scope=okx`: BTC is one node for OKX exposure only

Not allowed:

- emitting separate nodes such as `BTC (Binance)` and `BTC (OKX)`
- emitting frontend-only hints that imply node splitting

## Required Backend Changes

### 1. Add scope query handling to the contagion endpoint
Extend:

- `GET /api/v1/dashboard/{user_id}/contagion`

Expected request support:

- `?scope=all`
- `?scope=binance`
- `?scope=okx`

Requirements:

- default scope = `all`
- reject unsupported values with a clear `400`
- do not silently coerce unknown scopes

### 2. Filter live holdings by scope
The holdings loader must support scope-aware filtering.

Expected behavior:

- `all`: all active supported exchange credentials contribute
- `binance`: only active Binance credentials contribute
- `okx`: only active OKX credentials contribute

This applies to the holdings used as contagion graph input.

### 3. Return scope metadata in the response
The contagion response should expose scope metadata explicitly.

Preferred fields:

```json
{
  "scope": "binance",
  "scope_label": "Binance"
}
```

Recommended additional field if feasible:

```json
{
  "market_data_source": "binance"
}
```

If fallback market data sourcing is needed later, this field provides honest product context.

### 4. Keep source_state honest per scope
The current contagion endpoint already handles:

- `no_connection`
- `insufficient_holdings`
- `error`
- `live`
- `demo`

These must now be evaluated per selected scope.

Examples:

- user selects `okx`, but no active OKX connection exists -> `no_connection`
- user selects `binance`, but Binance has fewer than 2 meaningful holdings -> `insufficient_holdings`
- `all` has enough holdings while `okx` alone does not -> both responses can legitimately differ

### 5. Keep contagion computation asset-level
The output graph contract should remain compatible with the current frontend module.

Do not:

- invent exchange-specific node IDs
- change node identity semantics
- force the frontend to reinterpret graph meaning

## Market Data Source Guidance

### 1. Current reality
The existing implementation uses public OHLCV to compute dependency.

The current `all` path already relies on a market data source rather than exchange-specific execution data.

### 2. MVP recommendation
For this pass:

- `scope=all`: acceptable to keep the current public market data strategy
- `scope=binance`: use Binance market data
- `scope=okx`: use OKX market data if reliable in your current service layer
- if OKX market data is incomplete or unstable, use a clearly labeled fallback strategy rather than faking precision

If fallback is used, prefer exposing:

- `market_data_source = "binance_fallback"`

This keeps the product honest without blocking the scope filter feature.

## Required Response Shape

The response should still follow the current contagion envelope, while adding scope metadata.

Preferred top-level shape:

```json
{
  "status": "ok",
  "scope": "all",
  "scope_label": "All Exchanges",
  "market_data_source": "binance",
  "source_state": "live",
  "message": null,
  "warnings": [],
  "data": { ... }
}
```

The `data` object should remain compatible with the current contagion graph contract.

## Non-Negotiable Rules

- Do not split contagion nodes by exchange
- Do not change the meaning of `All Exchanges`
- Do not silently accept invalid scope values
- Do not redesign unrelated dashboard endpoints
- Do not break existing contagion contract fields already used by the frontend
- Keep warnings and messages honest per selected scope

## Suggested Implementation Order

1. Add scope validation in the contagion endpoint
2. Make the live holdings loader scope-aware
3. Build scope-specific fallback behavior
4. Add response metadata: `scope`, `scope_label`, optional `market_data_source`
5. Verify `all`, `binance`, and `okx` outputs remain asset-level

## Acceptance Criteria

- `GET /contagion` accepts `scope=all|binance|okx`
- invalid scopes are rejected cleanly
- `scope=all` remains the default
- `scope=binance` only reflects Binance holdings
- `scope=okx` only reflects OKX holdings
- `scope=all` merges same-asset exposure across exchanges
- graph output remains asset-level in all scopes
- scope-specific fallback states are honest
- current frontend contagion contract remains usable

## Required Final Report
When finished, report exactly:

- files changed
- how scope validation works
- how holdings filtering works per scope
- what scope metadata is returned
- how `no_connection` and `insufficient_holdings` behave per scope
- what market data source is used per scope
- anything still approximate
