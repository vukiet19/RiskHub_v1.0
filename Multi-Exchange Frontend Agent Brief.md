# RiskHub Multi-Exchange Frontend Agent Brief

## Objective
Implement the frontend changes required to move RiskHub from a single-exchange Binance Testnet dashboard to a multi-exchange dashboard with these approved constraints:

- Support `Binance` + `OKX`
- Only `1 active account per exchange` per user
- Prioritize `futures`
- Dashboard remains `globally aggregated`
- `Open Positions` must show an `exchange badge`
- `Net PnL by Exchange` becomes a `multi-row card`
- Replace `Connect Binance Testnet` with `Manage Connections`
- `Contagion graph` remains aggregated by asset, not split into asset-by-exchange nodes

This is a frontend implementation brief. Do not redefine backend semantics locally.

## Current Code Context
Inspect these files before changing anything:

- `frontend/src/app/page.tsx`
- `frontend/src/components/Navbar.tsx`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/PortfolioCard.tsx`
- `frontend/src/components/OpenPositions.tsx`
- `frontend/src/components/PortfolioContagionMap.tsx`
- `frontend/src/components/ConnectBinanceTestnetModal.tsx`
- `frontend/src/app/globals.css`

Important current-state observations:

- The UI is still branded around a single flow: `Connect Binance Testnet`
- The page already renders aggregated metrics, contagion, positions, and alerts
- `PortfolioCard` already supports multiple exchange rows conceptually, but the overall UX is still single-connection oriented
- `Open Positions` currently does not communicate exchange ownership strongly enough for a true multi-exchange experience

## Required Product Changes

### 1. Replace single-exchange connection UX
Replace the Binance-only connection entry point with a generic connection-management flow.

Required UX outcome:

- Navbar action becomes `Manage Connections`
- The modal/drawer is no longer Binance-only
- The user can:
  - view existing exchange connections
  - add a Binance connection
  - add an OKX connection
  - see status per connection
  - reconnect / refresh / disable a connection when supported by backend contract

Preferred implementation:

- Replace or evolve `ConnectBinanceTestnetModal.tsx` into a generic `ManageConnectionsModal`
- The modal should support an exchange selector
- Form fields should adapt to the exchange:
  - Binance: API key + API secret
  - OKX: API key + API secret + passphrase
- The UI must clearly show `environment` and `market_type`

### 2. Update connection language across the dashboard
Remove Binance-specific wording from the main dashboard chrome where the product is now multi-exchange.

Examples:

- Replace `Connect Binance Testnet` with `Manage Connections`
- Replace `Reconnect Binance Testnet` with a more generic action
- Connection status copy in `Navbar` should refer to backend-managed exchange data, not Binance only

### 3. Keep dashboard globally aggregated
Do not redesign the dashboard into separate exchange pages.

The top-level experience must stay portfolio-wide:

- `Total Portfolio Value` stays aggregated
- `Discipline Score` stays aggregated
- `Drawdown Impact` stays aggregated
- `Contagion` stays aggregated by asset

The UI should communicate that data is combined across active exchanges.

### 4. Net PnL by Exchange becomes a proper multi-row card
`PortfolioCard` must be able to render multiple connected exchanges cleanly.

Requirements:

- one row per exchange
- exchange badge / icon / label
- realized PnL per exchange
- trade count where available
- visually balanced when there are 2 exchanges
- still graceful when only 1 exchange is connected

Do not assume Binance is always row 1.

### 5. Open Positions must show exchange ownership
`Open Positions` must communicate which exchange each position belongs to.

Required behavior:

- add an `exchange badge` or `exchange chip` to every position row
- the badge must be easy to scan without dominating the row
- keep the current side / leverage / unrealized PnL layout intact where possible

Future-friendly requirement:

- the component should still work if positions are already globally aggregated from multiple exchanges

### 6. Contagion graph stays asset-level aggregated
Do not split graph nodes into:

- BTC on Binance
- BTC on OKX

That is explicitly out of scope.

However, frontend should be ready to display exchange-origin context if backend exposes it later through inspector metadata.

For this pass:

- keep node identity asset-based
- keep contagion graph portfolio-wide
- do not infer exchange-specific graph nodes locally

### 7. Add connection visibility to the dashboard shell
The dashboard should make it obvious that the portfolio is now multi-exchange.

Recommended UX additions:

- a small connection summary in navbar or near the connection control
- count of active exchanges
- per-connection health/state inside the connection manager

Do not add noisy persistent banners unless required by the backend state.

## Layout and Component Guidance

### Navbar
Update `Navbar.tsx` so it becomes the entry point to connection management:

- action label should be generic
- copy should not mention Binance-only behavior
- connection state text should reflect:
  - no connections
  - one active connection
  - multiple active connections

### Manage Connections Modal
The modal should show:

- current connections list
- add connection flow
- exchange selector
- connection metadata:
  - label
  - exchange
  - environment
  - market type
  - last sync
  - status

Do not overdesign it into a settings app. Keep it focused.

### Positions
Preserve readability first:

- symbol
- exchange badge
- side
- leverage
- pnl

The badge should not cause line wrapping on desktop.

## Non-Negotiable Rules

- Do not change backend contract assumptions locally unless required and explicitly documented
- Do not reintroduce Binance-only labels in the main connection flow
- Do not split contagion nodes by exchange
- Do not redesign the whole dashboard unnecessarily
- Keep all user-facing copy in English
- Preserve the RiskHub dark visual language

## Expected Backend Dependencies
The frontend should expect backend support for:

- multiple connections in `exchange_connections`
- generic connection create/list/update flows
- positions with `exchange_id`
- per-exchange rows for `Net PnL by Exchange`
- aggregated overview metrics

If a backend field is missing, report it explicitly instead of inventing semantics.

## Acceptance Criteria

- The dashboard no longer looks single-exchange only
- The main CTA is `Manage Connections`, not Binance-only
- The connection manager can present Binance + OKX flows
- `Net PnL by Exchange` renders multiple rows cleanly
- `Open Positions` visibly shows exchange badges
- Top-level metrics remain globally aggregated
- Contagion graph remains asset-level aggregated

## Report Format
When finished, report exactly:

1. files changed
2. how the connection manager flow changed
3. how Binance-only wording was removed
4. how `Net PnL by Exchange` now handles multiple exchanges
5. how `Open Positions` shows exchange ownership
6. what remains backend-dependent
7. what was verified
