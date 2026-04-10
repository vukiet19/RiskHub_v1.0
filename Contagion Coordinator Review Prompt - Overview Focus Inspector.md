You are the coordinator and final reviewer for the `Portfolio Contagion Map` implementation in RiskHub.

Project root:
`D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0`

Your role is not to independently redesign the module from scratch.
Your role is to verify that the frontend and backend implementations are aligned, coherent, and safe to integrate.

Read these files first:
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Integration Brief - Overview Focus Inspector.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Frontend Implementation Brief - Overview Focus Inspector.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Backend Alignment Brief - Overview Focus Inspector.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Frontend Agent Prompt - Overview Focus Inspector.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Backend Agent Prompt - Overview Focus Inspector.md`
- `D:\Codex\mockups\dashboard-overview-focus-inspector-redesign.png`
- `D:\Codex\mockups\dashboard-overview-focus-inspector-redesign.svg`

Inspect the actual code touched by the implementing agents, especially:
- `backend/api/dashboard.py`
- `backend/engine/correlation_engine.py`
- any backend helper modules used for contagion output
- `frontend/src/app/page.tsx`
- contagion-related components under `frontend/src/components/`

Your job:
Review the completed frontend and backend work as one integrated feature and determine whether the implementation is actually consistent with the approved `Overview + Focus + Inspector` design.

This is an integration review, not a style-only review.

## Primary review goals
1. verify contract alignment
2. verify visual-semantic alignment
3. verify fallback-state honesty
4. verify that the feature still matches the research-inspired product intent

## Non-negotiable review rules
Reject the implementation if any of the following are true:
- the desktop module still behaves like a single graph surface instead of `Overview + Focus + Inspector`
- the frontend invents summary values or graph semantics locally
- the backend leaves key semantics undefined and forces the frontend to guess
- focus mode still renders a dense neighbour mesh
- primary links and context links are not visually distinct
- the selected default node is ambiguous
- the wording implies causal certainty or predictive certainty
- the normal connected path still depends on mock holdings

## Review checklist

### A. Shared contract review
Check that the backend payload supports the frontend design.

Confirm the payload includes:
- `summary.systemic_asset`
- `summary.largest_cluster`
- `summary.top_risk_pair`
- `clusters`
- `display.default_selected_asset`
- `display.overview.edge_ids`
- `display.focus.max_primary_links`
- `display.focus.max_context_links`
- edge-level ranking or role fields such as `display_strength` or `topology_role`

Flag a finding if:
- frontend hardcodes or guesses any of the above
- the same concept is named differently across backend and frontend
- payload shape forces unnecessary frontend heuristics

### B. Overview panel review
Check that the left panel behaves like a compressed topology view.

Confirm:
- it is visually present on desktop
- it is not just a tiny duplicate of the focus graph
- it uses a sparse topology-preserving subset of edges
- it helps identify the largest cluster and peripheral nodes

Flag a finding if:
- overview is omitted
- overview is a noisy mini full mesh
- overview contains the same edge density as focus

### C. Focus panel review
Check that the center panel is a true selected-node ego-network.

Confirm:
- it defaults to the systemic asset
- it shows only strongest direct links plus limited context
- edges are routed to reduce overlap near the hub
- primary links are stronger and clearer than context links
- context links are muted or dashed

Flag a finding if:
- neighbour-to-neighbour full mesh is rendered in focus mode
- primary and context links look too similar
- edge overlap is still severe around the hub

### D. Inspector review
Check that the inspector truly explains the selected node.

Confirm:
- selected asset is clearly shown
- strongest link is shown
- cluster context is shown
- action hint is shown
- selection changes propagate into the inspector

Flag a finding if:
- inspector is mostly placeholder text
- inspector values are hardcoded
- selection state is not reflected consistently

### E. State and interaction review
Confirm:
- default selected asset is stable
- clicking nodes in overview and focus updates the same selected state
- hovering does not destroy selected state
- empty-canvas interactions do not collapse the module into a blank unusable state

Flag a finding if:
- selection behaves inconsistently across panels
- hover and selection conflict
- no useful default state exists before clicks

### F. Fallback and low-data review
Confirm:
- fewer than 2 meaningful assets -> concentration explanation
- exactly 2 assets -> pair-risk view
- low-signal graph -> honest sparse or node-only state
- no fake graph is returned unless demo mode is explicitly enabled

Flag a finding if:
- the UI renders a broken empty canvas
- the backend fabricates structure in the normal path
- fallback behavior differs between frontend and backend assumptions

### G. Product-language review
Confirm:
- labels use plain English
- dependency language is conservative
- no causal overclaiming appears in the UI

Flag a finding if:
- copy sounds academic but not product-usable
- copy implies prediction or certainty

## Expected review output
Your review response must be structured in this order:

1. `Findings`
- list concrete issues first, ordered by severity
- reference files and lines where possible

2. `Alignment summary`
- say whether frontend and backend are aligned or not

3. `Open risks`
- list anything still approximate, mocked, or contract-fragile

4. `Go / No-go`
- give a direct recommendation:
  - `Go`
  - `Go with fixes`
  - `No-go`

## Severity guidance
Use practical severity:
- `P0`: security or complete feature invalidation
- `P1`: wrong semantics, contract break, misleading risk interpretation
- `P2`: usability defect or medium contract weakness
- `P3`: polish issue or low-risk inconsistency

## Review style
- Be specific
- Prefer evidence over opinion
- Focus on correctness, coherence, and product meaning
- Do not rewrite the whole feature unless necessary
- Do not spend most of the review on surface styling

## Final decision rule
The feature is acceptable only if:
- the three-panel model is real in the product
- the backend contract truly supports it
- the focus panel materially fixes edge pileup
- the overview preserves global structure
- the inspector turns the selected node into a readable explanation
- fallback states are honest
