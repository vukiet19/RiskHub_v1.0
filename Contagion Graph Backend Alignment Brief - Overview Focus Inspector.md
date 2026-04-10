# Contagion Graph Backend Alignment Brief - Overview Focus Inspector

## Document Status
- This brief extends and partially supersedes the earlier `Contagion Graph Backend Brief.md` for the contagion module API contract.
- Use this document as the backend source of truth for the `Overview + Focus + Inspector` frontend redesign.
- This brief is written specifically to prevent frontend/backend mismatch during implementation.

## Primary Goal
Provide a stable, interpretable backend contract for a `Portfolio Contagion Map` that is rendered as:
- `Network Overview`
- `Focus View`
- `Asset Inspector`

The backend must support both:
- research-aligned network structure
- product-oriented readability

The backend must not return only a raw graph and expect the frontend to infer the entire UI model from scratch.

## Relevant Backend Files
- `backend/api/dashboard.py`
- `backend/engine/correlation_engine.py`
- `backend/services/exchange_service.py`
- any helper modules for clustering, ranking, or insight generation

## Why a New Backend Alignment Brief Is Needed
The earlier backend brief was sufficient for a single graph surface.
It is not sufficient for the new frontend structure because the new UI now requires:
- a global topology representation for `Overview`
- a selected-node neighbourhood representation for `Focus`
- cluster-aware summary fields
- stable default selection behavior
- explicit roles for edges so the frontend does not accidentally render misleading full meshes

If the backend does not define these semantics clearly, the frontend agent will almost certainly:
- over-render edges
- infer inconsistent cluster rules
- choose the wrong default selected asset
- produce a UI that looks correct but misstates the network logic

## Product Interpretation Boundary
This backend powers a research-inspired product visualization.

Therefore:
- it should represent dynamic dependency risk honestly
- it should not overclaim causal contagion
- it should return enough structure for a safe productized interpretation

Use language and fields that support:
- `dependency`
- `tightening`
- `largest cluster`
- `systemic asset`
- `context edge`

Avoid backend semantics that imply:
- proven directionality
- causal transmission certainty
- predictive certainty

## Core Backend Responsibility
The backend must provide three kinds of information simultaneously:

1. `Global network structure`
- enough data to render a compressed overview of the whole topology

2. `Focused local neighbourhood`
- enough data to render a selected asset plus its strongest visible relationships without edge pileups

3. `Narrative summary fields`
- enough data to populate summary cards and inspector text without frontend guesswork

## High-Level Contract Recommendation
Keep one canonical contagion endpoint for the module:
- `GET /api/v1/dashboard/{user_id}/contagion`

The endpoint must return a single payload that includes:
- canonical graph entities
- graph summary
- cluster summary
- display guidance metadata

The frontend should not need to call a second endpoint just to resolve focus state.

## Required Top-Level Response Shape
Recommended shape:

```json
{
  "status": "ok",
  "data": {
    "generated_at": "2026-04-10T08:00:00Z",
    "window_days": 30,
    "regime": {
      "label": "stress",
      "reason": "Dependency tightening and realized volatility are above recent baseline."
    },
    "summary": {},
    "nodes": [],
    "edges": [],
    "clusters": [],
    "display": {}
  }
}
```

The endpoint may include additional internal metadata if needed, but the frontend should rely on the stable sections above.

## Required Summary Fields
The `summary` object must include:
- `contagion_risk_score`
- `contagion_risk_delta_7d`
- `systemic_asset`
- `top_risk_pair`
- `largest_cluster`
- `network_density`
- `insight`

Recommended extended fields:
- `visible_overview_edges`
- `visible_overview_nodes`
- `focus_default_asset`
- `focus_default_primary_edge_count`
- `focus_default_context_edge_count`

### Required Summary Definitions

#### `summary.contagion_risk_score`
- 0 to 100
- graph-level measure of weighted dependency concentration
- interpretable and stable

#### `summary.contagion_risk_delta_7d`
- change in score versus an equivalent 30-day window shifted 7 days earlier
- must be like-for-like, not compared against a shorter truncated history

#### `summary.systemic_asset`
- the asset that should be selected by default in `Focus View`
- derived from portfolio importance plus network importance
- if there is a tie, break it deterministically

#### `summary.top_risk_pair`
- strongest pair by dependency strength times portfolio importance
- should be directly usable by the metrics row

Recommended structure:
```json
{
  "source": "BTC",
  "target": "ETH",
  "correlation": 0.94,
  "delta_7d": -0.004
}
```

#### `summary.largest_cluster`
- required for the new layout
- do not force the frontend to derive this from scratch if avoidable

Recommended structure:
```json
{
  "cluster_id": "cluster_majors",
  "label": "BTC / ETH / DOGE",
  "member_count": 3,
  "total_weight_pct": 65.3,
  "systemic_asset": "BTC"
}
```

#### `summary.insight`
- one conservative English sentence
- must be product-ready and directly renderable

Example:
- `BTC remains the dominant contagion hub. The largest dependency cluster is BTC-ETH-DOGE, while ONT and KNC remain peripheral.`

