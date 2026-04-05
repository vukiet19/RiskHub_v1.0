"use client";

import { useMemo } from 'react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const initialNodes = [
  { id: '1', position: { x: 250, y: 150 }, data: { label: 'BTC' }, style: { width: 80, height: 80, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f59e0b', color: '#fff', border: 'none' } },
  { id: '2', position: { x: 100, y: 300 }, data: { label: 'ETH' }, style: { width: 60, height: 60, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#627eea', color: '#fff', border: 'none' } },
  { id: '3', position: { x: 400, y: 300 }, data: { label: 'SOL' }, style: { width: 70, height: 70, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#14f195', color: '#111', border: 'none' } },
  { id: '4', position: { x: 250, y: 450 }, data: { label: 'LINK' }, style: { width: 50, height: 50, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#2a5ada', color: '#fff', border: 'none' } },
];

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', animated: true, style: { stroke: '#ef4444', strokeWidth: 3 } },
  { id: 'e1-3', source: '1', target: '3', style: { stroke: '#f59e0b', strokeWidth: 2 } },
  { id: 'e2-4', source: '2', target: '4', style: { stroke: '#6b7280', strokeWidth: 1 } },
];

export function ContagionGraph() {
  const nodes = useMemo(() => initialNodes, []);
  const edges = useMemo(() => initialEdges, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background color="#1e293b" gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
