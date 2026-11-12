"use client";

import React from "react";
import { useAppState } from "@/components/providers";

export default function SettingsPage() {
  const { actor, workspaceId } = useAppState();

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold text-[#101828]">Workspace & Policy Settings</h1>
        <p className="text-xs text-[#667085] mt-0.5">
          Reporting conventions, monetary precision policy, and active demonstration context.
        </p>
      </div>

      <div className="rounded-lg border border-[#E5E9F0] bg-white divide-y divide-[#E5E9F0] text-xs">
        <div className="p-4 flex justify-between">
          <span className="text-[#667085]">Institution</span>
          <span className="font-medium text-[#101828]">Northbridge Wealth — Demonstration Environment (Synthetic)</span>
        </div>
        <div className="p-4 flex justify-between">
          <span className="text-[#667085]">Workspace ID</span>
          <span className="font-mono text-[#101828]">{workspaceId}</span>
        </div>
        <div className="p-4 flex justify-between">
          <span className="text-[#667085]">Reporting Currency & Precision</span>
          <span className="font-mono text-[#101828]">USD • PostgreSQL NUMERIC(20,4)</span>
        </div>
        <div className="p-4 flex justify-between">
          <span className="text-[#667085]">Daily Cut-Off Time</span>
          <span className="font-mono text-[#101828]">17:00:00 EST</span>
        </div>
        <div className="p-4 flex justify-between">
          <span className="text-[#667085]">Active Actor Context</span>
          <span className="font-medium text-[#101828]">
            {actor.displayName} ({actor.role})
          </span>
        </div>
      </div>
    </div>
  );
}
