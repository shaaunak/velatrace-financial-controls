"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FlaskConical,
  RefreshCw,
} from "lucide-react";
import { apiFetch, formatNumber, formatUsd } from "@/lib/api";
import { useAppState } from "@/components/providers";
import { StatusBadge } from "@/components/StatusBadge";

interface OverviewResponse {
  workspace_id: string;
  available_dates: string[];
  selected_batch: {
    id: string;
    batch_code: string;
    reporting_date: string;
    status: string;
    total_assets_usd: number;
    custody_total_usd: number;
    calculated_total_usd: number;
    financial_variance_usd: number;
    records_ingested: number;
    records_validated: number;
    reconciliation_coverage_pct: number;
    open_exceptions: number;
    critical_exceptions: number;
    sources_processed: number;
    duration_ms: number | null;
  } | null;
  recent_batches: Array<{
    id: string;
    batch_code: string;
    reporting_date: string;
    status: string;
    total_assets_usd: number;
    financial_variance_usd: number;
    records_ingested: number;
    exceptions_count: number;
    duration_ms: number | null;
    started_at: string;
  }>;
  severity_breakdown: Array<{ severity: string; count: number }>;
  source_coverage: Array<{
    source_system: string;
    file_name: string;
    row_count: number;
    status: string;
    source_hash: string;
  }>;
  last_publication: {
    id: string;
    version_number: number;
    reporting_date: string;
    published_by: string;
    published_at: string;
    publication_status: string;
    content_fingerprint: string;
  } | null;
}

