"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  AlertOctagon,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  FlaskConical,
  History,
  LayoutDashboard,
  Menu,
  Play,
  SearchCode,
  Settings,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { DEMO_ACTORS } from "@/lib/api";
import { useAppState } from "@/components/providers";

const NAV_ITEMS = [
  { href: "/app", label: "Overview", icon: LayoutDashboard },
  { href: "/app/runs", label: "Reconciliation Runs", icon: Activity },
  { href: "/app/sources", label: "Data Sources", icon: Database },
  { href: "/app/controls", label: "Control Library", icon: ShieldCheck },
  { href: "/app/exceptions", label: "Exceptions", icon: AlertOctagon },
  { href: "/app/investigate", label: "Investigate", icon: SearchCode },
  { href: "/app/failure-lab", label: "Failure Lab", icon: FlaskConical },
  { href: "/app/reports", label: "Reports", icon: FileSpreadsheet },
  { href: "/app/audit", label: "Audit Trail", icon: History },
  { href: "/app/analytics", label: "Operations Analytics", icon: BarChart3 },
  { href: "/app/settings", label: "Settings", icon: Settings },
];

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F8FA]" />}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { actor, setActor, workspaceId } = useAppState();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) => {
    if (href === "/app") return pathname === "/app";
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen flex bg-[#F7F8FA] text-[#172033]">
      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#101828]/40 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#E5E9F0] bg-white transition-all duration-200 lg:static ${
          collapsed ? "w-16" : "w-60"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[#E5E9F0] px-3.5">
          <Link href="/" className="flex items-center gap-2.5 overflow-hidden">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[#101828] text-xs font-semibold text-white">
              VT
            </div>
            {!collapsed && (
              <span className="font-semibold text-sm tracking-tight text-[#101828] truncate">
                VelaTrace
              </span>
            )}
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:inline-flex rounded p-1 text-[#667085] hover:bg-[#F2F4F7] hover:text-[#172033]"
            aria-label="Toggle sidebar"
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden rounded p-1 text-[#667085]"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[#EFF4FF] text-[#3267D6]"
                    : "text-[#475467] hover:bg-[#F2F4F7] hover:text-[#172033]"
                }`}
              >
                <item.icon className={`h-4 w-4 shrink-0 ${active ? "text-[#3267D6]" : "text-[#667085]"}`} />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {!collapsed && (
          <div className="border-t border-[#E5E9F0] p-3 text-[11px] text-[#667085]">
            <div className="font-medium text-[#172033]">Synthetic Demo Mode</div>
            <div className="mt-0.5">Northbridge Wealth • USD</div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[#E5E9F0] bg-white px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-md border border-[#E5E9F0] p-1.5 text-[#475467]"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="hidden sm:flex items-center gap-2 text-xs">
              <span className="font-medium text-[#101828]">Northbridge Wealth</span>
              <span className="text-[#D0D5DD]">/</span>
              <span className="font-mono text-[#667085]">{workspaceId}</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/app/failure-lab?guided=1"
              className="hidden md:inline-flex items-center gap-1.5 rounded-md border border-[#D0D5DD] bg-white px-3 py-1.5 text-xs font-medium text-[#101828] hover:border-[#3267D6] transition-colors"
            >
              <Play className="h-3.5 w-3.5 text-[#3267D6]" />
              Run Guided Investigation
            </Link>

            <div className="flex items-center gap-1.5 rounded-md border border-[#E5E9F0] bg-[#F9FAFB] px-2.5 py-1">
              <UserCheck className="h-3.5 w-3.5 text-[#667085]" />
              <select
                aria-label="Demo user context"
                value={actor.actorId}
                onChange={(e) => {
                  const found = DEMO_ACTORS.find((a) => a.actorId === e.target.value);
                  if (found) setActor(found);
                }}
                className="bg-transparent text-xs font-medium text-[#172033] focus:outline-none"
              >
                {DEMO_ACTORS.map((a) => (
                  <option key={a.actorId} value={a.actorId}>
                    {a.displayName} [{a.role}]
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
