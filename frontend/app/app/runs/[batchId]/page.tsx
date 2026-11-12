"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, FileSpreadsheet, SearchCode, XOctagon } from "lucide-react";
import { ApiError, apiFetch, formatNumber, formatUsd } from "@/lib/api";
import { useAppState } from "@/components/providers";
import { StatusBadge } from "@/components/StatusBadge";

interface BatchDetail {
  batch: {
    id: string;
    batch_code: string;
    reporting_date: string;
    status: string;
    is_sandbox: boolean;
    total_assets_usd: number;
    custody_total_usd: number;
    calculated_total_usd: number;
    financial_variance_usd: number;
    records_ingested: number;
    records_validated: number;
    exceptions_count: number;
    duration_ms: number | null;
    triggered_by: string;
    notes: string | null;
    publication_eligible: boolean;
  };
  stages: Array<{
    stage_name: string;
    status: string;
    started_at: string;
    completed_at: string;
    duration_ms: number;
    records_in: number;
    records_out: number;
  }>;
  sources: Array<{
    id: string;
    source_system: string;
    file_name: string;
    row_count: number;
    source_hash: string;
    processing_status: string;
  }>;
  controls: Array<{
    id: number;
    rule_id: string;
    rule_version: string;
    status: string;
    is_blocking: boolean;
    evaluated_count: number;
    failed_count: number;
    measured_variance_usd: number;
    threshold_description: string;
    evidence_summary: string;
  }>;
}

