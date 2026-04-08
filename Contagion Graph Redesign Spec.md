**Contagion Graph Redesign Spec**

**Relevant Codebase Context**
- Current graph component: [ContagionGraph.tsx](D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\frontend\src\components\ContagionGraph.tsx)
- Current dashboard container: [page.tsx](D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\frontend\src\app\page.tsx)
- Current backend graph endpoint: [dashboard.py](D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\backend\api\dashboard.py)
- Current graph calculation logic: [correlation_engine.py](D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\backend\engine\correlation_engine.py)
- Existing UI design language: [DESIGN.md](D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\DESIGN.md)

**1. Product Positioning**
- Rename the module from `Asset Contagion Graph` to `Portfolio Contagion Map`.
- Position the module as an adaptive dependency map for portfolio risk, not as a causal prediction engine.
- The module must answer three questions within five seconds:
  - Which asset is the main contagion source right now?
  - Which holdings are likely to move together under stress?
  - What should the user watch or reduce first?

**2. Why the Current Version Fails**
- The current graph is visually interesting but does not explain risk.
- The current `Risk Score` is hardcoded and therefore not trustworthy.
- The current node layout makes all assets look equally important.
- The current graph does not expose portfolio weight, correlation trend, or systemic importance.
- The current backend uses mock positions for the graph, so the visualization is not tied to real user exposure.
- The current graph treats contagion as a static snapshot, while the product should communicate changing network conditions.

**3. Core Design Principles**
- Insight before visualization. The module must lead with a short explanation, not a graph alone.
- One visual encoding per meaning. Size, color, thickness, and motion must each have a single stable interpretation.
- Stress-aware, not static. The module must show whether the network is tightening or loosening.
- Retail clarity over academic completeness. Hide complexity unless it improves a user decision.
- Positive co-movement is the default focus. Negative correlation is secondary and should not dominate the MVP view.

**4. Module Structure**
- Header row:
  - Title: `Portfolio Contagion Map`
  - Subtitle: `How tightly your holdings are likely to move together under stress`
  - Regime pill: `Calm`, `Elevated`, or `Stress`
  - Timestamp: `Updated X min ago`
- Insight strip:
  - One generated sentence summarizing the main risk.
  - Example: `BTC is currently the dominant contagion hub. A selloff in BTC is most likely to transmit into ETH and SOL because dependency strength has increased over the last 7 days.`
- Summary metrics row:
  - `Contagion Risk Score`
  - `7D Change`
  - `Systemic Asset`
  - `Top Risk Pair`
- Main body:
  - Left 70%: interactive network canvas
  - Right 30%: asset detail inspector
- Footer row:
  - legend
  - one-line explanation of encodings
  - optional toggle for `Show hedging links`

**5. Visual Encoding Rules**
- Node size = portfolio weight percentage.
- Node fill = asset category or cluster membership.
- Node outer ring = systemic importance score.
- Node pulse = only for a shock source or a significant recent negative move.
- Edge thickness = absolute dependency strength.
- Edge color by band:
  - `>= 0.70`: high contagion, red/orange
  - `0.40-0.69`: moderate contagion, amber
  - `< 0.40`: hidden by default
- Negative correlation edges should be hidden by default in MVP.
- If negative edges are shown, they must use a dashed cool-toned style and a separate legend.

**6. Interaction Behavior**
- Hovering a node highlights only its connected edges and dims the rest of the network.
- Clicking a node locks focus and populates the inspector panel.
- Clicking empty canvas clears selection.
- Hovering an edge shows a compact tooltip:
  - pair name
  - current correlation
  - 7D delta
  - contagion band
- The graph must support zoom and pan, but those controls must stay visually subordinate to insight and selection.
- The module must work without interaction; interaction should deepen understanding, not unlock the basic meaning.

**7. Asset Detail Inspector**
- The right-side inspector must show:
  - asset name and ticker
  - current portfolio weight
  - current value in USD
  - 24h move
  - systemic importance score
  - top 3 connected assets
  - strongest current dependency
  - 7D tightening or loosening signal
  - action hint
- Example action hint:
  - `This asset dominates portfolio contagion. Reducing BTC concentration would lower cluster-level drawdown risk more than trimming DOGE.`

