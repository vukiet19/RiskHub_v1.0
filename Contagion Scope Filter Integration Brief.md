# RiskHub Contagion Scope Filter Integration Brief

## Purpose
This file is the shared contract for the `All / Binance / OKX` contagion scope filter.

All agents must treat this brief as binding.

Do not let frontend or backend redefine scope semantics locally.

## Approved Feature

Add a contagion filter with exactly these choices:

- `All`
- `Binance`
- `OKX`

This feature is layered on top of the existing multi-exchange MVP.

## Fixed Product Constraints

The following constraints remain unchanged:

- Support `Binance` + `OKX`
- Only `1 active account per exchange`
- Prioritize `futures`
- Dashboard remains `globally aggregated`
- Contagion remains `asset-level aggregated`
- Do **not** split contagion nodes into `asset@exchange`

Anything outside this scope is future work.

## Shared Semantics

### 1. Scope definitions

#### `All`
Portfolio-wide contagion across all active exchanges.

Meaning:

- merge holdings across active exchanges before contagion calculation
- same asset across exchanges becomes one merged node

Example:

- BTC on Binance + BTC on OKX => one `BTC` node in `All`

#### `Binance`
Contagion view derived only from the active Binance connection.

#### `OKX`
Contagion view derived only from the active OKX connection.

### 2. Node semantics
Node identity remains asset-based.

Allowed:

- `BTC`
- `ETH`
- `DOGE`

Not allowed:

- `BTC (Binance)`
- `BTC@OKX`
- duplicated nodes caused only by exchange origin

### 3. Inspector semantics
The inspector is always scoped to the currently selected contagion view.

Examples:

- In `All`, BTC inspector reflects merged BTC exposure
- In `Binance`, BTC inspector reflects Binance-only BTC exposure
- In `OKX`, BTC inspector reflects OKX-only BTC exposure

## Required Backend Contract

### Endpoint
The active contagion endpoint becomes scope-aware:

- `GET /api/v1/dashboard/{user_id}/contagion?scope=all`
- `GET /api/v1/dashboard/{user_id}/contagion?scope=binance`
- `GET /api/v1/dashboard/{user_id}/contagion?scope=okx`

Default:

- if `scope` is omitted, treat it as `all`

Invalid values:

- must return `400`

### Required top-level fields
The response must remain compatible with the current contagion envelope and add scope metadata.

Required:

```json
{
  "status": "ok",
  "scope": "all",
  "scope_label": "All Exchanges",
  "source_state": "live",
  "message": null,
  "warnings": [],
  "data": { ... }
}
```

Recommended if feasible:

```json
{
  "market_data_source": "binance"
}
```

### Holdings rules

#### `scope=all`
- include all active supported exchanges
- merge same-asset exposure across exchanges

#### `scope=binance`
- include only active Binance holdings

#### `scope=okx`
- include only active OKX holdings

### Fallback rules

#### no connection for selected scope
Example:

- `scope=okx`, but no active OKX connection exists

Return:

- `source_state = "no_connection"`
- honest `message`

#### insufficient holdings for selected scope
Example:

- `scope=binance` has only one meaningful asset

Return:

- `source_state = "insufficient_holdings"`

#### partial warning state
If the backend can still compute a valid graph but had warnings relevant to the selected scope:

- keep `source_state = "live"` or `"demo"` as appropriate
- return `message` and/or `warnings`
- do not hide the warning condition

## Required Frontend Contract

### Scope UI
The contagion module must display a scope selector with:

- `All`
- `Binance`
- `OKX`

Default:

- `All`

### Request behavior
Frontend must request contagion data by scope.

Do not:

- fake the scope by filtering nodes client-side
- reuse `All` graph data for `Binance` or `OKX`

### View interaction
The existing `Overview / Focus` toggle remains active within the chosen scope.

Correct mental model:

- first choose scope
- then choose `Overview` or `Focus`

### Selected asset behavior
When scope changes:

- keep the selected asset if it still exists
- otherwise reset to backend default selected asset

### Scope-aware fallback behavior
If the selected scope has:

- no connection
- insufficient holdings
- warnings

the UI must reflect that state honestly for that scope.

## Market Data Source Guidance

### Current MVP rule
The scope filter does not require exchange-split graph topology.

If a single market data source or a fallback source is still used behind the scenes, the product must remain honest about that when needed.

Preferred metadata:

- `market_data_source = "binance"`
- `market_data_source = "okx"`
- `market_data_source = "binance_fallback"`

This is recommended, not mandatory for the first pass, unless the implementation would otherwise mislead the user.

## Non-Negotiable Rules

- Do not split contagion nodes by exchange
- Do not make the `All` view secretly mean Binance-only
- Do not allow invalid scope values silently
- Do not replace backend-driven scope filtering with frontend-only filtering
- Do not break current contagion graph semantics
- Keep all user-facing copy in English

## Acceptance Criteria

This feature is complete only when:

- `All / Binance / OKX` exists in the contagion UI
- `All` is the default selection
- backend honors scope in the active contagion path
- each scope produces its own honest fallback states
- the graph remains asset-level in every scope
- `Overview / Focus` still works after adding scope selection
- no scope creates exchange-split nodes
- frontend and backend agree on the scope contract
