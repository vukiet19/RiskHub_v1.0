"use client";

import { useEffect, useState, useCallback } from "react";
import { Sidebar } from "../components/Sidebar";
import { Navbar } from "../components/Navbar";
import { PortfolioCard } from "../components/PortfolioCard";
import { ContagionGraph } from "../components/ContagionGraph";
import { AlertsPanel, AlertData } from "../components/AlertsPanel";
import { OpenPositions } from "../components/OpenPositions";
import { useRiskWebSocket } from "../hooks/useRiskWebSocket";
import { Toaster } from "sonner";

// Use a mock valid MongoDB ObjectId for MVP testing
const DUMMY_USER_ID = "64f1a2b3c4d5e6f7a8b9c0d1";

export default function Dashboard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [metrics, setMetrics] = useState<any>(null);
  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [positions, setPositions] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isPositionsLoading, setIsPositionsLoading] = useState(true);

  // Fallback to "F" grade if undefined
  const disciplineScore = metrics?.discipline_score?.total ?? 0;
  const disciplineGrade = metrics?.discipline_score?.grade ?? "F";
  const drawdownPct = metrics?.max_drawdown?.value_pct ?? "0.00";
  const netPnlUsd = metrics?.net_pnl_usd ?? "0.00";

  // Initial Fetch Data
  useEffect(() => {
    async function fetchDashboard() {
      try {
        const [metricsRes, alertsRes] = await Promise.all([
          fetch(`http://localhost:8000/api/v1/dashboard/${DUMMY_USER_ID}/metrics`),
          fetch(`http://localhost:8000/api/v1/dashboard/${DUMMY_USER_ID}/alerts?unread_only=true`)
        ]);

        if (metricsRes.ok) {
          const mData = await metricsRes.json();
          setMetrics(mData.data);
        }

        if (alertsRes.ok) {
          const aData = await alertsRes.json();
          // Filter to just map what we need
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const formattedAlerts = aData.alerts.map((a: any) => ({
            id: a._id || Math.random().toString(),
            rule_id: a.rule_id,
            rule_name: a.rule_name,
            severity: a.severity,
            title: a.title,
            message: a.message,
            triggered_at: a.triggered_at,
            is_read: a.is_read
          }));
          setAlerts(formattedAlerts);
        }
      } catch (err) {
        console.error("Dashboard data fetch error:", err);
      } finally {
        setIsLoading(false);
      }
    }
    
    async function fetchLivePositions() {
      try {
        const res = await fetch(`http://localhost:8000/api/v1/sync/positions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exchange_id: 'binance',
            api_key: 'p78rg4piSpNNlRNZV9973wJZ9g5hqIuEw9LwsJUpTV7TkgnyLBIK8Ca2jMjGSg2b',
            api_secret: 'iRACN88DEMG4EE44h8cFy9WiniluQ1UuhammAG8DM7t9J9ZA1y4YiDXcNpRn8Kjg',
            testnet: true
          })
        });
        
        if (res.ok) {
          const data = await res.json();
          setPositions(data.positions || []);
        }
      } catch (err) {
        console.error("Failed to fetch positions:", err);
      } finally {
        setIsPositionsLoading(false);
      }
    }

    fetchDashboard();
    fetchLivePositions();
  }, []);

  // Set up WebSocket for real-time alert updates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleNewAlert = useCallback((newAlert: any) => {
    setAlerts((prev) => {
      // Prepend the new alert, limit to 20 visually maybe, but just prepend for now
      return [newAlert, ...prev];
    });
  }, []);

  useRiskWebSocket({
    userId: DUMMY_USER_ID,
    onNewAlert: handleNewAlert
  });

  return (
    <div className="flex h-screen overflow-hidden bg-main-bg">
      <Toaster 
        position="bottom-right" 
        expand={false} 
        theme="dark" 
        toastOptions={{
          className: 'bg-main-bg/70 backdrop-blur-xl border border-surface-highest text-text-primary rounded-md',
          classNames: {
            error: '!bg-danger-container !border-danger-container !text-danger-accent shadow-[0_48px_48px_rgba(105,0,5,0.4)] drop-shadow-lg',
          }
        }}
      />
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden relative">
        <Navbar />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 relative z-0">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full">
            {/* Column 1 (narrow) */}
            <div className="lg:col-span-3 flex flex-col gap-6">
              <PortfolioCard 
                exchanges={metrics?.by_exchange || []} 
                totalUnrealizedPnl={netPnlUsd} 
              />
              {/* Discipline Score gauge */}
              <div className="bg-surface-high hover:bg-surface-highest rounded-md p-6 relative overflow-hidden transition-all duration-300">
                <h3 className="text-lg font-semibold mb-6 text-text-primary flex justify-between items-center">
                  <span>Discipline Score</span>
                  <span className="text-xs bg-surface-lowest px-2 py-1 rounded-md text-text-secondary">Trailing 30d</span>
                </h3>
                <div className="flex items-center justify-center py-4">
                   <div className="relative w-36 h-36 rounded-full flex items-center justify-center">
                     {/* Outer animated ring */}
                     <div className="absolute inset-0 rounded-full border-2 border-surface-highest"></div>
                     {/* Score ring */}
                     <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="45" className="stroke-surface-highest stroke-[8px] fill-transparent" />
                        <circle cx="50" cy="50" r="45" className="stroke-primary stroke-[8px] fill-transparent" strokeDasharray="283" strokeDashoffset={`${283 - (283 * disciplineScore) / 100}`} strokeLinecap="round" />
                     </svg>
                     <div className="absolute flex flex-col items-center justify-center">
                       <span className="text-4xl font-bold font-mono tracking-tight text-text-primary">{disciplineScore}</span>
                       <span className="text-xs text-primary font-medium tracking-wide mt-1">GRADE: {disciplineGrade}</span>
                     </div>
                   </div>
                </div>
                <div className="text-center mt-4">
                  <div className="inline-flex items-center gap-2 bg-success/10 text-success px-3 py-1.5 rounded-full text-sm font-medium border border-success/20">
                    <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                    {isLoading ? 'Loading...' : `Grade: ${disciplineGrade}`}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2 (wide) */}
            <div className="lg:col-span-6 flex flex-col gap-6">
              <div className="glass-card rounded-2xl p-6 flex-1 flex flex-col min-h-[500px] border border-white/5 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h3 className="text-lg font-semibold text-white">Asset Contagion Graph</h3>
                    <p className="text-sm text-gray-400 mt-1">Real-time cross-asset correlation</p>
                  </div>
                  <div className="px-4 py-2 bg-black/40 rounded-xl rounded-bl-none rounded-br-none border-b border-warning/50 shadow-[0_4px_20px_-4px_rgba(245,158,11,0.3)] backdrop-blur-md">
                    <span className="text-xs text-gray-400 mr-2 uppercase tracking-wider">Risk Score</span>
                    <span className="text-warning font-bold text-lg">65%</span>
                  </div>
                </div>
                <div className="flex-1 bg-black/40 rounded-xl border border-white/5 overflow-hidden relative shadow-inner">
                  <ContagionGraph />
                </div>
              </div>
            </div>

            {/* Column 3 (narrow) */}
            <div className="lg:col-span-3 flex flex-col gap-6">
              <OpenPositions positions={positions} isLoading={isPositionsLoading} />
              <AlertsPanel alerts={alerts} />
              <div className="glass-card rounded-2xl p-5 hover:border-danger/30 transition-colors duration-300">
                 <h3 className="text-base font-semibold mb-3 text-white">Drawdown Impact</h3>
                 <div className="flex justify-between items-center bg-gradient-to-r from-danger/20 to-danger/5 border border-danger/30 rounded-xl p-4 shadow-[inset_0_1px_4px_rgba(0,0,0,0.5)]">
                   <div className="flex flex-col">
                     <span className="text-danger font-bold text-xl font-mono tracking-tight">-{drawdownPct}%</span>
                     <span className="text-[10px] text-danger/70 uppercase tracking-wider mt-1">Peak-to-Trough</span>
                   </div>
                   <div className="w-10 h-10 rounded-full bg-danger/10 flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.3)]">
                     <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger"><polyline points="22 17 13.5 8.5 8.5 13.5 2 7"></polyline><polyline points="16 17 22 17 22 11"></polyline></svg>
                   </div>
                 </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
