# Graph Report - .  (2026-04-19)

## Corpus Check
- 127 files · ~214,314 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 656 nodes · 1265 edges · 32 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 208 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `MongoBaseDocument` - 62 edges
2. `EncryptionConfigError` - 26 edges
3. `RiskHub — Pydantic Models Package ================================== Maps the 4` - 21 edges
4. `RawExchangeData` - 20 edges
5. `TradeHistoryDocument` - 20 edges
6. `AccountType` - 19 edges
7. `TradeSide` - 19 edges
8. `PositionSide` - 19 edges
9. `PnlCategory` - 19 edges
10. `HistoryRecordType` - 19 edges

## Surprising Connections (you probably didn't know these)
- `RiskHub — ``trade_history`` Collection Model ===================================` --uses--> `MongoBaseDocument`  [INFERRED]
  backend\models\trade_history.py → backend\models\base.py
- `Original CCXT response payload — embedded for auditability.     The ``info`` dic` --uses--> `MongoBaseDocument`  [INFERRED]
  backend\models\trade_history.py → backend\models\base.py
- `Root Pydantic model for the ``trade_history`` MongoDB collection.      Every clo` --uses--> `MongoBaseDocument`  [INFERRED]
  backend\models\trade_history.py → backend\models\base.py
- `RiskHub — Dashboard REST API ============================== Endpoints for the fr` --uses--> `EncryptionConfigError`  [INFERRED]
  backend\api\dashboard.py → backend\security.py
- `Recursively convert BSON types (ObjectId, Decimal128, datetime) to     JSON-safe` --uses--> `EncryptionConfigError`  [INFERRED]
  backend\api\dashboard.py → backend\security.py

