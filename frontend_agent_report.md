# Frontend Agent Report — Contagion Module (Overview + Focus + Inspector)

> **Contract**: `Contagion Graph Integration Brief - Overview Focus Inspector.md`
> **Build status**: ✅ `npx next build` — compiled successfully, zero errors

---

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| [types.ts](file:///D:/%C4%90%E1%BA%A1i%20h%E1%BB%8Dc/Fintech%20Blockchain%20Hackathon%202026/source%20code/v1.0/RiskHub_v1.0/frontend/src/components/contagion/types.ts) | **Created** | Shared type definitions aligned with the full contract |
| [NetworkOverview.tsx](file:///D:/%C4%90%E1%BA%A1i%20h%E1%BB%8Dc/Fintech%20Blockchain%20Hackathon%202026/source%20code/v1.0/RiskHub_v1.0/frontend/src/components/contagion/NetworkOverview.tsx) | **Created** | Network Overview panel (left, ~22%) |
| [FocusView.tsx](file:///D:/%C4%90%E1%BA%A1i%20h%E1%BB%8Dc/Fintech%20Blockchain%20Hackathon%202026/source%20code/v1.0/RiskHub_v1.0/frontend/src/components/contagion/FocusView.tsx) | **Created** | Focus View panel (center, ~42%) |
| [AssetInspector.tsx](file:///D:/%C4%90%E1%BA%A1i%20h%E1%BB%8Dc/Fintech%20Blockchain%20Hackathon%202026/source%20code/v1.0/RiskHub_v1.0/frontend/src/components/AssetInspector.tsx) | **Rewritten** | Inspector panel — now includes cluster membership, largest cluster, systemic role |
| [PortfolioContagionMap.tsx](file:///D:/%C4%90%E1%BA%A1i%20h%E1%BB%8Dc/Fintech%20Blockchain%20Hackathon%202026/source%20code/v1.0/RiskHub_v1.0/frontend/src/components/PortfolioContagionMap.tsx) | **Rewritten** | Orchestrator — three-panel layout, state management, all fallbacks |
| [globals.css](file:///D:/%C4%90%E1%BA%A1i%20h%E1%BB%8Dc/Fintech%20Blockchain%20Hackathon%202026/source%20code/v1.0/RiskHub_v1.0/frontend/src/app/globals.css) | **Extended** | Three-panel flex layout + responsive breakpoints |

**Not changed**: `page.tsx` — the existing dynamic import of `PortfolioContagionMap` continues to work as-is. `ContagionCanvas.tsx` is now unused by the main module (superseded by `NetworkOverview` + `FocusView`).

---

## Component Structure

```
PortfolioContagionMap (orchestrator)
├── ModuleHeader
├── InsightStrip
├── SummaryRow (5 metrics: Risk, 7D, Systemic Asset, Top Pair, Largest Cluster)
├── Three-panel content area
│   ├── NetworkOverview       (contagion/NetworkOverview.tsx)
│   ├── FocusView             (contagion/FocusView.tsx)
│   └── AssetInspector        (AssetInspector.tsx)
├── ContagionLegend
│
├── ConcentrationFallback     (< 2 assets)
├── PairRiskFallback          (exactly 2 assets)
└── LowSignalFallback         (nodes but no edges)
```

Shared types live in `contagion/types.ts` and are imported by all three panels.

---

## Selected Asset State Rules

| Rule | Implementation |
|------|---------------|
| **Default** | `display.default_selected_asset` → fallback `summary.systemic_asset` → fallback first node |
| **Click node (overview or focus)** | Updates `selectedNodeId` to that node |
| **Click same node again** | **Does not clear** — module never enters a blank unselected state |
| **Hover** | Temporary visual emphasis only; never overwrites `selectedNodeId` |
| **Click empty canvas** | Selection persists (no clearing) |
| **Contract consistency** | If `display.default_selected_asset` and `summary.systemic_asset` both exist, they must match (contract rule — not validated in frontend, flagged as contract bug if mismatched) |

---

## Overview Rendering Rules

| Aspect | Rule |
|--------|------|
| **Edge source** | `display.overview.edge_ids` from backend |
| **Fallback** | If `edge_ids` is empty, show edges with `topology_role === "primary"` or `"secondary"` |
| **Layout** | Deterministic cluster-based radial layout (no force simulation) |
| **Node size** | Portfolio weight (`weight_pct`) |
| **Node ring** | Systemic importance (`systemic_score`) |
| **Edge color** | Risk gradient via `band` field |
| **Edge thickness** | `abs_correlation × 3` |
| **Full mesh** | ❌ Never rendered — only sparse set from backend guidance |
| **Interaction** | Click any node → updates `selectedNodeId` across all panels |

---

## Focus Rendering Rules

| Aspect | Rule |
|--------|------|
| **Primary edges** | Top-k strongest direct edges of selected node, where k = `display.focus.max_primary_links` (backend default: 3) |
| **Context edges** | Next m edges, where m = `display.focus.max_context_links` (backend default: 3) |
| **Ranking** | Sorted by `display_strength` descending |
| **Neighbour-to-neighbour** | ❌ Never rendered — focus is ego-network only |
| **Layout** | Deterministic radial: selected node center-left, neighbours on right-side arc |
| **Primary edge style** | Solid, risk-colored gradient, `strokeWidth = abs_correlation × 4.5`, glow filter for ≥0.7 |
| **Context edge style** | Dashed (`5 4`), gray (`rgba(100,116,145,0.35)`), `strokeWidth = 1.5`, opacity 0.5 |
| **Visual distinction** | Primary and context edges are unmistakably different in color, width, opacity, and dash pattern |

---

## Routed Edge Behavior

Primary edges in the Focus View use **quadratic Bézier curves** with angular-slot curvature:

```
curvature = ((i - (n-1)/2) / max(n-1, 1)) * 0.25
```

- Each edge gets a unique perpendicular offset from the midpoint
- Edges fan out from the hub at distinct angles
- No two edges leave from the same visual point
- Context edges use a separate low curvature (`0.08 + i * 0.04`)

This prevents the edge-pileup problem identified in the integration brief.

---

## Fallback States

| Condition | Behavior |
|-----------|----------|
| **< 2 meaningful assets** | `ConcentrationFallback` — icon + explanation card |
| **Source state `no_connection`** | Header + "Connect Binance Testnet" explanation |
| **Source state `error`** | Header + "Live Holdings Unavailable" with retry |
| **Exactly 2 assets** | `PairRiskFallback` — pair visualization with correlation bar |
| **Nodes but 0 edges** | `LowSignalFallback` — "Weak or Unstable Dependencies" explanation |
| **Missing icon** | Ticker text fallback (all nodes render as labeled circles) |
| **API error / null data** | Error card with retry button |
| **Loading** | Skeleton with three-panel shape preview |

No fake graph output in any connected path. All fallbacks are honest and explicit.

---

## Backend-Dependent Blockers

| Item | Status | Notes |
|------|--------|-------|
| `display.overview.edge_ids` | ✅ Backend provides | Currently derived from `topology_role` in/out of `primary`/`secondary` |
| `display.focus.max_primary_links` | ✅ Backend provides | Currently `3` |
| `display.focus.max_context_links` | ✅ Backend provides | Currently `3` |
| `display.default_selected_asset` | ✅ Backend provides | Matches `summary.systemic_asset` |
| `summary.largest_cluster` | ⚠️ Backend returns cluster ID string | Frontend resolves to label via `clusters[]` array — works but contract recommends object form |
| `clusters[]` array | ✅ Backend provides | Used for overview layout, inspector, summary row |
| `edge.id` format | ⚠️ Backend uses `SYM_A-SYM_B` | Contract recommends `SYM_A\|SYM_B`; `normalizePayload` handles if `id` is missing |
| `node.cluster_role` | ⚠️ Backend returns `"hub"` or `"member"` | Contract recommends `hub/core/bridge/peripheral`; frontend shows what's given |
| `edge.topology_role` | ✅ Backend provides | `primary`, `secondary`, `context` — used for overview edge filtering |
| Remote CDN icons | ❌ Not used | All nodes render as ticker text circles (no CDN dependency) |

> [!NOTE]
> The `normalizePayload()` adapter in `PortfolioContagionMap.tsx` fills in any missing contract fields with safe defaults. This is documented as a temporary adapter, not a permanent semantic override. When the backend evolves to return the full contract shape, the adapter becomes a no-op.

---

## Summary Metrics Row

Now shows **5 cards** (was 4):

1. **Contagion Risk** → `summary.contagion_risk_score`
2. **7D Change** → `summary.contagion_risk_delta_7d`
3. **Systemic Asset** → `summary.systemic_asset`
4. **Top Risk Pair** → `summary.top_risk_pair`
5. **Largest Cluster** → resolved from `summary.largest_cluster` + `clusters[]`

All values are backend-driven. No hardcoded demo values in the connected path.

---

## Contract Compliance Summary

| Integration Brief Requirement | Status |
|-------------------------------|--------|
| Desktop: three visible panels (Overview, Focus, Inspector) | ✅ |
| Overview and Focus are NOT merged into one canvas | ✅ |
| Focus does NOT render a dense cluster mesh | ✅ |
| Default selected asset is data-driven | ✅ |
| Largest cluster is visible and data-driven | ✅ |
| Context links visually distinct from primary links | ✅ |
| No hardcoded summary values | ✅ |
| No frontend-invented backend semantics | ✅ |
| UI wording avoids causal/prediction certainty | ✅ |
| Fallback states are honest and explicit | ✅ |
| Module is useful before any click interaction | ✅ |
| Responsive mobile stacking (overview → focus → inspector) | ✅ |
