"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FlaskConical,
  Lock,
  Play,
  RotateCcw,
  SearchCode,
  ShieldAlert,
  XOctagon,
  Zap,
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
  baseline_batch: {
    id: string;
    batch_code: string;
    status: string;
    total_assets_usd: number;
  } | null;
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
  const [selectedScenarioKey, setSelectedScenarioKey] = useState("duplicate_transaction");
  const [activeRun, setActiveRun] = useState<FailureRun | null>(null);
  const [gateFeedback, setGateFeedback] = useState<{
    type: "blocked" | "ok";
    text: string;
    reportId?: string;
  } | null>(null);

  const { data: scenData } = useQuery<{ scenarios: Scenario[] }>({
    queryKey: ["fl-scenarios"],
    queryFn: () => apiFetch("/failure-lab/scenarios"),
  });

  const { data: runsData, refetch: refetchRuns } = useQuery<{ items: FailureRun[] }>({
    queryKey: ["fl-runs"],
    queryFn: () => apiFetch("/failure-lab/runs"),
  });

  const currentRun = activeRun || runsData?.items?.[0] || null;
  const scenarios = scenData?.scenarios || [];
  const selectedScenario =
    scenarios.find((s) => s.scenario_key === selectedScenarioKey) || scenarios[0];

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
      qc.invalidateQueries({ queryKey: ["exceptions"] });
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
      if (refreshed.data?.items?.length) {
        const updated = refreshed.data.items.find((r) => r.id === currentRun?.id);
        setActiveRun(updated || refreshed.data.items[0]);
      }
      qc.invalidateQueries({ queryKey: ["batches"] });
    },
  });

  const testGateMut = useMutation({
    mutationFn: (batchId: string) =>
      apiFetch<{ id: string; publication_status: string; version_number: number }>(
        "/reports/publish",
        {
          method: "POST",
          actor,
          body: JSON.stringify({
            batch_id: batchId,
            diagnostic_only: false,
            notes: "Failure Lab Publication Gate verification",
          }),
        }
      ),
    onSuccess: (res) => {
      setGateFeedback({
        type: "ok",
        text: `Publication Gate PASSED — Issued ${res.publication_status} report v${res.version_number}.`,
        reportId: res.id,
      });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err: Error) => {
      if (err instanceof ApiError) {
        setGateFeedback({
          type: "blocked",
          text: `HTTP ${err.status} BLOCKED — ${err.message}. Audit event recorded.`,
        });
      } else {
        setGateFeedback({ type: "blocked", text: err.message });
      }
    },
  });

  const isCorrected = Boolean(currentRun?.corrected_batch);
  const isBlocked = Boolean(currentRun?.corrupted_batch && !currentRun?.corrected_batch);
  const targetBatchForGate =
    currentRun?.corrected_batch?.id || currentRun?.corrupted_batch?.id || "";

  return (
    <div className="space-y-6">
      {/* Top Environment Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#372E40] bg-[#120B19] px-4 py-2.5 font-mono text-[11px]">
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex items-center gap-1.5 text-[#D9F66F] font-semibold">
            <span className="h-2 w-2 rounded-full bg-[#D9F66F]" />
            ENVIRONMENT: SIMULATION SANDBOX [ws_velatrace_sandbox]
          </span>
          <span className="rounded-[2px] border border-[#DE785F] bg-[#331A1E] px-2 py-0.5 text-[10px] font-semibold text-[#FF9D85]">
            NO PRODUCTION EXPOSURE
          </span>
        </div>
        <div className="flex items-center gap-4 text-[#B7A9C7]">
          <span>
            RUN REF:{" "}
            <strong className="text-[#EBDEF2]">
              {currentRun ? currentRun.id.slice(0, 12) : "STANDBY"}
            </strong>
          </span>
          <span className="hidden sm:inline">ENGINE: DETERMINISTIC RULE EVALUATOR v1.0</span>
        </div>
      </div>

      {/* Header & Primary Action Bar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
            <FlaskConical className="h-3.5 w-3.5" />
            INSTITUTIONAL STRESS TEST &amp; CONTROL ASSURANCE HARNESS
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
            Failure Lab
          </h1>
          <p className="mt-1 text-xs text-[#B7A9C7]">
            Introduce controlled discrepancies into an isolated synthetic batch. Verify detection,
            HTTP 409 publication blocking, and full remediation.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-2 font-mono text-xs">
            <span className="text-[#90937E]">SEED</span>
            <input
              type="number"
              value={seed}
              onChange={(e) => setSeed(Number(e.target.value) || 20261112)}
              className="w-24 bg-transparent text-[#EBDEF2] focus:outline-none tabular-nums"
            />
          </div>

          <button
            onClick={() => {
              setActiveRun(null);
              setGateFeedback(null);
            }}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#372E40] bg-[#241D2B] px-3.5 py-2 text-xs font-medium text-[#EBDEF2] hover:border-[#B7A9C7] cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset Selection
          </button>

          <button
            onClick={() => injectMut.mutate(selectedScenarioKey)}
            disabled={injectMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#D9F66F] px-4 py-2 text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64] disabled:opacity-50 cursor-pointer"
          >
            <Zap className="h-3.5 w-3.5" />
            {injectMut.isPending
              ? "Injecting & Validating..."
              : "Inject Discrepancy & Re-Evaluate"}
          </button>
        </div>
      </div>

      {/* Scenario Selector Grid (11 Real Scenarios) */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {scenarios.map((sc) => {
          const isSelected = sc.scenario_key === selectedScenarioKey;
          return (
            <button
              key={sc.scenario_key}
              onClick={() => setSelectedScenarioKey(sc.scenario_key)}
              className={`text-left rounded-[4px] border p-3 transition-colors cursor-pointer ${
                isSelected
                  ? "border-[#D9F66F] bg-[#241D2B]"
                  : "border-[#372E40] bg-[#201927] hover:border-[#B7A9C7]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[10px] font-semibold text-[#D9F66F]">
                  {sc.expected_rule}
                </span>
                {sc.is_signature ? (
                  <span className="rounded-[2px] bg-[#D9F66F] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#171E00]">
                    SIGNATURE
                  </span>
                ) : (
                  <span className="font-mono text-[9px] uppercase text-[#90937E]">
                    {sc.category}
                  </span>
                )}
              </div>
              <div className="mt-1.5 font-display text-xs font-semibold text-[#EBDEF2] line-clamp-1">
                {sc.name}
              </div>
            </button>
          );
        })}
      </div>

      {/* 6-Stage Harness Verification Lifecycle */}
      <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 font-mono text-[10px] uppercase tracking-[0.08em]">
          <span className="text-[#B7A9C7]">
            HARNESS VERIFICATION LIFECYCLE // {selectedScenario?.name || "SELECT SCENARIO"}
          </span>
          <span className="text-[#D9F66F]">
            STATUS: {currentRun ? currentRun.status : "READY TO INJECT"}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {[
            {
              stage: "STAGE 01",
              title: "Scenario Configured",
              sub: selectedScenario?.expected_rule || "CTL-UNIQ-001",
              state: "done",
            },
            {
              stage: "STAGE 02",
              title: "Injected into Ingress",
              sub: currentRun ? "SANDBOX SNAPSHOT" : "PENDING",
              state: currentRun ? "done" : "idle",
            },
            {
              stage: "STAGE 03",
              title: "Control Engine",
              sub: currentRun ? "16 RULES EVALUATED" : "STANDBY",
              state: currentRun ? "done" : "idle",
            },
            {
              stage: "STAGE 04",
              title: "Discrepancy Flagged",
              sub: currentRun
                ? formatUsd(currentRun.actual_variance_usd)
                : "AWAITING RUN",
              state: isBlocked ? "alert" : isCorrected ? "done" : "idle",
            },
            {
              stage: "STAGE 05",
              title: "Publication Gate",
              sub: isBlocked
                ? "BLOCKED // HTTP 409"
                : isCorrected
                ? "PASS // CLEARED"
                : "READY",
              state: isBlocked ? "alert" : isCorrected ? "done" : "idle",
            },
            {
              stage: "STAGE 06",
              title: "Remediation",
              sub: isCorrected ? "OFFICIAL VERIFIED" : "PENDING CORRECTION",
              state: isCorrected ? "done" : "idle",
            },
          ].map((st) => (
            <div
              key={st.stage}
              className={`rounded-[4px] border p-3 ${
                st.state === "alert"
                  ? "border-[#DE785F] bg-[#2F1B22]"
                  : st.state === "done"
                  ? "border-[#2E7D52] bg-[#162E21]"
                  : "border-[#372E40] bg-[#120B19]"
              }`}
            >
              <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                {st.stage}
              </div>
              <div className="mt-1 font-display text-xs font-semibold text-[#EBDEF2]">
                {st.title}
              </div>
              <div
                className={`mt-1 font-mono text-[10px] font-semibold ${
                  st.state === "alert"
                    ? "text-[#FF9D85]"
                    : st.state === "done"
                    ? "text-[#8AE2A4]"
                    : "text-[#90937E]"
                }`}
              >
                {st.sub}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Side-by-Side Trusted Baseline vs Injected Anomaly */}
      {currentRun ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Left: Trusted Baseline */}
          <div className="rounded-[4px] border border-[#2E7D52]/60 bg-[#241D2B] overflow-hidden flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-[#372E40] bg-[#201927] px-4 py-3">
                <span className="font-mono text-xs font-semibold text-[#EBDEF2]">
                  TRUSTED BASELINE (CLEAN SNAPSHOT)
                </span>
                <StatusBadge status={currentRun.baseline_batch?.status || "PASS"} />
              </div>

              <div className="grid grid-cols-3 border-b border-[#372E40] divide-x divide-[#372E40]">
                <div className="p-3.5">
                  <div className="font-mono text-[9px] uppercase text-[#90937E]">BATCH CODE</div>
                  <div className="mt-1 font-mono text-xs font-semibold text-[#EBDEF2]">
                    {currentRun.baseline_batch?.batch_code || "BASELINE"}
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="font-mono text-[9px] uppercase text-[#90937E]">TOTAL ASSETS</div>
                  <div className="mt-1 font-mono text-xs font-semibold text-[#EBDEF2] tabular-nums">
                    {formatUsd(currentRun.baseline_batch?.total_assets_usd ?? 0)}
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="font-mono text-[9px] uppercase text-[#90937E]">AUDIT VARIANCE</div>
                  <div className="mt-1 font-mono text-xs font-semibold text-[#8AE2A4] tabular-nums">
                    $0.00 [BALANCED]
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7] mb-2">
                  INJECTION PARAMETERS &amp; PAYLOAD METADATA
                </div>
                <pre className="overflow-x-auto rounded-[4px] border border-[#372E40] bg-[#120B19] p-3 font-mono text-[11px] text-[#EBDEF2] leading-relaxed">
                  {JSON.stringify(currentRun.injected_details, null, 2)}
                </pre>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-[#372E40] bg-[#162E21] px-4 py-2.5 font-mono text-[11px] text-[#8AE2A4]">
              <span className="flex items-center gap-1.5 font-semibold">
                <CheckCircle2 className="h-3.5 w-3.5" />
                BASELINE INTEGRITY VERIFIED
              </span>
              <span>SEED: {currentRun.seed}</span>
            </div>
          </div>

          {/* Right: Injected Anomaly / Corrected State */}
          <div
            className={`rounded-[4px] border bg-[#241D2B] overflow-hidden flex flex-col justify-between ${
              isCorrected ? "border-[#2E7D52]" : "border-[#DE785F]"
            }`}
          >
            <div>
              <div className="flex items-center justify-between border-b border-[#372E40] bg-[#201927] px-4 py-3">
                <span className="font-mono text-xs font-semibold text-[#EBDEF2]">
                  {isCorrected
                    ? "REMEDIATED BATCH (CORRECTED SNAPSHOT)"
                    : "INJECTED ANOMALY (CORRUPTED FEED)"}
                </span>
                <StatusBadge
                  status={
                    isCorrected
                      ? currentRun.corrected_batch!.status
                      : currentRun.corrupted_batch?.status || "BLOCKED"
                  }
                />
              </div>

              <div
                className={`grid grid-cols-3 border-b border-[#372E40] divide-x divide-[#372E40] ${
                  isCorrected ? "bg-[#162E21]/40" : "bg-[#2F1B22]"
                }`}
              >
                <div className="p-3.5">
                  <div className="font-mono text-[9px] uppercase text-[#B7A9C7]">BATCH CODE</div>
                  <div className="mt-1 font-mono text-xs font-semibold text-[#EBDEF2]">
                    {isCorrected
                      ? currentRun.corrected_batch!.batch_code
                      : currentRun.corrupted_batch?.batch_code}
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="font-mono text-[9px] uppercase text-[#B7A9C7]">EXCEPTIONS</div>
                  <div
                    className={`mt-1 font-mono text-xs font-semibold tabular-nums ${
                      isCorrected ? "text-[#8AE2A4]" : "text-[#FF9D85]"
                    }`}
                  >
                    {isCorrected
                      ? `${currentRun.corrected_batch!.exceptions_count} Blocking`
                      : `${currentRun.corrupted_batch?.exceptions_count ?? 0} Detected`}
                  </div>
                </div>
                <div className="p-3.5">
                  <div className="font-mono text-[9px] uppercase text-[#B7A9C7]">
                    FINANCIAL VARIANCE
                  </div>
                  <div
                    className={`mt-1 font-mono text-xs font-semibold tabular-nums ${
                      isCorrected ? "text-[#8AE2A4]" : "text-[#FF9D85]"
                    }`}
                  >
                    {formatUsd(
                      isCorrected
                        ? currentRun.corrected_batch!.financial_variance_usd
                        : currentRun.corrupted_batch?.financial_variance_usd ?? 0
                    )}
                  </div>
                </div>
              </div>

              <div className="p-4 space-y-3">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                  SCENARIO EVALUATION SUMMARY
                </div>
                <p className="text-xs leading-relaxed text-[#EBDEF2]">
                  {selectedScenario?.description}
                </p>

                {gateFeedback && (
                  <div
                    className={`rounded-[4px] border p-3 font-mono text-xs flex items-start gap-2 ${
                      gateFeedback.type === "blocked"
                        ? "border-[#DE785F] bg-[#331A1E] text-[#FF9D85]"
                        : "border-[#2E7D52] bg-[#162E21] text-[#8AE2A4]"
                    }`}
                  >
                    {gateFeedback.type === "blocked" ? (
                      <XOctagon className="h-4 w-4 shrink-0 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-2">
                      <div>{gateFeedback.text}</div>
                      {gateFeedback.reportId && (
                        <a
                          href={`${API_BASE}/api/v1/reports/${gateFeedback.reportId}/download`}
                          className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#D9F66F] px-3 py-1.5 text-[11px] font-semibold text-[#171E00] hover:bg-[#CEEA64]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          Download 7-Sheet Excel Workbook
                        </a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div
              className={`flex items-center justify-between border-t border-[#372E40] px-4 py-2.5 font-mono text-[11px] ${
                isCorrected
                  ? "bg-[#162E21] text-[#8AE2A4]"
                  : "bg-[#331A1E] text-[#FF9D85]"
              }`}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                <Lock className="h-3.5 w-3.5" />
                {isCorrected
                  ? "PUBLICATION GATE: CLEAR TO PUBLISH"
                  : "PUBLICATION GATE: BLOCKED"}
              </span>
              <span>RULE: {selectedScenario?.expected_rule}</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-8 text-center">
          <FlaskConical className="mx-auto h-8 w-8 text-[#D9F66F]" />
          <h3 className="mt-3 font-display text-base font-semibold text-[#EBDEF2]">
            No Failure Lab Run Active
          </h3>
          <p className="mt-1 text-xs text-[#B7A9C7]">
            Select any of the 11 scenarios above and click{" "}
            <strong className="text-[#D9F66F]">Inject Discrepancy &amp; Re-Evaluate</strong> to
            execute the live control harness.
          </p>
        </div>
      )}

      {/* Bottom 3-Column Remediation & Gate Workbench */}
      {currentRun && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {/* Card 1: Gate Proof */}
          <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                  1. PUBLICATION GATE PROOF
                </span>
                <StatusBadge status={isCorrected ? "PASS" : "BLOCKED"} />
              </div>
              <h3 className="mt-2 font-display text-sm font-bold text-[#EBDEF2]">
                Verify HTTP 409 Gate Enforcement
              </h3>
              <p className="mt-1 text-xs text-[#B7A9C7] leading-relaxed">
                Attempt to issue an Official Management Report against the active sandbox batch.
                Blocked batches are rejected server-side with HTTP 409.
              </p>
            </div>
            <button
              onClick={() => targetBatchForGate && testGateMut.mutate(targetBatchForGate)}
              disabled={!targetBatchForGate || testGateMut.isPending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-[4px] border border-[#DE785F] bg-[#2F1B22] px-3 py-2 font-mono text-xs font-semibold text-[#FF9D85] hover:bg-[#331A1E] disabled:opacity-50 cursor-pointer"
            >
              <ShieldAlert className="h-3.5 w-3.5" />
              {isCorrected
                ? "Publish Verified Official Report"
                : "Attempt Official Publish (Prove 409 Block)"}
            </button>
          </div>

          {/* Card 2: Forensic Lineage */}
          <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                  2. AFFECTED FINANCIAL LEDGERS
                </span>
                <span className="font-mono text-[10px] text-[#D9F66F]">TRACEABLE</span>
              </div>
              <h3 className="mt-2 font-display text-sm font-bold text-[#EBDEF2]">
                Investigate Discrepant Accounts
              </h3>
              <p className="mt-1 text-xs text-[#B7A9C7] leading-relaxed">
                Inspect stage-by-stage roll-forward totals, affected account balances, and raw CSV
                line numbers in the Investigation Workbench.
              </p>
            </div>
            <Link
              href={`/app/investigate?batchId=${
                currentRun.corrupted_batch?.id || currentRun.baseline_batch?.id || ""
              }`}
              className="w-full inline-flex items-center justify-center gap-2 rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-2 font-mono text-xs font-semibold text-[#EBDEF2] hover:border-[#D9F66F]"
            >
              <SearchCode className="h-3.5 w-3.5 text-[#D9F66F]" />
              Open Investigation Workbench →
            </Link>
          </div>

          {/* Card 3: Remediation */}
          <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                  3. REMEDIATION WORKBENCH
                </span>
                <span className="rounded-[2px] bg-[#D9F66F] px-1.5 py-0.5 font-mono text-[9px] font-bold text-[#171E00]">
                  SOX-404
                </span>
              </div>
              <h3 className="mt-2 font-display text-sm font-bold text-[#EBDEF2]">
                Correct Snapshot &amp; Rerun Validation
              </h3>
              <p className="mt-1 text-xs text-[#B7A9C7] leading-relaxed">
                Creates a corrected input version while preserving prior raw snapshots, reruns all
                16 controls, and unlocks official Excel publication.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => correctMut.mutate(currentRun.id)}
                disabled={isCorrected || correctMut.isPending}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-[4px] bg-[#D9F66F] px-3 py-2 font-mono text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64] disabled:opacity-40 cursor-pointer"
              >
                <Play className="h-3.5 w-3.5" />
                {isCorrected ? "Remediated (PASS)" : "Correct & Rerun"}
              </button>
              <Link
                href="/app/reports"
                className="inline-flex items-center justify-center rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-2 font-mono text-xs text-[#EBDEF2] hover:border-[#B7A9C7]"
                title="View Reports"
              >
                <FileSpreadsheet className="h-4 w-4 text-[#8AE2A4]" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Recent Sandbox Runs History */}
      {(runsData?.items || []).length > 0 && (
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
          <div className="border-b border-[#372E40] bg-[#201927] px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B7A9C7]">
            SANDBOX SIMULATION LOG ({runsData!.items.length} RUNS)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase text-[#90937E]">
                <tr>
                  <th className="px-4 py-2.5">Scenario</th>
                  <th className="px-4 py-2.5">Seed</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Measured Variance</th>
                  <th className="px-4 py-2.5 text-right">Select</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#372E40]">
                {runsData!.items.slice(0, 8).map((r) => (
                  <tr
                    key={r.id}
                    className={`h-10 hover:bg-[#302839] ${
                      currentRun?.id === r.id ? "bg-[#201927] border-l-[3px] border-l-[#D9F66F]" : ""
                    }`}
                  >
                    <td className="px-4 py-2 font-medium text-[#EBDEF2]">{r.scenario_name}</td>
                    <td className="px-4 py-2 font-mono text-[#B7A9C7]">{r.seed}</td>
                    <td className="px-4 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular-nums text-[#FF9D85]">
                      {formatUsd(r.actual_variance_usd)}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => {
                          setActiveRun(r);
                          setSelectedScenarioKey(r.scenario_key);
                          setGateFeedback(null);
                        }}
                        className="font-mono text-[11px] font-semibold text-[#D9F66F] hover:underline cursor-pointer"
                      >
                        Inspect →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
