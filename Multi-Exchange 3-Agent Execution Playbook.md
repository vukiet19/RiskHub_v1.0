# RiskHub Multi-Exchange 3-Agent Execution Playbook

## Purpose
This playbook defines how to run the multi-exchange implementation across three agents without losing contract alignment.

Use this playbook only for the approved scope:

- Binance + OKX
- one active account per exchange
- futures first
- globally aggregated dashboard
- Open Positions with exchange badges
- Net PnL by Exchange as a multi-row card
- Manage Connections instead of Connect Binance Testnet
- contagion graph still aggregated by asset

## Operating Rule
All three agents must treat this file as the shared contract source set:

- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Integration Brief.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Frontend Agent Brief.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Backend Agent Brief.md`
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Coordinator Brief.md`

The integration brief is the final authority if any local assumption conflicts with other files.

Do not let any agent redefine the product scope locally.

## Recommended Agent Assignment

### Backend Agent
Recommended model:
- `Gemini 3.1 Pro`

Reason:
- this pass is backend-heavy
- strong need for contract, aggregation, and endpoint reasoning
- connection-model decisions must be locked early

### Frontend Agent
Recommended model:
- `Sonnet 4.6`

Reason:
- this pass requires pragmatic UI restructuring, connection manager work, and dashboard adaptation
- frontend must stay disciplined and not invent backend semantics

### Coordinator Agent
Recommended model:
- `GPT 5.4`

Reason:
- coordinator must verify product semantics, not just code style
- this role needs the strongest cross-file reasoning and contract review

## Execution Order

### Phase 1: Backend first pass
Run backend before frontend or at least start backend first.

Why:
- frontend must not invent the multi-exchange contract
- connection-management semantics must be real before UI is judged complete

Goal of the backend first pass:

- generic connection model
- Binance + OKX support path
- one-active-account-per-exchange enforcement
- exchange ownership in positions
- multi-row `metrics.by_exchange`
- global aggregation semantics
- contagion remains asset-level aggregated

### Phase 2: Frontend first pass
Run frontend after backend has at least stabilized the intended shape.

Goal of the frontend first pass:

- generic `Manage Connections` flow
- remove Binance-only UX framing
- exchange badges in positions
- multi-row Net PnL by Exchange rendering
- preserve global dashboard semantics
- keep contagion graph asset-level aggregated

### Phase 3: Coordinator review
Run coordinator only after both frontend and backend have completed their first pass.

Goal of coordinator:

- inspect code, not reports
- verify frontend/backend contract alignment
- identify hidden Binance-only assumptions
- verify one-active-account-per-exchange is actually enforced
- verify contagion remains asset-level aggregated

## Copy-Paste Prompt Sequence

### 1. Backend agent prompt
Send this to the backend agent:

```text
You are the backend implementation owner for the approved RiskHub multi-exchange expansion.

Project root:
D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0

Read these files first and treat them as binding:
- D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Integration Brief.md
- D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Backend Agent Brief.md

Important rule:
Do not redefine the contract locally. The integration brief is binding.

Implement only the approved scope:
- Binance + OKX
- one active account per exchange
- futures first
- globally aggregated dashboard
- positions with exchange ownership
- multi-row by-exchange PnL
- generic Manage Connections backend support
- contagion remains asset-level aggregated

When finished, report exactly:
- files changed
- new/changed endpoints
- how one-active-account-per-exchange is enforced
- how multi-exchange aggregation works
- how positions expose exchange ownership
- how by-exchange PnL is produced
- how contagion holdings are aggregated across exchanges
- what remains approximate
```

### 2. Frontend agent prompt
Send this to the frontend agent:

```text
You are the frontend implementation owner for the approved RiskHub multi-exchange expansion.

Project root:
D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0

Read these files first and treat them as binding:
- D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Integration Brief.md
- D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Frontend Agent Brief.md

Important rule:
Do not redefine the contract locally. The integration brief is binding.

Implement only the approved scope:
- Binance + OKX
- one active account per exchange
- futures first
- globally aggregated dashboard
- Open Positions with exchange badges
- Net PnL by Exchange as a multi-row card
- Manage Connections instead of Connect Binance Testnet
- contagion remains asset-level aggregated

When finished, report exactly:
- files changed
- how the connection flow changed
- how Binance-only wording was removed
- how Manage Connections works
- how Net PnL by Exchange renders multiple rows
- how Open Positions shows exchange ownership
- what remains backend-dependent
- what was verified
```

### 3. Coordinator review prompt
After backend and frontend are done, send this to the coordinator:

```text
You are the coordinator reviewer for the approved RiskHub multi-exchange expansion.

Project root:
D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0

Read these files first and treat them as binding:
- D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Integration Brief.md
- D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Multi-Exchange Coordinator Brief.md

Important rule:
Review actual code, not just reports.

Review focus:
- hidden Binance-only assumptions
- one-active-account-per-exchange enforcement
- global aggregation correctness
- Open Positions exchange ownership
- Net PnL by Exchange multi-row integrity
- Manage Connections frontend/backend alignment
- contagion remaining asset-level aggregated

Return:
1. findings first, ordered by severity
2. alignment summary
3. open risks
4. final recommendation: Go / Go with fixes / No-go
```

## Review Policy

### What counts as acceptable drift
These are acceptable MVP approximations if explicitly documented:

- heuristic connection health labels
- partial support differences between Binance and OKX
- simplified refresh summary formatting
- conservative UI copy around exchange support

### What does not count as acceptable drift
These must be treated as findings:

- frontend still behaving like Binance-only product UX
- backend allowing multiple active connections for the same exchange
- positions without `exchange_id`
- fake multi-row PnL generated only on the frontend
- contagion split into exchange-specific nodes
- frontend inferring core multi-exchange semantics instead of receiving them

## Fix Loop Guidance

### If coordinator returns `Go`
Move to manual QA.

### If coordinator returns `Go with fixes`
Do a narrow fix pass only.

Rules:

- send backend findings only to backend agent
- send frontend findings only to frontend agent
- do not restart the whole implementation round
- do not widen scope during the fix round

### If coordinator returns `No-go`
Stop and fix the blocking issues before any manual QA or polish.

## Manual QA Recommendations After `Go`

When coordinator returns `Go`, validate at least these cases:

1. no exchange connected
2. Binance only
3. OKX only
4. Binance + OKX both active
5. one exchange succeeds, one exchange fails
6. positions show correct exchange ownership
7. Net PnL by Exchange shows one row vs two rows correctly
8. contagion still shows one BTC node if BTC exists on multiple exchanges
9. connection manager copy is no longer Binance-only

## Final Rule

Do not use this playbook to push beyond the approved multi-exchange scope.

If a change would require:

- multiple accounts per exchange
- asset-by-exchange contagion nodes
- per-exchange dashboard pages
- broad exchange marketplace support

that is a separate phase and must not be smuggled into this pass.