**8. Required Derived Metrics**
- `contagion_risk_score`: 0-100 summary score derived from weighted dependency concentration.
- `contagion_risk_delta_7d`: change in the summary score versus 7 days ago.
- `systemic_asset`: the asset with the highest combined weight and network influence.
- `systemic_score`: per-node score based on weighted degree centrality times portfolio weight.
- `network_density`: share of retained meaningful edges.
- `top_risk_pair`: strongest retained pair by combined portfolio weight and dependency strength.
- `market_regime`: calm/elevated/stress based on cross-sectional realized volatility or dependency tightening.
- `cluster_summary`: optional cluster grouping for major dependency groups.

**9. Backend Response Contract**
```json
{
  "status": "ok",
  "data": {
    "generated_at": "2026-04-08T10:00:00Z",
    "window_days": 30,
    "regime": {
      "label": "stress",
      "reason": "Cross-asset dependency and realized volatility are both above their recent baseline."
    },
    "summary": {
      "contagion_risk_score": 72,
      "contagion_risk_delta_7d": 11,
      "systemic_asset": "BTC",
      "top_risk_pair": {
        "source": "BTC",
        "target": "ETH",
        "correlation": 0.84,
        "delta_7d": 0.09
      },
      "network_density": 0.46,
      "insight": "BTC is the dominant contagion hub and its linkage to ETH and SOL has tightened over the last 7 days."
    },
    "nodes": [
      {
        "id": "BTC",
        "label": "BTC",
        "value_usd": 45000,
        "weight_pct": 38.4,
        "daily_move_pct": -5.8,
        "systemic_score": 91,
        "cluster_id": "majors",
        "flags": ["shock_source"],
        "top_correlations": [
          { "asset": "ETH", "correlation": 0.84, "delta_7d": 0.09 },
          { "asset": "SOL", "correlation": 0.79, "delta_7d": 0.07 }
        ]
      }
    ],
    "edges": [
      {
        "source": "BTC",
        "target": "ETH",
        "correlation": 0.84,
        "abs_correlation": 0.84,
        "delta_7d": 0.09,
        "band": "high",
        "trend": "tightening"
      }
    ]
  }
}
```

**10. Frontend Implementation Requirements**
- Remove the hardcoded `Risk Score` from the dashboard container and render backend-derived summary values.
- Remove the current circular demo layout and switch to a force-based or cluster-aware layout.
- Replace inline-only visual styling with a component structure that supports:
  - insight strip
  - summary row
  - graph canvas
  - inspector panel
  - legend
- Keep the graph readable when the portfolio has 3 assets and when it has 15 assets.
- If the portfolio has fewer than 2 meaningful assets, do not render a network. Render a concentration explanation instead.
- If the portfolio has exactly 2 assets, render a simplified pair-risk view instead of a full graph metaphor.

**11. Backend Implementation Requirements**
- Stop using mock positions for contagion output.
- Base node weights on real user holdings or open positions.
- Extend graph calculation beyond raw node and edge output to include summary insight fields.
- Add 7-day delta calculations for both network-level and edge-level change.
- Introduce a regime classification step before building the response.
- Retain a thresholding strategy that avoids clutter and preserves stable graph sparsity.

**12. Copy and Microcopy Rules**
- Use plain risk language, not research language.
- Avoid words like `causal`, `systemic propagation mechanism`, or `nonlinear network topology` in the UI.
- Prefer phrases like:
  - `most connected risk source`
  - `moving together`
  - `dependency tightening`
  - `cluster risk`
  - `stress regime`
- Every summary sentence must be actionable and asset-specific.

**13. Non-Goals for MVP**
- Do not build a full timeline scrubber.
- Do not expose raw correlation matrices.
- Do not expose negative edges by default.
- Do not claim predictive certainty.
- Do not implement a GNN-based model in MVP just because the research paper used one.

**14. Acceptance Criteria**
- A user can identify the main contagion source without clicking anything.
- Every visible node and edge has a documented semantic meaning.
- The score, regime, insight sentence, and top risk pair are all data-driven.
- Clicking an asset reveals enough context to explain why it matters.
- The graph does not degrade into visual noise for medium-sized portfolios.
- The module gracefully handles empty, low-data, and high-volatility states.
- The redesign improves comprehension, not just aesthetics.

**15. Important Delivery Constraint**
- This redesign is not a CSS-only task.
- Visual improvement alone is insufficient because the current data contract does not support meaningful contagion communication.
- Existing dashboard fetching and WebSocket logic can remain, but the contagion endpoint and graph component both require structural changes.
