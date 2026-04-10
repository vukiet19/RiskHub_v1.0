You are the frontend implementation owner for the new `Portfolio Contagion Map` in RiskHub.

Project root:
`D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0`

Read these files first and treat them as the source of truth:
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Frontend Implementation Brief - Overview Focus Inspector.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Integration Brief - Overview Focus Inspector.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Backend Alignment Brief - Overview Focus Inspector.md`
- `D:\Codex\mockups\dashboard-overview-focus-inspector-redesign.png`
- `D:\Codex\mockups\dashboard-overview-focus-inspector-redesign.svg`

Inspect the current frontend implementation before changing anything:
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\frontend\src\app\page.tsx`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\frontend\src\components\PortfolioContagionMap.tsx`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\frontend\src\components\ContagionCanvas.tsx`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\frontend\src\components\AssetInspector.tsx`
- any existing contagion-related components under `frontend\src\components`

Your job:
Implement the contagion module as a three-panel desktop surface:
- `Network Overview`
- `Focus View`
- `Asset Inspector`

This is not a decorative redesign. It is a readability and semantics correction for a research-inspired risk module.

Non-negotiable rules:
- Do not merge overview and focus into one desktop canvas.
- Do not render a full mesh in focus mode.
- Do not reintroduce the old circular demo layout.
- Do not hardcode summary values.
- Do not invent backend semantics that are not in the integration brief.
- Do not depend on remote CDN icons in the production path.
- Do not imply causal certainty in the UI copy.

Shared contract rule:
- The integration brief is the shared contract between you and the backend agent.
- If a field is missing in the current backend implementation, do not silently rename or reinvent the contract.
- If you need a temporary adapter for local progress, keep it internal and document it clearly in the final report.

Primary implementation outcomes:
1. Build the new contagion card layout:
   - header
   - insight strip
   - summary metrics row
   - three-panel content area
2. Build `Network Overview` as a compressed topology view.
3. Build `Focus View` as a selected-node ego-network with routed primary edges and muted context edges.
4. Build `Asset Inspector` as the selected-node explanation surface.
5. Use a stable selected-asset state that defaults to the backend-provided systemic asset.
6. Add explicit low-data and pair-risk fallback states.

Specific implementation requirements:
- `Overview` must render only the sparse topology-preserving edge set, not every edge.
- `Focus View` must render only the strongest selected-node links plus a small number of muted context links.
- Primary links must use the risk gradient.
- Context links must be dashed or muted and must not visually compete with primary links.
- The selected node must remain useful on first render without requiring any click.
- The inspector must update when selection changes.
- Clicking a node in overview or focus must update the same selected-asset state.
- Hover state must never replace selected state.

Node/icon requirements:
- use a safe local or package-based icon mapping when possible
- if an icon is missing, render a clean ticker fallback
- selected node styling must remain readable even with the icon

Responsive requirements:
- desktop: three panels in one row
- mobile/narrow: stack overview, focus, inspector in that order
- do not collapse the meaning of overview vs focus on mobile

Error and fallback requirements:
- fewer than 2 meaningful assets: concentration explanation
- exactly 2 assets: pair-risk view
- nodes but no stable edges: node-focused low-signal state
- missing icon: ticker fallback

Implementation discipline:
- keep component boundaries clear
- prefer deterministic layout math over unstable force simulation for the new panels
- keep the module readable before any interaction
- keep the design aligned with the existing dark RiskHub visual language

Suggested execution order:
1. normalize payload shape and selected asset state
2. restructure the outer contagion card
3. implement overview panel
4. implement focus panel with routed edges
5. implement inspector panel
6. wire interactions
7. add fallbacks and responsive behavior
8. run available checks

When you finish, report exactly:
- files changed
- component structure introduced or updated
- how selected asset state works
- how overview edge rendering is chosen
- how focus edge rendering is chosen
- how routed edges are implemented
- what fallback states were added
- what remains blocked or backend-dependent
