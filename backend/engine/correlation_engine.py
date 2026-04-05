import logging
import pandas as pd
from typing import Dict, List, Any

logger = logging.getLogger("riskhub.engine.correlation")

def calculate_contagion_graph(
    ohlcv_data: Dict[str, List[List[float]]],
    positions: Dict[str, float]
) -> Dict[str, Any]:
    """
    Takes OHLCV data for multiple symbols and their current position sizes,
    calculates the Pearson correlation matrix based on closing prices,
    and returns a Graph topology (Nodes and Edges) for the frontend.

    ohlcv_data format: 
        {
            "BTC/USDT": [
                [ timestamp, open, high, low, close, volume ], ...
            ],
            ...
        }
    positions format:
        { "BTC": 1500.50, "ETH": 800.00, ... } # values in USD
    """
    if not ohlcv_data:
        logger.warning("No OHLCV data provided for correlation engine.")
        return {"nodes": [], "edges": []}

    # 1. Build a DataFrame of closing prices
    price_series = {}
    for symbol, candles in ohlcv_data.items():
        base_asset = symbol.split('/')[0] if '/' in symbol else symbol
        # Create a series of close prices (index 4 in OHLCV)
        # Use timestamp (index 0) as the index for alignment
        df = pd.DataFrame(candles, columns=['ts', 'o', 'h', 'l', 'c', 'v'])
        df.set_index('ts', inplace=True)
        price_series[base_asset] = df['c']
    
    # Combine all series into one DataFrame. pandas will automatically align by timestamp.
    close_prices_df = pd.DataFrame(price_series)

    # Forward-fill any missing data if timestamps slightly misalign, then drop mostly empty rows
    close_prices_df.ffill(inplace=True)
    close_prices_df.dropna(inplace=True)

    if close_prices_df.empty:
        logger.warning("Aligned price dataframe is empty. Cannot calculate correlation.")
        return {"nodes": [], "edges": []}

    # 2. Calculate Pearson Correlation Matrix
    corr_matrix = close_prices_df.corr()

    # 3. Transform to Graph Topology format
    nodes = []
    edges = []

    symbols_list = list(corr_matrix.columns)

    # Create Nodes
    for i, symbol in enumerate(symbols_list):
        nodes.append({
            "id": symbol,
            "group": i % 5 + 1, # Arbitrary grouping for colors
            "value": float(positions.get(symbol, 100)) # Default size if no pos data
        })

    # Create Edges (only where abs(corr) > 0.5)
    for i in range(len(symbols_list)):
        for j in range(i + 1, len(symbols_list)):
            sym_a = symbols_list[i]
            sym_b = symbols_list[j]
            corr_val = float(corr_matrix.loc[sym_a, sym_b])

            if abs(corr_val) > 0.5:
                edges.append({
                    "source": sym_a,
                    "target": sym_b,
                    "correlation": round(corr_val, 4)
                })

    logger.info("Calculated contagion graph: %d nodes, %d edges", len(nodes), len(edges))
    return {
        "nodes": nodes,
        "edges": edges
    }
