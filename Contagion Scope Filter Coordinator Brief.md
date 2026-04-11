# RiskHub Contagion Scope Filter Coordinator Brief

## Objective
Review the frontend and backend implementation of the `All / Binance / OKX` contagion scope filter.

This review must evaluate:

- contract alignment
- scope semantics
- fallback honesty
- preservation of the approved multi-exchange MVP constraints

Review actual source code, not just agent reports.

## Shared Scope Constraints

The approved scope is fixed:

- Support `Binance` + `OKX`
- Only `1 active account per exchange`
- Prioritize `futures`
- Dashboard remains `globally aggregated`
- Contagion stays `asset-level aggregated`
- Do **not** split contagion nodes into `asset@exchange`

The new feature adds:

- contagion scope filter = `All / Binance / OKX`

This does **not** authorize:

- exchange-split contagion nodes
- separate contagion pages per exchange
- frontend-local graph filtering that bypasses backend holdings logic

## Review Questions

### 1. Scope semantics
Check whether:

- `All` truly means all active exchanges combined
- `Binance` truly uses only Binance holdings
- `OKX` truly uses only OKX holdings

Reject implementations where:

- the UI filter is cosmetic only
- the frontend fakes exchange filtering locally
- the backend ignores the scope query

### 2. Asset-level integrity
Check whether contagion still remains asset-level.

Reject implementations where:

- node IDs become exchange-specific
- the same asset appears twice solely because it exists on two exchanges
- frontend or backend introduces `BTC (Binance)` vs `BTC (OKX)` behavior

### 3. Scope-aware fallback honesty
Check whether fallback states are correct per selected scope.

Examples that must behave honestly:

- no active OKX connection, but user selects `OKX`
- Binance has enough holdings, OKX does not
- `All` is valid while `Binance` alone is not

Reject implementations where the selected scope still shows a misleading graph.

### 4. Frontend interaction integrity
Check whether:

- the scope filter is visible and usable
- `All` is the default
- `Overview / Focus` still works correctly inside each scope
- selected asset state is preserved or reset cleanly on scope change

Reject implementations where:

- switching scope leaves the inspector in a broken state
- changing scope breaks graph rendering
- controls overlap or become ambiguous

### 5. Backend response integrity
Check whether:

- invalid scope values are rejected
- response metadata clearly indicates the active scope
- the contagion response remains compatible with the current frontend contract
- optional metadata like `market_data_source` is honest if present

## Priority Review Targets

Review these files first:

- `backend/api/dashboard.py`
- `backend/services/exchange_service.py`
- `frontend/src/components/PortfolioContagionMap.tsx`
- `frontend/src/components/contagion/types.ts`
- `frontend/src/components/contagion/NetworkOverview.tsx`
- `frontend/src/components/contagion/FocusView.tsx`
- `Multi-Exchange Integration Brief.md`

## Findings Policy

Prioritize:

- broken scope semantics
- misleading fallback behavior
- exchange-split node regressions
- contract drift between frontend and backend
- state bugs around scope switching

Do not prioritize:

- minor style preferences
- optional future enhancements
- backlog cleanup unless it breaks the active path

## Required Final Output

Return:

1. findings first, ordered by severity
2. alignment summary
3. open risks
4. final recommendation:
   - `Go`
   - `Go with fixes`
   - `No-go`

## Approval Standard

Recommend `Go` only if all of the following are true:

- `All / Binance / OKX` works on the active contagion path
- each scope changes the backend-driven graph meaningfully
- the graph remains asset-level in all scopes
- fallback states are honest per scope
- no major frontend/backend contract mismatch remains
