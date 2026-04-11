# RiskHub Multi-Exchange Backend Agent Brief

## Objective
Implement the backend foundation required for RiskHub to support a multi-exchange dashboard with these approved constraints:

- Support `Binance` + `OKX`
- Only `1 active account per exchange` per user
- Prioritize `futures`
- Dashboard remains `globally aggregated`
- `Open Positions` must expose `exchange_id`
- `Net PnL by Exchange` becomes a real multi-row backend summary
- Replace Binance-only connection flow with generic `Manage Connections`
- `Contagion` remains aggregated by asset, not split into asset-by-exchange nodes

This is a backend implementation brief. Do not force the frontend to infer product semantics that the backend can provide explicitly.

## Current Code Context
Inspect these files before changing anything:

- `backend/api/exchange_keys.py`
- `backend/api/dashboard.py`
- `backend/api/sync.py`
- `backend/services/exchange_service.py`
- `backend/services/exchange_key_service.py`
- `backend/models/user.py`
- `backend/database.py`

Important current-state observations:

- `exchange_keys.py` currently exposes a Binance-specific connect route:
  - `POST /api/v1/exchange-keys/{user_id}/binance-testnet/connect`
- Several dashboard flows are still Binance-centric in wording and behavior
- The user document already supports an `exchange_keys` array with useful metadata
- The dashboard overview already exposes `exchange_connections` and `metrics.by_exchange`, which is a good starting point

## Required Architecture Changes

### 1. Generalize exchange connection creation
Replace the Binance-only connect pattern with a generic connection flow.

Preferred endpoint:

- `POST /api/v1/exchange-keys/{user_id}/connect`

Recommended request shape:

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

Requirements:

- support `binance`
- support `okx`
- validate per exchange
- store encrypted credentials
- return sanitized connection metadata

### 2. Enforce one active account per exchange
This is an approved product constraint.

Required behavior:

- a user may have at most one active Binance connection
- a user may have at most one active OKX connection
- if a new active connection is saved for the same exchange, it should replace or deactivate the previous one in a deterministic way

Do not allow ambiguous “two active Binance accounts” states in this pass.

### 3. Prioritize futures
The dashboard should primarily work from futures-oriented data for Binance and OKX.

Requirements:

- `market_type = futures` should be first-class
- futures positions and futures account state must work before spot/mixed expansion
- do not block the whole design on spot parity

### 4. Build exchange adapter selection cleanly
Do not spread exchange-specific branching throughout dashboard endpoints.

Preferred approach:

- central adapter/registry selection by `exchange_id`
- exchange-specific validators and fetch methods behind a common interface

The backend should expose unified shapes for:

- validate credentials
- fetch open positions
- fetch futures balances / account overview
- sync trades
- fetch holdings input for contagion

### 5. Keep dashboard globally aggregated
Do not convert the backend into per-exchange dashboards.

The main dashboard must remain aggregated across all active exchange connections:

- `total_portfolio_value`
- `total_unrealized_pnl`
- `discipline_score`
- `max_drawdown_pct`
- contagion holdings input

Aggregation rules must be explicit and deterministic.

### 6. Positions must include exchange ownership
`Open Positions` now needs to render exchange badges.

Backend requirement:

- every position returned to the frontend must include `exchange_id`
- keep existing position fields stable where possible

### 7. Net PnL by Exchange must be real multi-row data
`metrics.by_exchange` must become a reliable backend-produced multi-row summary.

Each row should include at least:

- `exchange_id`
- `trade_count`
- `net_pnl_usd`

Optional:

- `win_rate_pct`
- `avg_leverage`

Do not hardcode ordering around Binance.

### 8. Contagion remains asset-level aggregated
This is a non-negotiable scope decision.

Required behavior:

- aggregate holdings by asset symbol across exchanges
- do not emit separate nodes for `BTC@binance` and `BTC@okx`
- if holdings come from multiple exchanges, merge them before contagion graph calculation

This means backend aggregation must normalize asset identity before contagion generation.

### 9. Generic connection management responses
The frontend connection manager will need a cleaner list contract.

The list endpoint should clearly expose:

- exchange id
- label
- environment
- market type
- permissions verified
- is active
- last sync at
- last sync status
- last sync error

Do not expose secrets.

### 10. Refresh orchestration must become multi-connection aware
Current refresh behavior is still too Binance-centric.

Required behavior:

- load all active connections
- refresh each supported active exchange
- aggregate results
- keep partial success possible

Recommended response shape:

```json
{
  "status": "ok",
  "results": [
    {
      "exchange_id": "binance",
      "status": "ok"
    },
    {
      "exchange_id": "okx",
      "status": "error",
      "error": "..."
    }
  ],
  "warnings": []
}
```

One exchange failing must not collapse the whole dashboard if another exchange succeeds.

## Recommended Implementation Order

1. Generalize connection create endpoint
2. Add per-exchange validation and registry routing
3. Enforce one active account per exchange
4. Make dashboard live context and refresh orchestration multi-connection aware
5. Add `exchange_id` to position output
6. Make `metrics.by_exchange` real multi-row backend output
7. Ensure contagion holdings aggregation merges assets across exchanges
8. Update connection list responses for frontend manager

## Non-Negotiable Rules

- Do not keep the main connection flow Binance-only
- Do not allow multiple active accounts for the same exchange in this pass
- Do not split contagion graph nodes by exchange
- Do not require the frontend to infer exchange ownership from labels
- Do not expose plaintext secrets
- Keep calculations interpretable for MVP

## Acceptance Criteria

- Backend supports Binance + OKX connection management
- Each exchange can have at most one active account per user
- Dashboard overview remains globally aggregated
- Open positions include `exchange_id`
- `Net PnL by Exchange` supports multiple exchanges cleanly
- Refresh works across all active connections with partial-failure tolerance
- Contagion holdings are aggregated by asset across exchanges

## Report Format
When finished, report exactly:

1. files changed
2. new or changed endpoints
3. how one-active-account-per-exchange is enforced
4. how multi-exchange refresh works
5. how positions now expose exchange ownership
6. how `metrics.by_exchange` is produced
7. how contagion asset aggregation works across exchanges
8. what remains approximate or future scope
