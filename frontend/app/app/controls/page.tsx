"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  FlaskConical,
  Search,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { ApiError, apiFetch, formatUsd } from "@/lib/api";
import { useAppState } from "@/components/providers";
import { StatusBadge } from "@/components/StatusBadge";

interface ControlItem {
  rule_id: string;
  version: string;
  name: string;
  business_description: string;
  control_family: string;
  severity: string;
  is_blocking: boolean;
  is_waivable: boolean;
  owner_team: string;
  tolerance_abs: number | null;
  handler_name: string;
  effective_date: string;
  last_result: string;
  config_yaml: string;
  is_active?: boolean;
}

export default function ControlsPage() {
  const { actor } = useAppState();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState("");
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data, isLoading } = useQuery<{ items: ControlItem[] }>({
    queryKey: ["controls"],
    queryFn: () => apiFetch("/controls"),
  });

  const toggleMut = useMutation({
    mutationFn: ({ rule_id, is_active }: { rule_id: string; is_active: boolean }) =>
      apiFetch(`/controls/${rule_id}`, {
        method: "PATCH",
        actor,
        body: JSON.stringify({ is_active }),
      }),
    onSuccess: () => {
      setFeedback({ type: "ok", text: "Control rule state updated and audited." });
      qc.invalidateQueries({ queryKey: ["controls"] });
    },
    onError: (e: Error) =>
      setFeedback({ type: "err", text: e instanceof ApiError ? e.message : e.message }),
  });

  const allControls = data?.items || [];
  const families = Array.from(new Set(allControls.map((c) => c.control_family)));

  const filtered = allControls.filter((c) => {
    if (familyFilter && c.control_family !== familyFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        c.rule_id.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.control_family.toLowerCase().includes(q) ||
        c.handler_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selected =
    filtered.find((c) => c.rule_id === selectedRuleId) || filtered[0] || null;

  const hardBlockers = allControls.filter((c) => c.is_blocking).length;
  const warningGates = allControls.filter((c) => !c.is_blocking).length;
  const waivableCount = allControls.filter((c) => c.is_waivable).length;
  const passingCount = allControls.filter((c) => c.last_result === "PASS").length;

  return (
    <div className="space-y-6">
      {/* Top Search & Family Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#372E40] bg-[#201927] p-3">
        <div className="relative min-w-[220px] flex-1 max-w-sm">
          <Search className="h-3.5 w-3.5 text-[#90937E] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search rule ID, name, handler..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[4px] border border-[#372E40] bg-[#120B19] pl-8 pr-3 py-1.5 font-mono text-xs text-[#EBDEF2] placeholder-[#90937E] focus:border-[#D9F66F] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFamilyFilter("")}
            className={`rounded-[4px] border px-2.5 py-1.5 font-mono text-[11px] font-medium cursor-pointer ${
              familyFilter === ""
                ? "border-[#D9F66F] bg-[#D9F66F] text-[#171E00]"
                : "border-[#372E40] bg-[#241D2B] text-[#B7A9C7] hover:border-[#B7A9C7]"
            }`}
          >
            All ({allControls.length})
          </button>
          {families.map((fam) => (
            <button
              key={fam}
              onClick={() => setFamilyFilter(fam)}
              className={`rounded-[4px] border px-2.5 py-1.5 font-mono text-[11px] font-medium cursor-pointer ${
                familyFilter === fam
                  ? "border-[#D9F66F] bg-[#D9F66F] text-[#171E00]"
                  : "border-[#372E40] bg-[#241D2B] text-[#B7A9C7] hover:border-[#B7A9C7]"
              }`}
            >
              {fam}
            </button>
          ))}
        </div>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
            SOV-POLICY-CORE // YAML-CONFIGURED CONTROL ENGINE
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
            Control Library &amp; Rule Engine
          </h1>
          <p className="mt-1 text-xs text-[#B7A9C7]">
            16 registered financial controls mapped to deterministic Python/SQL handlers. Historical
            batches preserve evaluated rule versions.
          </p>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between rounded-[4px] border px-4 py-2.5 font-mono text-xs ${
            feedback.type === "ok"
              ? "border-[#2E7D52] bg-[#162E21] text-[#8AE2A4]"
              : "border-[#DE785F] bg-[#2F1B22] text-[#FF9D85]"
          }`}
        >
          <span className="flex items-center gap-2">
            {feedback.type === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <ShieldAlert className="h-4 w-4 shrink-0" />
            )}
            {feedback.text}
          </span>
          <button onClick={() => setFeedback(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* 5 KPI Summary Cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4">
          <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">TOTAL RULES</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
            {allControls.length} Registered
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#8AE2A4]">
            {families.length} Control Families
          </div>
        </div>

        <div className="rounded-[4px] border border-[#DE785F]/60 bg-[#2F1B22] p-4">
          <div className="font-mono text-[10px] uppercase text-[#FF9D85]">HARD GATE BLOCKERS</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
            {hardBlockers} Rules
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#FF9D85]">Trigger HTTP 409</div>
        </div>

        <div className="rounded-[4px] border border-[#C27803]/60 bg-[#2E2415] p-4">
          <div className="font-mono text-[10px] uppercase text-[#FFCE73]">WARNING GATES</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
            {warningGates} Rules
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#FFCE73]">Conditional Sign-Off</div>
        </div>

        <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4">
          <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">WAIVABLE CONTROLS</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
            {waivableCount} Rules
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#90937E]">Maker-Checker Eligible</div>
        </div>

        <div className="rounded-[4px] border border-[#2E7D52]/60 bg-[#162E21] p-4">
          <div className="font-mono text-[10px] uppercase text-[#8AE2A4]">LAST CYCLE PASS</div>
          <div className="mt-2 font-display text-2xl font-bold text-[#EBDEF2] tabular-nums">
            {passingCount} / {allControls.length}
          </div>
          <div className="mt-1 font-mono text-[10px] text-[#8AE2A4]">Latest Batch Status</div>
        </div>
      </div>

      {/* Split-Pane Registry & Specification Inspector */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left Registry Table (7 Cols) */}
        <div className="lg:col-span-7 rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#372E40] bg-[#201927] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
            <span>REGISTRY VIEW: FINANCIAL_REPORTING_V1</span>
            <span>SHOWING {filtered.length} RULES</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase text-[#90937E]">
                <tr>
                  <th className="px-3.5 py-2.5">Rule ID</th>
                  <th className="px-3.5 py-2.5">Control Name &amp; Description</th>
                  <th className="px-3.5 py-2.5">Family</th>
                  <th className="px-3.5 py-2.5">Gate Action</th>
                  <th className="px-3.5 py-2.5">Last Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#372E40]">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center font-mono text-[#90937E]">
                      Loading control catalogue...
                    </td>
                  </tr>
                ) : (
                  filtered.map((c) => {
                    const isSel = selected?.rule_id === c.rule_id;
                    return (
                      <tr
                        key={c.rule_id}
                        onClick={() => setSelectedRuleId(c.rule_id)}
                        className={`cursor-pointer transition-colors hover:bg-[#302839] ${
                          isSel
                            ? "border-l-[3px] border-l-[#D9F66F] bg-[#201927]"
                            : ""
                        }`}
                      >
                        <td className="px-3.5 py-3 font-mono font-semibold text-[#D9F66F] whitespace-nowrap">
                          {c.rule_id}
                        </td>
                        <td className="px-3.5 py-3">
                          <div className="font-medium text-[#EBDEF2]">{c.name}</div>
                          <div className="mt-0.5 text-[11px] text-[#90937E] line-clamp-1">
                            {c.business_description}
                          </div>
                        </td>
                        <td className="px-3.5 py-3 font-mono text-[11px] text-[#B7A9C7]">
                          {c.control_family}
                        </td>
                        <td className="px-3.5 py-3">
                          <StatusBadge
                            status={c.is_blocking ? "HARD_BLOCK" : "WARNING"}
                            label={c.is_blocking ? "HARD BLOCK" : "WARNING"}
                          />
                        </td>
                        <td className="px-3.5 py-3">
                          <StatusBadge status={c.last_result} />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right Control Specification Inspector (5 Cols) */}
        <div className="lg:col-span-5 rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden flex flex-col justify-between">
          {selected ? (
            <div className="divide-y divide-[#372E40]">
              <div className="p-4 bg-[#201927]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
                    CONTROL SPECIFICATION // {selected.rule_id}
                  </span>
                  <StatusBadge status={selected.severity} />
                </div>
                <h2 className="mt-2 font-display text-lg font-bold text-[#EBDEF2]">
                  {selected.name}
                </h2>
                <p className="mt-1.5 text-xs text-[#B7A9C7] leading-relaxed">
                  {selected.business_description}
                </p>
              </div>

              <div className="p-4 grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                  <div className="font-mono text-[9px] text-[#90937E]">HANDLER</div>
                  <div className="mt-0.5 font-mono text-[#EBDEF2] truncate">
                    {selected.handler_name}
                  </div>
                </div>
                <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                  <div className="font-mono text-[9px] text-[#90937E]">OWNER TEAM</div>
                  <div className="mt-0.5 font-mono text-[#EBDEF2]">{selected.owner_team}</div>
                </div>
                <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                  <div className="font-mono text-[9px] text-[#90937E]">TOLERANCE (USD)</div>
                  <div className="mt-0.5 font-mono text-[#D9F66F] tabular-nums">
                    {selected.tolerance_abs !== null ? formatUsd(selected.tolerance_abs) : "$0.00"}
                  </div>
                </div>
                <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                  <div className="font-mono text-[9px] text-[#90937E]">WAIVABLE</div>
                  <div className="mt-0.5 font-mono text-[#EBDEF2]">
                    {selected.is_waivable ? "Yes (Maker-Checker)" : "Non-Waivable"}
                  </div>
                </div>
              </div>

              <div className="p-4">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7] mb-2">
                  <span>YAML RULE DEFINITION (v{selected.version})</span>
                  <span className="text-[#8AE2A4]">EFFECTIVE {selected.effective_date}</span>
                </div>
                <pre className="overflow-x-auto rounded-[4px] border border-[#372E40] bg-[#120B19] p-3 font-mono text-[11px] text-[#D9F66F] leading-relaxed max-h-60">
                  {selected.config_yaml}
                </pre>
              </div>

              <div className="p-4 bg-[#201927] space-y-2">
                <Link
                  href="/app/failure-lab"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-[4px] bg-[#D9F66F] px-3 py-2 font-mono text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64]"
                >
                  <FlaskConical className="h-3.5 w-3.5" />
                  Run Simulation in Failure Lab
                </Link>
                <button
                  onClick={() =>
                    toggleMut.mutate({
                      rule_id: selected.rule_id,
                      is_active: selected.is_active === false,
                    })
                  }
                  disabled={toggleMut.isPending}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-2 font-mono text-xs text-[#EBDEF2] hover:border-[#B7A9C7] cursor-pointer"
                >
                  <ShieldCheck className="h-3.5 w-3.5 text-[#8AE2A4]" />
                  {selected.is_active === false ? "Enable Control Rule" : "Toggle Control State (Controller)"}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center font-mono text-xs text-[#90937E]">
              Select a control rule to inspect its YAML specification.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
