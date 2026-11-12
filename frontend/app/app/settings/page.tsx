"use client";

import React from "react";
import { useAppState } from "@/components/providers";
import { StatusBadge } from "@/components/StatusBadge";

export default function SettingsPage() {
  const { actor, workspaceId } = useAppState();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
          TERMINAL CONFIGURATION // MONETARY PRECISION POLICY
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
          Workspace &amp; Policy Settings
        </h1>
        <p className="mt-1 text-xs text-[#B7A9C7]">
          Reporting conventions, PostgreSQL monetary precision policy, and active demonstration
          RBAC context.
        </p>
      </div>

      <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] divide-y divide-[#372E40] text-xs">
        <div className="p-4 flex justify-between items-center gap-4">
          <span className="font-mono text-[#B7A9C7]">INSTITUTION</span>
          <span className="font-medium text-[#EBDEF2]">
            Northbridge Wealth — Demonstration Environment (Synthetic)
          </span>
        </div>
        <div className="p-4 flex justify-between items-center gap-4">
          <span className="font-mono text-[#B7A9C7]">WORKSPACE ID</span>
          <span className="font-mono text-[#D9F66F]">{workspaceId}</span>
        </div>
        <div className="p-4 flex justify-between items-center gap-4">
          <span className="font-mono text-[#B7A9C7]">REPORTING CURRENCY &amp; PRECISION</span>
          <span className="font-mono text-[#EBDEF2]">USD • PostgreSQL NUMERIC(20,4)</span>
        </div>
        <div className="p-4 flex justify-between items-center gap-4">
          <span className="font-mono text-[#B7A9C7]">DAILY CUT-OFF TIME</span>
          <span className="font-mono text-[#EBDEF2]">17:00:00 EST</span>
        </div>
        <div className="p-4 flex justify-between items-center gap-4">
          <span className="font-mono text-[#B7A9C7]">ACTIVE ACTOR CONTEXT</span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-[#EBDEF2]">{actor.displayName}</span>
            <StatusBadge status="ACTIVE" label={actor.role} />
          </div>
        </div>
      </div>
    </div>
  );
}
