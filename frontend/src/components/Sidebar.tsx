"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Fingerprint,
  History,
  LayoutDashboard,
  Menu,
  Settings,
} from "lucide-react";

interface SidebarProps {
  collapsed?: boolean;
  onToggle?: () => void;
}

export function Sidebar({ collapsed = false, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={`bg-surface-low flex-col hidden md:flex relative z-20 transition-all duration-300 border-r border-white/5 overflow-hidden ${
        collapsed ? 'w-20' : 'w-64'
      }`}
      style={{ willChange: 'width' }}
    >
      <div className={`flex items-center p-6 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary-dark flex items-center justify-center shadow-[0_0_15px_rgba(26,86,219,0.5)] shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            </div>
            <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400 tracking-wider">RiskHub</h1>
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] text-gray-300 transition-all hover:bg-white/10 hover:text-white shrink-0"
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            title={collapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <Menu size={16} />
          </button>
        )}
      </div>
      
      <nav className={`flex-1 mt-2 space-y-1.5 ${collapsed ? 'px-3' : 'px-4'}`}>
        <NavItem
          icon={<LayoutDashboard size={18} />}
          label="Dashboard"
          href="/dashboard"
          active={pathname === "/dashboard" || pathname === "/"}
          collapsed={collapsed}
        />
        <NavItem
          icon={<Activity size={18} />}
          label="Risk Analysis"
          href="/risk-analysis"
          active={pathname.startsWith("/risk-analysis")}
          collapsed={collapsed}
        />
        <NavItem
          icon={<Fingerprint size={18} />}
          label="SBT Identity"
          href="/sbt-identity"
          active={pathname.startsWith("/sbt-identity")}
          collapsed={collapsed}
        />
        <NavItem
          icon={<History size={18} />}
          label="Alert History"
          href="/alert-history"
          active={pathname.startsWith("/alert-history")}
          collapsed={collapsed}
        />
        <NavItem
          icon={<Settings size={18} />}
          label="Settings"
          disabled
          collapsed={collapsed}
        />
      </nav>
    </aside>
  );
}

function NavItem({
  icon,
  iconFallback,
  label,
  href,
  active = false,
  disabled = false,
  collapsed = false,
}: {
  icon: ReactNode;
  iconFallback?: ReactNode;
  label: string;
  href?: string;
  active?: boolean;
  disabled?: boolean;
  collapsed?: boolean;
}) {
  const content = (
    <>
      {active && !collapsed ? (
        <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
      ) : null}
      {active && collapsed ? (
        <div className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r-md bg-primary" />
      ) : null}
      <div
        className={`transition-colors shrink-0 ${
          active ? "text-primary" : "text-text-secondary group-hover:text-text-primary"
        }`}
      >
        {iconFallback ?? icon}
      </div>
      {!collapsed ? (
        <span className="tracking-wide text-sm whitespace-nowrap overflow-hidden text-ellipsis">
          {label}
        </span>
      ) : null}
    </>
  );

  const className = `flex items-center py-3 transition-colors duration-300 group ${
    disabled
      ? "cursor-not-allowed text-text-secondary/50"
      : active
        ? "text-text-primary font-medium relative"
        : "text-text-secondary hover:text-text-primary"
  } ${collapsed ? "justify-center rounded-xl hover:bg-white/5" : "px-4 gap-3"}`;

  if (disabled || !href) {
    return (
      <div className={className} title={collapsed ? `${label} (coming soon)` : "Coming soon"}>
        {content}
      </div>
    );
  }

  return (
    <Link href={href} className={className} title={collapsed ? label : undefined}>
      {content}
    </Link>
  );
}
