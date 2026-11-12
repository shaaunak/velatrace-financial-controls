"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Database,
  FileSpreadsheet,
  FlaskConical,
  History,
  LayoutGrid,
  Menu,
  RefreshCw,
  SearchCode,
  Settings,
  ShieldCheck,
  UserCheck,
  X,
} from "lucide-react";
import { apiFetch, DEMO_ACTORS } from "@/lib/api";
import { useAppState } from "@/components/providers";
import { VelaTraceLogo } from "@/components/VelaTraceLogo";

interface OverviewMeta {
  selected_batch: {
    id: string;
    batch_code: string;
    status: string;
    open_exceptions: number;
  } | null;
}

const NAV_ITEMS = [
  { href: "/app", label: "Executive Overview", icon: LayoutGrid },
  { href: "/app/runs", label: "Reconciliation Runs", icon: Activity, tag: "LIVE" },
  { href: "/app/sources", label: "Data Sources", icon: Database },
  { href: "/app/controls", label: "Control Library", icon: ShieldCheck },
  { href: "/app/exceptions", label: "Exceptions", icon: AlertTriangle, hasBadge: true },
  { href: "/app/investigate", label: "Investigate", icon: SearchCode },
  { href: "/app/failure-lab", label: "Failure Lab", icon: FlaskConical, tag: "STAGED" },
  { href: "/app/reports", label: "Reports", icon: FileSpreadsheet },
  { href: "/app/audit", label: "Audit Trail", icon: History },
  { href: "/app/analytics", label: "Operations", icon: BarChart3 },
];

export default function AppShellLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#17111E]" />}>
      <AppShellInner>{children}</AppShellInner>
    </Suspense>
  );
}

function AppShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { actor, setActor, workspaceId } = useAppState();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: overviewMeta } = useQuery<OverviewMeta>({
    queryKey: ["shell-overview-meta", workspaceId],
    queryFn: () => apiFetch(`/overview?workspace_id=${workspaceId}`),
    staleTime: 15_000,
  });

  const openExceptions = overviewMeta?.selected_batch?.open_exceptions ?? 0;

  const isActive = (href: string) => {
    if (href === "/app") return pathname === "/app";
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen flex bg-[#17111E] text-[#EBDEF2]">
      {/* Mobile Sidebar Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#120B19]/80 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Left Terminal Rail */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex flex-col border-r border-[#372E40] bg-[#120B19] transition-all duration-150 lg:static ${
          collapsed ? "w-16" : "w-[264px]"
        } ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        {/* Brand Header */}
        <div className="flex h-14 items-center justify-between border-b border-[#372E40] px-3.5">
          <Link href="/" className="min-w-0 overflow-hidden">
            <VelaTraceLogo
              variant="dark"
              subtitle={collapsed ? undefined : "SOV-NODE // AUDIT-OS"}
              compact={collapsed}
            />
          </Link>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden lg:inline-flex rounded-[4px] border border-transparent p-1 text-[#B7A9C7] hover:border-[#372E40] hover:bg-[#241D2B] hover:text-[#EBDEF2]"
            aria-label="Toggle sidebar"
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" />
            ) : (
              <ChevronLeft className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden rounded-[4px] p-1 text-[#B7A9C7]"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Quick Reconcile Action */}
        {!collapsed && (
          <div className="border-b border-[#372E40] p-3">
            <Link
              href="/app/failure-lab"
              className="flex items-center justify-between rounded-[4px] border border-[#372E40] bg-[#201927] px-3 py-2 text-xs font-medium text-[#EBDEF2] hover:border-[#D9F66F] transition-colors"
            >
              <span className="flex items-center gap-2">
                <RefreshCw className="h-3.5 w-3.5 text-[#D9F66F]" />
                <span>Reconcile &amp; Stress Test</span>
              </span>
              <span className="font-mono text-[10px] text-[#B7A9C7]">
                {overviewMeta?.selected_batch?.batch_code?.slice(-4) || "LIVE"}
              </span>
            </Link>
          </div>
        )}

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto py-2.5">
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                title={collapsed ? item.label : undefined}
                className={`relative flex items-center justify-between px-3.5 py-2.5 text-[13px] font-medium transition-colors ${
                  active
                    ? "bg-[#241D2B] text-[#D9F66F] border-l-[3px] border-[#D9F66F]"
                    : "text-[#B7A9C7] hover:bg-[#201927] hover:text-[#EBDEF2] border-l-[3px] border-transparent"
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <item.icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? "text-[#D9F66F]" : "text-[#90937E]"
                    }`}
                  />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </span>

                {!collapsed && item.hasBadge && openExceptions > 0 && (
                  <span className="rounded-[2px] border border-[#DE785F] bg-[#331A1E] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#FF9D85] tabular-nums">
                    {openExceptions}
                  </span>
                )}
                {!collapsed && item.tag && !active && (
                  <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#90937E]">
                    {item.tag}
                  </span>
                )}
                {!collapsed && active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#D9F66F]" />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Bottom Terminal Identity & Links */}
        <div className="border-t border-[#372E40] bg-[#120B19]">
          {!collapsed && (
            <div className="border-b border-[#372E40] px-3.5 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[4px] border border-[#372E40] bg-[#241D2B] font-mono text-[11px] font-semibold text-[#D9F66F]">
                    {actor.role.slice(0, 2)}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs font-medium text-[#EBDEF2]">
                      {actor.displayName.split(" (")[0]}
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.06em] text-[#90937E]">
                      {actor.role} {"//"} SOC2 VERIFIED
                    </div>
                  </div>
                </div>
                <span className="h-2 w-2 shrink-0 rounded-full bg-[#8AE2A4]" />
              </div>
            </div>
          )}

          <div className="px-2 py-2 space-y-0.5">
            <Link
              href="/#architecture"
              onClick={() => setMobileOpen(false)}
              className="flex items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-xs text-[#B7A9C7] hover:bg-[#201927] hover:text-[#EBDEF2]"
            >
              <BookOpen className="h-3.5 w-3.5 text-[#90937E] shrink-0" />
              {!collapsed && <span>Documentation</span>}
            </Link>
            <Link
              href="/app/settings"
              onClick={() => setMobileOpen(false)}
              className={`flex items-center gap-2.5 rounded-[4px] px-2.5 py-1.5 text-xs ${
                pathname === "/app/settings"
                  ? "bg-[#241D2B] text-[#D9F66F]"
                  : "text-[#B7A9C7] hover:bg-[#201927] hover:text-[#EBDEF2]"
              }`}
            >
              <Settings className="h-3.5 w-3.5 text-[#90937E] shrink-0" />
              {!collapsed && <span>Terminal Settings</span>}
            </Link>
          </div>
        </div>
      </aside>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 bg-[#17111E]">
        {/* Top Terminal Bar */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-[#372E40] bg-[#17111E]/95 backdrop-blur px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-[4px] border border-[#372E40] bg-[#241D2B] p-1.5 text-[#EBDEF2]"
              aria-label="Open navigation"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
              <span className="text-[#EBDEF2] font-semibold">NORTHBRIDGE WEALTH</span>
              <span className="text-[#454837]">{"//"}</span>
              <span className="text-[#B7A9C7]">{workspaceId}</span>
              <span className="text-[#454837]">{"//"}</span>
              <span className="text-[#8AE2A4]">SEED 20261112</span>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              href="/app/failure-lab"
              className="hidden md:inline-flex items-center gap-1.5 rounded-[4px] border border-[#372E40] bg-[#201927] px-3 py-1.5 font-mono text-[11px] font-medium text-[#EBDEF2] hover:border-[#D9F66F] transition-colors"
            >
              <FlaskConical className="h-3.5 w-3.5 text-[#D9F66F]" />
              <span>FAILURE LAB</span>
            </Link>

            <div className="flex items-center gap-2 rounded-[4px] border border-[#372E40] bg-[#120B19] px-2.5 py-1.5">
              <UserCheck className="h-3.5 w-3.5 text-[#D9F66F] shrink-0" />
              <select
                aria-label="Demo user context"
                value={actor.actorId}
                onChange={(e) => {
                  const found = DEMO_ACTORS.find((a) => a.actorId === e.target.value);
                  if (found) setActor(found);
                }}
                className="bg-transparent font-mono text-[11px] font-medium text-[#EBDEF2] focus:outline-none cursor-pointer"
              >
                {DEMO_ACTORS.map((a) => (
                  <option key={a.actorId} value={a.actorId} className="bg-[#241D2B] text-[#EBDEF2]">
                    {a.displayName} [{a.role}]
                  </option>
                ))}
              </select>
            </div>
          </div>
        </header>

        {/* Page Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1600px] w-full mx-auto">
          {children}
        </main>

        {/* Terminal Footer Bar */}
        <footer className="border-t border-[#372E40] bg-[#120B19] px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[#90937E]">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-[#8AE2A4]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#8AE2A4]" />
              ALL LEDGER GATES ACTIVE
            </span>
            <span className="hidden sm:inline text-[#372E40]">|</span>
            <span className="hidden sm:inline">
              PRECISION: NUMERIC(20,4) // PYTHON DECIMAL
            </span>
          </div>
          <div>VELATRACE ENTERPRISE ASSURANCE ENGINE v1.0 // SYNTHETIC DEMO</div>
        </footer>
      </div>
    </div>
  );
}
