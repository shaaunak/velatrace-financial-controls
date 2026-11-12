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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#101828]">Reconciliation Runs</h1>
          <p className="text-xs text-[#667085] mt-0.5">
            Every processing batch creates a durable, uniquely identifiable audit record.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#E5E9F0] bg-white p-3.5">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 text-[#667085] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search batch code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-[#E5E9F0] pl-8 pr-3 py-1.5 text-xs focus:border-[#3267D6] focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-[#E5E9F0] bg-white px-3 py-1.5 text-xs text-[#172033]"
        >
          <option value="">All Statuses</option>
          <option value="PASS">PASS</option>
          <option value="PASS_WITH_WARNINGS">PASS WITH WARNINGS</option>
          <option value="BLOCKED">BLOCKED</option>
        </select>
        <label className="inline-flex items-center gap-2 text-xs text-[#667085] cursor-pointer">
          <input
            type="checkbox"
            checked={includeSandbox}
            onChange={(e) => setIncludeSandbox(e.target.checked)}
            className="rounded border-[#D0D5DD]"
          />
          Include Failure Lab Sandbox runs
        </label>
      </div>

      <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
              <tr>
                <th className="px-4 py-3 font-medium">Batch ID</th>
                <th className="px-4 py-3 font-medium">Reporting Date</th>
                <th className="px-4 py-3 font-medium">Environment</th>
                <th className="px-4 py-3 font-medium text-right">Sources</th>
                <th className="px-4 py-3 font-medium text-right">Ingested</th>
                <th className="px-4 py-3 font-medium text-right">Exceptions</th>
                <th className="px-4 py-3 font-medium text-right">Variance (USD)</th>
                <th className="px-4 py-3 font-medium text-right">Duration</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E9F0]">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[#667085]">
                    Loading reconciliation batches...
                  </td>
                </tr>
              ) : (data?.items || []).length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-[#667085]">
                    No batches match the current filter.
                  </td>
                </tr>
              ) : (
                data!.items.map((b) => (
                  <tr key={b.id} className="hover:bg-[#F9FAFB] transition-colors">
                    <td className="px-4 py-3 font-mono font-medium">
                      <Link href={`/app/runs/${b.id}`} className="text-[#3267D6] hover:underline">
                        {b.batch_code}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[#172033]">{b.reporting_date}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                          b.is_sandbox
                            ? "bg-[#F2F4F7] text-[#475467]"
                            : "bg-[#EFF4FF] text-[#3267D6]"
                        }`}
                      >
                        {b.is_sandbox ? `SANDBOX (${b.scenario_key || "sim"})` : "DEMO PROD"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{b.sources_processed}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatNumber(b.records_ingested)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{b.exceptions_count}</td>
                    <td
                      className={`px-4 py-3 text-right font-mono tabular-nums ${
                        Math.abs(b.financial_variance_usd) > 1 ? "text-[#C74242] font-semibold" : "text-[#168363]"
                      }`}
                    >
                      {formatUsd(b.financial_variance_usd)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-[#667085]">
                      {b.duration_ms ? `${b.duration_ms} ms` : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={b.status} />
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
