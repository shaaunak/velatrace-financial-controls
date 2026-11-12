"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
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
    return <div className="p-8 text-xs text-[#667085]">Calculating operational metrics from PostgreSQL...</div>;
  }

  const om = data.operational_metrics;
  const fl = data.failure_lab_metrics;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-[#101828]">Operations Analytics</h1>
        <p className="text-xs text-[#667085] mt-0.5">
          Genuinely measured operational metrics, separated clearly from controlled Failure Lab sandbox metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-5">
          <div className="text-xs text-[#667085]">Production Demo Runs</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums">{om.total_runs}</div>
          <div className="mt-1 text-xs text-[#168363]">{om.reconciliation_success_rate_pct}% passing rate</div>
        </div>
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-5">
          <div className="text-xs text-[#667085]">Active Control Rules</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums">{om.active_control_rules}</div>
          <div className="mt-1 text-xs text-[#667085]">Across 7 control families</div>
        </div>
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-5">
          <div className="text-xs text-[#667085]">SLA Breaches</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums">{om.sla_breaches}</div>
          <div className="mt-1 text-xs text-[#667085]">
            MTTR: {om.mean_time_to_resolve_hours !== null ? `${om.mean_time_to_resolve_hours} hrs` : "N/A"}
          </div>
        </div>
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-5">
          <div className="text-xs text-[#667085]">Failure Lab Detection (Sandbox)</div>
          <div className="mt-1.5 text-2xl font-semibold tabular-nums">
            {fl.successfully_detected_failures} / {fl.known_injected_failures}
          </div>
          <div className="mt-1 text-xs text-[#667085]">Missed: {fl.missed_injected_failures}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-5">
          <h2 className="text-sm font-semibold text-[#101828] mb-3">Control Failure Frequency (All Runs)</h2>
          {data.control_failure_frequency.length === 0 ? (
            <p className="text-xs text-[#667085]">No control failures recorded yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.control_failure_frequency.map((c) => (
                <div key={c.rule_id} className="flex items-center justify-between text-xs border-b border-[#F2F4F7] pb-2">
                  <span className="font-mono font-medium text-[#101828]">{c.rule_id}</span>
                  <span className="font-mono font-semibold text-[#C74242] tabular-nums">{c.failure_count}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-[#E5E9F0] bg-white p-5 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#101828]">
            <BarChart3 className="h-4 w-4 text-[#3267D6]" />
            Measured Process Recommendations
          </div>
          {data.recommendations.map((rec) => (
            <div key={rec.id} className="rounded border border-[#E5E9F0] bg-[#F9FAFB] p-3 text-xs space-y-1">
              <div className="font-semibold text-[#101828]">{rec.finding}</div>
              <div className="text-[#475467]">{rec.action}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
