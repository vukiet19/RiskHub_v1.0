# Agent-Ready Implementation Brief

## Project
`D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0`

## Objective
Implement an end-to-end Binance Testnet connection flow so the dashboard can be populated from backend-managed exchange data instead of hardcoded placeholders or mock inputs.

The user must be able to:
- enter Binance Testnet API key and secret in the app
- have the backend validate and encrypt the credentials
- store the credentials in `users.exchange_keys`
- trigger a refresh flow that syncs exchange data and recomputes dashboard metrics
- see live and computed dashboard widgets update from backend data

## Product Scope
Target exchange:
- Binance Testnet only

Target user scope:
- single-user MVP is acceptable for now

Target dashboard widgets:
- Portfolio Contagion Map
- Net PnL by Exchange
- Discipline Score
- Open Positions
- Drawdown Impact
- Total Portfolio Value
- Alerts
- History / trend data where already supported

## Architectural Rule
Do not implement a browser-to-Binance integration.

Correct architecture:
1. Frontend submits credentials to backend once
2. Backend validates credentials server-side
3. Backend encrypts and stores credentials
4. Backend reuses stored credentials for sync and live snapshots
5. Frontend fetches dashboard data only from backend endpoints

Frontend must never directly use stored secrets after submission.

## Existing Relevant Context
Already implemented in the codebase:
- server-side decrypt helper:
  - `backend/security.py`
- dotenv loading in backend:
  - `backend/database.py`
- live positions dashboard endpoint:
  - `backend/api/dashboard.py`
- live contagion flow from stored credentials:
  - `backend/api/dashboard.py`
- contagion engine:
  - `backend/engine/correlation_engine.py`

Do not regress these recent fixes.

## Required Deliverables

### 1. Exchange Key Model Upgrade
Extend stored exchange key metadata so the backend can distinguish Binance Testnet correctly.

Add fields to exchange key records:
- `environment`: `"testnet"` or `"mainnet"`
- `market_type`: `"futures"` or `"spot"` or `"mixed"`

Preserve existing fields:
- `exchange_id`
- `label`
- `api_key_encrypted`
- `api_secret_encrypted`
- `passphrase_encrypted`
- `permissions_verified`
- `is_active`
- `last_sync_at`
- `last_sync_status`
- `last_sync_error`

Primary file:
- `backend/models/user.py`

### 2. Exchange Key Management API
Add a backend router for exchange key connection and management.

Minimum endpoint for MVP:
- `POST /api/v1/exchange-keys/{user_id}/binance-testnet/connect`

Recommended optional endpoints:
- `GET /api/v1/exchange-keys/{user_id}`
- `DELETE /api/v1/exchange-keys/{user_id}/{key_index_or_id}`

The connect endpoint must:
- accept API key and secret
- validate them against Binance Testnet server-side
- confirm read access works
- encrypt and store them
- write metadata:
  - `exchange_id = "binance"`
  - `environment = "testnet"`
  - `market_type = "futures"` for MVP
  - `permissions_verified = ["read"]`
  - `is_active = true`

Never return raw secrets in responses.

Primary files:
- new backend router, e.g. `backend/api/exchange_keys.py`
- `backend/main.py`
- `backend/security.py`
- `backend/services/exchange_service.py`

### 3. Encryption Path for New Credentials
The repo already has decryption support. Add the matching encryption path for newly submitted credentials.

Requirements:
- implement `encrypt_secret(...)` in `backend/security.py`
- use the same AES-256-GCM envelope format documented in the schema:
  - `enc::<base64_iv>::<base64_tag>::<base64_ciphertext>`
- keep compatibility with existing decryption helper
- use `RISKHUB_ENCRYPTION_KEY` as the primary environment variable

### 4. Dashboard Refresh Orchestration
Add one backend refresh endpoint that turns a stored Binance Testnet connection into dashboard-ready data.

Required endpoint:
- `POST /api/v1/dashboard/{user_id}/refresh`

The refresh flow should:
1. load the active stored Binance Testnet key
2. decrypt credentials
3. fetch balances
4. fetch open positions
5. sync recent trade history
6. run the quant engine
7. return a refresh summary

Recommended response fields:
- `status`
- `started_at`
- `finished_at`
- `trade_sync.inserted`
- `trade_sync.updated`
- `positions_count`
- `balances_count`
- `engine_status`
- `warnings`

Primary files:
- `backend/api/dashboard.py`
- `backend/api/sync.py`
- `backend/engine/quant_engine.py`
- `backend/services/exchange_service.py`

### 5. Total Portfolio Value Support
Define and implement a backend-derived `Total Portfolio Value`.

Do not infer this from historical trade notional.

MVP definition:
- spot asset market value
- plus futures wallet/account value
- plus unrealized PnL where appropriate

If needed, add a dedicated service function such as:
- `fetch_futures_account_balance(...)`
- or `fetch_account_overview(...)`

