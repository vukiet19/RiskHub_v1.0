"""
RiskHub — Correlation Engine (Portfolio Contagion Map)
======================================================
Computes the full contagion response contract including:
  - Rolling 30-day correlation matrix (current window)
  - Matched 30-day correlation matrix shifted 7 days earlier for delta
  - Per-node: weight_pct, value_usd, daily_move_pct, systemic_score,
              cluster_id, flags, top_correlations
  - Per-edge: correlation, abs_correlation, delta_7d, band, trend
  - Summary:  contagion_risk_score, contagion_risk_delta_7d,
              systemic_asset, top_risk_pair, network_density, insight
  - Regime:   calm / elevated / stress

Design references:
  Contagion Graph Redesign Spec §4-§9
  Contagion Graph Backend Brief §Scope, §Calculation Requirements
"""

from __future__ import annotations

import logging
import math
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import pandas as pd

logger = logging.getLogger("riskhub.engine.correlation")

# ── Edge-band thresholds ────────────────────────────────────────────────
BAND_HIGH = 0.70
BAND_MODERATE = 0.40

# ── Regime thresholds ───────────────────────────────────────────────────
REGIME_STRESS_THRESHOLD = 0.65
REGIME_ELEVATED_THRESHOLD = 0.45


def _compute_correlation_matrix(close_prices: pd.DataFrame) -> pd.DataFrame:
    """Pearson correlation on daily returns (pct_change)."""
    returns = close_prices.pct_change().dropna()
    if returns.shape[0] < 5:
        return pd.DataFrame()
    return returns.corr()


def _compute_realised_volatility(close_prices: pd.DataFrame) -> float:
    """Cross-sectional average annualised realised volatility."""
    returns = close_prices.pct_change().dropna()
    if returns.empty:
        return 0.0
    daily_vols = returns.std()
    annualised = daily_vols * math.sqrt(365)
    return float(annualised.mean())


def _classify_regime(avg_abs_corr: float, realised_vol: float) -> dict:
    """
    Classify market regime from average dependency + realised vol.
    Returns {label, reason}.
    """
    stress_score = (avg_abs_corr * 0.6) + (min(realised_vol, 1.5) / 1.5 * 0.4)

    if stress_score >= REGIME_STRESS_THRESHOLD:
        return {
            "label": "stress",
            "reason": "Cross-asset dependency and realised volatility are both above their recent baseline."
        }
    elif stress_score >= REGIME_ELEVATED_THRESHOLD:
        return {
            "label": "elevated",
            "reason": "Dependencies are strengthening and cluster risk is rising."
        }
    else:
        return {
            "label": "calm",
            "reason": "Relationships are relatively loose and diversification is still working."
        }


def _edge_band(abs_corr: float) -> str:
    if abs_corr >= BAND_HIGH:
        return "high"
    elif abs_corr >= BAND_MODERATE:
        return "moderate"
    return "low"


def _edge_trend(delta_7d: float) -> str:
    if delta_7d > 0.03:
        return "tightening"
    elif delta_7d < -0.03:
        return "loosening"
    return "stable"


def _generate_insight(
    systemic_asset: str,
    top_pair: dict,
    regime_label: str,
    delta_7d: float,
    edge_count: int,
) -> str:
    """Generate a single human-readable insight sentence."""
    if edge_count == 0:
        return "Current portfolio assets are moving largely independently. No significant contagion risk links detected."

    direction = "tightened" if delta_7d > 0 else "loosened" if delta_7d < 0 else "remained stable"

    pair_str = ""
    if top_pair:
        if systemic_asset in (top_pair["source"], top_pair["target"]):
            partner = (
                top_pair["target"]
                if top_pair["source"] == systemic_asset
                else top_pair["source"]
            )
            pair_str = f" Its strongest visible link is with {partner} (dependency: {top_pair['correlation']:.2f})."
        else:
            pair_str = (
                f" The current dominant portfolio pair is "
                f"{top_pair['source']}-{top_pair['target']} "
                f"({top_pair['correlation']:.2f})."
            )

    regime_note = ""
    if regime_label == "stress":
        regime_note = " The current stress regime means drawdown amplification risk is elevated."
    elif regime_label == "elevated":
        regime_note = " Dependencies are above normal, so watch for cluster-level moves."

    return (
        f"{systemic_asset} is currently the most connected risk source in your portfolio."
        f"{pair_str}"
        f" Overall dependency has {direction} over the last 7 days."
        f"{regime_note}"
    )


