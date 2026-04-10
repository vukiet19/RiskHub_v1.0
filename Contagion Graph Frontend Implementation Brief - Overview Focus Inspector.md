# Contagion Graph Frontend Implementation Brief - Overview Focus Inspector

## Document Status
- This brief supersedes the earlier `Contagion Graph Frontend Brief.md` for the contagion module UI structure.
- Use this document as the frontend source of truth for the next implementation pass.
- This brief is based on the approved mockup pair:
  - `D:\Codex\mockups\dashboard-overview-focus-inspector-redesign.png`
  - `D:\Codex\mockups\dashboard-overview-focus-inspector-redesign.svg`

## Primary Goal
Implement a `Portfolio Contagion Map` that preserves the research-driven network logic while remaining readable and actionable inside the RiskHub dashboard.

The key product decision is:
- do not show only a raw full network
- do not show only a focused hub view
- always combine:
  - `Network Overview`
  - `Focus View`
  - `Asset Inspector`

This is required because:
- the overview preserves global topology and cluster context
- the focus panel prevents edge pileups and false visual interpretation
- the inspector turns the selected asset into an explicit risk explanation

## Relevant Project Files
- `frontend/src/app/page.tsx`
- `frontend/src/components/PortfolioContagionMap.tsx`
- `frontend/src/components/ContagionCanvas.tsx`
- `frontend/src/components/AssetInspector.tsx`
- any new components under `frontend/src/components/contagion/`
- any related styles already introduced for the current dashboard redesign

If the current file names differ slightly, keep the existing naming convention where reasonable, but preserve the structure defined in this brief.

## Source of Truth Hierarchy
Use this priority order when implementation details conflict:
1. backend response contract and real available data
2. this implementation brief
3. the approved mockup SVG and PNG
4. the earlier frontend brief

Do not invent extra interaction modes or academic features beyond the scope of this brief.

## High-Level Product Intent
The module must answer three questions immediately:
1. what does the full risk network look like
2. which asset is currently the dominant contagion hub
3. which direct connections matter most right now

The module must not behave like:
- a decorative network demo
- a dense force-layout dump
- a research-only visualization with poor readability

The module should behave like:
- a research-informed network view
- a productized risk explanation
- a readable decision support surface for a dense portfolio

## Mandatory Structural Layout
The contagion module must be divided into these layers in this exact conceptual order:

1. module header
2. insight strip
3. summary metrics row
4. three-panel content area
   - left: `Network Overview`
   - center: `Focus View`
   - right: `Asset Inspector`

Do not collapse the inspector below the graph on desktop.
Do not merge overview and focus into one canvas on desktop.
Do not allow a full-mesh network to replace the focused center panel.

## Desktop Layout Contract
Inside the contagion card:
- `Network Overview`: approximately 20% to 24% width
- `Focus View`: approximately 38% to 42% width
- `Asset Inspector`: approximately 28% to 32% width

The exact pixel widths may vary, but the center focus panel must remain visually dominant.

Recommended desktop structure:
- outer card container
- card header row
- insight strip
- metrics row
- content row with three children

## Mobile / Narrow Layout Contract
For smaller widths:
- stack the three panels vertically in this order:
  1. overview
  2. focus
  3. inspector
- keep the metrics row as a responsive grid
- preserve the difference between overview and focus even if stacked

Do not merge overview and focus on mobile just to save space.

## Module Header Requirements
The header must include:
- title: `Portfolio Contagion Map`
- short subtitle explaining the overview + focus model
- regime indicator pill
- optional mode pills that reflect the two visualization layers

Recommended wording:
- title: `Portfolio Contagion Map`
- subtitle: `Network Overview keeps global topology visible while Focus View stays readable and action oriented`

The header must not imply causal certainty.

## Insight Strip Requirements
The insight strip is required.

It must display a backend-driven summary sentence, for example:
- `BTC remains the dominant contagion hub. The left panel shows the whole dependency structure, while the center panel isolates the strongest BTC neighbourhood so edge pileups do not distort the risk story.`

Rules:
- use plain English
- mention the systemic asset if available
- mention the largest cluster or strongest neighbourhood if available
- if the backend does not provide an insight sentence, synthesize one only from available fields, but keep it conservative

Do not invent unsupported claims such as:
- `BTC will cause ETH to crash`
- `This network predicts future contagion with certainty`

## Summary Metrics Row
Render a data-driven metrics row above the three-panel content area.

Required cards:
- `Contagion Risk`
- `7D Change`
- `Systemic Asset`
- `Top Risk Pair`
- `Largest Cluster`

Preferred field mapping:
- `Contagion Risk` -> `summary.contagion_risk_score`
- `7D Change` -> `summary.contagion_risk_delta_7d`
- `Systemic Asset` -> `summary.systemic_asset`
- `Top Risk Pair` -> `summary.top_risk_pair`
- `Largest Cluster` -> derive from backend cluster summary if available, otherwise derive cautiously from visible node cluster data

Rules:
- every visible value must be backend-driven or explicitly derived from backend data
- do not leave hardcoded demo values in the connected dashboard path

## Three-Panel Content Design

