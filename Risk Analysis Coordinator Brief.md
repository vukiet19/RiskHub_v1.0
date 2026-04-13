# Risk Analysis Coordinator Brief

## Objective
Review the first implementation pass for the new `Risk Analysis` screen and determine whether frontend and backend are aligned well enough for approval.

This is a review pass, not an implementation pass.

## Review Context
RiskHub currently has:
- a working dashboard
- a sidebar item for `Risk Analysis`
- multi-exchange support for Binance + OKX
- futures-first product scope

The new work should introduce a real `Risk Analysis` route and a dedicated backend contract for deep portfolio risk analysis.

## What must be true for approval

### 1. Route and navigation
- `Risk Analysis` must be a real page, not a placeholder
- sidebar navigation must route honestly between `Dashboard` and `Risk Analysis`
- active nav state must reflect the current route

### 2. Screen purpose
The new screen must be meaningfully different from the dashboard.

It should clearly present:
- overall risk overview
- top risk contributors
- concentration / leverage / drawdown / contagion analysis
- scenario or stress analysis
- position-level risk detail

Reject implementations that are just a repackaged dashboard.

### 3. Backend contract quality
The backend must provide a coherent analysis-focused payload.

Review for:
- clear section-level data ownership
- honest scope semantics
- honest partial / insufficient-data handling
- no fake certainty when data is incomplete

### 4. Scope alignment
Frontend and backend must agree on:
- `all`
- `binance`
- `okx`

Scope must not silently drift between UI and payload behavior.

### 5. Multi-exchange product rules
The implementation must remain aligned with product constraints:
- Binance + OKX
- one active account per exchange
- futures-first
- aggregate-global analysis first

### 6. UX quality
Review for:
- stable layout across loading / empty / partial / error states
- clear hierarchy
- readable explanation of risk
- no misleading labels
- no broken controls

### 7. Regressions
The new work must not break:
- existing dashboard
- existing sidebar shell
- existing contagion usage on dashboard
- existing multi-exchange assumptions

## Files to Review
Review the actual changed files, especially:
- frontend route files
- sidebar navigation changes
- new Risk Analysis components
- backend risk-analysis API route(s)
- any new engine / service helpers

## Required Review Output
Return:
1. Findings
2. Alignment summary
3. Open risks
4. Final recommendation: Go / No-go

## Review Standard
Prioritize:
- incorrect behavior
- semantic drift
- misleading UX
- broken routing
- incomplete state handling
- contract mismatch

Do not focus on minor style issues unless they create product risk.