## Communities

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (64): AlertCategory, AlertSeverity, AlertsLogDocument, DeliveryStatus, RiskHub — ``alerts_log`` Collection Model ======================================, Snapshot of the exact data that caused the Quant Engine rule to fire.      Each, Tracks whether the alert was successfully pushed to the user., Root Pydantic model for the ``alerts_log`` MongoDB collection.      One document (+56 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (62): _build_alert_history_query(), _build_dashboard_overview(), _build_triggered_filter(), _determine_sync_status_for_error(), _expand_severity_query_values(), _extract_base_asset(), _format_day_label(), get_alert_history() (+54 more)

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (55): _apply_binance_sandbox_profile(), _attach_ccxt_threaded_dns_session(), _binance_position_signed_qty(), _binance_profile_candidates(), _binance_profiles_for_environment(), _build_binance_closed_position_documents(), _build_binance_income_group_closed_position_documents(), _build_closed_position_document() (+47 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (9): buildConnectionLabel(), formatEnumLabel(), getExchangeMeta(), handleDeleteConnection(), readErrorMessage(), formatCurrency(), toNumber(), readErrorMessage() (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (7): buildSummaryGroups(), deriveDisciplineTrend(), formatContagionRiskPair(), formatCurrency(), formatNumber(), formatPercent(), toNumber()

### Community 5 - "Community 5"
Cohesion: 0.08
Nodes (41): _compute_additional_metrics(), _compute_discipline_score(), _compute_exchange_breakdown(), _compute_leverage_stats(), _compute_max_drawdown(), _compute_win_rate(), _eval_rq001_revenge_trading(), _eval_rq002_overtrading() (+33 more)

### Community 6 - "Community 6"
Cohesion: 0.07
Nodes (18): appendCsvParam(), buildAlertHistoryPath(), buildAlertMarkReadPath(), fetchAlertHistory(), fetchAlertRelatedTrades(), markAlertRead(), markAllAlertsRead(), markFilteredAlertsRead() (+10 more)

### Community 7 - "Community 7"
Cohesion: 0.08
Nodes (28): close_mongo_connection(), connect_to_mongo(), ensure_indexes(), get_database(), get_database_name(), get_mongo_url(), RiskHub - Asynchronous MongoDB Connection Layer ================================, Read the connection string from env; fall back to localhost for dev. (+20 more)

### Community 8 - "Community 8"
Cohesion: 0.06
Nodes (11): clamp01(), dependencyStrength(), edgeParticleConfig(), edgeWidthByDependency(), hasNodeFlag(), resolveInfluenceDirection(), safeNumber(), computeFocusLayout() (+3 more)

### Community 9 - "Community 9"
Cohesion: 0.16
Nodes (28): _build_behavior_flags_summary(), _build_compare_row(), _build_compare_rows(), _build_current_profile(), compare_saved_with_latest(), _dedupe_strings(), _derive_identity_tier(), _derive_profile_status() (+20 more)

### Community 10 - "Community 10"
Cohesion: 0.35
Nodes (25): RiskHub — Exchange Data Ingestion Service ======================================, Fallback for Binance testnet accounts where user-trade and closed-order     hist, Fetch closed trades from an exchange via CCXT and upsert them into     the ``tra, Fetch closed-position history from an exchange and upsert it into     ``trade_hi, Fetch currently open Futures positions from the exchange.      Returns a list of, Fetch Spot account balances and best-effort USD valuations., Validate Binance Testnet Futures credentials by confirming authenticated     rea, Build a live account overview without relying on historical trade volume. (+17 more)

### Community 11 - "Community 11"
Cohesion: 0.15
Nodes (20): _clean_credential_input(), connect_exchange(), ConnectExchangeRequest, ConnectExchangeResponse, delete_connection(), DeleteExchangeResponse, ExchangeKeysListResponse, list_exchange_keys() (+12 more)

### Community 12 - "Community 12"
Cohesion: 0.15
Nodes (19): calculate_contagion_graph(), _classify_regime(), _compute_contagion_risk_score(), _compute_correlation_matrix(), _compute_realised_volatility(), _edge_band(), _edge_trend(), _empty_response() (+11 more)

### Community 13 - "Community 13"
Cohesion: 0.16
Nodes (11): arr(), label(), money(), num(), pct(), pretty(), rec(), RiskAnalysisScreen() (+3 more)

### Community 14 - "Community 14"
Cohesion: 0.11
Nodes (10): ConnectionManager, _json_serialiser(), RiskHub — WebSocket Connection Manager ========================================, Push a JSON message to ALL active connections for a specific user.          Retu, Push a message to ALL connected users (e.g., system announcements)., Custom serialiser for JSON-incompatible types in alert payloads., Manages active WebSocket connections mapped by ``user_id``.      Usage::, Accept and register a new WebSocket connection for a user. (+2 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (15): BalancesRequest, get_balances(), get_positions(), PositionsRequest, RiskHub — Trade Sync API Router ================================ POST /api/v1/sy, Fetch currently open Futures positions from the exchange.      Positions are eph, Fetch Spot account balances from the exchange.      Balances are ephemeral — ret, Request body for triggering a trade history sync. (+7 more)

### Community 16 - "Community 16"
Cohesion: 0.42
Nodes (9): _build_empty_response(), _build_quant_summary(), _compute_scope_quant_fallback(), _dedupe_warnings(), get_risk_analysis_overview(), _optional_float(), _preferred_trade_history_query(), _safe_int() (+1 more)

### Community 17 - "Community 17"
Cohesion: 0.32
Nodes (5): main(), RiskHub -- Exchange Connectivity Test Suite ====================================, Wrap a coroutine as a named test with timing., run_test(), TestResult

### Community 18 - "Community 18"
Cohesion: 0.48
Nodes (6): _build_reason(), calculate_risk_overview(), _clamp(), _extract_base_asset(), Deterministic v1 portfolio-risk decomposition.      The model is intentionally h, _safe_float()

### Community 19 - "Community 19"
Cohesion: 0.5
Nodes (3): RiskHub — Quant Engine API Router =================================== POST /api/, Manually trigger the Behavioral Quant Engine for a single user.      Steps execu, trigger_engine()

### Community 20 - "Community 20"
Cohesion: 0.5
Nodes (3): RiskHub — WebSocket Endpoint Router ===================================== ws://., Per-user WebSocket connection for real-time alert delivery.      Protocol:, websocket_alerts_endpoint()

### Community 21 - "Community 21"
Cohesion: 0.5
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (1): Return list of user_ids with active connections.

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (1): Total number of active WebSocket connections across all users.

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **74 isolated node(s):** `RiskHub - Asynchronous MongoDB Connection Layer ================================`, `Read the connection string from env; fall back to localhost for dev.`, `Read the database name from env; default to 'riskhub'.`, `Create the Motor client with MVP-tuned pool settings and verify     connectivity`, `Gracefully close the Motor client.  Called from ``shutdown``.` (+69 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 23`** (2 nodes): `parse_pdf.py`, `extract_text()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `layout.tsx`, `RootLayout()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (1 nodes): `extract.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (1 nodes): `Return list of user_ids with active connections.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (1 nodes): `Total number of active WebSocket connections across all users.`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (1 nodes): `ConnectBinanceTestnetModal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (1 nodes): `ContagionGraph.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (1 nodes): `SbtAdvancedDetails.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `MongoBaseDocument` connect `Community 0` to `Community 10`?**
  _High betweenness centrality (0.066) - this node is a cross-community bridge._
- **Why does `SaveRiskProfileRequest` connect `Community 0` to `Community 9`?**
  _High betweenness centrality (0.040) - this node is a cross-community bridge._
- **Why does `EncryptionConfigError` connect `Community 1` to `Community 11`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Are the 59 inferred relationships involving `MongoBaseDocument` (e.g. with `AlertSeverity` and `AlertCategory`) actually correct?**
  _`MongoBaseDocument` has 59 INFERRED edges - model-reasoned connections that need verification._
- **Are the 21 inferred relationships involving `EncryptionConfigError` (e.g. with `RiskHub — Dashboard REST API ============================== Endpoints for the fr` and `Recursively convert BSON types (ObjectId, Decimal128, datetime) to     JSON-safe`) actually correct?**
  _`EncryptionConfigError` has 21 INFERRED edges - model-reasoned connections that need verification._
- **Are the 20 inferred relationships involving `RiskHub — Pydantic Models Package ================================== Maps the 4` (e.g. with `UserDocument` and `WalletSubdocument`) actually correct?**
  _`RiskHub — Pydantic Models Package ================================== Maps the 4` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `RawExchangeData` (e.g. with `MongoBaseDocument` and `RiskHub — Pydantic Models Package ================================== Maps the 4`) actually correct?**
  _`RawExchangeData` has 17 INFERRED edges - model-reasoned connections that need verification._