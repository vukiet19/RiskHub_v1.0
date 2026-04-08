# Contagion Graph Integration Brief

## Objective
Coordinate the redesign of the current contagion module into a production-ready `Portfolio Contagion Map` by aligning frontend, backend, and UX-content work into one coherent delivery.

## Source Documents
- `Contagion Graph Redesign Spec.md`
- `Contagion Graph Frontend Brief.md`
- `Contagion Graph Backend Brief.md`
- `Contagion Graph UX Content Brief.md`

## Coordinator Role
Own cross-team alignment and final module quality.

This role is responsible for:
- keeping frontend and backend on the same response contract
- ensuring the UX hierarchy matches the product goal
- resolving scope drift between “visual polish” and “data meaning”
- validating that the final module explains risk rather than only rendering a graph

## Final Product Goal
The module must help a retail user understand, within a few seconds:
- which asset is the dominant contagion source
- which holdings are moving together under stress
- whether dependency risk is tightening or loosening
- what they should watch or reduce first

## Integration Priorities
1. Data integrity before UI polish
2. Insight clarity before graph complexity
3. Stable semantics before interaction depth
4. Readable fallback states before advanced features

## Required Shared Contract
The frontend must not invent summary values locally.

The backend must provide:
- `generated_at`
- `window_days`
- `regime`
- `summary`
- `nodes`
- `edges`

The integration is blocked until the following fields are stable:
- `summary.contagion_risk_score`
- `summary.contagion_risk_delta_7d`
- `summary.systemic_asset`
- `summary.top_risk_pair`
- `summary.network_density`
- `summary.insight`
- `nodes[*].weight_pct`
- `nodes[*].value_usd`
- `nodes[*].daily_move_pct`
- `nodes[*].systemic_score`
- `nodes[*].top_correlations`
- `edges[*].correlation`
- `edges[*].delta_7d`
- `edges[*].band`
- `edges[*].trend`

## Work Sequence
1. Backend stabilizes the contagion response contract using real portfolio exposure instead of mock data.
2. UX-content finalizes wording, labels, insight patterns, fallback copy, and terminology guardrails.
3. Frontend implements the new module structure against the stable contract.
4. Coordinator verifies semantics:
   - node size means one thing only
   - edge thickness means one thing only
   - edge color means one thing only
   - insight sentence matches returned data
5. Coordinator verifies fallback states and medium-portfolio readability.

## Cross-Team Rules
- Frontend must not hardcode `Risk Score`, `Systemic Asset`, or insight copy.
- Backend must not return mock contagion output for normal user flows.
- UX-content must avoid research language and causal overclaiming.
- All teams must treat the module as a dependency-risk surface, not a predictive certainty engine.

## Critical Integration Decisions
- Module name in UI: `Portfolio Contagion Map`
- Negative edges: hidden by default in MVP
- Layout: force-based or cluster-aware, not circular demo layout
- Main hierarchy:
  - insight strip
  - summary metrics
  - graph
  - asset inspector
- Fallback behavior:
  - fewer than 2 meaningful assets: concentration explanation
  - exactly 2 assets: pair-risk view

## Coordinator Checklist
- The dashboard no longer displays a hardcoded contagion score.
- The backend no longer uses mock positions for the contagion response.
- The insight sentence is generated from live returned data.
- The graph can be understood before any click interaction.
- Clicking a node reveals enough information to explain why it matters.
- The module remains readable for a portfolio of roughly 3 to 15 assets.
- Empty, low-data, and two-asset states are explicitly handled.
- Copy is plain, tactical, and retail-readable.

## Failure Conditions
The redesign should be rejected if any of the following remain true:
- the graph is still primarily decorative
- the score is still hardcoded or derived in the frontend
- the backend still serves mock portfolio exposure
- the module needs user interaction before it becomes understandable
- visual encodings are ambiguous or overloaded
- the wording implies causality or prediction certainty

## Acceptance Criteria
- A user can identify the main contagion source without clicking anything.
- The dominant risk pair is visible and data-driven.
- The regime label and 7-day change are data-driven.
- The selected asset panel explains why the asset matters in the network.
- The graph supports understanding, rather than replacing explanation.
- The final module improves comprehension, not only aesthetics.

## MVP Constraint
Do not introduce a GNN, timeline scrubber, or advanced academic tooling just because the research paper discussed them.

The MVP target is a trustworthy, interpretable, and implementable dependency-risk module built on the current stack.
