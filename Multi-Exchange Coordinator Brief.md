# RiskHub Multi-Exchange Coordinator Brief

## Objective
Review the frontend and backend implementation for the approved RiskHub multi-exchange scope and determine whether the system is aligned enough to proceed.

Approved product scope:

- Support `Binance` + `OKX`
- Only `1 active account per exchange` per user
- Prioritize `futures`
- Dashboard remains `globally aggregated`
- `Open Positions` shows `exchange badges`
- `Net PnL by Exchange` becomes a `multi-row card`
- `Manage Connections` replaces `Connect Binance Testnet`
- `Contagion graph` remains aggregated by asset, not split into asset-by-exchange nodes

## Your Review Role
You are the coordinator and final alignment reviewer.

You must:

- review actual code, not just agent reports
- verify backend/frontend contract alignment
- verify that the implementation matches the approved product scope
- identify regressions, semantic drift, or hidden single-exchange assumptions

Do not redesign the feature. Review and judge alignment.

## Files to Inspect

Backend:
- `backend/api/exchange_keys.py`
- `backend/api/dashboard.py`
- `backend/api/sync.py`
- `backend/services/exchange_service.py`
- `backend/services/exchange_key_service.py`
- `backend/models/user.py`

Frontend:
- `frontend/src/app/page.tsx`
- `frontend/src/components/Navbar.tsx`
- `frontend/src/components/Sidebar.tsx`
- `frontend/src/components/PortfolioCard.tsx`
- `frontend/src/components/OpenPositions.tsx`
- `frontend/src/components/PortfolioContagionMap.tsx`
- `frontend/src/components/ConnectBinanceTestnetModal.tsx` or replacement
- `frontend/src/app/globals.css`

## Required Review Questions

### 1. Is the connection flow still Binance-only anywhere important?
Check for:

- Binance-only connect endpoints
- Binance-only modal/component naming left active in UX
- navbar/button copy still centered on Binance only
- refresh logic still assuming Binance only

### 2. Is one active account per exchange actually enforced?
Check for:

- backend enforcement logic
- ambiguous multi-active states
- frontend assumptions that break if duplicates exist

### 3. Is the dashboard truly globally aggregated?
Check whether:

- overview totals combine active exchanges
- positions can come from multiple exchanges
- multi-exchange warnings and partial errors are represented honestly

### 4. Does Open Positions show exchange ownership clearly?
Check:

- backend includes exchange ownership
- frontend renders exchange badges cleanly
- no hidden assumptions that all rows belong to Binance

### 5. Is Net PnL by Exchange actually multi-row and data-driven?
Check:

- backend summary production
- frontend row rendering
- support for Binance + OKX
- graceful behavior for one connected exchange

### 6. Does contagion remain asset-level aggregated?
This is critical.

Check:

- holdings are merged by asset across exchanges
- frontend does not create exchange-specific contagion nodes
- no accidental `BTC@exchange` node semantics appear

### 7. Does the new `Manage Connections` UX align with backend capability?
Check:

- add/list/reconnect/disable flows if claimed
- no frontend-only fake states
- no backend fields left undefined where the frontend needs explicit state

## Review Standards

Prioritize findings by severity:

- P0: security / credential handling / broken core flow
- P1: contract mismatch / wrong aggregation / broken product semantics
- P2: UX correctness / misleading but non-blocking behavior
- P3: polish / cleanup / future improvements

Findings must be concrete, code-based, and file-referenced.

## Non-Negotiable Alignment Rules

- Do not approve an implementation that still behaves like a Binance-only product under the surface
- Do not approve an implementation that allows multiple active connections per exchange if the UI assumes one
- Do not approve an implementation that splits contagion nodes by exchange
- Do not approve an implementation where one broken exchange collapses the whole dashboard if partial success should be supported
- Do not treat visual completion as semantic completion

## Final Decision Format
Return:

1. Findings first, ordered by severity
2. Alignment summary
3. Open risks
4. Final recommendation:
   - `Go`
   - `Go with fixes`
   - `No-go`

If no blocking issues remain, say so explicitly.
