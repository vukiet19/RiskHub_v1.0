# Contagion Graph UX and Content Brief

## Objective
Turn the contagion module into a clear decision-support surface for retail users by defining the right information hierarchy, copy rules, and explanation patterns.

## Product Role
This module should explain portfolio dependency risk, not showcase a graph library.

The user should immediately understand:
- which asset is the main contagion source
- which holdings are moving together
- whether the network is getting tighter or looser
- what to reduce or watch first

## Naming
- Module name: `Portfolio Contagion Map`
- Avoid `Asset Contagion Graph` in the redesigned UI

## Information Hierarchy
- First: one-sentence insight
- Second: summary metrics
- Third: graph as supporting visualization
- Fourth: selected asset explanation

## Required Content Blocks
- Header
  - title
  - subtitle
  - regime pill
  - freshness timestamp
- Insight strip
  - one sentence generated from real data
- Summary row
  - `Contagion Risk Score`
  - `7D Change`
  - `Systemic Asset`
  - `Top Risk Pair`
- Asset inspector
  - asset name
  - portfolio weight
  - value in USD
  - 24h move
  - systemic importance
  - top connected assets
  - strongest dependency
  - tightening or loosening signal
  - action hint
- Legend
  - explain node size
  - explain edge thickness
  - explain edge color bands

## Writing Rules
- Use plain risk language.
- Write for a retail crypto trader, not a researcher.
- Prefer short, specific, asset-based statements.
- Every summary sentence must imply a decision or at least a clear warning.

## Avoid These Terms
- `causal`
- `systemic propagation mechanism`
- `nonlinear network topology`
- `graph-theoretic`
- `multilayer contagion architecture`

## Preferred Language
- `most connected risk source`
- `moving together`
- `dependency tightening`
- `cluster risk`
- `stress regime`
- `portfolio concentration`
- `dominant risk pair`

## Insight Sentence Pattern
Use patterns like:
- `BTC is currently the dominant contagion hub.`
- `Your portfolio is tightly linked through BTC, ETH, and SOL.`
- `Dependency strength has increased over the last 7 days, which raises cluster drawdown risk.`
- `Reducing BTC concentration would lower contagion risk more than trimming smaller alt positions.`

## Regime Labels
- `Calm`
  - relationships are relatively loose and diversification is still working
- `Elevated`
  - dependencies are strengthening and cluster risk is rising
- `Stress`
  - assets are moving together more aggressively and drawdown amplification risk is high

## Empty and Fallback States
- Too few assets:
  - `Contagion mapping needs at least two meaningful holdings. Right now your risk is driven more by concentration than by cross-asset contagion.`
- Two-asset portfolio:
  - `Your portfolio is driven by one dominant dependency pair rather than a broad contagion network.`
- Low-confidence data:
  - `Recent portfolio data is too limited for a stable contagion map.`

## Deliverables
- Final copy for header, subtitle, legend, inspector labels, empty states, and regime labels
- Insight sentence templates for backend generation
- Action hint templates for selected assets
- Terminology guardrails for all agents touching this module

## Acceptance Criteria
- A retail user can understand the module without knowing correlation theory.
- The UI leads with explanation, not diagram complexity.
- Copy remains specific, concise, and action-oriented.
- The language does not overstate certainty or imply causality.

## Constraints
- Keep all content in English.
- Keep wording aligned with the existing product tone: serious, tactical, and risk-focused.
- Do not turn the module into academic research copy.
