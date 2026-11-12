"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Play,
  RotateCcw,
  SearchCode,
  ShieldAlert,
  XOctagon,
} from "lucide-react";
import { API_BASE, ApiError, apiFetch, formatUsd } from "@/lib/api";
import { useAppState } from "@/components/providers";
import { StatusBadge } from "@/components/StatusBadge";

interface Scenario {
  scenario_key: string;
  name: string;
  category: string;
  expected_rule: string;
  description: string;
  is_signature: boolean;
}

interface FailureRun {
  id: string;
  scenario_key: string;
  scenario_name: string;
  seed: number;
  status: string;
  expected_variance_usd: number;
  actual_variance_usd: number;
  injected_details: Record<string, unknown>;
  baseline_batch: { id: string; batch_code: string; status: string; total_assets_usd: number } | null;
  corrupted_batch: {
    id: string;
    batch_code: string;
    status: string;
    financial_variance_usd: number;
    exceptions_count: number;
  } | null;
  corrected_batch: {
    id: string;
    batch_code: string;
    status: string;
    financial_variance_usd: number;
    exceptions_count: number;
  } | null;
  created_at: string;
}

export default function FailureLabPage() {
  const { actor } = useAppState();
  const qc = useQueryClient();
  const [seed, setSeed] = useState(20261112);
  const [activeRun, setActiveRun] = useState<FailureRun | null>(null);
  const [gateFeedback, setGateFeedback] = useState<{ type: "blocked" | "ok"; text: string; reportId?: string } | null>(null);

  const { data: scenData } = useQuery<{ scenarios: Scenario[] }>({
    queryKey: ["fl-scenarios"],
    queryFn: () => apiFetch("/failure-lab/scenarios"),
  });

  const { data: runsData, refetch: refetchRuns } = useQuery<{ items: FailureRun[] }>({
    queryKey: ["fl-runs"],
    queryFn: () => apiFetch("/failure-lab/runs"),
  });

  const injectMut = useMutation({
    mutationFn: (scenario_key: string) =>
      apiFetch("/failure-lab/inject", {
        method: "POST",
        actor,
        body: JSON.stringify({ scenario_key, seed, reporting_date: "2026-10-30" }),
      }),
    onSuccess: async () => {
      setGateFeedback(null);
      const refreshed = await refetchRuns();
      if (refreshed.data?.items?.length) {
        setActiveRun(refreshed.data.items[0]);
      }
      qc.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const correctMut = useMutation({
    mutationFn: (runId: string) =>
      apiFetch(`/failure-lab/runs/${runId}/correct`, {
        method: "POST",
        actor,
      }),
    onSuccess: async () => {
      setGateFeedback(null);
      const refreshed = await refetchRuns();
      if (refreshed.data?.items?.length && activeRun) {
        const updated = refreshed.data.items.find((x) => x.id === activeRun.id);
        if (updated) setActiveRun(updated);
      }
      qc.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const attemptPublishMut = useMutation({
    mutationFn: (batchId: string) =>
      apiFetch<{ id: string; version_number: number; publication_status: string }>("/reports/publish", {
        method: "POST",
        actor: { actorId: "controller_marcus", role: "CONTROLLER", displayName: "Marcus Vance" },
        body: JSON.stringify({ batch_id: batchId, diagnostic_only: false, notes: "Failure Lab gate verification" }),
      }),
    onSuccess: (res) => {
      setGateFeedback({
        type: "ok",
        text: `OFFICIAL report v${res.version_number} published after remediation.`,
        reportId: res.id,
      });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err: Error) => {
      setGateFeedback({
        type: "blocked",
        text: err instanceof ApiError ? err.message : err.message,
      });
    },
  });

  const current = activeRun || runsData?.items?.[0] || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[#3267D6]">
            <FlaskConical className="h-3.5 w-3.5" />
            Isolated Synthetic Sandbox
          </div>
          <h1 className="mt-1 text-xl font-semibold text-[#101828]">
            Failure Lab — Break the data. Prove the controls.
          </h1>
          <p className="text-xs text-[#667085] mt-0.5">
            Every simulation executes the real ingestion, staging, mart, and control pipeline in an isolated sandbox.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <label className="text-xs text-[#667085]">
            Seed:
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 20261112)}
              className="ml-1.5 w-24 rounded-md border border-[#E5E9F0] bg-white px-2 py-1 text-xs font-mono text-[#101828]"
            />
          </label>
          <button
            onClick={() => injectMut.mutate("duplicate_transaction")}
            disabled={injectMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-md bg-[#C74242] px-4 py-2 text-xs font-semibold text-white hover:bg-[#A63333] disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5" />
            {injectMut.isPending ? "Running Pipeline..." : "Run $125,000 Discrepancy Demo"}
          </button>
        </div>
      </div>

      {/* Active Guided Demonstration Panel */}
      {current && (
        <div className="rounded-xl border border-[#E5E9F0] bg-white p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E9F0] pb-4">
            <div>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#3267D6]">
                Active Simulation Evidence
              </span>
              <h2 className="text-base font-semibold text-[#101828] mt-0.5">{current.scenario_name}</h2>
              <p className="text-xs text-[#667085] font-mono mt-0.5">
                Run ID: {current.id} • Seed: {current.seed}
              </p>
            </div>
            <StatusBadge status={current.status} size="md" />
          </div>

          {/* Step-by-Step Comparison Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Step A: Baseline */}
            <div className="rounded-lg border border-[#E5E9F0] bg-[#F9FAFB] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#101828]">1. Healthy Baseline</span>
                {current.baseline_batch && <StatusBadge status={current.baseline_batch.status} />}
              </div>
              <div className="mt-2 font-mono text-xs text-[#667085]">
                {current.baseline_batch?.batch_code}
              </div>
              <div className="mt-2 text-sm font-semibold tabular-nums">
                {formatUsd(current.baseline_batch?.total_assets_usd)}
              </div>
              <div className="mt-1 text-[11px] text-[#168363]">Clean baseline verified before injection</div>
            </div>

            {/* Step B-E: Corrupted Run */}
            <div className="rounded-lg border border-[#FECDCA] bg-[#FEF3F2]/50 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#101828]">2. Injected Failure</span>
                {current.corrupted_batch && <StatusBadge status={current.corrupted_batch.status} />}
              </div>
              <div className="mt-2 font-mono text-xs text-[#667085]">
                {current.corrupted_batch?.batch_code}
              </div>
              <div className="mt-2 text-sm font-semibold text-[#C74242] tabular-nums">
                Variance: {formatUsd(current.actual_variance_usd)}
              </div>
              <div className="mt-1 text-[11px] text-[#667085]">
                Exceptions raised: {current.corrupted_batch?.exceptions_count ?? 0}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {current.corrupted_batch && (
                  <>
                    <button
                      onClick={() => attemptPublishMut.mutate(current.corrupted_batch!.id)}
                      disabled={attemptPublishMut.isPending}
                      className="inline-flex items-center gap-1 rounded border border-[#FECDCA] bg-white px-2.5 py-1 text-[11px] font-medium text-[#C74242] hover:bg-[#FEF3F2]"
                    >
                      <XOctagon className="h-3 w-3" />
                      Attempt Official Publish
                    </button>
                    <Link
                      href={`/app/investigate?batchId=${current.corrupted_batch.id}`}
                      className="inline-flex items-center gap-1 rounded border border-[#E5E9F0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#172033] hover:bg-[#F2F4F7]"
                    >
                      <SearchCode className="h-3 w-3 text-[#3267D6]" />
                      Investigate
                    </Link>
                  </>
                )}
              </div>
            </div>

            {/* Step F-G: Corrected & Recovered */}
            <div className="rounded-lg border border-[#E5E9F0] bg-[#F9FAFB] p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#101828]">3. Corrected & Revalidated</span>
                {current.corrected_batch ? (
                  <StatusBadge status={current.corrected_batch.status} />
                ) : (
                  <span className="text-[11px] text-[#667085]">Pending remediation</span>
                )}
              </div>
              {current.corrected_batch ? (
                <>
                  <div className="mt-2 font-mono text-xs text-[#667085]">
                    {current.corrected_batch.batch_code}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-[#168363] tabular-nums">
                    Variance: {formatUsd(current.corrected_batch.financial_variance_usd)}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => attemptPublishMut.mutate(current.corrected_batch!.id)}
                      disabled={attemptPublishMut.isPending}
                      className="inline-flex items-center gap-1 rounded bg-[#168363] px-2.5 py-1 text-[11px] font-medium text-white hover:bg-[#126B50]"
                    >
                      <FileSpreadsheet className="h-3 w-3" />
                      Publish Official Report
                    </button>
                  </div>
                </>
              ) : (
                <div className="mt-4">
                  <button
                    onClick={() => correctMut.mutate(current.id)}
                    disabled={correctMut.isPending}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#3267D6] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2554B8] disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    {correctMut.isPending ? "Revalidating..." : "Correct Source & Rerun"}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Injected Forensic Details */}
          <div className="rounded-md border border-[#E5E9F0] bg-[#F7F8FA] p-3 text-xs">
            <span className="font-semibold text-[#101828]">Injected Payload Details: </span>
            <code className="font-mono text-[#475467]">
              {JSON.stringify(current.injected_details)}
            </code>
          </div>

          {gateFeedback && (
            <div
              className={`flex items-center justify-between gap-3 rounded-lg border p-3.5 text-xs ${
                gateFeedback.type === "blocked"
                  ? "border-[#FECDCA] bg-[#FEF3F2] text-[#C74242]"
                  : "border-[#ABEFC6] bg-[#ECFDF3] text-[#168363]"
              }`}
            >
              <div className="flex items-center gap-2">
                {gateFeedback.type === "blocked" ? (
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                )}
                <span>{gateFeedback.text}</span>
              </div>
              {gateFeedback.reportId && (
                <a
                  href={`${API_BASE}/api/v1/reports/${gateFeedback.reportId}/download`}
                  className="inline-flex items-center gap-1 rounded bg-[#168363] px-3 py-1.5 font-medium text-white hover:bg-[#126B50]"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download Excel
                </a>
              )}
            </div>
          )}
        </div>
      )}

      {/* All 11 Scenario Cards */}
      <div>
        <h2 className="text-sm font-semibold text-[#101828] mb-3">
          11 Reproducible Failure Scenarios
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(scenData?.scenarios || []).map((sc) => (
            <div
              key={sc.scenario_key}
              className={`rounded-lg border p-4 bg-white flex flex-col justify-between ${
                sc.is_signature ? "border-[#3267D6] ring-1 ring-[#3267D6]/20" : "border-[#E5E9F0]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium text-[#667085]">{sc.category}</span>
                  <span className="font-mono text-[11px] font-semibold text-[#3267D6]">
                    {sc.expected_rule}
                  </span>
                </div>
                <h3 className="mt-1.5 text-sm font-semibold text-[#101828]">{sc.name}</h3>
                <p className="mt-1.5 text-xs text-[#667085] leading-relaxed">{sc.description}</p>
              </div>
              <button
                onClick={() => injectMut.mutate(sc.scenario_key)}
                disabled={injectMut.isPending}
                className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-[#E5E9F0] bg-[#F9FAFB] px-3 py-1.5 text-xs font-medium text-[#172033] hover:bg-[#101828] hover:text-white transition-colors disabled:opacity-50"
              >
                <AlertTriangle className="h-3.5 w-3.5" />
                Inject & Run Controls
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
