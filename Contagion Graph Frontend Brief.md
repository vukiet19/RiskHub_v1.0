# Contagion Graph Frontend Brief

## Objective
Redesign the current contagion module into a readable, data-driven `Portfolio Contagion Map` that helps users understand portfolio dependency risk within a few seconds.

## Primary Files
- `frontend/src/app/page.tsx`
- `frontend/src/components/ContagionGraph.tsx`
- Any new supporting components under `frontend/src/components/`

## Current Problems
- The module behaves like a graph demo instead of a risk explanation tool.
- The `Risk Score` shown in the dashboard is hardcoded.
- The circular layout makes all assets look equally important.
- The UI does not expose portfolio weight, systemic importance, or dependency tightening.
- The module does not provide a clear explanation before the graph itself.

## Scope
- Rename the module in the UI to `Portfolio Contagion Map`.
- Replace the current graph-only presentation with a structured module:
  - header
  - insight strip
  - summary metrics row
  - graph canvas
  - asset detail inspector
  - legend
- Remove the hardcoded score from the dashboard container and render backend-provided summary values.
- Replace the current circular layout with a force-based or cluster-aware layout.
- Support hover and click interactions:
  - hover node: highlight connected edges, dim unrelated nodes
  - click node: lock selection and populate the inspector panel
  - click empty space: clear selection
  - hover edge: show compact tooltip
- Keep the graph readable for portfolios with 3 to 15 assets.
- Render fallback states:
  - fewer than 2 meaningful assets: show a concentration explanation instead of a network
  - exactly 2 assets: show a simplified pair-risk view instead of a full graph

## Required UI Semantics
- Node size = portfolio weight percentage
- Node outer ring = systemic importance score
- Edge thickness = absolute dependency strength
- Edge color bands:
  - `>= 0.70`: high contagion
  - `0.40-0.69`: moderate contagion
  - `< 0.40`: hidden by default
- Negative correlation edges are hidden by default in MVP

## Required Data Usage
Use backend fields instead of local mock logic:
- `summary.contagion_risk_score`
- `summary.contagion_risk_delta_7d`
- `summary.systemic_asset`
- `summary.top_risk_pair`
- `summary.insight`
- `regime.label`
- `nodes[*].weight_pct`
- `nodes[*].systemic_score`
- `nodes[*].value_usd`
- `nodes[*].daily_move_pct`
- `nodes[*].top_correlations`
- `edges[*].correlation`
- `edges[*].delta_7d`
- `edges[*].band`
- `edges[*].trend`

## Deliverables
- Updated dashboard container that no longer hardcodes contagion values
- New `Portfolio Contagion Map` component structure
- New inspector panel for selected assets
- Clear legend and graph explanation copy in the UI
- Robust loading, empty, and low-data states

## Acceptance Criteria
- A user can identify the main contagion source without clicking anything.
- The module explains risk before the user interacts with the graph.
- The graph no longer relies on a static circular layout.
- All visible values in the module are data-driven.
- Clicking an asset reveals enough detail to explain why it matters.
- The module remains readable and useful on medium-sized portfolios.

## Constraints
- This is not a CSS-only task.
- Preserve existing dashboard fetch structure where reasonable, but adapt it to the new contagion response contract.
- Follow the existing dark design language in `DESIGN.md` instead of inventing a new visual system.