### 1. Network Overview
Purpose:
- preserve the full network logic
- show global topology
- reveal cluster structure and peripheral nodes

This panel is not the main action surface.
It is the system context surface.

Rendering rules:
- show a compressed network representation
- show only the strongest meaningful edges needed to understand topology
- do not show a full mesh
- allow minor or peripheral exposures to remain visible only if they help topology understanding

Visual semantics:
- node size = portfolio weight
- node ring = systemic importance or prominence
- edge thickness = dependency strength
- edge color = risk gradient
- edge count must stay intentionally sparse

What the user should learn from overview:
- where the biggest cluster is
- which assets sit at the center
- which assets are peripheral
- whether the portfolio is truly diversified or concentrated into one dependency cluster

### 2. Focus View
Purpose:
- make the selected hub readable
- prevent edge pileups
- show only the most relevant contagion paths

Default selection:
- the selected asset must default to `summary.systemic_asset`
- if that field is missing, use the node with the highest combined `weight_pct` and `systemic_score`
- if no stable default exists, use the first visible node deterministically

Rendering rules:
- show the selected node plus its strongest direct links
- show only the top `k` direct links for the selected node
- recommended `k = 4 to 6`
- additional secondary links may be shown as muted context, but they must not visually compete with primary links

Primary links:
- solid
- risk-colored
- thicker
- fully readable

Context links:
- dashed or muted
- lower opacity
- neutral gray-blue, not risk-colored
- explicitly treated as context only

Critical rule:
- do not render all neighbour-to-neighbour edges in focus mode
- the focus panel is an ego-network around the selected node, not a mini full-mesh cluster

This is the main protection against misreading the graph.

### 3. Asset Inspector
Purpose:
- convert the graph into a direct explanation
- tell the user why the selected node matters

Required fields:
- `Selected Asset`
- `Portfolio Weight`
- `Strongest Link`
- `Systemic Role`
- `Largest Cluster` or `Cluster Membership`
- `Action Hint`

Preferred additional fields:
- `Systemic Score`
- `7D Signal`
- `Top Connected Assets`

Rules:
- all content must support the selected node
- if selection changes, the inspector must update immediately
- if nothing is selected, the default selected node remains the systemic asset

## Interaction Model

### Default State
On first render:
- overview shows the global topology
- focus shows the systemic asset and its strongest visible neighbourhood
- inspector shows the systemic asset summary

The module must already be useful before any click interaction.

### Click Behavior
- clicking a node in overview updates the focus view and inspector to that node
- clicking a node in focus does the same
- clicking the active selected node again should not clear the module into an empty state
- clicking empty canvas may clear transient hover state, but should keep the current selected node

Do not make the module depend on a blank unselected state.

### Hover Behavior
- hovering a node in focus may temporarily emphasize its connected visible edges
- hovering an edge may show a small tooltip
- tooltip content must not overlap critical node labels or make the graph harder to read

If hover tooltips are hard to place cleanly, prefer anchoring them to an upper corner of the panel instead of floating directly on top of dense edges.

## Edge Rendering Rules
This is the highest-risk implementation area. Follow these rules strictly.

### Problem Being Solved
The previous implementation allowed multiple edges to overlap around the dominant hub. That created:
- visual clutter
- false impression of direct contagion relationships
- ambiguity about which edge belonged to which pair

### Required Solution
Implement deterministic routed edges in focus mode.

Rules:
- primary edges must leave the selected node from distinct angular slots
- primary edges must use curved routing, not straight lines stacked on top of each other
- edge curvature should separate connections visually near the hub
- edge routing must prefer readability over geometric minimalism

Do not:
- let five edges leave the hub from the same point
- let tooltips sit inside the densest crossing area
- use a generic force layout with uncontrolled edge overlap

### Edge Color Rules
Use a continuous or near-continuous gradient from:
- green = low risk
- yellow = moderate
- orange = high
- red = extreme

Risk colors must be used only for primary visible links.
Muted context links must not reuse the same strong colors.

### Edge Filtering Rules
Overview:
- keep only the strongest topology-preserving edges
- hide weak links by threshold

Focus:
- show top `k` links of the selected node
- optionally show a small number of context links
- all other neighbour-to-neighbour links must be hidden or clearly muted

These rules must be data-driven.
Do not hardcode visible pairs.

## Node Rendering Rules
Nodes must use asset icons where possible.

Preferred approach:
- use a local symbol-to-icon mapping in the frontend
- use a vetted icon package or local asset directory
- never depend on unstable remote CDN image loading inside the shipped app

Fallback:
- if an icon is missing, render a clean text-based fallback circle with the asset ticker

Required semantics:
- node size = portfolio weight
- outer ring = prominence/systemic importance
- selected node gets a stronger halo or ring treatment
- peripheral node styling must be visually quieter than the selected hub

## Overview Panel Constraints
The overview panel is intentionally compressed.
It must not become a second full-detail focus view.

Implementation rules:
- layout may be deterministic rather than physically simulated
- clusters may be lightly compressed toward the center
- the overview must remain readable in a small footprint

Good outcome:
- user sees a cluster map

