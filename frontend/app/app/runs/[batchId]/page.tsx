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
        text: err instanceof ApiError ? `HTTP ${err.status}: ${err.message}` : err.message,
      });
    },
  });

  if (isLoading || !data) {
    return <div className="p-8 font-mono text-xs text-[#90937E]">Loading batch execution evidence...</div>;
  }

  const { batch, stages, sources, controls } = data;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <Link
            href="/app/runs"
            className="inline-flex items-center gap-1 font-mono text-[11px] text-[#B7A9C7] hover:text-[#D9F66F] mb-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> BACK TO RUNS
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-bold font-mono text-[#EBDEF2]">
              {batch.batch_code}
            </h1>
            <StatusBadge status={batch.status} />
          </div>
          <p className="font-mono text-[11px] text-[#90937E] mt-1">
            Reporting Date: {batch.reporting_date} • Triggered by {batch.triggered_by} •{" "}
            {batch.duration_ms ?? 0} ms
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/app/investigate?batchId=${batch.id}`}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#372E40] bg-[#241D2B] px-3 py-2 font-mono text-xs font-medium text-[#EBDEF2] hover:border-[#D9F66F]"
          >
            <SearchCode className="h-3.5 w-3.5 text-[#D9F66F]" />
            Investigate Variance
          </Link>
          <button
            onClick={() => publishMut.mutate(false)}
            disabled={publishMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#D9F66F] px-3.5 py-2 font-mono text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64] disabled:opacity-50 cursor-pointer"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Publish Official Report
          </button>
          {!batch.publication_eligible && (
            <button
              onClick={() => publishMut.mutate(true)}
              disabled={publishMut.isPending}
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-2 font-mono text-xs font-medium text-[#B7A9C7] hover:border-[#B7A9C7] cursor-pointer"
            >
              Diagnostic Preview
            </button>
          )}
        </div>
      </div>

      {pubMsg && (
        <div
          className={`flex items-start gap-2.5 rounded-[4px] border p-3.5 font-mono text-xs ${
            pubMsg.type === "ok"
              ? "border-[#2E7D52] bg-[#162E21] text-[#8AE2A4]"
              : "border-[#DE785F] bg-[#2F1B22] text-[#FF9D85]"
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
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4">
          <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">CUSTODY TOTAL</div>
          <div className="mt-1.5 font-display text-xl font-bold text-[#EBDEF2] tabular-nums">
            {formatUsd(batch.custody_total_usd)}
          </div>
        </div>
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4">
          <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">CALCULATED TOTAL</div>
          <div className="mt-1.5 font-display text-xl font-bold text-[#EBDEF2] tabular-nums">
            {formatUsd(batch.calculated_total_usd)}
          </div>
        </div>
        <div
          className={`rounded-[4px] border p-4 ${
            Math.abs(batch.financial_variance_usd) > 0.01
              ? "border-[#DE785F] bg-[#2F1B22]"
              : "border-[#372E40] bg-[#241D2B]"
          }`}
        >
          <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">VARIANCE</div>
          <div
            className={`mt-1.5 font-display text-xl font-bold tabular-nums ${
              Math.abs(batch.financial_variance_usd) > 0.01 ? "text-[#FF9D85]" : "text-[#8AE2A4]"
            }`}
          >
            {formatUsd(batch.financial_variance_usd)}
          </div>
        </div>
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4">
          <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">RECORDS VALIDATED</div>
          <div className="mt-1.5 font-display text-xl font-bold text-[#EBDEF2] tabular-nums">
            {formatNumber(batch.records_validated)} / {formatNumber(batch.records_ingested)}
          </div>
        </div>
      </div>

      {/* Pipeline Stages & Sources */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
          <div className="border-b border-[#372E40] bg-[#201927] px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B7A9C7]">
            PIPELINE STAGES ({stages.length})
          </div>
          <div className="divide-y divide-[#372E40]">
            {stages.map((s) => (
              <div key={s.stage_name} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-mono font-semibold text-[#EBDEF2]">{s.stage_name}</div>
                  <div className="font-mono text-[10px] text-[#90937E]">
                    in: {formatNumber(s.records_in)} → out: {formatNumber(s.records_out)} ({s.duration_ms} ms)
                  </div>
                </div>
                <StatusBadge status={s.status} />
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
          <div className="border-b border-[#372E40] bg-[#201927] px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B7A9C7]">
            INGESTED SOURCE SNAPSHOTS ({sources.length})
          </div>
          <div className="divide-y divide-[#372E40]">
            {sources.map((src) => (
              <div key={src.id} className="px-4 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <div className="font-mono font-semibold text-[#D9F66F]">{src.source_system}</div>
                  <div className="font-mono text-[10px] text-[#B7A9C7]">
                    {src.file_name} • {formatNumber(src.row_count)} rows • #{src.source_hash.slice(0, 10)}
                  </div>
                </div>
                <StatusBadge status={src.processing_status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Control Evaluations */}
      <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
        <div className="border-b border-[#372E40] bg-[#201927] px-4 py-2.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B7A9C7]">
          CONTROL EVALUATION RESULTS ({controls.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase text-[#90937E]">
              <tr>
                <th className="px-4 py-2.5">Rule ID</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5 text-right">Evaluated</th>
                <th className="px-4 py-2.5 text-right">Failed</th>
                <th className="px-4 py-2.5 text-right">Variance</th>
                <th className="px-4 py-2.5">Evidence Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#372E40]">
              {controls.map((c) => (
                <tr key={c.id} className="hover:bg-[#302839]">
                  <td className="px-4 py-2.5 font-mono font-semibold text-[#D9F66F]">
                    {c.rule_id} <span className="text-[#90937E]">v{c.rule_version}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#B7A9C7]">
                    {formatNumber(c.evaluated_count)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#FF9D85]">
                    {formatNumber(c.failed_count)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#EBDEF2]">
                    {formatUsd(c.measured_variance_usd)}
                  </td>
                  <td className="px-4 py-2.5 text-[#B7A9C7]">{c.evidence_summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
