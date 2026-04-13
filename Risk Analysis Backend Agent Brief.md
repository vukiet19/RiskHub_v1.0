# Risk Analysis Backend Agent Brief

## Objective
Create the first backend data contract for the new `Risk Analysis` screen in RiskHub.

This backend should support deep portfolio risk analysis across active exchange connections, with aggregate-global behavior first and exchange scope as a supported filter.

## Product Context
Existing system behavior already includes:
- multi-exchange support for Binance + OKX
- one active account per exchange
- futures-first handling
- dashboard overview endpoints
- positions endpoint
- contagion graph and dependency logic

The new `Risk Analysis` screen should not reuse the dashboard payload blindly. It needs a clearer analysis-oriented contract.

## Core Product Goal
The backend should make it possible for the frontend to answer:
1. What is the portfolio's current overall risk?
2. What are the biggest risk contributors?
3. How exposed is the portfolio to concentration, leverage, drawdown, and contagion?
4. How do simple stress scenarios affect the portfolio?

## Required Backend Outcome

### 1. New Risk Analysis endpoint(s)
Add backend support for a dedicated `Risk Analysis` data contract.

Preferred direction:
- create a dedicated route namespace, for example:
  - `GET /api/v1/risk-analysis/{user_id}/overview`

Optional additional endpoints are acceptable if useful, but do not fragment the first version unnecessarily.

At minimum, the frontend needs one coherent overview payload for the page.

### 2. Scope support
Support:
- `scope=all`
- `scope=binance`
- `scope=okx`

Rules:
- `all` means aggregate across active exchanges
- `binance` means Binance-only
- `okx` means OKX-only

The scope semantics must remain consistent with the rest of RiskHub.

### 3. First-pass risk data contract
Return a payload that supports these frontend sections:

- risk overview strip
  - total risk score
  - concentration risk
  - leverage risk
  - drawdown risk
  - contagion risk

- risk contributors
  - top risky assets or positions
  - why they rank highly

- concentration analysis
  - largest asset concentration
  - largest cluster / dependency concentration
  - exchange concentration if relevant

- scenario analysis
  - simple deterministic scenarios are enough for v1
  - examples:
    - BTC shock
    - ETH shock
    - broad market selloff
    - cluster tightening / contagion stress

- position risk rows
  - symbol
  - exchange_id
  - side
  - leverage
  - notional / exposure
  - unrealized pnl
  - risk contribution or risk flags

- warnings / metadata
  - scope
  - as_of / generated_at
  - warnings
  - source_state where relevant

### 4. Calculation approach for v1
You do not need a full VaR engine.
Use a clear heuristic model that is defensible and easy to review.

Suggested decomposition:
- Concentration Risk
  - function of asset weights and dominant exposures

- Leverage Risk
  - function of average / max leverage and notional concentration

- Drawdown Risk
  - function of realized max drawdown metrics plus current exposure profile

- Contagion Risk
  - reuse summary-level outputs from the existing contagion / correlation engine where appropriate

- Total Risk Score
  - weighted blend of the above components

Make the formulas explicit in code comments if needed.

### 5. Reuse existing backend logic carefully
Prefer reusing:
- existing overview / positions aggregation logic
- contagion summary logic
- active exchange context loading
- scope-filter patterns already used elsewhere

Avoid:
- coupling the new endpoint too tightly to dashboard response formatting
- copying large blocks without extracting shared helpers

### 6. Honest fallback behavior
Handle these states clearly:
- no configured connection
- no live positions
- insufficient data
- partial exchange failure
- hard backend failure

Do not return overly confident risk conclusions when data is partial.

### 7. Exchange model constraints
Keep the current product rules:
- Binance + OKX only for this phase
- one active account per exchange
- futures-first
- aggregate by asset where that matches current RiskHub logic

Do not introduce `asset@exchange` node semantics unless strictly necessary, which it should not be for this task.

## Suggested File Ownership
Own backend implementation for:
- new API route(s)
- any service/helper additions needed for risk calculations
- contract shaping for the Risk Analysis screen

Likely files:
- `backend/api/...`
- `backend/services/...`
- `backend/engine/...`

## Non-Goals
Do not:
- rewrite the entire quant engine
- redesign contagion internals unless truly required
- break dashboard contracts
- fabricate full-confidence analysis from empty or partial data

## Deliverable
Implement the backend changes directly.

Then return a report with this structure:
1. Files changed
2. New endpoint(s) added or changed
3. Risk data contract now returned
4. How total risk and component risks are computed
5. How scope is handled
6. How fallback / partial states behave
7. What you verified
8. Anything still approximate or deferred