export default function OverviewPage() {
  const { workspaceId } = useAppState();
  const [selectedDate, setSelectedDate] = useState<string>("");

  const { data, isLoading, error, refetch } = useQuery<OverviewResponse>({
    queryKey: ["overview", workspaceId, selectedDate],
    queryFn: () => {
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (selectedDate) params.set("reporting_date", selectedDate);
      return apiFetch<OverviewResponse>(`/overview?${params.toString()}`);
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-64 rounded bg-[#E5E9F0] animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 rounded-lg border border-[#E5E9F0] bg-white animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data?.selected_batch) {
    return (
      <div className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2] p-6 text-sm text-[#C74242]">
        Failed to load reconciliation overview: {(error as Error)?.message || "No batches found."}
      </div>
    );
  }

  const b = data.selected_batch;
  const chartData = [...data.recent_batches]
    .reverse()
    .map((item) => ({
      name: item.reporting_date,
      assetsM: Number((item.total_assets_usd / 1_000_000).toFixed(2)),
      records: item.records_ingested,
      status: item.status,
    }));

  const sevColors: Record<string, string> = {
    CRITICAL: "#C74242",
    HIGH: "#D18A22",
    MEDIUM: "#3267D6",
    LOW: "#667085",
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#101828] tracking-tight">
            Financial Reporting Assurance Overview
          </h1>
          <p className="text-xs text-[#667085] mt-0.5">
            Batch <span className="font-mono text-[#172033]">{b.batch_code}</span> • Reporting Date{" "}
            <span className="font-medium text-[#172033]">{b.reporting_date}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <select
            aria-label="Filter by reporting date"
            value={selectedDate || b.reporting_date}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="rounded-md border border-[#E5E9F0] bg-white px-3 py-1.5 text-xs font-medium text-[#172033]"
          >
            {data.available_dates.map((dt) => (
              <option key={dt} value={dt}>
                Reporting Date: {dt}
              </option>
            ))}
          </select>
          <button
            onClick={() => refetch()}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E9F0] bg-white px-3 py-1.5 text-xs font-medium text-[#172033] hover:bg-[#F2F4F7]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <StatusBadge status={b.status} size="md" />
        </div>
      </div>

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link
          href={`/app/investigate?batchId=${b.id}`}
          className="group rounded-lg border border-[#E5E9F0] bg-white p-5 hover:border-[#3267D6] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#667085]">
            <span>Assets Under Reporting (USD)</span>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-[#3267D6]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#101828] tabular-nums">
            {formatUsd(b.total_assets_usd)}
          </div>
          <div className="mt-1.5 text-xs text-[#667085]">
            Custody vs Mart Variance:{" "}
            <span
              className={`font-mono font-medium ${
                Math.abs(b.financial_variance_usd) <= 1 ? "text-[#168363]" : "text-[#C74242]"
              }`}
            >
              {formatUsd(b.financial_variance_usd)}
            </span>
          </div>
        </Link>

        <Link
          href={`/app/runs/${b.id}`}
          className="group rounded-lg border border-[#E5E9F0] bg-white p-5 hover:border-[#3267D6] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#667085]">
            <span>Reconciliation Coverage</span>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-[#3267D6]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#101828] tabular-nums">
            {b.reconciliation_coverage_pct.toFixed(1)}%
          </div>
          <div className="mt-1.5 text-xs text-[#667085] tabular-nums">
            {formatNumber(b.records_validated)} validated / {formatNumber(b.records_ingested)} ingested
          </div>
        </Link>

        <Link
          href="/app/exceptions"
          className="group rounded-lg border border-[#E5E9F0] bg-white p-5 hover:border-[#3267D6] transition-colors"
        >
          <div className="flex items-center justify-between text-xs font-medium text-[#667085]">
            <span>Open Exceptions</span>
            <ArrowUpRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 text-[#3267D6]" />
          </div>
          <div className="mt-2 text-2xl font-semibold text-[#101828] tabular-nums">
            {formatNumber(b.open_exceptions)}
          </div>
          <div className="mt-1.5 text-xs text-[#667085]">
            Critical exceptions:{" "}
            <span className={b.critical_exceptions > 0 ? "font-semibold text-[#C74242]" : "text-[#168363]"}>
              {b.critical_exceptions}
            </span>
          </div>
        </Link>

        <div className="rounded-lg border border-[#E5E9F0] bg-white p-5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs font-medium text-[#667085]">
            <span>Publication Status</span>
            <FileSpreadsheet className="h-3.5 w-3.5 text-[#3267D6]" />
          </div>
          {data.last_publication ? (
            <>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-lg font-semibold text-[#101828]">
                  v{data.last_publication.version_number}
                </span>
                <StatusBadge status={data.last_publication.publication_status} />
              </div>
              <div className="mt-1.5 text-xs text-[#667085] truncate">
                Signed off by {data.last_publication.published_by}
              </div>
            </>
          ) : (
            <div className="mt-2 text-sm text-[#667085]">No official report issued yet</div>
          )}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-lg border border-[#E5E9F0] bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-[#101828]">
                Reconciliation Health & Reported AUM ($M USD)
              </h2>
              <p className="text-xs text-[#667085]">Across recent processing batches</p>
            </div>
            <Link href="/app/runs" className="text-xs font-medium text-[#3267D6] hover:underline">
              View all runs →
            </Link>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E9F0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#667085" }} />
                <YAxis tick={{ fontSize: 11, fill: "#667085" }} unit="M" />
                <Tooltip
                  formatter={(value) => [`$${value}M`, "Reported AUM"]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #E5E9F0",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="assetsM" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        entry.status === "BLOCKED"
                          ? "#C74242"
                          : entry.status === "PASS_WITH_WARNINGS"
                          ? "#D18A22"
                          : "#3267D6"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Severity Breakdown + Quick Failure Lab CTA */}
        <div className="space-y-4">
          <div className="rounded-lg border border-[#E5E9F0] bg-white p-5">
            <h2 className="text-sm font-semibold text-[#101828]">Exception Severity Distribution</h2>
            <p className="text-xs text-[#667085] mb-4">Current selected batch</p>
            {data.severity_breakdown.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-[#168363] py-6">
                <CheckCircle2 className="h-4 w-4" />
                Zero exceptions detected in this batch.
              </div>
            ) : (
              <div className="space-y-3">
                {data.severity_breakdown.map((s) => (
                  <div key={s.severity} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: sevColors[s.severity] || "#667085" }}
                      />
                      <span className="font-medium text-[#172033]">{s.severity}</span>
                    </div>
                    <span className="font-mono font-semibold tabular-nums text-[#101828]">
                      {s.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-[#E5E9F0] bg-[#101828] p-5 text-white">
            <div className="flex items-center gap-2 text-xs font-medium text-[#B2DDFF]">
              <FlaskConical className="h-4 w-4" />
              Signature Demonstration
            </div>
            <h3 className="mt-2 text-sm font-semibold">The $125,000 Discrepancy</h3>
            <p className="mt-1 text-xs text-[#D0D5DD] leading-relaxed">
              Inject a controlled duplicate wire in an isolated sandbox, prove the Publication Gate
              blocks it, and recover cleanly.
            </p>
            <Link
              href="/app/failure-lab?guided=1"
              className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-[#3267D6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2554B8]"
            >
              Launch Failure Lab →
            </Link>
          </div>
        </div>
      </div>

      {/* Source Coverage & Recent Processing Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#E5E9F0] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-[#3267D6]" />
              <h2 className="text-sm font-semibold text-[#101828]">Source Feed Coverage</h2>
            </div>
            <Link href="/app/sources" className="text-xs font-medium text-[#3267D6] hover:underline">
              Inspect sources →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Source System</th>
                  <th className="px-4 py-2.5 font-medium">File</th>
                  <th className="px-4 py-2.5 font-medium text-right">Rows</th>
                  <th className="px-4 py-2.5 font-medium">SHA-256</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E9F0]">
                {data.source_coverage.map((src) => (
                  <tr key={src.source_system} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-2.5 font-medium text-[#101828]">{src.source_system}</td>
                    <td className="px-4 py-2.5 font-mono text-[#667085]">{src.file_name}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(src.row_count)}</td>
                    <td className="px-4 py-2.5 font-mono text-[#667085]">{src.source_hash}…</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={src.status === "INGESTED" ? "PASS" : src.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#E5E9F0] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-[#D18A22]" />
              <h2 className="text-sm font-semibold text-[#101828]">Recent Processing Batches</h2>
            </div>
            <Link href="/app/runs" className="text-xs font-medium text-[#3267D6] hover:underline">
              All runs →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Batch Code</th>
                  <th className="px-4 py-2.5 font-medium">Date</th>
                  <th className="px-4 py-2.5 font-medium text-right">AUM (USD)</th>
                  <th className="px-4 py-2.5 font-medium text-right">Variance</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E9F0]">
                {data.recent_batches.map((rb) => (
                  <tr key={rb.id} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-2.5 font-mono font-medium">
                      <Link href={`/app/runs/${rb.id}`} className="text-[#3267D6] hover:underline">
                        {rb.batch_code}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-[#667085]">{rb.reporting_date}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(rb.total_assets_usd)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(rb.financial_variance_usd)}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={rb.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