## Required Node Fields
Each node must include:
- `id`
- `label`
- `value_usd`
- `weight_pct`
- `daily_move_pct`
- `systemic_score`
- `cluster_id`
- `cluster_role`
- `top_correlations`

Recommended additional fields:
- `display_priority`
- `is_peripheral`
- `focus_priority`

### Required Node Definitions

#### `cluster_role`
This field is important because the frontend now distinguishes:
- hub
- core
- bridge
- peripheral

Recommended enum:
- `hub`
- `core`
- `bridge`
- `peripheral`

If exact graph theory classification is too heavy for MVP:
- return a practical approximation
- but keep the enum stable

#### `top_correlations`
This is still important for focus rendering and inspector content.

Recommended structure:
```json
[
  {
    "asset": "ETH",
    "correlation": 0.94,
    "delta_7d": -0.004,
    "band": "high",
    "trend": "stable"
  }
]
```

#### `display_priority`
Recommended numeric rank that combines:
- weight
- systemic score
- connection significance

This helps the frontend decide which minor assets to hide first if space becomes constrained.

## Required Edge Fields
Each edge must include:
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

Recommended additional fields:
- `combined_weight_pct`
- `overview_visible`
- `focus_candidate`

### Required Edge Definitions

#### `id`
Must be stable and deterministic.

Recommended format:
- alphabetical asset pair joined by `|`
- example: `BTC|ETH`

This prevents frontend duplicate key mistakes.

#### `display_strength`
Single normalized numeric score for rendering decisions.

Suggested use:
- sort edges
- determine overview sparsification
- determine focus top-k ranking

Recommended derivation:
- primarily `abs_correlation`
- optionally adjusted by combined portfolio weight

#### `topology_role`
This is critical for the new frontend.

Recommended enum:
- `primary`
- `secondary`
- `context`
- `hidden_candidate`

Interpretation:
- `primary`: strong enough to appear in focus when relevant
- `secondary`: meaningful but not top-tier
- `context`: may be shown muted to preserve local context
- `hidden_candidate`: available in data but not preferred for default rendering

The frontend may still derive final visibility by selected node, but this field prevents totally arbitrary display logic.

## Required Cluster Fields
The new UI should not be forced to reverse-engineer clusters only from `cluster_id` on nodes.

Add a `clusters` array.

Required fields per cluster:
- `id`
- `label`
- `members`
- `member_count`
- `total_weight_pct`
- `systemic_asset`
- `risk_level`

Recommended structure:
```json
{
  "id": "cluster_majors",
  "label": "BTC / ETH / DOGE",
  "members": ["BTC", "ETH", "DOGE"],
  "member_count": 3,
  "total_weight_pct": 65.3,
  "systemic_asset": "BTC",
  "risk_level": "high"
}
```

The cluster list is required because:
- the overview panel needs explicit topology context
- the summary row needs `largest_cluster`
- the inspector may need cluster membership text

## Required Display Metadata
Add a `display` object to reduce frontend guesswork.

Recommended shape:

```json
{
  "default_selected_asset": "BTC",
  "overview": {
    "node_ids": ["BTC", "ETH", "DOGE", "SOL", "XRP", "BNB", "AVAX", "KNC"],
    "edge_ids": ["BTC|ETH", "BTC|DOGE", "BTC|SOL", "DOGE|XRP", "BNB|AVAX"],
    "note": "Compressed topology view"
  },
  "focus": {
    "max_primary_links": 5,
    "max_context_links": 2
  }
}
```

This object is strongly recommended even if some fields can technically be derived.
It helps keep multiple frontend agents consistent.

## Overview Rendering Support Requirements
The overview panel needs a sparse, topology-preserving set of edges.

Backend requirement:
- explicitly mark or list which edges belong in the default overview

Why:
- the frontend should not invent its own graph sparsification policy if the backend already knows cluster structure and significance

Recommended implementation choices:
- keep the strongest intra-cluster edges
- keep the most important inter-cluster bridges
- drop weak redundant edges

Good outcome:
- overview shows structure

Bad outcome:
- overview becomes a tiny dense graph with no readable topology

## Focus Rendering Support Requirements
The focus panel is selected-node-centric.

Backend requirement:
- provide enough information to identify the default selected node
- make it easy to rank the strongest direct edges of the selected node

Recommended implementation choices:
- use `summary.systemic_asset` as the default selected node
- ensure `nodes[*].top_correlations` is stable and sorted
- ensure `edges[*].display_strength` is present
- optionally provide a per-node focus ranking in the future if needed

The frontend should be able to:
- show the top 4 to 6 direct links of the selected node
- show up to 2 context links in muted style

The backend must not force the frontend to discover all of this by ad hoc sorting against raw correlation values only.

## Fallback and Honest No-Data Behavior
Do not force a graph when the data cannot support one.

### Case 1: fewer than 2 meaningful assets
Return:
- empty or minimal node list
- no default focus edges
- summary insight explaining insufficient diversification or insufficient holdings

### Case 2: exactly 2 meaningful assets
Return:
- both nodes
- one pair edge
- summary suitable for pair-risk rendering

