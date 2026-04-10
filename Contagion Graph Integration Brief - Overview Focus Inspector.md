# Contagion Graph Integration Brief - Overview Focus Inspector

## Objective
Coordinate the frontend and backend implementation of the new `Portfolio Contagion Map` so both sides ship one coherent module based on the `Overview + Focus + Inspector` model.

This document is the shared integration contract.
Frontend and backend agents must both follow it.

## Source Documents
Read these first:
- `Contagion Graph Frontend Implementation Brief - Overview Focus Inspector.md`
- `Contagion Graph Backend Alignment Brief - Overview Focus Inspector.md`
- `Contagion Graph Redesign Spec.md`

Optional visual references:
- `D:\Codex\mockups\dashboard-overview-focus-inspector-redesign.png`
- `D:\Codex\mockups\dashboard-overview-focus-inspector-redesign.svg`

## Core Product Decision
The contagion module must always combine:
- `Network Overview`
- `Focus View`
- `Asset Inspector`

This is non-negotiable for the desktop layout.

Reason:
- `Overview` preserves global topology and cluster context
- `Focus` prevents edge pileups and makes the selected node readable
- `Inspector` turns the network into a direct explanation and action hint

## Shared Product Interpretation
This module is a research-inspired dependency-risk surface.

It should communicate:
- dynamic dependency structure
- systemic asset importance
- largest cluster concentration
- strongest visible contagion-risk links

It must not imply:
- causal certainty
- directional certainty unless the backend truly supports that
- guaranteed prediction

Both teams must use conservative language such as:
- `dependency`
- `tightening`
- `largest cluster`
- `systemic asset`
- `context link`

## Mandatory Desktop Layout
The contagion card must render in this order:
1. header
2. insight strip
3. summary metrics row
4. three-panel content area
   - left: `Network Overview`
   - center: `Focus View`
   - right: `Asset Inspector`

The frontend must not merge overview and focus into a single canvas on desktop.
The backend must provide enough structure for these three panels to work without frontend guesswork.

## Shared Contract Requirements
The integration is blocked until the backend payload supports all of the following:

### Top-Level
- `generated_at`
- `window_days`
- `regime`
- `summary`
- `nodes`
- `edges`
- `clusters`
- `display`

### Summary
- `summary.contagion_risk_score`
- `summary.contagion_risk_delta_7d`
- `summary.systemic_asset`
- `summary.top_risk_pair`
- `summary.largest_cluster`
- `summary.network_density`
- `summary.insight`

### Nodes
- `id`
- `label`
- `weight_pct`
- `value_usd`
- `daily_move_pct`
- `systemic_score`
- `cluster_id`
- `cluster_role`
- `top_correlations`

### Edges
- `id`
- `source`
- `target`
- `correlation`
- `abs_correlation`
- `delta_7d`
- `band`
- `trend`
- `display_strength`
- `topology_role`

### Clusters
- `id`
- `label`
- `members`
- `member_count`
- `total_weight_pct`
- `systemic_asset`
- `risk_level`

### Display Guidance
- `display.default_selected_asset`
- `display.overview.node_ids`
- `display.overview.edge_ids`
- `display.focus.max_primary_links`
- `display.focus.max_context_links`

## Shared Semantic Rules

### Node Semantics
- node size = portfolio weight
- node prominence/ring = systemic importance
- selected node = active focus node
- peripheral node styling must be quieter than hub styling

### Edge Semantics
- primary visible links = strongest selected-node links in focus view
- context links = muted support links only
- risk color gradient applies to primary links
- context links must not use the same strong color treatment

### View Semantics
- `Overview` = global structure, not a second full-detail focus graph
- `Focus` = ego-network around the selected node, not a mini full mesh
- `Inspector` = selected-node explanation, not a generic info card

## Division of Responsibility

### Backend Owns
- truthful holdings and exposure source
- graph calculations
- systemic asset selection
- largest cluster calculation
- edge ranking
- overview visibility guidance
- focus candidate ranking
- summary insight generation
- honest fallback responses

