"use client";

import { useState, type ReactNode } from "react";
import { Toaster } from "sonner";
import { Sidebar } from "./Sidebar";

interface AppShellProps {
  header: ReactNode;
  children: ReactNode;
  mainClassName?: string;
}

export function AppShell({ header, children, mainClassName }: AppShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="relative flex h-screen overflow-hidden bg-main-bg">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(26,86,219,0.18),_transparent_36%),radial-gradient(circle_at_top_right,_rgba(181,196,255,0.08),_transparent_28%),radial-gradient(circle_at_bottom,_rgba(6,14,32,0.72),_transparent_45%)]" />
      <Toaster
        position="bottom-right"
        expand={false}
        theme="dark"
        toastOptions={{
          className:
            "border border-surface-highest bg-main-bg/70 text-text-primary rounded-md backdrop-blur-xl",
          classNames: {
            error:
              "!bg-danger-container !border-danger-container !text-danger-accent shadow-[0_48px_48px_rgba(105,0,5,0.4)] drop-shadow-lg",
          },
        }}
      />
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed((current) => !current)}
      />
      <div className="relative flex flex-1 flex-col overflow-hidden">
        {header}
        <main
          className={`relative z-0 flex-1 overflow-y-auto p-4 md:p-5 lg:p-6 ${mainClassName ?? ""}`}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