def _compute_contagion_risk_score(
    corr_matrix: pd.DataFrame,
    weights: Dict[str, float],
    symbols: List[str],
) -> float:
    """
    0-100 score: weighted average of above-threshold absolute correlations.
    Higher score = more concentrated dependency risk.
    """
    if corr_matrix.empty or len(symbols) < 2:
        return 0.0

    total_weighted_corr = 0.0
    total_weight = 0.0

    for i, sym_a in enumerate(symbols):
        for j in range(i + 1, len(symbols)):
            sym_b = symbols[j]
            if sym_a not in corr_matrix.columns or sym_b not in corr_matrix.columns:
                continue
            corr_val = abs(float(corr_matrix.loc[sym_a, sym_b]))
            pair_weight = (weights.get(sym_a, 0) + weights.get(sym_b, 0)) / 200.0
            total_weighted_corr += corr_val * pair_weight
            total_weight += pair_weight

    if total_weight == 0:
        return 0.0

    raw = total_weighted_corr / total_weight
    # Scale to 0-100
    return round(min(max(raw * 100, 0), 100), 1)


def _slice_window(close_prices: pd.DataFrame, window_days: int, offset_days: int = 0) -> pd.DataFrame:
    """
    Return a trailing window of equal length.

    offset_days=0      -> most recent window
    offset_days=7      -> window ending 7 observations before the latest
    """
    if close_prices.empty:
        return close_prices

    end = None if offset_days == 0 else -offset_days
    start = -(window_days + offset_days)
    return close_prices.iloc[start:end]


