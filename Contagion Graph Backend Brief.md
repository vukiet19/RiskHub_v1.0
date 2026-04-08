# Contagion Graph Backend Brief

## Objective
Replace the current mock contagion endpoint with a real, data-driven portfolio dependency service that supports a meaningful `Portfolio Contagion Map`.

## Primary Files
- `backend/api/dashboard.py`
- `backend/engine/correlation_engine.py`
- `backend/services/exchange_service.py`
- Any helper modules needed for contagion summary calculation

## Current Problems
- The endpoint currently uses mocked positions instead of real user exposure.
- The response only returns raw nodes and edges, which is not enough for a useful UI.
- There is no summary score, no regime classification, no systemic asset, and no 7-day change logic.
- The graph is effectively a static snapshot, not a changing risk structure.

## Scope
- Stop using mock positions inside the contagion endpoint.
- Base node weights on real user holdings or real open positions.
- Keep the current rolling dependency approach for MVP, but extend it with summary metrics and change signals.
- Compute graph-level and node-level fields required by the redesigned frontend.
- Add 7-day comparison logic for both network-level and pair-level change.
- Introduce a market regime classification step before returning the response.

## Required Response Shape
The endpoint must return:
- `generated_at`
- `window_days`
- `regime`
- `summary`
- `nodes`
- `edges`

The response must include, at minimum:
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
- `nodes[*].cluster_id`
- `nodes[*].flags`
- `nodes[*].top_correlations`
- `edges[*].correlation`
- `edges[*].abs_correlation`
- `edges[*].delta_7d`
- `edges[*].band`
- `edges[*].trend`

## Calculation Requirements
- Use rolling-window dependency values, not a single fixed historical matrix.
- Retain only meaningful edges to avoid clutter and unstable graph density.
- Derive `systemic_score` from weighted degree centrality multiplied by portfolio weight.
- Derive `top_risk_pair` from combined dependency strength and combined portfolio importance.
- Derive `contagion_risk_score` as a 0-100 summary of weighted dependency concentration.
- Derive `market_regime` from dependency tightening and-or cross-sectional realized volatility.
- Derive a single insight sentence that the frontend can display directly.

## Implementation Notes
- Prefer real portfolio exposure over generic symbol lists.
- If the user has too few meaningful assets, return a response that supports a fallback UI rather than forcing fake graph output.
- Keep the API honest: this endpoint describes dependency risk, not causal certainty.
- For MVP, negative correlation can remain excluded from the primary graph payload if that simplifies interpretation.

## Deliverables
- Updated contagion endpoint in `dashboard.py`
- Expanded graph calculation logic in `correlation_engine.py`
- Any helper logic required for summary metrics, regime classification, and insight generation
- Stable JSON contract for frontend use

## Acceptance Criteria
- The endpoint no longer returns mocked portfolio data.
- The frontend can render the new module without inventing its own summary values.
- The API returns enough context to identify the dominant contagion source and top risk pair.
- The response includes 7-day change signals and a regime label.
- The output stays readable and sparse for typical retail portfolios.

## Constraints
- Do not introduce a GNN or advanced ML dependency for MVP.
- Do not overclaim causal contagion.
- Favor stable, interpretable calculations over academic complexity.
