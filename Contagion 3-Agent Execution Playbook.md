# Contagion 3-Agent Execution Playbook

## Recommended Agent Assignment
- `Gemini 3.1 Pro` -> backend implementation
- `Sonnet 4.6` -> frontend implementation
- `GPT 5.4` -> coordinator review and final alignment

## Operating Rule
All three agents must treat this file as the shared contract:
- `D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Graph Integration Brief - Overview Focus Inspector.md`

Do not let any agent redefine the contract locally.

## Step 1: Backend Agent First Pass
Use `Gemini 3.1 Pro`.

Paste this message:

```text
Read and execute the instructions in this file exactly:
D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Backend Agent Prompt - Overview Focus Inspector.md

Important rules:
- Treat the integration brief as binding
- Do not redefine field names locally
- Do not use mock holdings in the normal connected path
- Report exactly in the format requested by the prompt
```

Expected output from backend agent:
- files changed
- exact payload fields added or changed
- how `systemic_asset` is computed
- how `largest_cluster` is computed
- how overview-visible edges are selected
- how focus-candidate edges are supported
- fallback responses

Do not move to coordinator review before this exists.

## Step 2: Frontend Agent First Pass
Use `Sonnet 4.6`.

Paste this message:

```text
Read and execute the instructions in this file exactly:
D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Frontend Agent Prompt - Overview Focus Inspector.md

Important rules:
- Treat the integration brief as binding
- Do not invent backend semantics
- Do not merge Overview and Focus into one desktop canvas
- Do not render a full mesh in focus mode
- Report exactly in the format requested by the prompt
```

Expected output from frontend agent:
- files changed
- component structure
- selected asset state rules
- overview rendering rules
- focus rendering rules
- routed edge behavior
- fallback states
- backend-dependent blockers

## Step 3: If Backend Contract Is Still Moving
If the backend agent reports contract changes that materially differ from the current brief, send one short follow-up message to the frontend agent:

```text
Re-check your implementation against the backend payload contract that was just finalized.

Do not change the shared semantics.
Only adapt the frontend where necessary to match the agreed integration brief and actual backend field names.

Then report only:
- what changed
- what contract assumptions were updated
- whether any blocker remains
```

Use this only if needed.
Do not create unnecessary extra rounds.

## Step 4: Coordinator Review
Use `GPT 5.4`.

Paste this message:

```text
Read and execute the instructions in this file exactly:
D:\Đại học\Fintech Blockchain Hackathon 2026\source code\v1.0\RiskHub_v1.0\Contagion Coordinator Review Prompt - Overview Focus Inspector.md

Review the completed frontend and backend work as one integrated feature.

Important rules:
- Focus on contract alignment, graph semantics, and fallback honesty
- Do not spend the review mostly on styling
- Return findings first, ordered by severity
- End with a direct Go / Go with fixes / No-go recommendation
```

Expected output from coordinator:
- findings
- alignment summary
- open risks
- go / no-go decision

## Step 5: Fix Round
If the coordinator returns `Go with fixes` or `No-go`:

- send frontend findings only to the frontend agent
- send backend findings only to the backend agent
- do not paste the entire review blindly to both if the issues are scoped

Recommended frontend fix message:

```text
Apply these frontend-specific review findings only.

Do not redesign the module again.
Do not change the shared contract.
Fix the issues, run checks if available, and report:
- files changed
- exact fixes made
- anything still blocked
```

Recommended backend fix message:

```text
Apply these backend-specific review findings only.

Do not change unrelated parts of the payload.
Keep the integration brief contract stable unless a review finding explicitly requires a correction.
Fix the issues, run checks if available, and report:
- files changed
- exact fixes made
- anything still approximate
```

## Step 6: Final Coordinator Pass
After both fix rounds are complete, send the coordinator one final message:

```text
Re-review the contagion feature after the applied fixes.

Return only:
- remaining findings, if any
- final alignment summary
- final recommendation: Go or No-go
```

## Practical Working Rules
- Keep backend and frontend in separate threads.
- Keep coordinator in a third thread.
- Do not ask the coordinator to implement unless you deliberately want it to take over.
- Do not let frontend and backend agents debate architecture with each other directly.
- Use the integration brief as the single source of truth when answers conflict.

## Fast Decision Rule
- If backend contract is unstable -> stop and stabilize backend first
- If backend contract is stable -> let frontend proceed
- If both are implemented -> run coordinator review
- If coordinator finds only minor UI polish issues -> do not restart backend work

## Minimal File Set To Share
At minimum, each agent must have access to:
- the agent-specific prompt file
- the integration brief

Frontend should also get:
- the approved mockup files

Coordinator should also get:
- frontend brief
- backend brief
- actual implementation code paths
