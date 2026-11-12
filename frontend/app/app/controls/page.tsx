"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { apiFetch, formatUsd } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

interface ControlItem {
  rule_id: string;
  version: string;
  name: string;
  business_description: string;
  control_family: string;
  severity: string;
  is_blocking: boolean;
  is_waivable: boolean;
  owner_team: string;
  tolerance_abs: number | null;
  handler_name: string;
  effective_date: string;
  last_result: string;
  config_yaml: string;
}

export default function ControlsPage() {
  const [selected, setSelected] = useState<ControlItem | null>(null);

  const { data, isLoading } = useQuery<{ items: ControlItem[] }>({
    queryKey: ["controls"],
    queryFn: () => apiFetch("/controls"),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#101828]">Financial Control Library</h1>
        <p className="text-xs text-[#667085] mt-0.5">
          16 YAML-configured rules mapped to registered Python/SQL control handlers. Historical batches preserve evaluated versions.
        </p>
      </div>

      {selected && (
        <div className="rounded-lg border border-[#3267D6]/30 bg-white p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#3267D6]" />
                <span className="font-mono text-sm font-semibold text-[#101828]">{selected.rule_id}</span>
                <span className="text-xs text-[#667085]">v{selected.version}</span>
                <StatusBadge status={selected.severity} />
              </div>
              <h2 className="mt-1 text-base font-semibold text-[#101828]">{selected.name}</h2>
              <p className="mt-1 text-xs text-[#475467]">{selected.business_description}</p>
            </div>
            <button onClick={() => setSelected(null)} className="text-xs text-[#667085] hover:text-[#172033]">
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-[#F9FAFB] p-3 rounded border border-[#E5E9F0]">
            <div>
              <span className="text-[#667085]">Handler:</span>{" "}
              <code className="font-mono text-[#101828]">{selected.handler_name}</code>
            </div>
            <div>
              <span className="text-[#667085]">Blocking:</span>{" "}
              <strong>{selected.is_blocking ? "Yes" : "No"}</strong>
            </div>
            <div>
              <span className="text-[#667085]">Waivable:</span>{" "}
              <strong>{selected.is_waivable ? "Yes" : "Non-Waivable"}</strong>
            </div>
            <div>
              <span className="text-[#667085]">Owner:</span> <strong>{selected.owner_team}</strong>
            </div>
          </div>
          <pre className="overflow-x-auto rounded bg-[#101828] p-3 text-[11px] font-mono text-[#E5E9F0]">
            {selected.config_yaml}
          </pre>
        </div>
      )}

      <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
              <tr>
                <th className="px-4 py-3 font-medium">Rule ID</th>
                <th className="px-4 py-3 font-medium">Control Name</th>
                <th className="px-4 py-3 font-medium">Category</th>
                <th className="px-4 py-3 font-medium">Severity</th>
                <th className="px-4 py-3 font-medium">Gate Behavior</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium">Tolerance</th>
                <th className="px-4 py-3 font-medium">Last Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E9F0]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[#667085]">
                    Loading control library...
                  </td>
                </tr>
              ) : (
                (data?.items || []).map((r) => (
                  <tr
                    key={`${r.rule_id}-${r.version}`}
                    onClick={() => setSelected(r)}
                    className="hover:bg-[#F9FAFB] cursor-pointer"
                  >
                    <td className="px-4 py-2.5 font-mono font-medium text-[#3267D6]">
                      {r.rule_id} <span className="text-[#667085]">v{r.version}</span>
                    </td>
                    <td className="px-4 py-2.5 font-medium text-[#101828]">{r.name}</td>
                    <td className="px-4 py-2.5 text-[#667085]">{r.control_family}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.severity} />
                    </td>
                    <td className="px-4 py-2.5">
                      {r.is_blocking ? "Blocking" : "Warning"}{" "}
                      {!r.is_waivable && (
                        <span className="ml-1 text-[10px] text-[#C74242] font-medium">(Non-waivable)</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[#667085]">{r.owner_team}</td>
                    <td className="px-4 py-2.5 font-mono tabular-nums">
                      {r.tolerance_abs !== null ? formatUsd(r.tolerance_abs) : "Exact"}
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={r.last_result} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