Primary files:
- `backend/services/exchange_service.py`
- `backend/api/dashboard.py`

### 6. Dashboard Overview Endpoint
Add an aggregated overview payload to reduce frontend fragmentation.

Required endpoint:
- `GET /api/v1/dashboard/{user_id}/overview`

Overview payload should include:
- `total_portfolio_value`
- `total_unrealized_pnl`
- `net_pnl_usd`
- `discipline_score`
- `discipline_grade`
- `max_drawdown_pct`
- `exchange_connections`
- `last_refresh_at`
- `data_freshness`
- `has_live_exchange_connection`

Primary file:
- `backend/api/dashboard.py`

### 7. Frontend Connection Flow
Add a UI flow that lets the user connect Binance Testnet credentials directly from the app.

Required UI pieces:
- `Connect Binance Testnet` button
- modal or drawer form
- fields:
  - API Key
  - API Secret
  - optional label
- submit state
- validation error state
- success state

After successful connection:
- close the modal
- call the dashboard refresh endpoint
- refetch overview, metrics, alerts, positions, and contagion

Recommended files:
- `frontend/src/app/page.tsx`
- new component such as `frontend/src/components/ConnectBinanceTestnetModal.tsx`
- optional status badge / connection card component

### 8. Frontend Dashboard Wiring
Ensure all visible dashboard widgets are backend-driven after the connection succeeds.

Required frontend data flow:
- page load:
  - fetch overview
  - fetch metrics
  - fetch alerts
  - fetch positions
  - fetch contagion
- after successful connect:
  - call refresh endpoint
  - refetch all dashboard data
- after manual refresh:
  - call refresh endpoint again

Remove remaining placeholder behavior where it conflicts with real backend data.

## Widget Data Mapping

Portfolio Contagion Map:
- source: stored exchange credentials -> live holdings -> public OHLCV -> contagion engine
- endpoint: `GET /api/v1/dashboard/{user_id}/contagion`

Net PnL by Exchange:
- source: synced trade history -> quant engine output
- endpoint: `GET /api/v1/dashboard/{user_id}/metrics` or `overview`

Discipline Score:
- source: synced trade history -> quant engine output
- endpoint: `GET /api/v1/dashboard/{user_id}/metrics`

Open Positions:
- source: stored exchange credentials -> live positions snapshot
- endpoint: `GET /api/v1/dashboard/{user_id}/positions`

Drawdown Impact:
- source: synced trade history -> quant engine output
- endpoint: `GET /api/v1/dashboard/{user_id}/metrics`

Total Portfolio Value:
- source: live account state, not trade history
- endpoint: `GET /api/v1/dashboard/{user_id}/overview`

Alerts:
- source: quant engine rules + alerts log
- endpoint: `GET /api/v1/dashboard/{user_id}/alerts`

History:
- source: persisted `risk_metrics`
- endpoint: `GET /api/v1/dashboard/{user_id}/history`

## Non-Negotiable Constraints
- Do not expose raw secrets in frontend or API responses
- Do not store plaintext credentials in MongoDB
- Do not compute portfolio value from cumulative historical trade volume
- Do not rebuild the contagion system as a frontend-only feature
- Do not break the existing decrypt helper or current dashboard endpoints
- Keep user-facing UI copy in English
- Preserve the current dashboard design language unless a change is needed for clarity

## Recommended Implementation Order
1. upgrade exchange key schema metadata
2. add encryption path for newly submitted credentials
3. add exchange key connection API
4. add dashboard refresh orchestration endpoint
5. add live account overview / portfolio value support
6. add dashboard overview endpoint
7. build frontend connect modal and connection state
8. wire frontend refresh flow
9. remove or replace remaining hardcoded dashboard values
10. test with a real Binance Testnet account

## Acceptance Criteria
- user can connect Binance Testnet credentials from the app
- backend validates credentials before storing them
- stored credentials are encrypted at rest
- dashboard refresh uses stored credentials only
- Open Positions is populated from backend-managed live exchange data
- Contagion Map is generated from real holdings, not mock fallback, when live data exists
- Net PnL by Exchange is computed from synced trade history
- Discipline Score is computed from engine output
- Drawdown Impact is computed from engine output
- Total Portfolio Value comes from live account state
- frontend no longer depends on hardcoded dashboard values for connected flows
- invalid credentials, missing encryption key, sparse accounts, and exchange failures all show explicit error states

## Verification Requirements
Minimum verification before marking done:
- backend syntax / import sanity checks pass
- frontend TypeScript compile passes
- connect flow works with a real Binance Testnet key
- refresh endpoint populates trades / metrics / positions
- dashboard updates after connect without page reload
- no raw secret appears in logs, UI, or API responses

## Expected Final Report from the Agent
The implementation report must include:
- architecture summary
- key files changed
- API endpoints added or changed
- security decisions made
- what was verified
- what remains approximate or still blocked
