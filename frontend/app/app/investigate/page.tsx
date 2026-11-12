"use client";

import React, { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileCode2,
  GitCommitHorizontal,
  SearchCode,
} from "lucide-react";
import { apiFetch, formatUsd } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

interface BatchOption {
  id: string;
  batch_code: string;
  reporting_date: string;
  status: string;
}

interface InvestigateResp {
  batch_id: string;
  batch_code: string;
  reporting_date: string;
  stage_comparison: Array<{ stage: string; total_usd: number | null }>;
  discrepant_accounts: Array<{
    account_external_id: string;
    opening_assets_usd: number;
    external_inflows_usd: number;
    external_outflows_usd: number;
    market_movement_usd: number;
    fees_usd: number;
    expected_closing_usd: number;
    custody_closing_usd: number;
    variance_usd: number;
  }>;
  root_cause: {
    observation: string;
    first_discrepancy_boundary: string;
    scope: string;
    confirmed_findings: string[];
    provisional_hypotheses: string[];
    recommended_action: string;
  };
}

interface LineageResp {
  account_external_id: string;
  custody_source: {
    file_name: string | null;
    source_hash: string | null;
    row_number: number | null;
    original_currency: string | null;
    fx_rate_applied: number | null;
  };
  transactions: Array<{
    id: number;
    row_number: number;
    external_txn_id: string;
    trade_date: string;
    txn_type: string;
    flow_classification: string;
    net_amount_usd: number;
    description: string | null;
  }>;
}

