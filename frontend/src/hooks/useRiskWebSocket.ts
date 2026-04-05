import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

interface UseRiskWebSocketProps {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onNewAlert: (alert: any) => void;
}

export function useRiskWebSocket({ userId, onNewAlert }: UseRiskWebSocketProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!userId) return;

    const connect = () => {
      // Connect to the WebSocket endpoint
      const wsUrl = `ws://localhost:8000/ws/alerts/${userId}`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`[WebSocket] Connected to alerts stream for user ${userId}`);
        if (reconnectTimeoutRef.current) {
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'alert' && data.alert) {
            console.log('[WebSocket] New alert received:', data.alert);
            
            // Trigger Sonner toast
            const isCritical = data.alert.severity === 'critical';
            const isWarning = data.alert.severity === 'warning';
            
            toast(data.alert.title, {
              description: data.alert.message,
              style: {
                background: isCritical ? 'rgba(239, 68, 68, 0.9)' : isWarning ? 'rgba(245, 158, 11, 0.9)' : 'rgba(56, 189, 248, 0.9)',
                color: '#fff',
                border: '1px solid rgba(255, 255, 255, 0.2)',
              },
              duration: 8000,
            });

            // Call the callback to update React state
            onNewAlert(data.alert);
          }
        } catch (err) {
          console.error('[WebSocket] Failed to parse message', err);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected. Reconnecting in 3s...');
        wsRef.current = null;
        reconnectTimeoutRef.current = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('[WebSocket] Error:', err);
        ws.close();
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [userId, onNewAlert]);

  return { ws: wsRef.current };
}
