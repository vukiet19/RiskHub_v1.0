You are the backend implementation owner for the new `Portfolio Contagion Map` contract in RiskHub.

Project root:
`D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0`

Read these files first and treat them as the source of truth:
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Backend Alignment Brief - Overview Focus Inspector.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Integration Brief - Overview Focus Inspector.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Frontend Implementation Brief - Overview Focus Inspector.md`

Inspect the current backend implementation before changing anything:
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\backend\api\dashboard.py`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\backend\engine\correlation_engine.py`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\backend\services\exchange_service.py`
- any contagion-related helper modules already present

Your job:
Stabilize the backend contagion payload so the frontend can implement the approved `Overview + Focus + Inspector` desktop layout without guessing graph semantics.

This is not just a field-addition task.
You are defining the safe contract that prevents the frontend from misrepresenting the network.

Non-negotiable rules:
- Do not return mock holdings in the normal connected path.
- Do not overclaim causal contagion.
- Do not leave the default selected asset undefined.
- Do not force the frontend to infer the largest cluster from scratch if the backend can determine it.
- Do not return a dense raw edge list without guidance for overview and focus rendering.
- Do not silently rename contract fields from the integration brief.

Shared contract rule:
- The integration brief is the shared contract between you and the frontend agent.
- Your payload must support that exact module shape:
  - `Network Overview`
  - `Focus View`
  - `Asset Inspector`

Primary implementation outcomes:
1. Stabilize `/api/v1/dashboard/{user_id}/contagion`.
2. Return a payload that includes:
   - `generated_at`
   - `window_days`
   - `regime`
   - `summary`
   - `nodes`
   - `edges`
   - `clusters`
   - `display`
3. Make `summary.systemic_asset` and `display.default_selected_asset` explicit and consistent.
4. Return explicit cluster summary so the frontend does not reverse-engineer it.
5. Return explicit edge ranking and topology semantics so overview and focus rendering can remain sparse and honest.

Specific contract requirements:

Summary must include:
- `contagion_risk_score`
- `contagion_risk_delta_7d`
- `systemic_asset`
- `top_risk_pair`
- `largest_cluster`
- `network_density`
- `insight`

Nodes must include:
- `id`
- `label`
- `value_usd`
- `weight_pct`
- `daily_move_pct`
- `systemic_score`
- `cluster_id`
- `cluster_role`
- `top_correlations`

Edges must include:
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

Clusters must include:
- `id`
- `label`
- `members`
- `member_count`
- `total_weight_pct`
- `systemic_asset`
- `risk_level`

Display guidance must include:
- `display.default_selected_asset`
- `display.overview.node_ids`
- `display.overview.edge_ids`
- `display.focus.max_primary_links`
- `display.focus.max_context_links`

Semantic requirements:
- `summary.systemic_asset` must be the default focus node
- `summary.largest_cluster` must be directly usable by the frontend metrics row
- `display.overview.edge_ids` must represent a sparse topology-preserving subset, not the full edge list
- `topology_role` must help separate `primary`, `secondary`, and `context` links
- the payload must be truthful enough that the frontend does not need to invent graph rules

Calculation requirements:
- use current live holdings or positions, not historical trade notional, for present exposure
- compare 7-day change using equivalent windows
- compute `systemic_score` using an interpretable weighted network method
- compute `largest_cluster` using a simple, explainable cluster grouping method
- keep the API honest: this is dependency risk, not causal certainty

Fallback requirements:
- fewer than 2 meaningful assets: return an honest low-data payload
- exactly 2 meaningful assets: return a pair-ready payload
- nodes but no stable edges: return sparse edges plus explanatory summary
- do not fabricate a graph unless `demo=true` is explicitly requested

Implementation discipline:
- keep calculations stable and interpretable for MVP
- favor clear contracts over academic complexity
- support the frontend enough that it can stay mostly declarative

Suggested execution order:
1. inspect the current contagion endpoint and engine
2. stabilize summary fields
3. add clusters and largest cluster logic
4. add display guidance metadata
5. add edge ranking and topology-role semantics
6. verify fallback responses
7. run available checks or smoke tests

When you finish, report exactly:
- files changed
- exact payload fields added or changed
- how `systemic_asset` is computed
- how `largest_cluster` is computed
- how overview-visible edges are selected
- how focus-candidate edges are supported
- what fallback responses are returned
- what remains approximate or future work
