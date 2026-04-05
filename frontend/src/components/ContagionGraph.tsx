"use client";

import { useEffect, useState, useMemo } from 'react';
import { ReactFlow, Background, Controls, Node, Edge } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const DUMMY_USER_ID = "64f1a2b3c4d5e6f7a8b9c0d1";

// Helper color assignments based on groups
const GROUP_COLORS: Record<number, string> = {
  1: '#f59e0b', // Amber
  2: '#627eea', // Indigo/Blue
  3: '#14f195', // Green
  4: '#2a5ada', // Deep Blue
  5: '#ec4899', // Pink
};

export function ContagionGraph() {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    async function fetchGraphData() {
      try {
        const res = await fetch(`http://localhost:8000/api/v1/dashboard/${DUMMY_USER_ID}/contagion`);
        if (!res.ok) return;
        const json = await res.json();
        
        if (json.data) {
          const apiNodes = json.data.nodes || [];
          const apiEdges = json.data.edges || [];

          // Calculate circular layout positions
          const radius = 120;
          const centerX = 250;
          const centerY = 250;

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const transformedNodes: Node[] = apiNodes.map((n: any, idx: number) => {
            const angle = (idx / apiNodes.length) * 2 * Math.PI;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            // Limit size visually between 40 and 100
            const size = Math.min(Math.max(40, (n.value / 1000) * 10), 100);
            
            const bgColor = GROUP_COLORS[n.group % 5 + 1] || '#333';

            return {
              id: n.id,
              position: { x, y },
              data: { label: n.id },
              style: {
                width: size,
                height: size,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: bgColor,
                color: '#fff',
                border: 'none',
                fontWeight: 'bold',
                fontSize: size > 60 ? '14px' : '10px'
              }
            };
          });

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const transformedEdges: Edge[] = apiEdges.map((e: any, idx: number) => {
            const isHighContagion = Math.abs(e.correlation) > 0.75;
            
            return {
              id: `e-${e.source}-${e.target}-${idx}`,
              source: e.source,
              target: e.target,
              animated: isHighContagion,
              style: {
                stroke: isHighContagion ? '#ef4444' : (e.correlation < 0 ? '#10b981' : '#6b7280'),
                strokeWidth: isHighContagion ? 3 : 1,
                strokeDasharray: isHighContagion ? '5,5' : 'none'
              }
            };
          });

          setNodes(transformedNodes);
          setEdges(transformedEdges);
        }
      } catch (err) {
        console.error("Failed to fetch contagion graph data:", err);
      }
    }
    fetchGraphData();
  }, []);

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background color="#1e293b" gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