### Frontend Owns
- visual layout
- responsive structure
- selected asset state
- rendering overview, focus, and inspector panels
- routed edge drawing in focus view
- hover and click interactions
- icon rendering with safe fallback
- loading and empty states

### Frontend Must Not Invent
- systemic asset
- largest cluster
- top risk pair
- overview edge selection rules from scratch
- meaning of `topology_role`

### Backend Must Not Assume
- that the frontend will safely interpret a dense raw edge list
- that the frontend should infer clusters entirely on its own
- that a single graph surface is enough

## Required Default Experience
On first load:
- overview renders the global topology
- focus renders the default selected asset
- inspector explains that selected asset

The selected asset should default to:
- `summary.systemic_asset`
- or `display.default_selected_asset` if both are present, they must match

If they do not match, this is a contract bug.

## Edge Visibility Rules

### Overview
The backend should explicitly identify the sparse edge set used for the overview.

The frontend should render:
- the edge ids listed in `display.overview.edge_ids`
- not the full edge set by default

### Focus
The backend provides ranking fields and link significance.
The frontend renders:
- up to `display.focus.max_primary_links` strongest direct links of the selected node
- up to `display.focus.max_context_links` muted context links

The frontend must not render neighbour-to-neighbour full meshes in focus mode.

## Fallback Rules
These fallback states must align across both teams.

### Fewer than 2 meaningful assets
- backend returns honest low-data payload
- frontend shows concentration explanation instead of overview+focus split

### Exactly 2 meaningful assets
- backend returns pair-ready payload
- frontend renders a simplified pair-risk view

### Nodes but no stable edges
- backend returns sparse or empty edges with explanatory summary
- frontend renders node-level concentration state instead of a broken graph

No fake graph output is allowed in the normal connected path.
Demo output is allowed only under explicit demo mode.

## Work Sequence
Recommended order:
1. backend stabilizes the payload contract
2. frontend normalizes the new payload and selected asset state
3. frontend implements three-panel desktop layout
4. frontend implements overview rendering using backend overview edge guidance
5. frontend implements focus rendering using backend ranking and selected asset
6. inspector is wired to selected asset and cluster summary
7. both sides verify fallback states

## Integration Failure Conditions
Reject the implementation if any of the following remain true:
- overview and focus are still merged into one desktop canvas
- focus mode still renders a dense cluster mesh
- the default selected asset is ambiguous or inconsistent
- largest cluster is missing or guessed incorrectly in the frontend
- context links are visually indistinguishable from primary links
- the frontend still hardcodes summary values
- the backend still returns normal-path mock holdings
- the UI wording implies causality or prediction certainty

## Integration Acceptance Criteria
The integration is complete only when:
- the desktop module visibly contains `Overview`, `Focus`, and `Inspector`
- the default selected asset is data-driven and stable
- the largest cluster is visible and data-driven
- focus mode reduces edge overlap materially
- overview preserves global network context
- the inspector explains why the selected asset matters
- fallback states are honest, explicit, and consistent across frontend and backend
- the module improves comprehension without breaking research alignment

## Coordinator Checklist
Before accepting the work, confirm:
- `summary.systemic_asset` matches `display.default_selected_asset`
- `summary.largest_cluster` matches `clusters[]`
- `display.overview.edge_ids` contains only sparse topology edges
- focus mode uses selected-node edges only
- primary links and context links are visually distinct
- insight text matches the actual returned graph structure
- no frontend-only derived value contradicts backend truth

## Delivery Expectation
Each agent should report its part in a way the coordinator can compare quickly:

Frontend agent must report:
- files changed
- selected asset state rules
- overview render rules
- focus render rules
- inspector dependencies
- fallback behavior

Backend agent must report:
- files changed
- exact payload fields
- systemic asset logic
- largest cluster logic
- overview edge selection logic
- focus candidate logic
- fallback responses