export default function RunDetailPage() {
  const { batchId } = useParams<{ batchId: string }>();
  const { actor } = useAppState();
  const qc = useQueryClient();
  const [pubMsg, setPubMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data, isLoading } = useQuery<BatchDetail>({
    queryKey: ["batch-detail", batchId],
    queryFn: () => apiFetch(`/batches/${batchId}`),
  });

  const publishMut = useMutation({
    mutationFn: (diagnosticOnly: boolean) =>
      apiFetch("/reports/publish", {
        method: "POST",
        actor,
        body: JSON.stringify({
          batch_id: batchId,
          diagnostic_only: diagnosticOnly,
          notes: diagnosticOnly ? "Diagnostic preview from run detail" : "Official sign-off from run detail",
        }),
      }),
    onSuccess: (res: unknown) => {
      const r = res as { publication_status: string; version_number: number };
      setPubMsg({
        type: "ok",
        text: `Issued ${r.publication_status} report v${r.version_number}. View in Reports.`,
      });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err: Error) => {
      setPubMsg({
        type: "err",
        text: err instanceof ApiError ? err.message : err.message,
      });
    },
  });

  if (isLoading || !data) {
    return <div className="p-8 text-xs text-[#667085]">Loading batch execution evidence...</div>;
  }

  const { batch, stages, sources, controls } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link href="/app/runs" className="inline-flex items-center gap-1 text-xs text-[#667085] hover:text-[#172033] mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Runs
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold font-mono text-[#101828]">{batch.batch_code}</h1>
            <StatusBadge status={batch.status} size="md" />
          </div>
          <p className="text-xs text-[#667085] mt-1">
            Reporting Date: {batch.reporting_date} • Triggered by {batch.triggered_by} •{" "}
            {batch.duration_ms ?? 0} ms
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href={`/app/investigate?batchId=${batch.id}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-[#E5E9F0] bg-white px-3 py-2 text-xs font-medium text-[#172033] hover:bg-[#F2F4F7]"
          >
            <SearchCode className="h-3.5 w-3.5 text-[#3267D6]" />
            Investigate Variance
          </Link>
          <button
            onClick={() => publishMut.mutate(false)}
            disabled={publishMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#101828] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1D2939] disabled:opacity-50"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Publish Official Report
          </button>
          {!batch.publication_eligible && (
            <button
              onClick={() => publishMut.mutate(true)}
              disabled={publishMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#D0D5DD] bg-white px-3 py-2 text-xs font-medium text-[#344054] hover:bg-[#F2F4F7]"
            >
              Generate Diagnostic Preview
            </button>
          )}
        </div>
      </div>

      {pubMsg && (
        <div
          className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-xs ${
            pubMsg.type === "ok"
              ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#168363]"
              : "border-[#FECDCA] bg-[#FEF3F2] text-[#C74242]"
          }`}
        >
          {pubMsg.type === "ok" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
          ) : (
            <XOctagon className="h-4 w-4 shrink-0 mt-0.5" />
          )}
          <div>{pubMsg.text}</div>
        </div>
      )}

      {/* Financial Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-4">
          <div className="text-xs text-[#667085]">Custody Total (USD)</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatUsd(batch.custody_total_usd)}</div>
        </div>
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-4">
          <div className="text-xs text-[#667085]">Calculated Mart Total (USD)</div>
          <div className="mt-1 text-lg font-semibold tabular-nums">{formatUsd(batch.calculated_total_usd)}</div>
        </div>
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-4">
          <div className="text-xs text-[#667085]">Financial Variance</div>
          <div
            className={`mt-1 text-lg font-semibold tabular-nums ${
              Math.abs(batch.financial_variance_usd) > 1 ? "text-[#C74242]" : "text-[#168363]"
            }`}
          >
            {formatUsd(batch.financial_variance_usd)}
          </div>
        </div>
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-4">
          <div className="text-xs text-[#667085]">Publication Eligibility</div>
          <div className="mt-1 text-sm font-semibold text-[#101828]">
            {batch.publication_eligible ? "ELIGIBLE (Controller Sign-Off)" : "BLOCKED BY CONTROLS"}
          </div>
        </div>
      </div>

      {/* Pipeline Stages */}
      <div className="rounded-lg border border-[#E5E9F0] bg-white p-5">
        <h2 className="text-sm font-semibold text-[#101828] mb-3">Pipeline Stage Timestamps & Durations</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {stages.map((s) => (
            <div key={s.stage_name} className="rounded-md border border-[#E5E9F0] bg-[#F9FAFB] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#101828]">{s.stage_name}</span>
                <StatusBadge status={s.status === "COMPLETED" ? "PASS" : s.status} />
              </div>
              <div className="mt-2 text-[11px] text-[#667085] tabular-nums">
                In: {formatNumber(s.records_in)} → Out: {formatNumber(s.records_out)}
              </div>
              <div className="mt-1 text-[11px] font-mono text-[#667085]">{s.duration_ms} ms</div>
            </div>
          ))}
        </div>
      </div>

      {/* Control Execution Evidence */}
      <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
        <div className="border-b border-[#E5E9F0] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[#101828]">Control Execution Evidence ({controls.length} Rules)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Rule ID</th>
                <th className="px-4 py-2.5 font-medium">Blocking</th>
                <th className="px-4 py-2.5 font-medium text-right">Evaluated</th>
                <th className="px-4 py-2.5 font-medium text-right">Failed</th>
                <th className="px-4 py-2.5 font-medium text-right">Variance</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Evidence Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E9F0]">
              {controls.map((c) => (
                <tr key={c.id} className={c.status === "FAIL" ? "bg-[#FEF3F2]/50" : "hover:bg-[#F9FAFB]"}>
                  <td className="px-4 py-2.5 font-mono font-medium text-[#101828]">
                    {c.rule_id} <span className="text-[#667085]">v{c.rule_version}</span>
                  </td>
                  <td className="px-4 py-2.5">{c.is_blocking ? "Blocking" : "Warning"}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(c.evaluated_count)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-medium">{c.failed_count}</td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                    {formatUsd(c.measured_variance_usd)}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-2.5 text-[#475467]">{c.evidence_summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Source Manifests */}
      <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
        <div className="border-b border-[#E5E9F0] px-5 py-3.5">
          <h2 className="text-sm font-semibold text-[#101828]">Ingested Source Snapshots ({sources.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
              <tr>
                <th className="px-4 py-2.5 font-medium">Source System</th>
                <th className="px-4 py-2.5 font-medium">File Name</th>
                <th className="px-4 py-2.5 font-medium text-right">Rows</th>
                <th className="px-4 py-2.5 font-medium">Source Hash (SHA-256)</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E9F0]">
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="px-4 py-2.5 font-medium">{s.source_system}</td>
                  <td className="px-4 py-2.5 font-mono">{s.file_name}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(s.row_count)}</td>
                  <td className="px-4 py-2.5 font-mono text-[#667085]">{s.source_hash.slice(0, 24)}…</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={s.processing_status === "INGESTED" ? "PASS" : s.processing_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