def calculate_contagion_graph(
    ohlcv_data: Dict[str, List[List[float]]],
    positions: Dict[str, float],
    window_days: int = 30,
) -> Dict[str, Any]:
    """
    Full contagion response contract.

    Parameters
    ----------
    ohlcv_data : dict
        {symbol: [[ts, o, h, l, c, v], ...]}
    positions : dict
        {asset: value_usd}
    window_days : int
        Lookback window for correlation (default 30).

    Returns
    -------
    dict matching the Contagion Graph Redesign Spec §9.
    """
    if not ohlcv_data:
        logger.warning("No OHLCV data provided for correlation engine.")
        return _empty_response(window_days)

    # ── 1. Build price DataFrames ────────────────────────────────────
    price_series: Dict[str, pd.Series] = {}
    for symbol, candles in ohlcv_data.items():
        base_asset = symbol.split('/')[0] if '/' in symbol else symbol
        if not candles:
            continue
        df = pd.DataFrame(candles, columns=['ts', 'o', 'h', 'l', 'c', 'v'])
        df['ts'] = pd.to_datetime(df['ts'], unit='ms')
        df.set_index('ts', inplace=True)
        df = df.sort_index()
        price_series[base_asset] = df['c'].astype(float)

    close_df = pd.DataFrame(price_series)
    close_df.ffill(inplace=True)
    close_df.dropna(inplace=True)

    if close_df.shape[0] < 7 or close_df.shape[1] < 2:
        logger.warning("Not enough data for contagion analysis (rows=%d, cols=%d)",
                        close_df.shape[0], close_df.shape[1])
        return _empty_response(window_days)

    symbols = [s for s in close_df.columns if s in positions]
    if len(symbols) < 2:
        symbols = list(close_df.columns)
    close_df = close_df[symbols] if all(s in close_df.columns for s in symbols) else close_df

    symbols = list(close_df.columns)

    # ── 2. Current and 7-day-ago correlation matrices ────────────────
    current_window = _slice_window(close_df, window_days, offset_days=0)
    corr_current = _compute_correlation_matrix(current_window)

    previous_window = pd.DataFrame()
    corr_7d_ago = pd.DataFrame()
    if close_df.shape[0] >= window_days + 7:
        previous_window = _slice_window(close_df, window_days, offset_days=7)
        corr_7d_ago = _compute_correlation_matrix(previous_window)

    if corr_current.empty:
        return _empty_response(window_days)

    # ── 3. Portfolio weight calculations ─────────────────────────────
    total_value = sum(positions.get(s, 0) for s in symbols)
    if total_value == 0:
        total_value = 1.0  # avoid div-by-zero

    raw_weight_pcts = {
        s: (positions.get(s, 0) / total_value * 100)
        for s in symbols
    }
    weight_pcts = {
        s: round(raw_weight_pcts[s], 2)
        for s in symbols
    }

    # ── 4. Daily move from last 2 close prices ──────────────────────
    daily_moves = {}
    for s in symbols:
        series = close_df[s].dropna()
        if len(series) >= 2:
            prev, last = float(series.iloc[-2]), float(series.iloc[-1])
            daily_moves[s] = round((last - prev) / prev * 100, 2) if prev != 0 else 0.0
        else:
            daily_moves[s] = 0.0

    # ── 5. Build edges (only positive, abs >= BAND_MODERATE) ────────
    edges = []
    edge_set = set()  # for density calculation
    possible_edges = len(symbols) * (len(symbols) - 1) / 2

    for i in range(len(symbols)):
        for j in range(i + 1, len(symbols)):
            sym_a, sym_b = symbols[i], symbols[j]
            if sym_a not in corr_current.columns or sym_b not in corr_current.columns:
                continue

            corr_val = float(corr_current.loc[sym_a, sym_b])
            abs_corr = abs(corr_val)

            # Skip negative correlations for MVP
            if corr_val < 0:
                continue

            # Skip weak correlations
            if abs_corr < BAND_MODERATE:
                continue

            # Delta vs 7 days ago
            if (not corr_7d_ago.empty
                    and sym_a in corr_7d_ago.columns
                    and sym_b in corr_7d_ago.columns):
                corr_7d = float(corr_7d_ago.loc[sym_a, sym_b])
                delta = round(corr_val - corr_7d, 4)
            else:
                delta = 0.0

            band = _edge_band(abs_corr)
            trend = _edge_trend(delta)

            edges.append({
                "id": f"{sym_a}|{sym_b}",
                "source": sym_a,
                "target": sym_b,
                "correlation": round(corr_val, 4),
                "abs_correlation": round(abs_corr, 4),
                "delta_7d": delta,
                "band": band,
                "trend": trend,
                "display_strength": round(abs_corr, 4),
                "topology_role": "context",
            })
            edge_set.add((sym_a, sym_b))

    # ── 6. Network density ──────────────────────────────────────────
    network_density = round(len(edge_set) / possible_edges, 2) if possible_edges > 0 else 0.0

    # ── 7. Systemic score per node ──────────────────────────────────
    # systemic_score = weighted_degree_centrality × portfolio_weight
    degree_sums: Dict[str, float] = {s: 0.0 for s in symbols}
    for edge in edges:
        degree_sums[edge["source"]] += edge["abs_correlation"]
        degree_sums[edge["target"]] += edge["abs_correlation"]

    max_degree = max(degree_sums.values()) if degree_sums else 1.0
    if max_degree == 0:
        max_degree = 1.0

    systemic_scores: Dict[str, float] = {}
    for s in symbols:
        norm_degree = degree_sums[s] / max_degree
        norm_weight = raw_weight_pcts[s] / 100.0
        # Combine: 60% network influence + 40% portfolio weight
        raw_score = norm_degree * 0.6 + norm_weight * 0.4
        systemic_scores[s] = round(raw_score * 100, 1)

    # ── 8. Identify systemic asset ──────────────────────────────────
    systemic_asset = max(symbols, key=lambda s: systemic_scores.get(s, 0))

    # ── 9. Top risk pair ────────────────────────────────────────────
    top_risk_pair = None
    if edges:
        # Score = correlation × combined portfolio importance
        def pair_risk(e):
            combined_weight = (raw_weight_pcts.get(e["source"], 0) + raw_weight_pcts.get(e["target"], 0)) / 200.0
            return e["abs_correlation"] * combined_weight

        best_edge = max(edges, key=pair_risk)
        top_risk_pair = {
            "source": best_edge["source"],
            "target": best_edge["target"],
            "correlation": best_edge["correlation"],
            "delta_7d": best_edge["delta_7d"],
        }

    # ── 10. Top correlations per node ───────────────────────────────
    top_corrs: Dict[str, list] = {s: [] for s in symbols}
    for edge in edges:
        top_corrs[edge["source"]].append({
            "asset": edge["target"],
            "correlation": edge["correlation"],
            "delta_7d": edge["delta_7d"],
        })
        top_corrs[edge["target"]].append({
            "asset": edge["source"],
            "correlation": edge["correlation"],
            "delta_7d": edge["delta_7d"],
        })

    # Sort and limit to top 3
    for s in symbols:
        top_corrs[s] = sorted(
            top_corrs[s],
            key=lambda x: abs(x["correlation"]),
            reverse=True
        )[:3]

    # ── 11. Cluster assignment & topology roles ─────────────────────
    adj: Dict[str, List[str]] = {s: [] for s in symbols}
    for e in edges:
        adj[e["source"]].append(e["target"])
        adj[e["target"]].append(e["source"])
        
    visited = set()
    components = []
    for s in symbols:
        if s not in visited:
            comp = []
            queue = [s]
            visited.add(s)
            while queue:
                curr = queue.pop(0)
                comp.append(curr)
                for nxt in adj[curr]:
                    if nxt not in visited:
                        visited.add(nxt)
                        queue.append(nxt)
            components.append(comp)

    cluster_members = {}
    cluster_ids = {}
    clusters = []
    
    for comp in components:
        sys_asset = max(comp, key=lambda m: systemic_scores.get(m, 0.0))
        cid = f"cluster_{sys_asset.lower()}"
        cluster_members[cid] = comp
        for m in comp:
            cluster_ids[m] = cid
            
        total_w = sum(weight_pcts[m] for m in comp)
        avg_move = sum(daily_moves[m] for m in comp) / len(comp) if len(comp) > 0 else 0.0
        risk_level = "high" if avg_move < -3.0 else "elevated" if avg_move > 3.0 else "moderate"
        clusters.append({
            "id": cid,
            "label": f"{sys_asset} Cluster" if len(comp) > 1 else f"Isolated {comp[0]}",
            "members": comp,
            "member_count": len(comp),
            "total_weight_pct": round(total_w, 2),
            "systemic_asset": sys_asset,
            "risk_level": risk_level,
        })
    
    largest_cluster = None
    if clusters:
        lc = max(clusters, key=lambda c: c["total_weight_pct"])
        largest_cluster = {
            "cluster_id": lc["id"],
            "label": lc["label"],
            "member_count": lc["member_count"],
            "total_weight_pct": lc["total_weight_pct"],
            "systemic_asset": lc["systemic_asset"],
        }

    # Topology roles for edges
    top1_links = set()
    for s in symbols:
        if top_corrs[s]:
            top1_links.add(tuple(sorted([s, top_corrs[s][0]['asset']])))
    
    for edge in edges:
        pair = tuple(sorted([edge["source"], edge["target"]]))
        if pair in top1_links:
            edge["topology_role"] = "primary"
        elif edge["abs_correlation"] >= BAND_HIGH:
            edge["topology_role"] = "secondary"
        else:
            edge["topology_role"] = "context"

    # ── 12. Flags & Roles ───────────────────────────────────────────
    flags_map: Dict[str, List[str]] = {s: [] for s in symbols}
    cluster_roles: Dict[str, str] = {s: "peripheral" for s in symbols}
    
    # Shock source: >3% daily drop
    for s in symbols:
        if daily_moves.get(s, 0) < -3.0:
            flags_map[s].append("shock_source")
        
        # Core approximation based on systemic influence
        if systemic_scores.get(s, 0) > 30.0:
            cluster_roles[s] = "core"

    # Bridge approximation: links across clusters
    for edge in edges:
        s_cid = cluster_ids.get(edge["source"])
        t_cid = cluster_ids.get(edge["target"])
        if s_cid != t_cid and edge["abs_correlation"] >= BAND_MODERATE:
            if cluster_roles[edge["source"]] == "peripheral":
                cluster_roles[edge["source"]] = "bridge"
            if cluster_roles[edge["target"]] == "peripheral":
                cluster_roles[edge["target"]] = "bridge"

    # Dominant hub
    if systemic_asset:
        flags_map[systemic_asset].append("dominant_hub")
    
    for c in clusters:
        if c["member_count"] > 1:
            cluster_roles[c["systemic_asset"]] = "hub"

    # ── 13. Build nodes ─────────────────────────────────────────────
    nodes = []
    for s in symbols:
        nodes.append({
            "id": s,
            "label": s,
            "value_usd": round(positions.get(s, 0), 2),
            "weight_pct": weight_pcts[s],
            "daily_move_pct": daily_moves[s],
            "systemic_score": systemic_scores[s],
            "cluster_id": cluster_ids[s],
            "cluster_role": cluster_roles[s],
            "flags": flags_map[s],
            "top_correlations": top_corrs[s],
        })

    # Overview guidance: Sparse topology-preserving subset (MST-like)
    parent = {s: s for s in symbols}

    def find(i):
        if parent[i] == i:
            return i
        parent[i] = find(parent[i])
        return parent[i]

    def union(i, j):
        root_i = find(i)
        root_j = find(j)
        if root_i != root_j:
            parent[root_i] = root_j
            return True
        return False

    sorted_edges = sorted(edges, key=lambda x: x["abs_correlation"], reverse=True)
    mst_edge_ids = []
    for e in sorted_edges:
        if union(e["source"], e["target"]):
            mst_edge_ids.append(e["id"])

    overview_edge_ids = mst_edge_ids

    # ── 14. Risk score and delta ────────────────────────────────────
    risk_score = _compute_contagion_risk_score(corr_current, weight_pcts, symbols)
    risk_score_7d_ago = (
        _compute_contagion_risk_score(corr_7d_ago, weight_pcts, symbols)
        if not corr_7d_ago.empty
        else risk_score
    )
    risk_delta = round(risk_score - risk_score_7d_ago, 1)

    # ── 15. Regime ──────────────────────────────────────────────────
    avg_abs_corr = 0.0
    count = 0
    for edge in edges:
        avg_abs_corr += edge["abs_correlation"]
        count += 1
    avg_abs_corr = avg_abs_corr / count if count > 0 else 0.0

    realised_vol = _compute_realised_volatility(current_window)
    regime = _classify_regime(avg_abs_corr, realised_vol)

    # ── 16. Insight sentence ────────────────────────────────────────
    insight = _generate_insight(
        systemic_asset,
        top_risk_pair,
        regime["label"],
        risk_delta,
        len(edges),
    )

    # ── 17. Assemble response ───────────────────────────────────────
    return {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "window_days": window_days,
        "regime": regime,
        "summary": {
            "contagion_risk_score": risk_score,
            "contagion_risk_delta_7d": risk_delta,
            "systemic_asset": systemic_asset,
            "top_risk_pair": top_risk_pair,
            "largest_cluster": largest_cluster,
            "network_density": network_density,
            "insight": insight,
        },
        "nodes": nodes,
        "edges": edges,
        "clusters": clusters,
        "display": {
            "default_selected_asset": systemic_asset,
            "overview": {
                "node_ids": [n["id"] for n in nodes],
                "edge_ids": overview_edge_ids,
            },
            "focus": {
                "max_primary_links": 3,
                "max_context_links": 3
            }
        }
    }


def _empty_response(window_days: int = 30) -> Dict[str, Any]:
    """Return a valid but empty contagion response for fallback states."""
    return {
        "generated_at": datetime.now(tz=timezone.utc).isoformat(),
        "window_days": window_days,
        "regime": {
            "label": "calm",
            "reason": "Not enough data to determine market regime.",
        },
        "summary": {
            "contagion_risk_score": 0,
            "contagion_risk_delta_7d": 0,
            "systemic_asset": None,
            "top_risk_pair": None,
            "largest_cluster": None,
            "network_density": 0,
            "insight": "Recent portfolio data is too limited for a stable contagion map.",
        },
        "nodes": [],
        "edges": [],
        "clusters": [],
        "display": {
            "default_selected_asset": None,
            "overview": {
                "node_ids": [],
                "edge_ids": [],
            },
            "focus": {
                "max_primary_links": 3,
                "max_context_links": 3
            }
        }
    }
