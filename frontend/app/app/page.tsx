"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  Lock,
  Play,
  ShieldAlert,
  ShieldCheck,
  XOctagon,
} from "lucide-react";
import { API_BASE, ApiError, apiFetch, formatNumber, formatUsd } from "@/lib/api";
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
    publication_status: string;
    published_at: string;
    content_fingerprint: string;
  } | null;
}

interface BatchException {
  id: string;
  exception_code: string;
  rule_id: string;
  severity: string;
  is_blocking: boolean;
  variance_amount_usd: number;
  title: string;
  source_system: string;
  status: string;
}

export default function ExecutiveOverviewPage() {
  const { workspaceId, actor } = useAppState();
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [batchSearch, setBatchSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pubToast, setPubToast] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data, isLoading, error } = useQuery<OverviewResponse>({
    queryKey: ["overview", workspaceId, selectedDate],
    queryFn: () => {
      const params = new URLSearchParams({ workspace_id: workspaceId });
      if (selectedDate) params.set("reporting_date", selectedDate);
      return apiFetch(`/overview?${params.toString()}`);
    },
  });

  const batch = data?.selected_batch ?? null;

  const { data: excData } = useQuery<{ items: BatchException[] }>({
    queryKey: ["overview-exceptions", batch?.id],
    queryFn: () => apiFetch(`/exceptions?batch_id=${batch!.id}`),
    enabled: Boolean(batch?.id),
  });

  const publishMut = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; publication_status: string; version_number: number }>(
        "/reports/publish",
        {
          method: "POST",
          actor,
          body: JSON.stringify({
            batch_id: batch!.id,
            diagnostic_only: false,
            notes: `Executive Overview sign-off by ${actor.actorId}`,
          }),
        }
      ),
    onSuccess: (res) => {
      setPubToast({
        type: "ok",
        text: `Published ${res.publication_status} report v${res.version_number}.`,
      });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err: Error) => {
      const msg = err instanceof ApiError ? `HTTP ${err.status}: ${err.message}` : err.message;
      setPubToast({ type: "err", text: msg });
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-12 rounded-[4px] border border-[#372E40] bg-[#241D2B] animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 rounded-[4px] border border-[#372E40] bg-[#241D2B] animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[4px] border border-[#DE785F] bg-[#2F1B22] p-6 text-sm text-[#FF9D85]">
        Failed to load Executive Overview from FastAPI backend. Ensure PostgreSQL and uvicorn are running.
      </div>
    );
  }

  const isBlocked = batch?.status === "BLOCKED";
  const hasVariance = Math.abs(batch?.financial_variance_usd ?? 0) > 0.01;
  const openExceptions = (excData?.items || []).filter((e) =>
    ["OPEN", "INVESTIGATING", "WAIVER_REQUESTED"].includes(e.status)
  );

  // Waterfall data from real batch figures
  const custodyVal = batch?.custody_total_usd ?? 0;
  const calcVal = batch?.calculated_total_usd ?? 0;
  const varianceVal = batch?.financial_variance_usd ?? 0;

  const waterfallData = [
    {
      name: "Custody Feed",
      value: Number((custodyVal / 1_000_000).toFixed(2)),
      fill: "#4F445E",
      raw: custodyVal,
    },
    {
      name: "Calculated Ledger",
      value: Number((calcVal / 1_000_000).toFixed(2)),
      fill: "#D9F66F",
      raw: calcVal,
    },
    {
      name: "Net Variance",
      value: Number((Math.abs(varianceVal) / 1_000_000).toFixed(4)),
      fill: hasVariance ? "#DE785F" : "#8AE2A4",
      raw: varianceVal,
    },
  ];

  const filteredBatches = data.recent_batches.filter((b) => {
    const matchesSearch =
      !batchSearch ||
      b.batch_code.toLowerCase().includes(batchSearch.toLowerCase()) ||
      b.reporting_date.includes(batchSearch);
    const matchesStatus = !statusFilter || b.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const sevMap = new Map(data.severity_breakdown.map((s) => [s.severity, s.count]));
  const coveragePct = batch?.reconciliation_coverage_pct ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Action & Context Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#372E40] bg-[#201927] p-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-1.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              CYCLE DATE
            </span>
            <select
              aria-label="Reporting date selector"
              value={selectedDate || batch?.reporting_date || ""}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent font-mono text-xs font-semibold text-[#EBDEF2] focus:outline-none cursor-pointer"
            >
              {data.available_dates.map((d) => (
                <option key={d} value={d} className="bg-[#241D2B]">
                  {d}
                </option>
              ))}
            </select>
          </div>

          {batch && (
            <div className="flex items-center gap-2 font-mono text-xs text-[#B7A9C7]">
              <span>BATCH:</span>
              <span className="font-semibold text-[#EBDEF2]">{batch.batch_code}</span>
              <StatusBadge status={batch.status} />
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/failure-lab"
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#D9F66F] px-3.5 py-2 text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64] transition-colors"
          >
            <Play className="h-3.5 w-3.5" />
            Run Failure Lab Stress Test
          </Link>
          {data.last_publication && (
            <a
              href={`${API_BASE}/api/v1/reports/${data.last_publication.id}/download`}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#372E40] bg-[#241D2B] px-3.5 py-2 text-xs font-medium text-[#EBDEF2] hover:border-[#B7A9C7] transition-colors"
            >
              <Download className="h-3.5 w-3.5 text-[#D9F66F]" />
              Export Audit Package
            </a>
          )}
          {batch && (
            <button
              onClick={() => publishMut.mutate()}
              disabled={publishMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#372E40] bg-[#120B19] px-3.5 py-2 text-xs font-medium text-[#EBDEF2] hover:border-[#D9F66F] disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-[#8AE2A4]" />
              Sign Off Batch
            </button>
          )}
        </div>
      </div>

      {pubToast && (
        <div
          className={`flex items-center justify-between rounded-[4px] border px-4 py-3 text-xs ${
            pubToast.type === "ok"
              ? "border-[#2E7D52] bg-[#162E21] text-[#8AE2A4]"
              : "border-[#DE785F] bg-[#2F1B22] text-[#FF9D85]"
          }`}
        >
          <span className="flex items-center gap-2 font-mono">
            {pubToast.type === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <XOctagon className="h-4 w-4 shrink-0" />
            )}
            {pubToast.text}
          </span>
          <button onClick={() => setPubToast(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Editorial Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between border-b border-[#372E40] pb-5">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
            ASSURANCE CONTROL DESK // {batch?.batch_code || "NO BATCH"}
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
            Reporting integrity, at a glance.
          </h1>
          <p className="mt-1 text-xs text-[#B7A9C7]">
            Deterministic reconciliation across Custody, Internal Ledger, Trades, CRM, and Treasury FX.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-5 font-mono text-[11px]">
          <div>
            <div className="text-[9px] uppercase tracking-[0.08em] text-[#90937E]">
              LAST OFFICIAL FINGERPRINT
            </div>
            <div className="mt-0.5 text-[#EBDEF2]">
              {data.last_publication
                ? `SHA-256: ${data.last_publication.content_fingerprint.slice(0, 14)}…`
                : "Pending Official Issue"}
            </div>
          </div>
          <div>
            <div className="text-[9px] uppercase tracking-[0.08em] text-[#90937E]">
              EXECUTION LATENCY
            </div>
            <div className="mt-0.5 text-[#D9F66F]">
              {batch?.duration_ms ? `${batch.duration_ms} ms` : "Synced"}
            </div>
          </div>
        </div>
      </div>

      {/* 5-Column KPI Strip */}
      {batch && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {/* KPI 1 */}
          <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              <span>TOTAL ASSETS UNDER REPORTING</span>
              <Database className="h-3.5 w-3.5 text-[#90937E]" />
            </div>
            <div className="mt-3 font-display text-xl font-bold text-[#EBDEF2] tabular-nums">
              {formatUsd(batch.total_assets_usd)}
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[#8AE2A4]">
              <span>{batch.sources_processed} Sources Verified</span>
              <span className="text-[#90937E]">USD BASE</span>
            </div>
          </div>

          {/* KPI 2 */}
          <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              <span>RECONCILED RECORDS</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-[#8AE2A4]" />
            </div>
            <div className="mt-3 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
              {formatNumber(batch.records_validated)}
            </div>
            <div className="mt-2 flex items-center justify-between font-mono text-[10px]">
              <span className="text-[#8AE2A4]">{coveragePct.toFixed(2)}% match rate</span>
              <span className="text-[#90937E]">of {formatNumber(batch.records_ingested)}</span>
            </div>
          </div>

          {/* KPI 3 */}
          <div
            className={`rounded-[4px] border p-4 flex flex-col justify-between ${
              hasVariance
                ? "border-[#DE785F] bg-[#2F1B22]"
                : "border-[#372E40] bg-[#241D2B]"
            }`}
          >
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              <span>NET FINANCIAL VARIANCE</span>
              <AlertTriangle
                className={`h-3.5 w-3.5 ${hasVariance ? "text-[#DE785F]" : "text-[#8AE2A4]"}`}
              />
            </div>
            <div
              className={`mt-3 font-display text-2xl font-bold tabular-nums ${
                hasVariance ? "text-[#FF9D85]" : "text-[#8AE2A4]"
              }`}
            >
              {formatUsd(batch.financial_variance_usd)}
            </div>
            <div className="mt-2 font-mono text-[10px]">
              {hasVariance ? (
                <span className="text-[#FF9D85]">Unexplained Discrepancy</span>
              ) : (
                <span className="text-[#8AE2A4]">Zero Roll-Forward Variance</span>
              )}
            </div>
          </div>

          {/* KPI 4 */}
          <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              <span>OPEN EXCEPTIONS</span>
              <ShieldAlert className="h-3.5 w-3.5 text-[#FFCE73]" />
            </div>
            <div className="mt-3 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
              {batch.open_exceptions}{" "}
              <span className="text-xs font-normal text-[#B7A9C7]">active</span>
            </div>
            <div className="mt-2 flex items-center gap-2 font-mono text-[10px]">
              <span className="text-[#FF9D85]">{sevMap.get("CRITICAL") ?? 0} Crit</span>
              <span className="text-[#FFCE73]">{sevMap.get("HIGH") ?? 0} High</span>
              <span className="text-[#B7A9C7]">{sevMap.get("MEDIUM") ?? 0} Med</span>
            </div>
          </div>

          {/* KPI 5 */}
          <div
            className={`rounded-[4px] border p-4 flex flex-col justify-between ${
              isBlocked
                ? "border-[#DE785F] bg-[#331A1E]"
                : batch.status === "PASS"
                ? "border-[#2E7D52] bg-[#162E21]"
                : "border-[#C27803] bg-[#2E2415]"
            }`}
          >
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              <span>PUBLICATION GATE</span>
              <Lock className="h-3.5 w-3.5 text-[#EBDEF2]" />
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="font-display text-xl font-bold tracking-tight text-[#EBDEF2]">
                {batch.status.replace(/_/g, " ")}
              </span>
            </div>
            <div className="mt-2 font-mono text-[10px] text-[#B7A9C7]">
              {isBlocked
                ? "Official release locked (409)"
                : "Eligible for Excel export"}
            </div>
          </div>
        </div>
      )}

      {/* Main 12-Column Matrix: Waterfall (8) + Publication Gate (4) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 8 Cols: Reconciliation Waterfall & Flow Matrix */}
        <div className="lg:col-span-8 rounded-[4px] border border-[#372E40] bg-[#241D2B] flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#372E40] px-5 py-3.5">
              <div>
                <h2 className="font-display text-base font-semibold text-[#EBDEF2]">
                  Institutional Reconciliation Waterfall &amp; Flow Matrix
                </h2>
                <p className="font-mono text-[10px] text-[#B7A9C7]">
                  CUSTODY FEED vs CALCULATED ROLL-FORWARD LEDGER ($M USD)
                </p>
              </div>
              <Link
                href={`/app/investigate?batchId=${batch?.id || ""}`}
                className="inline-flex items-center gap-1 rounded-[4px] border border-[#372E40] bg-[#120B19] px-2.5 py-1 font-mono text-[10px] text-[#D9F66F] hover:border-[#D9F66F]"
              >
                Inspect Lineage <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 border-b border-[#372E40] bg-[#201927] px-5 py-2.5 font-mono text-[11px]">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-[1px] bg-[#4F445E]" />
                <span className="text-[#B7A9C7]">Custody Reported:</span>
                <span className="font-semibold text-[#EBDEF2] tabular-nums">
                  {formatUsd(custodyVal)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-[1px] bg-[#D9F66F]" />
                <span className="text-[#B7A9C7]">Calculated Ledger:</span>
                <span className="font-semibold text-[#EBDEF2] tabular-nums">
                  {formatUsd(calcVal)}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`h-2.5 w-2.5 rounded-[1px] ${
                    hasVariance ? "bg-[#DE785F]" : "bg-[#8AE2A4]"
                  }`}
                />
                <span className="text-[#B7A9C7]">Net Variance:</span>
                <span
                  className={`font-semibold tabular-nums ${
                    hasVariance ? "text-[#FF9D85]" : "text-[#8AE2A4]"
                  }`}
                >
                  {formatUsd(varianceVal)}
                </span>
              </div>
            </div>

            {/* Recharts Bar Matrix */}
            <div className="p-5 h-[270px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={waterfallData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid stroke="#372E40" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="name"
                    stroke="#B7A9C7"
                    tick={{ fill: "#B7A9C7", fontSize: 11, fontFamily: "var(--font-ibm-mono)" }}
                    axisLine={{ stroke: "#372E40" }}
                    tickLine={false}
                  />
                  <YAxis
                    stroke="#B7A9C7"
                    tick={{ fill: "#90937E", fontSize: 11, fontFamily: "var(--font-ibm-mono)" }}
                    axisLine={{ stroke: "#372E40" }}
                    tickLine={false}
                    tickFormatter={(v) => `$${v}M`}
                  />
                  <Tooltip
                    cursor={{ fill: "#302839", opacity: 0.5 }}
                    contentStyle={{
                      backgroundColor: "#120B19",
                      border: "1px solid #372E40",
                      borderRadius: "4px",
                      fontSize: "12px",
                      color: "#EBDEF2",
                      fontFamily: "var(--font-ibm-mono)",
                    }}
                    formatter={(_val, _name, props) => [
                      formatUsd(props?.payload?.raw ?? 0),
                      "Exact USD",
                    ]}
                  />
                  <Bar dataKey="value" radius={[2, 2, 0, 0]} maxBarSize={72} isAnimationActive={false}>
                    {waterfallData.map((entry, idx) => (
                      <Cell key={idx} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Tolerance Footer Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-[#372E40] divide-y sm:divide-y-0 sm:divide-x divide-[#372E40] bg-[#201927]">
            <div className="px-4 py-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#90937E]">
                BALANCE CONTINUITY TOLERANCE
              </div>
              <div className="mt-1 font-mono text-xs font-semibold text-[#EBDEF2]">
                $1.00 / account
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#90937E]">
                CURRENT EXCURSION
              </div>
              <div
                className={`mt-1 font-mono text-xs font-semibold ${
                  hasVariance ? "text-[#FF9D85]" : "text-[#8AE2A4]"
                }`}
              >
                {hasVariance ? `${formatUsd(varianceVal)} Discrepancy` : "Within Tolerance ($0.00)"}
              </div>
            </div>
            <div className="px-4 py-3">
              <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#90937E]">
                CONTROL ENGINE STATUS
              </div>
              <div className="mt-1 font-mono text-xs font-semibold text-[#D9F66F]">
                16 Registered Controls Active
              </div>
            </div>
          </div>
        </div>

        {/* Right 4 Cols: Publication Gate & Attestation */}
        <div className="lg:col-span-4 rounded-[4px] border border-[#372E40] bg-[#241D2B] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#372E40] px-4 py-3.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#D9F66F]" />
                <h2 className="font-display text-sm font-semibold text-[#EBDEF2]">
                  Publication Gate &amp; Attestation
                </h2>
              </div>
              {batch && <StatusBadge status={batch.status} />}
            </div>

            {/* Coverage Ring + Policy */}
            <div className="flex items-center gap-4 border-b border-[#372E40] bg-[#201927] p-4">
              <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border-4 border-[#372E40]">
                <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 36 36">
                  <circle
                    cx="18"
                    cy="18"
                    r="15.5"
                    fill="none"
                    stroke={isBlocked ? "#DE785F" : "#D9F66F"}
                    strokeWidth="3"
                    strokeDasharray={`${Math.min(100, coveragePct)}, 100`}
                  />
                </svg>
                <span className="font-mono text-xs font-bold text-[#EBDEF2] tabular-nums">
                  {Math.round(coveragePct)}%
                </span>
              </div>
              <div className="min-w-0">
                <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#EBDEF2]">
                  GATE POLICY: ZERO HARD BLOCKERS
                </div>
                <p className="mt-1 text-xs text-[#B7A9C7] leading-relaxed">
                  {isBlocked
                    ? "Official publication is blocked until critical exceptions are resolved or waived."
                    : "All blocking gates satisfied. Batch is eligible for official Excel publication."}
                </p>
              </div>
            </div>

            {/* Active Exceptions List */}
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                <span>ACTIVE EXCEPTIONS ({openExceptions.length})</span>
                <Link href="/app/exceptions" className="text-[#D9F66F] hover:underline">
                  Manage Desk →
                </Link>
              </div>

              {openExceptions.length === 0 ? (
                <div className="rounded-[4px] border border-[#2E7D52]/50 bg-[#162E21] p-3 text-xs text-[#8AE2A4]">
                  No open exceptions for this batch. Ready for Controller sign-off.
                </div>
              ) : (
                <div className="space-y-2 max-h-[210px] overflow-y-auto pr-1">
                  {openExceptions.slice(0, 4).map((ex) => (
                    <div
                      key={ex.id}
                      className={`rounded-[4px] border p-2.5 ${
                        ex.is_blocking
                          ? "border-[#DE785F]/60 bg-[#2F1B22]"
                          : "border-[#372E40] bg-[#120B19]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[11px] font-semibold text-[#EBDEF2]">
                          {ex.rule_id}
                        </span>
                        <span className="font-mono text-[11px] font-semibold text-[#FF9D85] tabular-nums">
                          {formatUsd(ex.variance_amount_usd)}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-[#B7A9C7] line-clamp-1">{ex.title}</p>
                      <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] text-[#90937E]">
                        <span>{ex.source_system}</span>
                        <Link href="/app/exceptions" className="text-[#D9F66F] hover:underline">
                          Resolve &gt;
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Bottom Governance Actions */}
          <div className="border-t border-[#372E40] bg-[#201927] p-4 flex items-center justify-between gap-2">
            <Link
              href="/app/exceptions"
              className="flex-1 text-center rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-2 font-mono text-[11px] font-medium text-[#EBDEF2] hover:border-[#B7A9C7]"
            >
              Review Exceptions
            </Link>
            <Link
              href="/app/reports"
              className="flex-1 text-center rounded-[4px] bg-[#D9F66F] px-3 py-2 font-mono text-[11px] font-semibold text-[#171E00] hover:bg-[#CEEA64]"
            >
              Reports Center
            </Link>
          </div>
        </div>
      </div>

      {/* Multi-Source Ingestion & Node Connectivity Strip */}
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B7A9C7]">
            MULTI-SOURCE INGESTION &amp; NODE CONNECTIVITY
          </span>
          <Link href="/app/sources" className="font-mono text-[10px] text-[#8AE2A4] hover:underline">
            Inspect Raw Snapshots →
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {data.source_coverage.map((src) => (
            <div
              key={`${src.source_system}-${src.file_name}`}
              className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-3.5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-semibold text-[#EBDEF2]">
                  {src.source_system}
                </span>
                <span className="font-mono text-[10px] text-[#8AE2A4]">{src.status}</span>
              </div>
              <div className="mt-1 truncate font-mono text-[10px] text-[#B7A9C7]">
                {src.file_name}
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-[#90937E]">
                <span>{formatNumber(src.row_count)} rows</span>
                <span>#{src.source_hash}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Execution Log & Batch Integrity Register */}
      <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#372E40] px-5 py-3.5">
          <div>
            <h2 className="font-display text-sm font-semibold text-[#EBDEF2]">
              Execution Log &amp; Batch Integrity Register
            </h2>
            <p className="font-mono text-[10px] text-[#90937E]">
              SHOWING {filteredBatches.length} OF {data.recent_batches.length} RECENT BATCHES
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              placeholder="Filter batch code..."
              value={batchSearch}
              onChange={(e) => setBatchSearch(e.target.value)}
              className="rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-1.5 font-mono text-xs text-[#EBDEF2] placeholder-[#90937E] focus:border-[#D9F66F] focus:outline-none"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-[4px] border border-[#372E40] bg-[#120B19] px-2.5 py-1.5 font-mono text-xs text-[#EBDEF2] focus:border-[#D9F66F] focus:outline-none"
            >
              <option value="">ALL STATUSES</option>
              <option value="PASS">PASS</option>
              <option value="PASS_WITH_WARNINGS">PASS WITH WARNINGS</option>
              <option value="BLOCKED">BLOCKED</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#372E40] bg-[#201927] font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Batch ID</th>
                <th className="px-4 py-2.5 font-semibold">Reporting Date</th>
                <th className="px-4 py-2.5 font-semibold">Gate Status</th>
                <th className="px-4 py-2.5 font-semibold text-right">Total Assets</th>
                <th className="px-4 py-2.5 font-semibold text-right">Variance</th>
                <th className="px-4 py-2.5 font-semibold text-right">Exceptions</th>
                <th className="px-4 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#372E40]">
              {filteredBatches.map((b) => {
                const isSelected = b.id === batch?.id;
                const rowBlocked = b.status === "BLOCKED";
                return (
                  <tr
                    key={b.id}
                    className={`h-10 transition-colors hover:bg-[#302839] ${
                      isSelected
                        ? "border-l-[3px] border-l-[#D9F66F] bg-[#201927]"
                        : rowBlocked
                        ? "border-l-[3px] border-l-[#DE785F]"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#EBDEF2]">
                      <Link href={`/app/runs/${b.id}`} className="hover:text-[#D9F66F]">
                        {b.batch_code}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#B7A9C7]">{b.reporting_date}</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={b.status} />
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
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#B7A9C7]">
                      {b.exceptions_count}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono">
                      <Link
                        href={`/app/investigate?batchId=${b.id}`}
                        className="text-[11px] font-semibold text-[#D9F66F] hover:underline"
                      >
                        {rowBlocked ? "Inspect Variance →" : "View Lineage →"}
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
