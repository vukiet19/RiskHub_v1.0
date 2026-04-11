# RiskHub Contagion Scope Filter Frontend Agent Brief

## Objective
Implement the frontend changes required to add a contagion scope filter with these approved views:

- `All Exchanges`
- `Binance`
- `OKX`

This feature must stay aligned with the current RiskHub multi-exchange architecture:

- Support `Binance` + `OKX`
- Keep `1 active account per exchange`
- Keep `futures-first` semantics
- Keep the dashboard `globally aggregated`
- Keep contagion `asset-level aggregated`
- Do **not** split contagion nodes into `asset@exchange`

This is a frontend brief only. Do not redefine backend contagion semantics locally.

## Current Code Context
Read these files before changing anything:

- `frontend/src/components/PortfolioContagionMap.tsx`
- `frontend/src/components/contagion/types.ts`
- `frontend/src/components/contagion/NetworkOverview.tsx`
- `frontend/src/components/contagion/FocusView.tsx`
- `frontend/src/components/AssetInspector.tsx`
- `frontend/src/app/page.tsx`
- `frontend/src/app/globals.css`

Important current-state observations:

- The contagion module already supports `Overview` vs `Focus`
- The graph is currently portfolio-wide and asset-level
- The dashboard already supports multi-exchange connectivity elsewhere
- The contagion UI currently does **not** expose exchange scope switching

## Approved Product Scope

### 1. Add a scope filter
Add a clear segmented control or filter chips for:

- `All`
- `Binance`
- `OKX`

Requirements:

- default selection = `All`
- the control should sit near the contagion header controls
- it must visually coexist cleanly with the existing `Overview / Focus` toggle
- do not bury it in the inspector or settings

### 2. Only one graph scope is shown at a time
The user is not comparing multiple exchange scopes side by side in this pass.

The module should show exactly one scope at a time:

- `All`
- `Binance`
- `OKX`

### 3. Keep contagion asset-level
Frontend must not invent exchange-split nodes.

Examples:

- `BTC` remains one node in `All`
- `BTC` remains one node in `Binance`
- `BTC` remains one node in `OKX`

Not allowed:

- `BTC (Binance)`
- `BTC (OKX)`
- frontend-only splitting logic based on exchange labels

## Required Frontend Changes

### 1. Add scope state to the contagion module
`PortfolioContagionMap` must own a new scope state:

- `"all"`
- `"binance"`
- `"okx"`

Behavior:

- default = `"all"`
- changing scope triggers a new backend fetch
- changing scope should not unnecessarily reset unrelated module UI

### 2. Fetch contagion by scope
The contagion request must include the selected scope.

Expected request pattern:

- `/api/v1/dashboard/{user_id}/contagion?scope=all`
- `/api/v1/dashboard/{user_id}/contagion?scope=binance`
- `/api/v1/dashboard/{user_id}/contagion?scope=okx`

Frontend must not simulate scope locally by filtering existing nodes after the fact.

### 3. Keep Overview / Focus intact
The existing `Overview` vs `Focus` toggle remains.

New behavior:

- the user chooses a scope (`All / Binance / OKX`)
- inside that scope, the user can still switch `Overview / Focus`

Do not collapse scope switching into view switching.

### 4. Preserve selected asset state carefully
When the user changes scope:

- if the currently selected asset still exists in the new graph, keep it selected
- if the selected asset does not exist, fall back to the backend-provided default selected asset
- do not leave the inspector blank unless the backend returns no meaningful graph

### 5. Add scope-aware copy
The module should make the selected scope clear in user-facing copy.

Recommended examples:

- `All`: `Portfolio-wide cross-exchange dependency analysis`
- `Binance`: `Binance-only dependency view`
- `OKX`: `OKX-only dependency view`

Insight copy should also remain honest to the active scope.
Do not imply a portfolio-wide statement when the user is in a single-exchange view.

### 6. Support honest fallback states per scope
The frontend must render scope-specific fallbacks honestly.

Examples:

- user selects `OKX`, but no active OKX connection exists
- user selects `Binance`, but holdings are too sparse for contagion
- user selects `All`, but only one exchange currently contributes usable holdings

Requirements:

- use backend `source_state`, `message`, and `warnings`
- do not fake a graph when the selected scope has no valid graph
- keep the warning banner behavior intact for partial data cases

### 7. Optional metadata rendering
If the backend returns:

- `scope`
- `scope_label`
- `market_data_source`

the frontend should render them cleanly when useful.

Recommended:

- use `scope_label` in the active filter UI or subtitle
- if `market_data_source` implies fallback behavior, show a small non-blocking note

Do not block the implementation if only `scope` and `scope_label` are present.

## UX Expectations

### 1. Layout
The new scope filter must not make the contagion header feel crowded.

Preferred order:

- title / subtitle
- `Overview / Focus`
- `All / Binance / OKX`
- regime pill / updated time

If a different order fits the current layout better, keep it clean and readable.

### 2. Visual language
Keep the current RiskHub dark dashboard styling.

Do not:

- redesign the contagion module
- change the graph visual semantics
- introduce heavy new panels or drawers for scope selection

### 3. Mobile / tablet
If horizontal space is limited:

- wrap controls cleanly
- keep both toggles usable
- do not let one control overlap the other

## Non-Negotiable Rules

- Do not split contagion nodes by exchange
- Do not infer exchange-level graph data from the current graph
- Do not hardcode Binance as the only market source in the UI
- Do not remove the existing `Overview / Focus` control
- Do not change backend contracts locally
- Do not break current warning banner behavior
- Keep all user-facing copy in English

## Suggested Implementation Order

1. Add contagion scope types and request wiring
2. Add the new scope segmented control UI
3. Wire refetch behavior on scope change
4. Make subtitle / header copy scope-aware
5. Preserve selected-node behavior across scope changes
6. Verify fallbacks for `All`, `Binance`, and `OKX`

## Acceptance Criteria

- The contagion module supports `All`, `Binance`, and `OKX`
- `All` is the default scope
- Scope switching triggers backend-driven contagion fetches
- `Overview / Focus` still works within the selected scope
- The graph stays asset-level in every scope
- The selected asset is preserved or reset cleanly on scope change
- Scope-specific no-connection and low-data states are honest
- The UI does not imply that the `All` view is a Binance-only graph

## Required Final Report
When finished, report exactly:

- files changed
- how scope state was implemented
- how the request URL changes by scope
- how selected-asset preservation works across scope changes
- how scope-aware copy works
- what fallback states were verified
- any remaining backend dependency
