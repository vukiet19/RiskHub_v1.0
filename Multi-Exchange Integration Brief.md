# RiskHub Multi-Exchange Integration Brief

## Purpose
This file is the shared contract for the approved multi-exchange expansion of RiskHub.

All agents must treat this brief as binding.

Do not let frontend or backend redefine the product scope locally.
Do not let one side invent semantics that the other side does not explicitly support.

## Approved Product Scope

The following decisions are fixed for this implementation pass:

- Support `Binance` + `OKX`
- Only `1 active account per exchange` per user
- Prioritize `futures`
- The dashboard remains `globally aggregated`
- `Open Positions` must show `exchange ownership`
- `Net PnL by Exchange` must be a real multi-row card
- `Manage Connections` replaces `Connect Binance Testnet`
- `Contagion graph` remains aggregated by asset
- Do **not** split contagion nodes into `asset@exchange`

Anything outside this scope is future work unless explicitly approved later.

## Shared Product Semantics

### 1. Global dashboard semantics
The dashboard remains portfolio-wide.

This means:

- `Total Portfolio Value` is the combined value across active exchanges
- `Discipline Score` is a global score, not one score per exchange at the top level
- `Drawdown Impact` is global
- `Contagion` is global and asset-level
- `Open Positions` is a combined list of positions from all active exchanges

The UI may expose exchange-level detail, but the main page remains globally aggregated.

### 2. Exchange connection semantics
The system supports one active account per exchange.

For this pass:

- one active Binance connection maximum
- one active OKX connection maximum

The frontend must not assume multiple active Binance accounts.
The backend must enforce this so the frontend does not have to guess.

### 3. Contagion semantics
Contagion remains asset-level aggregated.

Examples:

- If the user has BTC exposure on Binance and BTC exposure on OKX, the graph shows one `BTC` node
- Holdings across exchanges are merged before contagion calculation
- The graph is not exchange-segmented in this pass

Allowed:

- inspector metadata may mention that a given asset is sourced from multiple exchanges

Not allowed:

- separate nodes like `BTC (Binance)` and `BTC (OKX)`
- frontend-only exchange splitting logic

## Required Backend Responsibilities

### 1. Generic connection management
Backend must expose connection management that is not Binance-only.

Preferred route shape:

- `GET /api/v1/exchange-keys/{user_id}`
- `POST /api/v1/exchange-keys/{user_id}/connect`
- optional update/disable/delete routes as implemented

At minimum, the connect flow must support:

- `exchange_id = "binance"`
- `exchange_id = "okx"`

### 2. Enforce one-active-account-per-exchange
Backend must guarantee that the user cannot end up with ambiguous active states.

If a new Binance connection is saved as active, previous active Binance connection state must no longer remain active.
The same applies to OKX.

### 3. Multi-exchange dashboard aggregation
Backend must aggregate across all active connections.

This includes:

- total portfolio value
- positions
- exchange connection statuses
- by-exchange PnL summary
- contagion input holdings

One exchange failing must not invalidate successful data from another exchange if partial results can still be returned honestly.

### 4. Position contract
Every returned position must include exchange ownership.

Required field:

- `exchange_id`

Recommended stable position shape:

```json
{
  "symbol": "BTCUSDT",
  "side": "short",
  "leverage": 1,
  "unrealized_pnl": "218.09",
  "mark_price": "0",
  "entry_price": "0",
  "exchange_id": "binance"
}
```

### 5. Net PnL by Exchange contract
The backend must provide a clean multi-row summary for the frontend card.

Minimum required fields per row:

- `exchange_id`
- `trade_count`
- `net_pnl_usd`

Optional fields if already available:

- `win_rate_pct`
- `avg_leverage`

### 6. Exchange connections in overview
The overview payload must expose enough state for a connection manager UI.

Each connection entry should provide:

- `exchange_id`
- `label`
- `environment`
- `market_type`
- `permissions_verified`
- `is_active`
- `last_sync_at`
- `last_sync_status`
- `last_sync_error`

## Required Frontend Responsibilities

### 1. Manage Connections UX
The frontend must stop framing the product as Binance-only.

Required changes:

- replace `Connect Binance Testnet` / `Reconnect Binance Testnet` with a generic `Manage Connections` flow
- modal/drawer should support Binance and OKX input paths
- form fields adapt to exchange requirements

### 2. Use connection metadata honestly
Frontend must render what the backend actually supports.

Do not:

- invent extra connection states
- fake multi-account support
- assume all exchanges support the same fields if the backend does not say so

### 3. Open Positions rendering
Frontend must show exchange ownership clearly.

Required UI:

- exchange badge/chip on each position row
- still readable at a glance

### 4. Net PnL by Exchange rendering
Frontend must present multiple exchange rows cleanly.

Requirements:

- no Binance-first hardcoding
- works with one active exchange
- works with two active exchanges

### 5. Contagion rendering
Frontend must preserve asset-level aggregation.

Do not:

- create exchange-specific contagion nodes
- infer exchange-level graph semantics locally

## Shared API Expectations

### Connection creation request
Preferred request contract:

```json
{
  "exchange_id": "binance",
  "environment": "testnet",
  "market_type": "futures",
  "label": "Binance Testnet Futures",
  "api_key": "...",
  "api_secret": "...",
  "passphrase": null
}
```

For OKX, `passphrase` may be required.

### Overview response expectations
At minimum, overview should be able to communicate:

- aggregated totals
- active connection count or detailed connections
- live connection health
- last refresh context

### Refresh behavior
The refresh workflow must be multi-connection aware.

Preferred semantics:

- refresh all active exchanges
- aggregate successful results
- preserve per-exchange warning/error visibility

## Explicit Non-Goals For This Pass

These are not part of this approved implementation:

- multiple active accounts per exchange
- asset-by-exchange contagion nodes
- separate dashboard pages per exchange
- fully independent per-exchange portfolio dashboards
- broad multi-exchange support beyond Binance + OKX
- a full portfolio attribution system by exchange across every widget

## Failure Conditions

The implementation should be considered misaligned if any of the following happen:

- frontend still behaves as a Binance-only product in primary connection flow
- backend allows two active accounts for the same exchange
- positions do not carry exchange ownership
- `Net PnL by Exchange` is not real multi-row backend data
- contagion graph gets split into exchange-specific nodes
- frontend has to guess core exchange semantics that backend should provide

## Acceptance Criteria

The integration is acceptable only if:

1. Binance + OKX can both be represented in the connection model
2. one active account per exchange is enforced
3. dashboard top-level metrics remain globally aggregated
4. `Open Positions` shows exchange ownership
5. `Net PnL by Exchange` supports multiple exchanges cleanly
6. the main connection entry point is generic `Manage Connections`
7. contagion graph remains asset-level aggregated
8. frontend and backend do not diverge on these semantics

## Coordinator Review Focus

The coordinator must verify:

- no hidden Binance-only assumptions remain in the core UX
- one-active-account-per-exchange is real, not just implied
- frontend and backend agree on connection metadata
- partial exchange failures are handled honestly
- contagion remains asset-aggregated
- Open Positions and Net PnL by Exchange reflect true multi-exchange behavior

## Final Rule

If any frontend brief, backend brief, or agent-local assumption conflicts with this file, this integration brief wins.
