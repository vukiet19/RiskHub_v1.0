# Risk Analysis Frontend Agent Brief

## Objective
Build the first real `Risk Analysis` screen for RiskHub as a separate route, using the existing dashboard visual language but a different information hierarchy.

This screen is for deep portfolio risk analysis, not for general daily overview.

## Product Context
Current state of the app:
- The frontend currently has a single main page at `frontend/src/app/page.tsx`
- The sidebar already shows a `Risk Analysis` nav item, but it does not route anywhere real yet
- The dashboard already has working patterns for:
  - sidebar + navbar shell
  - multi-exchange overview
  - positions
  - contagion map
  - alerts

Your job is to create the frontend structure for a dedicated `Risk Analysis` experience without breaking the existing dashboard.

## Core UX Goal
The `Risk Analysis` screen must answer these questions quickly:
1. Where is the portfolio's biggest risk right now?
2. Which assets or positions contribute most to that risk?
3. How concentrated / leveraged / contagion-exposed is the portfolio?
4. What should the user pay attention to first?

## Required Frontend Outcome

### 1. Real route and navigation
Implement a real `Risk Analysis` route.

Expected direction:
- `Dashboard` remains the landing page
- `Risk Analysis` becomes its own page, for example under:
  - `frontend/src/app/risk-analysis/page.tsx`

Update the sidebar nav so:
- `Dashboard` routes to the dashboard page
- `Risk Analysis` routes to the new page
- active nav state reflects the current route honestly

Do not leave `href="#"` placeholders on these two items.

### 2. Shared app shell
Refactor the frontend so `Dashboard` and `Risk Analysis` share the same shell patterns where appropriate:
- sidebar
- navbar
- page container spacing
- sidebar collapsed state
- global visual style

Do not duplicate large blocks of layout code if a small shell abstraction is more maintainable.

### 3. Screen layout for Risk Analysis
Build a first-pass Risk Analysis layout with these sections:

- Header / title area
  - page title
  - short subtitle explaining this is deep portfolio risk analysis
  - optional scope control area if needed

- Risk Overview strip
  - total risk score
  - concentration risk
  - leverage risk
  - drawdown risk
  - contagion risk

- Main analysis area
  - top risk contributors
  - concentration / cluster breakdown
  - scenario / stress-test panel
  - position risk table
  - action / attention panel

This does not need to be the final polished design, but it must already feel intentional and useful.

### 4. Scope-aware UX
The page must support the existing product direction:
- multi-exchange
- one active account per exchange
- aggregate-global analysis first

Include a scope control that is visually aligned with the rest of RiskHub:
- `All`
- `Binance`
- `OKX`

This can start as UI state if backend payloads are not fully wired yet, but do not fake business logic. If the backend cannot supply scoped data yet for a section, show an honest placeholder state.

### 5. Loading / empty / partial / no-connection states
The screen must not collapse into broken layout when data is missing.

Implement coherent states for:
- loading
- no exchange connection
- no positions / insufficient data
- partial backend data
- hard API error

Keep the header and controls stable across states.

### 6. Reuse existing components carefully
You may reuse ideas or substructures from current components, but do not just transplant the whole dashboard into a new page.

Expected reuse candidates:
- styling language from dashboard cards
- positions presentation patterns
- warning / alert presentation patterns
- scope / segmented controls if appropriate

Avoid:
- duplicating `PortfolioContagionMap` as the main centerpiece of this screen
- copying the dashboard metric strip unchanged

## Suggested File Ownership
Own the frontend implementation for these areas:
- `frontend/src/app/risk-analysis/page.tsx`
- routing-related updates for sidebar navigation
- any small shared shell/layout abstractions needed
- new Risk Analysis components under `frontend/src/components/`

If you create new components, prefer a clear folder or prefix such as:
- `RiskAnalysisOverview.tsx`
- `RiskDriverPanel.tsx`
- `RiskScenarioPanel.tsx`
- `PositionRiskTable.tsx`
- `RiskActionPanel.tsx`

## Data Contract Expectations
Design the page so it can consume backend-provided data shaped roughly like:
- risk overview metrics
- top risk contributors
- concentration metrics
- leverage metrics
- drawdown metrics
- contagion summary
- scenario results
- position-level risk rows
- warnings
- scope
- as-of timestamp

If backend fields are not complete yet:
- use narrow, explicit adapters
- do not invent fake "healthy" business data
- keep placeholders honest and temporary

## Non-Goals
Do not:
- redesign the entire app
- break the existing dashboard
- silently hardcode fake analysis values as if they were real
- hide backend limitations with misleading frontend text

## Deliverable
Implement the frontend changes directly.

Then return a report with this structure:
1. Files changed
2. New route / navigation behavior
3. New Risk Analysis screen structure
4. State handling implemented
5. Any backend dependencies still remaining
6. What you verified