### Case 3: enough nodes but no stable edges above threshold
Return:
- nodes
- sparse or empty edges
- summary explaining that current holdings are weakly connected or insufficiently stable for a meaningful contagion map

Do not inject fake graph structure unless the caller explicitly requests `demo=true`.

## Calculation Guidance

### Holdings Source
Use:
- current live positions and-or holdings
- server-side exchange access only

Do not use:
- historical trade notional as a proxy for current exposure

### 7-Day Comparison
Must compare:
- current 30-day window
- prior 30-day window shifted 7 days earlier

Do not compare:
- current 30-day window
- shorter truncated history

### Systemic Score
Recommended formula:
- weighted degree centrality times portfolio weight

The exact formula can vary, but it must remain:
- interpretable
- stable
- monotonic enough that the default selected asset makes product sense

### Largest Cluster
Recommended approach:
- cluster over retained meaningful edges
- use connected components or another simple interpretable graph grouping
- return explicit cluster summary

### Regime Label
Recommended labels:
- `calm`
- `elevated`
- `stress`

Use dependency tightening and-or realized volatility.

## Backend-to-Frontend Safety Rules
The backend must protect the frontend from common UI mistakes by returning explicit semantics.

Return enough information so the frontend does not need to decide:
- what the default selected node should be
- which edges count as overview edges
- which nodes are peripheral
- what the largest cluster is

If the backend omits these semantics, the frontend will fill the gap with guesswork.

## Recommended JSON Example
```json
{
  "status": "ok",
  "data": {
    "generated_at": "2026-04-10T08:00:00Z",
    "window_days": 30,
    "regime": {
      "label": "stress",
      "reason": "Dependency tightening and realized volatility are above recent baseline."
    },
    "summary": {
      "contagion_risk_score": 68,
      "contagion_risk_delta_7d": 1.1,
      "systemic_asset": "BTC",
      "top_risk_pair": {
        "source": "BTC",
        "target": "ETH",
        "correlation": 0.94,
        "delta_7d": -0.004
      },
      "largest_cluster": {
        "cluster_id": "cluster_majors",
        "label": "BTC / ETH / DOGE",
        "member_count": 3,
        "total_weight_pct": 65.3,
        "systemic_asset": "BTC"
      },
      "network_density": 0.41,
      "insight": "BTC remains the dominant contagion hub. The largest dependency cluster is BTC-ETH-DOGE, while KNC and ONT remain peripheral."
    },
    "nodes": [
      {
        "id": "BTC",
        "label": "BTC",
        "value_usd": 26749,
        "weight_pct": 31.5,
        "daily_move_pct": -1.8,
        "systemic_score": 91,
        "cluster_id": "cluster_majors",
        "cluster_role": "hub",
        "display_priority": 1,
        "top_correlations": [
          {
            "asset": "ETH",
            "correlation": 0.94,
            "delta_7d": -0.004,
            "band": "high",
            "trend": "stable"
          }
        ]
      }
    ],
    "edges": [
      {
        "id": "BTC|ETH",
        "source": "BTC",
        "target": "ETH",
        "correlation": 0.94,
        "abs_correlation": 0.94,
        "delta_7d": -0.004,
        "band": "high",
        "trend": "stable",
        "display_strength": 0.94,
        "topology_role": "primary",
        "combined_weight_pct": 47.9,
        "overview_visible": true,
        "focus_candidate": true
      }
    ],
    "clusters": [
      {
        "id": "cluster_majors",
        "label": "BTC / ETH / DOGE",
        "members": ["BTC", "ETH", "DOGE"],
        "member_count": 3,
        "total_weight_pct": 65.3,
        "systemic_asset": "BTC",
        "risk_level": "high"
      }
    ],
    "display": {
      "default_selected_asset": "BTC",
      "overview": {
        "node_ids": ["BTC", "ETH", "DOGE", "SOL", "BNB", "XRP", "AVAX", "KNC"],
        "edge_ids": ["BTC|ETH", "BTC|DOGE", "BTC|SOL", "DOGE|XRP", "BNB|AVAX"],
        "note": "Compressed topology view"
      },
      "focus": {
        "max_primary_links": 5,
        "max_context_links": 2
      }
    }
  }
}
```

## Non-Negotiable Constraints
Do not:
- return mock holdings in the normal connected path
- overclaim causal contagion
- leave largest cluster undefined if the backend can determine it
- force the frontend to derive default focus asset through guesswork
- return a dense edge list without any visibility guidance

## Acceptance Checklist
The backend alignment is complete only when:
- the contagion payload supports both overview and focus panels
- the default selected asset is explicit
- the payload includes largest cluster information
- the payload includes enough edge semantics to separate primary and context links
- the payload supports the inspector without frontend hardcoding
- fallback states are honest and explicit
- the frontend agent can implement the approved layout without inventing graph rules

## Delivery Expectations for the Backend Agent
When implementation is done, the backend agent must report:
- files changed
- exact payload fields added
- how largest cluster is computed
- how default selected asset is computed
- how overview-visible edges are chosen
- how focus-candidate edges are chosen
- what fallback cases are returned
- what remains approximate or planned for later