function InvestigateContent() {
  const searchParams = useSearchParams();
  const initialBatch = searchParams.get("batchId") || "";
  const [batchId, setBatchId] = useState(initialBatch);
  const [selectedAcct, setSelectedAcct] = useState<string | null>(null);

  const { data: batches } = useQuery<{ items: BatchOption[] }>({
    queryKey: ["batches-for-investigate"],
    queryFn: () => apiFetch("/batches?limit=30"),
  });

  const activeBatchId = batchId || batches?.items?.[0]?.id || "";

  const { data: inv, isLoading } = useQuery<InvestigateResp>({
    queryKey: ["investigate", activeBatchId],
    queryFn: () => apiFetch(`/investigate/batch/${activeBatchId}`),
    enabled: Boolean(activeBatchId),
  });

  const activeAcct =
    selectedAcct || inv?.discrepant_accounts?.[0]?.account_external_id || null;

  const { data: lineage } = useQuery<LineageResp>({
    queryKey: ["lineage", activeBatchId, activeAcct],
    queryFn: () => apiFetch(`/investigate/lineage/${activeBatchId}/${activeAcct}`),
    enabled: Boolean(activeBatchId && activeAcct),
  });

  const totalVariance = (inv?.discrepant_accounts || []).reduce(
    (sum, a) => sum + (a.variance_usd || 0),
    0
  );
  const hasVariance = Math.abs(totalVariance) > 0.01;

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Batch Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#372E40] bg-[#201927] px-4 py-2.5">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.06em]">
          <Link href="/app/runs" className="text-[#B7A9C7] hover:text-[#EBDEF2]">
            RECONCILIATION RUNS
          </Link>
          <span className="text-[#454837]">/</span>
          <span className="text-[#EBDEF2] font-semibold">
            {inv?.batch_code || "SELECT BATCH"}
          </span>
          <span className="text-[#454837]">/</span>
          <span className="text-[#D9F66F] font-semibold">INVESTIGATION WORKBENCH</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Select reconciliation batch"
            value={activeBatchId}
            onChange={(e) => {
              setBatchId(e.target.value);
              setSelectedAcct(null);
            }}
            className="rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-1.5 font-mono text-xs text-[#EBDEF2] focus:border-[#D9F66F] focus:outline-none"
          >
            {(batches?.items || []).map((b) => (
              <option key={b.id} value={b.id}>
                {b.batch_code} ({b.reporting_date}) [{b.status}]
              </option>
            ))}
          </select>

          {activeBatchId && (
            <Link
              href={`/app/runs/${activeBatchId}`}
              className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#D9F66F] px-3 py-1.5 font-mono text-[11px] font-semibold text-[#171E00] hover:bg-[#CEEA64]"
            >
              Batch Detail <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Hero Summary Row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
        <div className="lg:col-span-6">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
            FORENSIC LEDGER WORKBENCH // {inv?.reporting_date || "—"}
          </div>
          <h1 className="mt-1.5 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
            Find where the numbers stopped agreeing.
          </h1>
          <p className="mt-1.5 text-xs text-[#B7A9C7]">
            Stage-by-stage variance progression from Raw Ingestion through Staging, Roll-Forward
            Continuity, and Account-Level Source Provenance.
          </p>
        </div>

        <div
          className={`lg:col-span-6 rounded-[4px] border p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 ${
            hasVariance
              ? "border-[#DE785F] bg-[#2F1B22]"
              : "border-[#2E7D52] bg-[#162E21]"
          }`}
        >
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              NET VARIANCE
            </div>
            <div
              className={`mt-1 font-display text-2xl font-bold tabular-nums ${
                hasVariance ? "text-[#FF9D85]" : "text-[#8AE2A4]"
              }`}
            >
              {formatUsd(totalVariance)}
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              DISCREPANCY BOUNDARY
            </div>
            <div className="mt-1 font-mono text-xs font-semibold text-[#EBDEF2]">
              {inv?.root_cause?.first_discrepancy_boundary || "None"}
            </div>
          </div>
          <div>
            <div className="font-mono text-[9px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              AUDIT STATE
            </div>
            <div className="mt-1.5">
              <StatusBadge status={hasVariance ? "BLOCKED" : "BALANCED"} />
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Tier Variance Waterfall Progression */}
      {isLoading ? (
        <div className="h-32 rounded-[4px] border border-[#372E40] bg-[#241D2B] animate-pulse" />
      ) : (
        inv && (
          <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-4">
            <div className="flex items-center justify-between border-b border-[#372E40] pb-3 mb-4 font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              <span>MULTI-TIER VARIANCE WATERFALL LEDGER PROGRESSION</span>
              <span className="text-[#D9F66F]">{inv.root_cause.scope}</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {inv.stage_comparison.map((s, idx) => {
                const isLast = idx === inv.stage_comparison.length - 1;
                return (
                  <div
                    key={s.stage}
                    className={`rounded-[4px] border p-4 ${
                      isLast && hasVariance
                        ? "border-[#DE785F] bg-[#2F1B22]"
                        : "border-[#372E40] bg-[#120B19]"
                    }`}
                  >
                    <div className="flex items-center justify-between font-mono text-[10px] text-[#90937E]">
                      <span>STAGE 0{idx + 1}</span>
                      <GitCommitHorizontal className="h-3.5 w-3.5 text-[#D9F66F]" />
                    </div>
                    <div className="mt-2 text-xs font-medium text-[#B7A9C7]">{s.stage}</div>
                    <div className="mt-2 font-display text-lg font-bold text-[#EBDEF2] tabular-nums">
                      {s.total_usd !== null ? formatUsd(s.total_usd) : "N/A"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )
      )}

      {/* 2-Column Forensic Split: Root Cause + Discrepant Accounts (Left) & Lineage Inspector (Right) */}
      {inv && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 6 Cols: Root Cause & Discrepant Accounts */}
          <div className="lg:col-span-6 space-y-5">
            {/* Root Cause Card */}
            <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
                  <SearchCode className="h-4 w-4" />
                  DETERMINISTIC ROOT-CAUSE DIAGNOSIS
                </span>
                <StatusBadge status={hasVariance ? "CRITICAL" : "VERIFIED"} />
              </div>

              <p className="text-sm font-medium text-[#EBDEF2] leading-relaxed">
                {inv.root_cause.observation}
              </p>

              {inv.root_cause.confirmed_findings.length > 0 && (
                <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-3 space-y-1.5">
                  <div className="font-mono text-[10px] uppercase text-[#B7A9C7]">
                    CONFIRMED FINDINGS
                  </div>
                  <ul className="space-y-1 text-xs text-[#EBDEF2]">
                    {inv.root_cause.confirmed_findings.map((f, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[#D9F66F]">•</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="rounded-[4px] border border-[#2E7D52]/50 bg-[#162E21] p-3 text-xs text-[#8AE2A4]">
                <strong>Recommended Action:</strong> {inv.root_cause.recommended_action}
              </div>
            </div>

            {/* Discrepant Accounts Table */}
            <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
              <div className="border-b border-[#372E40] bg-[#201927] px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B7A9C7]">
                DISCREPANT ACCOUNTS ({inv.discrepant_accounts.length})
              </div>
              {inv.discrepant_accounts.length === 0 ? (
                <div className="p-6 text-center text-xs text-[#8AE2A4] flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Zero account-level roll-forward discrepancies in this batch.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase text-[#90937E]">
                      <tr>
                        <th className="px-3.5 py-2.5">Account</th>
                        <th className="px-3.5 py-2.5 text-right">Expected</th>
                        <th className="px-3.5 py-2.5 text-right">Custody</th>
                        <th className="px-3.5 py-2.5 text-right">Variance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#372E40]">
                      {inv.discrepant_accounts.map((a) => {
                        const isSel = activeAcct === a.account_external_id;
                        return (
                          <tr
                            key={a.account_external_id}
                            onClick={() => setSelectedAcct(a.account_external_id)}
                            className={`cursor-pointer transition-colors hover:bg-[#302839] ${
                              isSel ? "border-l-[3px] border-l-[#D9F66F] bg-[#201927]" : ""
                            }`}
                          >
                            <td className="px-3.5 py-2.5 font-mono font-semibold text-[#D9F66F]">
                              {a.account_external_id}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-[#EBDEF2]">
                              {formatUsd(a.expected_closing_usd)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums text-[#B7A9C7]">
                              {formatUsd(a.custody_closing_usd)}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-mono tabular-nums font-semibold text-[#FF9D85]">
                              {formatUsd(a.variance_usd)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right 6 Cols: Source Record Lineage Inspector */}
          <div className="lg:col-span-6 rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#372E40] bg-[#201927] px-4 py-3">
              <span className="flex items-center gap-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#EBDEF2]">
                <FileCode2 className="h-3.5 w-3.5 text-[#D9F66F]" />
                SOURCE RECORD LINEAGE // {activeAcct || "SELECT ACCOUNT"}
              </span>
              {lineage?.custody_source?.source_hash && (
                <span className="font-mono text-[10px] text-[#8AE2A4]">
                  SHA-256: {lineage.custody_source.source_hash.slice(0, 12)}…
                </span>
              )}
            </div>

            {lineage ? (
              <div className="p-4 space-y-4">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                    <div className="font-mono text-[9px] text-[#90937E]">SOURCE FILE</div>
                    <div className="mt-0.5 truncate font-mono text-xs text-[#EBDEF2]">
                      {lineage.custody_source.file_name || "—"}
                    </div>
                  </div>
                  <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                    <div className="font-mono text-[9px] text-[#90937E]">CSV ROW</div>
                    <div className="mt-0.5 font-mono text-xs font-semibold text-[#D9F66F]">
                      #{lineage.custody_source.row_number ?? "—"}
                    </div>
                  </div>
                  <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                    <div className="font-mono text-[9px] text-[#90937E]">CURRENCY</div>
                    <div className="mt-0.5 font-mono text-xs text-[#EBDEF2]">
                      {lineage.custody_source.original_currency || "USD"}
                    </div>
                  </div>
                  <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                    <div className="font-mono text-[9px] text-[#90937E]">FX APPLIED</div>
                    <div className="mt-0.5 font-mono text-xs text-[#EBDEF2] tabular-nums">
                      {lineage.custody_source.fx_rate_applied ?? "1.0000"}
                    </div>
                  </div>
                </div>

                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7] mb-2">
                    UNDERLYING LEDGER TRANSACTIONS ({lineage.transactions.length})
                  </div>
                  <div className="overflow-x-auto rounded-[4px] border border-[#372E40]">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase text-[#90937E]">
                        <tr>
                          <th className="px-3 py-2">Row</th>
                          <th className="px-3 py-2">Txn ID</th>
                          <th className="px-3 py-2">Flow Class</th>
                          <th className="px-3 py-2 text-right">Net USD</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#372E40]">
                        {lineage.transactions.map((t) => (
                          <tr key={t.id} className="hover:bg-[#302839]">
                            <td className="px-3 py-2 font-mono text-[#90937E]">#{t.row_number}</td>
                            <td className="px-3 py-2 font-mono text-[#EBDEF2]">
                              {t.external_txn_id}
                            </td>
                            <td className="px-3 py-2">
                              <StatusBadge status={t.flow_classification} />
                            </td>
                            <td className="px-3 py-2 text-right font-mono tabular-nums text-[#EBDEF2]">
                              {formatUsd(t.net_amount_usd)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center font-mono text-xs text-[#90937E]">
                <AlertTriangle className="mx-auto h-6 w-6 text-[#90937E] mb-2" />
                {inv.discrepant_accounts.length === 0
                  ? "No discrepant accounts to trace for this clean batch."
                  : "Select an account on the left to inspect raw source provenance."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function InvestigatePage() {
  return (
    <Suspense fallback={<div className="p-8 font-mono text-xs text-[#90937E]">Loading workbench...</div>}>
      <InvestigateContent />
    </Suspense>
  );
}
