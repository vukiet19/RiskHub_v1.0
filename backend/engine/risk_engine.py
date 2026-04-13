from __future__ import annotations

from typing import Any


def _safe_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(value, high))


def _extract_base_asset(symbol: str) -> str:
    clean = (symbol or "").split(":")[0]
    if "/" in clean:
        return clean.split("/")[0]

    for suffix in ("USDT", "USDC", "BUSD", "FDUSD", "USD", "BTC", "ETH"):
        if clean.endswith(suffix) and len(clean) > len(suffix):
            return clean[: -len(suffix)]
    return clean or "UNKNOWN"


def _build_reason(parts: list[str]) -> str:
    return " ".join(part for part in parts if part)


def calculate_risk_overview(
    positions: list[dict[str, Any]],
    holdings: dict[str, float],
    contagion_graph: dict[str, Any] | None,
    warnings: list[str] | None = None,
) -> dict[str, Any]:
    """
    Deterministic v1 portfolio-risk decomposition.

    The model is intentionally heuristic rather than statistical:
    - concentration = exposure dominance across holdings
    - leverage = effective, average, and max leverage from open positions
    - drawdown = current unrealised pressure relative to total exposure
    - contagion = summary score from the existing correlation engine
    """
    warnings = warnings or []
    contagion_graph = contagion_graph or {}
    contagion_summary = contagion_graph.get("summary") or {}
    contagion_nodes = contagion_graph.get("nodes") or []

    asset_systemic_scores = {
        str(node.get("id")): _safe_float(node.get("systemic_score"))
        for node in contagion_nodes
        if node.get("id")
    }

    total_portfolio_value = round(sum(max(_safe_float(value), 0.0) for value in holdings.values()), 2)
    sorted_holdings = sorted(
        ((asset, round(max(_safe_float(value), 0.0), 2)) for asset, value in holdings.items()),
        key=lambda item: item[1],
        reverse=True,
    )
    top_asset, top_asset_value = sorted_holdings[0] if sorted_holdings else ("None", 0.0)
    top_asset_pct = (top_asset_value / total_portfolio_value * 100) if total_portfolio_value > 0 else 0.0

    total_notional = sum(abs(_safe_float(position.get("notional"))) for position in positions)
    leverage_values = [
        max(_safe_float(position.get("leverage", 1)), 1.0)
        for position in positions
    ]
    average_leverage = sum(leverage_values) / len(leverage_values) if leverage_values else 0.0
    max_leverage = max(leverage_values) if leverage_values else 0.0
    effective_leverage = (total_notional / total_portfolio_value) if total_portfolio_value > 0 else 0.0

    total_unrealized = sum(_safe_float(position.get("unrealized_pnl")) for position in positions)
    drawdown_pct = (
        abs(total_unrealized) / total_portfolio_value * 100
        if total_portfolio_value > 0 and total_unrealized < 0
        else 0.0
    )
    worst_position = min(
        positions,
        key=lambda position: _safe_float(position.get("unrealized_pnl")),
        default=None,
    )

    largest_cluster = contagion_summary.get("largest_cluster") or {}
    largest_cluster_pct = _safe_float(largest_cluster.get("total_weight_pct"))
    contagion_score = _safe_float(contagion_summary.get("contagion_risk_score"))
    contagion_available = bool(contagion_nodes)

    concentration_score = _clamp((top_asset_pct - 20.0) * 2.5 + (largest_cluster_pct * 0.35))
    leverage_score = _clamp((effective_leverage * 16.0) + (average_leverage * 3.0) + max(max_leverage - 8.0, 0.0) * 4.0)
    drawdown_score = _clamp((drawdown_pct * 3.6) + (12.0 if worst_position and _safe_float(worst_position.get("unrealized_pnl")) < 0 else 0.0))

    total_risk_score = (
        concentration_score * 0.28 +
        leverage_score * 0.32 +
        drawdown_score * 0.18 +
        contagion_score * 0.22
    )
    if warnings:
        total_risk_score = min(total_risk_score + 4.0, 100.0)

    position_assets = {
        _extract_base_asset(str(position.get("symbol") or "UNKNOWN"))
        for position in positions
    }
    asset_exposure_lookup: dict[str, dict[str, Any]] = {}
    asset_exposure_entries: list[dict[str, Any]] = []

    for asset, exposure_value in sorted_holdings[:5]:
        asset_weight_pct = (exposure_value / total_portfolio_value * 100) if total_portfolio_value > 0 else 0.0
        systemic_score = asset_systemic_scores.get(asset, 0.0)
        contributor_score = _clamp((asset_weight_pct * 1.15) + (systemic_score * 0.45))
        reason_parts = [
            f"{asset} accounts for {asset_weight_pct:.1f}% of scoped exposure.",
            f"Systemic linkage score is {systemic_score:.1f}." if systemic_score > 0 else "",
            "This concentration can dominate portfolio moves." if asset_weight_pct >= 25 else "",
        ]
        exposure_entry = {
            "id": f"asset:{asset}",
            "type": "asset",
            "label": asset,
            "value_usd": round(exposure_value, 2),
            "weight_pct": round(asset_weight_pct, 2),
            "contributor_score": round(contributor_score, 1),
            "why": _build_reason(reason_parts),
            "flags": [
                flag
                for flag in (
                    "dominant_exposure" if asset_weight_pct >= 30 else None,
                    "contagion_core" if systemic_score >= 35 else None,
                )
                if flag
            ],
        }
        asset_exposure_lookup[asset] = exposure_entry
        if asset not in position_assets:
            asset_exposure_entries.append(exposure_entry)

    top_risk_contributors: list[dict[str, Any]] = list(asset_exposure_entries)

    for position in positions:
        symbol = str(position.get("symbol") or "UNKNOWN")
        base_asset = _extract_base_asset(symbol)
        notional = abs(_safe_float(position.get("notional")))
        leverage = max(_safe_float(position.get("leverage", 1)), 1.0)
        unrealized_pnl = _safe_float(position.get("unrealized_pnl"))
        notional_share_pct = (notional / total_notional * 100) if total_notional > 0 else 0.0
        pnl_pressure = abs(min(unrealized_pnl, 0.0)) / notional * 100 if notional > 0 else 0.0
        systemic_score = asset_systemic_scores.get(base_asset, 0.0)
        contributor_score = _clamp(
            notional_share_pct * 0.75 +
            leverage * 5.0 +
            pnl_pressure * 1.6 +
            systemic_score * 0.22
        )
        if contributor_score < 25:
            continue

        reasons = [
            f"{symbol} carries {notional_share_pct:.1f}% of total notional.",
            f"Leverage is {leverage:.1f}x." if leverage >= 4 else "",
            f"Unrealized loss pressure is {pnl_pressure:.1f}% of notional." if unrealized_pnl < 0 and pnl_pressure > 0 else "",
            f"{base_asset} is tightly linked inside the dependency graph." if systemic_score >= 35 else "",
        ]
        top_risk_contributors.append(
            {
                "id": f"position:{position.get('exchange_id') or 'unknown'}:{symbol}:{position.get('side') or 'long'}",
                "type": "position",
                "label": symbol,
                "exchange_id": position.get("exchange_id"),
                "side": position.get("side"),
                "value_usd": round(notional, 2),
                "weight_pct": round(notional_share_pct, 2),
                "contributor_score": round(contributor_score, 1),
                "why": _build_reason(reasons),
                "underlying_exposure": asset_exposure_lookup.get(base_asset),
                "flags": [
                    flag
                    for flag in (
                        "high_leverage" if leverage >= 8 else None,
                        "loss_making" if unrealized_pnl < 0 else None,
                        "contagion_core" if systemic_score >= 35 else None,
                    )
                    if flag
                ],
            }
        )

    top_risk_contributors.sort(
        key=lambda contributor: (_safe_float(contributor.get("contributor_score")), _safe_float(contributor.get("value_usd"))),
        reverse=True,
    )
    top_risk_contributors = top_risk_contributors[:6]

    exchange_notional: dict[str, float] = {}
    for position in positions:
        exchange_id = str(position.get("exchange_id") or "unknown")
        exchange_notional[exchange_id] = exchange_notional.get(exchange_id, 0.0) + abs(_safe_float(position.get("notional")))
    dominant_exchange = max(exchange_notional.items(), key=lambda item: item[1], default=("unknown", 0.0))
    dominant_exchange_pct = (
        dominant_exchange[1] / total_notional * 100
        if total_notional > 0 else 0.0
    )

    concentration_insight_parts = []
    if top_asset_pct >= 35:
        concentration_insight_parts.append(f"{top_asset} is the dominant exposure at {top_asset_pct:.1f}% of the scoped book.")
    if largest_cluster_pct >= 45:
        cluster_label = largest_cluster.get("label") or "largest dependency cluster"
        concentration_insight_parts.append(f"{cluster_label} concentrates {largest_cluster_pct:.1f}% of dependency weight.")
    if dominant_exchange_pct >= 65:
        concentration_insight_parts.append(
            f"{dominant_exchange[0]} carries {dominant_exchange_pct:.1f}% of open-position notional."
        )
    concentration_insight = (
        " ".join(concentration_insight_parts)
        if concentration_insight_parts
        else "Exposure is not dominated by a single asset or exchange, but the largest weights still deserve monitoring."
    )

    leverage_insight = (
        f"Effective leverage is {effective_leverage:.2f}x across the scoped portfolio."
        if total_notional > 0
        else "No live futures notional is currently available in this scope."
    )
    if max_leverage >= 10:
        leverage_insight += f" The highest individual position is running at {max_leverage:.1f}x."

    worst_position_symbol = worst_position.get("symbol") if worst_position else None
    worst_position_pnl = _safe_float(worst_position.get("unrealized_pnl")) if worst_position else 0.0
    drawdown_insight = (
        f"Current unrealized drawdown is {drawdown_pct:.1f}% of scoped exposure."
        if total_unrealized < 0
        else "No current unrealized drawdown is visible from live positions."
    )
    if worst_position_symbol and worst_position_pnl < 0:
        drawdown_insight += f" The heaviest live drag is {worst_position_symbol} at ${worst_position_pnl:.2f}."

    if contagion_available:
        contagion_insight = str(contagion_summary.get("insight") or "").strip()
    elif len(holdings) < 2:
        contagion_insight = "Contagion analysis is limited because this scope has fewer than two meaningful assets."
    else:
        contagion_insight = "Contagion analysis is currently limited because market data coverage is incomplete."

    position_risk_rows: list[dict[str, Any]] = []
    row_risk_total = 0.0

    for position in positions:
        symbol = str(position.get("symbol") or "UNKNOWN")
        base_asset = _extract_base_asset(symbol)
        side = str(position.get("side") or "long")
        exchange_id = str(position.get("exchange_id") or "unknown")
        leverage = max(_safe_float(position.get("leverage", 1)), 1.0)
        notional = abs(_safe_float(position.get("notional")))
        unrealized_pnl = _safe_float(position.get("unrealized_pnl"))
        exposure_share_pct = (notional / total_notional * 100) if total_notional > 0 else 0.0
        asset_weight_pct = (holdings.get(base_asset, 0.0) / total_portfolio_value * 100) if total_portfolio_value > 0 else 0.0
        systemic_score = asset_systemic_scores.get(base_asset, 0.0)
        loss_pressure_pct = abs(min(unrealized_pnl, 0.0)) / notional * 100 if notional > 0 else 0.0
        row_risk_score = _clamp(
            exposure_share_pct * 0.9 +
            leverage * 5.0 +
            loss_pressure_pct * 1.8 +
            systemic_score * 0.25 +
            asset_weight_pct * 0.3
        )
        row_risk_total += row_risk_score

        risk_flags = [
            flag
            for flag in (
                "high_leverage" if leverage >= 8 else None,
                "sized_large" if exposure_share_pct >= 25 else None,
                "loss_making" if unrealized_pnl < 0 else None,
                "contagion_core" if systemic_score >= 35 else None,
                "concentrated_asset" if asset_weight_pct >= 30 else None,
            )
            if flag
        ]
        explanation = _build_reason(
            [
                f"{symbol} represents {exposure_share_pct:.1f}% of open notional." if exposure_share_pct > 0 else "",
                f"Leverage is {leverage:.1f}x." if leverage >= 4 else "",
                f"Current unrealized PnL is ${unrealized_pnl:.2f}.",
                f"{base_asset} carries {asset_weight_pct:.1f}% asset concentration." if asset_weight_pct >= 20 else "",
                f"{base_asset} systemic score is {systemic_score:.1f}." if systemic_score >= 20 else "",
            ]
        )

        position_risk_rows.append(
            {
                "symbol": symbol,
                "base_asset": base_asset,
                "exchange_id": exchange_id,
                "side": side,
                "leverage": round(leverage, 2),
                "notional": round(notional, 2),
                "exposure_usd": round(notional, 2),
                "unrealized_pnl": round(unrealized_pnl, 2),
                "risk_score": round(row_risk_score, 1),
                "risk_flags": risk_flags,
                "explanation": explanation,
                "underlying_exposure": asset_exposure_lookup.get(base_asset),
            }
        )

    position_risk_rows.sort(key=lambda row: row["risk_score"], reverse=True)
    for row in position_risk_rows:
        row["risk_contribution_pct"] = round(
            (_safe_float(row.get("risk_score")) / row_risk_total * 100) if row_risk_total > 0 else 0.0,
            2,
        )

    asset_exposures = {asset: _safe_float(value) for asset, value in holdings.items()}
    btc_exposure = asset_exposures.get("BTC", 0.0)
    eth_exposure = asset_exposures.get("ETH", 0.0)
    broad_shock_multiplier = max(1.0, effective_leverage * 0.7)
    cluster_stress_multiplier = max(0.5, min(contagion_score / 100.0, 1.0))
    dominant_cluster_pct = largest_cluster_pct / 100.0 if largest_cluster_pct > 0 else 0.0
    btc_impact_pct = round((btc_exposure / total_portfolio_value * 20.0) if total_portfolio_value > 0 else 0.0, 2)
    eth_impact_pct = round((eth_exposure / total_portfolio_value * 20.0) if total_portfolio_value > 0 else 0.0, 2)
    btc_severity = "high" if total_portfolio_value > 0 and (btc_exposure / total_portfolio_value) >= 0.25 else "moderate"
    eth_severity = "high" if total_portfolio_value > 0 and (eth_exposure / total_portfolio_value) >= 0.25 else "moderate"

    scenario_results = [
        {
            "scenario_id": "btc_shock",
            "name": "BTC -20% Shock",
            "shock_pct": -20,
            "estimated_pnl_impact": round(-(btc_exposure * 0.20 * max(1.0, effective_leverage)), 2),
            "impact_pct_of_portfolio": btc_impact_pct,
            "severity": btc_severity,
            "description": "Direct BTC downside shock amplified by current leverage.",
        },
        {
            "scenario_id": "eth_shock",
            "name": "ETH -20% Shock",
            "shock_pct": -20,
            "estimated_pnl_impact": round(-(eth_exposure * 0.20 * max(1.0, effective_leverage)), 2),
            "impact_pct_of_portfolio": eth_impact_pct,
            "severity": eth_severity,
            "description": "ETH downside shock using the same leverage amplification rule.",
        },
        {
            "scenario_id": "broad_selloff",
            "name": "Broad Market -15% Selloff",
            "shock_pct": -15,
            "estimated_pnl_impact": round(-(total_portfolio_value * 0.15 * broad_shock_multiplier), 2),
            "impact_pct_of_portfolio": round(15.0 * broad_shock_multiplier, 2) if total_portfolio_value > 0 else 0.0,
            "severity": "high" if effective_leverage >= 2.5 else "moderate",
            "description": "Market-wide downside stress assuming diversification weakens as leverage rises.",
        },
        {
            "scenario_id": "contagion_tightening",
            "name": "Dependency Tightening / Contagion Stress",
            "shock_pct": None,
            "estimated_pnl_impact": round(-(total_portfolio_value * dominant_cluster_pct * 0.12 * (1.0 + cluster_stress_multiplier)), 2),
            "impact_pct_of_portfolio": round(dominant_cluster_pct * 12.0 * (1.0 + cluster_stress_multiplier), 2),
            "severity": "high" if contagion_score >= 55 else "moderate",
            "description": "Largest dependency cluster reprices together as correlations tighten.",
        },
    ]

    attention_items: list[dict[str, Any]] = []
    if top_asset_pct >= 35:
        attention_items.append(
            {
                "severity": "high",
                "title": "Reduce dominant asset concentration",
                "detail": f"{top_asset} currently represents {top_asset_pct:.1f}% of scoped exposure.",
                "source": "concentration",
            }
        )
    if max_leverage >= 10:
        attention_items.append(
            {
                "severity": "high",
                "title": "Trim highest-leverage position",
                "detail": f"The book contains at least one {max_leverage:.1f}x position, which leaves less room for error under stress.",
                "source": "leverage",
            }
        )
    if worst_position_symbol and worst_position_pnl < 0:
        attention_items.append(
            {
                "severity": "moderate",
                "title": "Review the largest unrealized drag",
                "detail": f"{worst_position_symbol} is the biggest current drawdown driver at ${worst_position_pnl:.2f}.",
                "source": "drawdown",
            }
        )
    if contagion_score >= 55 and largest_cluster.get("label"):
        attention_items.append(
            {
                "severity": "moderate",
                "title": "Monitor cluster dependency",
                "detail": f"{largest_cluster['label']} holds {largest_cluster_pct:.1f}% of dependency weight while contagion risk is elevated.",
                "source": "contagion",
            }
        )
    if warnings:
        attention_items.append(
            {
                "severity": "moderate",
                "title": "Analysis is running with partial inputs",
                "detail": warnings[0],
                "source": "source_state",
            }
        )
    if not attention_items:
        attention_items.append(
            {
                "severity": "low",
                "title": "No single urgent risk dominates",
                "detail": "The current heuristic pass does not find one overwhelming concentration, leverage, or contagion issue.",
                "source": "overview",
            }
        )

    return {
        "risk_score_total": round(total_risk_score, 1),
        "risk_components": {
            "concentration_score": round(concentration_score, 1),
            "leverage_score": round(leverage_score, 1),
            "drawdown_score": round(drawdown_score, 1),
            "contagion_score": round(contagion_score, 1),
        },
        "top_risk_contributors": top_risk_contributors,
        "concentration_summary": {
            "top_asset": top_asset,
            "top_asset_value": round(top_asset_value, 2),
            "top_asset_pct": round(top_asset_pct, 2),
            "largest_cluster": largest_cluster,
            "largest_cluster_pct": round(largest_cluster_pct, 2),
            "dominant_exchange": dominant_exchange[0],
            "dominant_exchange_pct": round(dominant_exchange_pct, 2),
            "insight": concentration_insight,
        },
        "leverage_summary": {
            "effective_leverage": round(effective_leverage, 2),
            "average_leverage": round(average_leverage, 2),
            "max_leverage": round(max_leverage, 2),
            "total_notional": round(total_notional, 2),
            "insight": leverage_insight,
        },
        "drawdown_summary": {
            "current_drawdown_pct": round(drawdown_pct, 2),
            "total_unrealized_pnl": round(total_unrealized, 2),
            "worst_position_symbol": worst_position_symbol,
            "worst_position_pnl": round(worst_position_pnl, 2),
            "insight": drawdown_insight,
        },
        "contagion_summary": {
            "available": contagion_available,
            "source_state": "available" if contagion_available else "insufficient_data",
            "contagion_risk_score": round(contagion_score, 1),
            "contagion_risk_delta_7d": round(_safe_float(contagion_summary.get("contagion_risk_delta_7d")), 1),
            "systemic_asset": contagion_summary.get("systemic_asset"),
            "top_risk_pair": contagion_summary.get("top_risk_pair"),
            "largest_cluster": largest_cluster,
            "network_density": round(_safe_float(contagion_summary.get("network_density")), 2),
            "insight": contagion_insight,
        },
        "scenario_results": scenario_results,
        "position_risk_rows": position_risk_rows,
        "attention_items": attention_items[:4],
    }
