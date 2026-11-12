"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { apiFetch, formatNumber, formatUsd } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

interface BatchItem {
  id: string;
  workspace_id: string;
  batch_code: string;
  reporting_date: string;
  status: string;
  is_sandbox: boolean;
  scenario_key: string | null;
  sources_processed: number;
  records_ingested: number;
  records_validated: number;
  exceptions_count: number;
  financial_variance_usd: number;
  total_assets_usd: number;
  duration_ms: number | null;
  started_at: string;
}

export default function RunsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [includeSandbox, setIncludeSandbox] = useState(true);

  const { data, isLoading } = useQuery<{ total: number; items: BatchItem[] }>({
    queryKey: ["batches", statusFilter, search, includeSandbox],
    queryFn: () => {
      const p = new URLSearchParams();
      if (statusFilter) p.set("status", statusFilter);
      if (search) p.set("search", search);
      p.set("include_sandbox", String(includeSandbox));
      p.set("limit", "50");
      return apiFetch(`/batches?${p.toString()}`);
    },
  });

  return (
    <div className="space-y-5">
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
          EXECUTION LEDGER // DURABLE BATCH HISTORY
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
          Reconciliation Runs
        </h1>
        <p className="mt-1 text-xs text-[#B7A9C7]">
          Every processing batch creates a durable, uniquely identifiable audit record across
          production and sandbox workspaces.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-[4px] border border-[#372E40] bg-[#201927] p-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 text-[#90937E] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search batch code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[4px] border border-[#372E40] bg-[#120B19] pl-8 pr-3 py-1.5 font-mono text-xs text-[#EBDEF2] placeholder-[#90937E] focus:border-[#D9F66F] focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-1.5 font-mono text-xs text-[#EBDEF2] focus:border-[#D9F66F] focus:outline-none"
        >
          <option value="">ALL STATUSES</option>
          <option value="PASS">PASS</option>
          <option value="PASS_WITH_WARNINGS">PASS WITH WARNINGS</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>
        <label className="inline-flex items-center gap-2 font-mono text-xs text-[#B7A9C7] cursor-pointer">
          <input
            type="checkbox"
            checked={includeSandbox}
            onChange={(e) => setIncludeSandbox(e.target.checked)}
            className="rounded-[2px] border-[#372E40]"
          />
          Include Failure Lab Sandbox Runs
        </label>
      </div>

      <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase tracking-[0.08em] text-[#90937E]">
              <tr>
                <th className="px-4 py-3">Batch Code</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3">Environment</th>
                <th className="px-4 py-3">Gate Status</th>
                <th className="px-4 py-3 text-right">Records</th>
                <th className="px-4 py-3 text-right">Total Assets</th>
                <th className="px-4 py-3 text-right">Variance</th>
                <th className="px-4 py-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#372E40]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center font-mono text-[#90937E]">
                    Loading reconciliation batches...
                  </td>
                </tr>
              ) : (data?.items || []).length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center font-mono text-[#90937E]">
                    No batches match your filter.
                  </td>
                </tr>
              ) : (
                data!.items.map((b) => (
                  <tr key={b.id} className="h-10 hover:bg-[#302839] transition-colors">
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#D9F66F]">
                      <Link href={`/app/runs/${b.id}`} className="hover:underline">
                        {b.batch_code}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#B7A9C7]">{b.reporting_date}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge
                        status={b.is_sandbox ? "STAGED" : "VERIFIED"}
                        label={b.is_sandbox ? "SANDBOX" : "PROD DEMO"}
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#B7A9C7]">
                      {formatNumber(b.records_ingested)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#EBDEF2]">
                      {formatUsd(b.total_assets_usd)}
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-mono tabular-nums ${
                        Math.abs(b.financial_variance_usd) > 0.01
                          ? "text-[#FF9D85] font-semibold"
                          : "text-[#8AE2A4]"
                      }`}
                    >
                      {formatUsd(b.financial_variance_usd)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <Link
                        href={`/app/runs/${b.id}`}
                        className="text-[11px] font-semibold text-[#D9F66F] hover:underline"
                      >
                        Detail →
                      </Link>
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
