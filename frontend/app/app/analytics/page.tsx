"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAppState } from "@/components/providers";

interface OpsAnalytics {
  operational_metrics: {
    total_runs: number;
    passed_runs: number;
    blocked_runs: number;
    reconciliation_success_rate_pct: number;
    total_exceptions: number;
    sla_breaches: number;
    mean_time_to_resolve_hours: number | null;
    active_control_rules: number;
  };
  control_failure_frequency: Array<{ rule_id: string; failure_count: number }>;
  failure_lab_metrics: {
    known_injected_failures: number;
    successfully_detected_failures: number;
    missed_injected_failures: number;
  };
  recommendations: Array<{ id: string; finding: string; action: string }>;
}

export default function AnalyticsPage() {
  const { workspaceId } = useAppState();
  const { data, isLoading } = useQuery<OpsAnalytics>({
    queryKey: ["ops-analytics", workspaceId],
    queryFn: () => apiFetch(`/analytics/operations?workspace_id=${workspaceId}`),
  });

  if (isLoading || !data) {
    return (
      <div className="p-8 font-mono text-xs text-[#90937E]">
        Calculating operational metrics from PostgreSQL...
      </div>
    );
  }

  const om = data.operational_metrics;
  const fl = data.failure_lab_metrics;

  return (
    <div className="space-y-6">
      <div>
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
          TELEMETRY // PRODUCTION VS SANDBOX METRICS
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
          Operations Analytics
        </h1>
        <p className="mt-1 text-xs text-[#B7A9C7]">
          Genuinely measured operational metrics, separated clearly from controlled Failure Lab
          sandbox detections.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-5">
          <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">PRODUCTION DEMO RUNS</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
            {om.total_runs}
          </div>
          <div className="mt-1 font-mono text-xs text-[#8AE2A4]">
            {om.reconciliation_success_rate_pct}% passing rate
          </div>
        </div>
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-5">
          <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">ACTIVE CONTROL RULES</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
            {om.active_control_rules}
          </div>
          <div className="mt-1 font-mono text-xs text-[#90937E]">Across 7 control families</div>
        </div>
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-5">
          <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">SLA BREACHES</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
            {om.sla_breaches}
          </div>
          <div className="mt-1 font-mono text-xs text-[#90937E]">
            MTTR:{" "}
            {om.mean_time_to_resolve_hours !== null
              ? `${om.mean_time_to_resolve_hours} hrs`
              : "N/A"}
          </div>
        </div>
        <div className="rounded-[4px] border border-[#D9F66F]/50 bg-[#241D2B] p-5">
          <div className="font-mono text-[10px] uppercase text-[#D9F66F]">
            FAILURE LAB DETECTION (SANDBOX)
          </div>
          <div className="mt-2 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
            {fl.successfully_detected_failures} / {fl.known_injected_failures}
          </div>
          <div className="mt-1 font-mono text-xs text-[#8AE2A4]">
            Missed: {fl.missed_injected_failures}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-5">
          <h2 className="font-display text-sm font-semibold text-[#EBDEF2] mb-3">
            Control Failure Frequency (All Runs)
          </h2>
          {data.control_failure_frequency.length === 0 ? (
            <p className="font-mono text-xs text-[#90937E]">No control failures recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.control_failure_frequency.map((c) => (
                <div
                  key={c.rule_id}
                  className="flex items-center justify-between text-xs border-b border-[#372E40] pb-2"
                >
                  <span className="font-mono font-semibold text-[#D9F66F]">{c.rule_id}</span>
                  <span className="font-mono font-semibold text-[#FF9D85] tabular-nums">
                    {c.failure_count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-5">
          <h2 className="font-display text-sm font-semibold text-[#EBDEF2] mb-3">
            Operational Recommendations
          </h2>
          <div className="space-y-3">
            {data.recommendations.map((rec) => (
              <div
                key={rec.id}
                className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-3 text-xs space-y-1"
              >
                <div className="font-mono font-semibold text-[#D9F66F]">{rec.id}</div>
                <div className="text-[#EBDEF2]">{rec.finding}</div>
                <div className="text-[#B7A9C7]">{rec.action}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
