# Risk Analysis Integration Brief

## Purpose
This document is the shared contract for the first implementation pass of the `Risk Analysis` screen in RiskHub.

All agents must treat this file as the source of truth for scope, structure, and expected behavior.

## Operating Rule
All three agents must treat this file as the shared contract:
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Risk Analysis Integration Brief.md`

Do not let any agent redefine the contract locally.

## Product Goal
`Risk Analysis` is a dedicated deep-analysis screen.

It is not a duplicate of the dashboard.

The screen must help the user answer:
1. What is the portfolio's biggest risk right now?
2. Which assets or positions are contributing most to that risk?
3. How exposed is the portfolio to concentration, leverage, drawdown, and contagion?
4. What should the user pay attention to first?

## Current App Context
Current frontend state:
- the app currently uses a main dashboard page
- the sidebar already includes a `Risk Analysis` item
- that item must become a real route

Current product state:
- Binance + OKX are supported
- one active account per exchange
- futures-first
- dashboard remains the operational overview screen
- contagion graph already exists and should remain dashboard-oriented

## Page Role Definition

### Dashboard
The dashboard remains:
- operational
- compact
- refresh-oriented
- suitable for frequent checking

### Risk Analysis
The Risk Analysis page must be:
- deeper
- more explanatory
- more decomposition-oriented
- more action-oriented

It should prioritize:
- risk overview
- contributor ranking
- scenario understanding
- position-level risk detail

## Shared Structural Requirements

### 1. Real route
Implement a real frontend route for `Risk Analysis`.

Expected direction:
- Dashboard remains on its current route
- Risk Analysis becomes a dedicated route, for example:
  - `frontend/src/app/risk-analysis/page.tsx`

Sidebar navigation must route honestly between the two pages.

### 2. Shared app shell
`Dashboard` and `Risk Analysis` should use a shared shell pattern for:
- sidebar
- navbar
- outer page container
- collapse state handling
- top-level layout rhythm

This shared shell must not force the Risk Analysis content to copy the dashboard information hierarchy.

Shared shell is allowed.
Shared page meaning is not.

### 3. Scope support
The page must support:
- `all`
- `binance`
- `okx`

Scope rules:
- `all` = aggregate across active exchanges
- `binance` = Binance-only
- `okx` = OKX-only

Frontend and backend must keep these semantics aligned.

## Required Screen Sections
The first pass of the `Risk Analysis` screen must include these sections in some coherent layout:

### A. Page header
Must include:
- title
- short subtitle
- scope control

Optional:
- as-of timestamp
- warning summary

### B. Risk overview strip
Must surface:
- total risk score
- concentration risk
- leverage risk
- drawdown risk
- contagion risk

These may be heuristic in v1, but they must be explicit and honest.

### C. Top risk contributors
Must rank the most important drivers of portfolio risk.

Examples:
- assets
- clusters
- positions

Each item should explain why it is risky, not just show a number.

### D. Concentration / dependency analysis
Must include at least:
- largest exposure
- cluster or dependency concentration
- a compact explanation of what is driving concentration

This section may reuse contagion summary data at a high level, but it must not just embed the full dashboard contagion module as the primary content.

### E. Scenario / stress panel
Must include simple deterministic scenarios in v1.

Examples:
- BTC shock
- ETH shock
- broad market selloff
- dependency tightening / contagion stress

The goal is interpretability, not a full institutional VaR engine.

### F. Position risk table
Must include a table or list showing position-level risk detail.

Expected columns or fields:
- symbol
- exchange_id
- side
- leverage
- exposure or notional
- unrealized pnl
- risk contribution or risk flags

### G. Action / attention panel
Must summarize what deserves the user's attention first.

Examples:
- top warnings
- top risks to reduce
- unstable areas in the portfolio

## Backend Contract Requirements
The backend must provide a dedicated analysis-oriented payload.

Preferred first endpoint:
- `GET /api/v1/risk-analysis/{user_id}/overview`

The response must support the frontend sections above.

### Minimum response shape
The exact field names can vary, but the response must include data for:
- `scope`
- `generated_at` or equivalent
- `source_state` where relevant
- `warnings`
- `risk_score_total`
- `risk_components`
- `top_risk_contributors`
- `concentration_summary`
- `leverage_summary`
- `drawdown_summary`
- `contagion_summary`
- `scenario_results`
- `position_risk_rows`

### Calculation standard
This v1 implementation may use heuristics.
It does not need a full statistical risk engine.

But the calculations must be:
- explicit
- internally consistent
- reviewable
- honest about approximation

## Frontend Requirements
The frontend must:
- build a real route
- preserve shell consistency
- create a page clearly distinct from the dashboard
- handle loading / empty / partial / error states without collapsing layout
- avoid misleading placeholder content

If backend data is incomplete, show an honest placeholder state rather than pretending the analysis is complete.

## Honest State Handling
Both backend and frontend must support:
- no configured connection
- no live positions
- insufficient data
- partial exchange failure
- hard API error

The page must remain structurally stable in all of these states.

Controls should not jump around or disappear unexpectedly.

## Non-Goals
This pass must not:
- redesign the whole app
- rewrite the dashboard
- replace the contagion screen
- invent fake full-confidence risk outputs from missing data
- introduce `asset@exchange` graph logic for this page

## Implementation Priorities
Priority order:
1. route + shared shell correctness
2. dedicated data contract
3. stable page structure
4. honest state handling
5. clean risk decomposition
6. polished visuals

## Acceptance Criteria
This pass is acceptable only if:
1. `Risk Analysis` is a real route
2. sidebar navigation is real and active state works
3. page is clearly distinct from `Dashboard`
4. scope support exists and is semantically aligned
5. risk overview, contributors, scenarios, and position risk are all present
6. partial / empty / error states are honest and usable
7. the existing dashboard is not broken

## Agent Responsibilities

### Frontend Agent
Owns:
- route creation
- navigation updates
- shared shell refactor if needed
- Risk Analysis page layout
- section components
- state handling on the page

### Backend Agent
Owns:
- risk-analysis endpoint(s)
- payload design and implementation
- risk decomposition logic
- scope filtering
- fallback and warning semantics

### Coordinator
Owns:
- checking alignment to this contract
- checking route correctness
- checking page-role separation from dashboard
- checking state honesty
- checking backend/frontend contract alignment

## Deliverables
At the end of implementation:
- frontend should provide a real Risk Analysis screen
- backend should provide a real Risk Analysis payload
- coordinator should decide Go / No-go against this file