Bad outcome:
- user sees an unreadable miniature version of the full graph

## Focus Panel Constraints
The focus panel is the main reading surface.

Implementation rules:
- selected node near lower-left or center-left is acceptable if it improves edge routing
- strongest edge should have the most direct visual emphasis
- tooltip should not cover the selected node or the main edge junctions
- keep labels readable even when node icons are present

Good outcome:
- user can follow each visible edge from the selected hub to its endpoint without confusion

Bad outcome:
- user still sees a dense pile of overlapping colored wires

## Inspector Content Rules
The inspector must speak in product language, not paper language.

Preferred wording:
- `Selected Asset`
- `Strongest Link`
- `Systemic Role`
- `Largest Cluster`
- `Action Hint`

Avoid:
- `nonlinear propagation`
- `causal topology`
- `systemic transmission coefficient`

Example action hints:
- `Reduce BTC overlap first`
- `ETH is tightly coupled with BTC, so holding both provides less diversification than it appears`
- `KNC is currently peripheral and contributes little to cluster-level contagion`

## Data Contract Expectations
The frontend implementation should expect these fields when available:

Top-level:
- `regime.label`
- `summary.contagion_risk_score`
- `summary.contagion_risk_delta_7d`
- `summary.systemic_asset`
- `summary.top_risk_pair`
- `summary.insight`

Nodes:
- `id`
- `label`
- `weight_pct`
- `systemic_score`
- `value_usd`
- `daily_move_pct`
- `cluster_id`
- `top_correlations`

Edges:
- `source`
- `target`
- `correlation`
- `abs_correlation`
- `delta_7d`
- `band`
- `trend`

If cluster-level fields are missing:
- derive only lightweight view metadata in the frontend
- do not fabricate cluster causality

## Recommended Component Decomposition
Do not keep this module as a single monolithic component.

Recommended structure:
- `PortfolioContagionMap`
  - data normalization
  - selected asset state
  - visible edge selection
  - derived summary display
- `ContagionHeader`
- `ContagionInsightStrip`
- `ContagionMetricRow`
- `ContagionOverviewPanel`
- `ContagionFocusPanel`
- `ContagionInspectorPanel`
- `ContagionLegend`

If the repo already has a slightly different naming convention, preserve the overall decomposition even if exact file names differ.

## State Management Requirements
Minimum frontend state:
- normalized nodes
- normalized edges
- selected asset id
- hovered asset id or edge id
- derived visible focus edges
- derived overview edges

Rules:
- selected asset state must be stable
- hover state must never overwrite selected asset state
- focus panel visible edge calculation must be memoized or derived efficiently

## Responsiveness Requirements
Desktop:
- three panels in one row

Tablet:
- overview above focus+inspector or stacked as two rows if necessary

Mobile:
- overview
- focus
- inspector

The graph panels must not collapse into unreadable miniature canvases on smaller widths.

## Error, Empty, and Low-Data States
The module must degrade cleanly.

Cases:
- no meaningful holdings
- exactly two holdings
- missing systemic asset
- missing icon
- backend returned zero usable edges
- backend returned nodes but no stable largest cluster summary

Required behavior:
- no meaningful holdings: show concentration explanation card
- exactly two holdings: show pair-risk view instead of overview+focus split
- nodes but no usable edges: show node-only concentration layout plus explanation
- missing icon: use ticker fallback

Do not render broken empty canvases.

## Performance Rules
This is still a dashboard component, not a research workstation.

Rules:
- avoid expensive animated force simulation on every render
- prefer deterministic layout math for overview and focus
- avoid continuous layout recomputation during hover
- keep the visible focus graph intentionally small

## Accessibility Rules
- selected node must be identifiable without color alone
- inspector must expose the selected asset clearly
- text contrast must remain high in the dark theme
- icons must have accessible labels where relevant

## Hard Constraints
Do not:
- reintroduce the old circular demo layout
- render all edges in focus mode
- use the same strong color treatment for primary and context links
- place the tooltip in the middle of the densest edge region
- hardcode summary values
- depend on remote CDN icons in the production frontend path

## Acceptance Checklist
The work is complete only when all of the following are true:

- the desktop contagion module is visibly split into `Overview`, `Focus`, and `Inspector`
- the overview shows global structure without becoming unreadable
- the focus panel shows the selected hub and strongest direct links only
- edge overlap around the selected hub is materially reduced
- context links are clearly differentiated from primary links
- the inspector explains why the selected asset matters
- the module remains understandable before any interaction
- icons render with a safe fallback path
- all summary values are data-driven
- empty and low-data states are explicit and graceful

## Implementation Priority
Implement in this order:
1. normalize data and selected asset state
2. build the outer module structure
3. build the overview panel
4. build the focus panel with routed primary edges
5. build the inspector panel
6. add legend, tooltip, and responsive behavior
7. verify low-data states

## Final Delivery Expectations
When reporting completion, the implementing agent must include:
- files changed
- component structure introduced
- how selected asset state works
- how overview edge filtering works
- how focus edge filtering works
- how routed edges are implemented
- what fallback states were added
- what remains approximate or backend-dependent
