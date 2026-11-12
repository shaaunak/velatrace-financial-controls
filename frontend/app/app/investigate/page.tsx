"use client";

import React, { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { GitCommitHorizontal, SearchCode } from "lucide-react";
import { apiFetch, formatUsd } from "@/lib/api";

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

  const { data: inv } = useQuery<InvestigateResp>({
    queryKey: ["investigate", activeBatchId],
    queryFn: () => apiFetch(`/investigate/batch/${activeBatchId}`),
    enabled: Boolean(activeBatchId),
  });

  const { data: lineage } = useQuery<LineageResp>({
    queryKey: ["lineage", activeBatchId, selectedAcct],
    queryFn: () => apiFetch(`/investigate/lineage/${activeBatchId}/${selectedAcct}`),
    enabled: Boolean(activeBatchId && selectedAcct),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-[#101828]">
            Find where the numbers stopped agreeing.
          </h1>
          <p className="text-xs text-[#667085] mt-0.5">
            Side-by-side stage totals, SQL roll-forward drilldown, and deterministic root-cause analysis.
          </p>
        </div>
        <select
          value={activeBatchId}
          onChange={(e) => {
            setBatchId(e.target.value);
            setSelectedAcct(null);
          }}
          className="rounded-md border border-[#E5E9F0] bg-white px-3 py-1.5 text-xs font-mono"
        >
          {(batches?.items || []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.batch_code} ({b.status})
            </option>
          ))}
        </select>
      </div>

      {inv && (
        <>
          {/* Stage Comparison */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {inv.stage_comparison.map((st) => (
              <div key={st.stage} className="rounded-lg border border-[#E5E9F0] bg-white p-4">
                <div className="text-[11px] font-medium text-[#667085]">{st.stage}</div>
                <div className="mt-1.5 text-sm font-semibold text-[#101828] tabular-nums">
                  {st.total_usd !== null ? formatUsd(st.total_usd) : "Not Published"}
                </div>
              </div>
            ))}
          </div>

          {/* Root-Cause Report */}
          <div className="rounded-lg border border-[#E5E9F0] bg-white p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-[#101828]">
              <SearchCode className="h-4 w-4 text-[#3267D6]" />
              Deterministic Root-Cause Analysis
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <div className="text-[#667085]">Observation</div>
                <div className="mt-0.5 font-medium text-[#172033]">{inv.root_cause.observation}</div>
              </div>
              <div>
                <div className="text-[#667085]">First Discrepancy Boundary</div>
                <div className="mt-0.5 font-semibold text-[#3267D6]">
                  {inv.root_cause.first_discrepancy_boundary}
                </div>
              </div>
            </div>
            {inv.root_cause.confirmed_findings.length > 0 && (
              <div className="rounded border border-[#FECDCA] bg-[#FEF3F2] p-3 text-xs text-[#C74242]">
                <div className="font-semibold mb-1">Confirmed Findings:</div>
                <ul className="list-disc pl-4 space-y-0.5">
                  {inv.root_cause.confirmed_findings.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="text-xs text-[#475467]">
              <strong>Recommended Action:</strong> {inv.root_cause.recommended_action}
            </div>
          </div>

          {/* Discrepant Accounts Table */}
          <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
            <div className="border-b border-[#E5E9F0] px-5 py-3.5">
              <h2 className="text-sm font-semibold text-[#101828]">
                Account-Level Roll-Forward Variance ({inv.discrepant_accounts.length} Discrepant)
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Account</th>
                    <th className="px-4 py-2.5 font-medium text-right">Opening</th>
                    <th className="px-4 py-2.5 font-medium text-right">Ext. Inflows</th>
                    <th className="px-4 py-2.5 font-medium text-right">Ext. Outflows</th>
                    <th className="px-4 py-2.5 font-medium text-right">Expected Closing</th>
                    <th className="px-4 py-2.5 font-medium text-right">Custody Closing</th>
                    <th className="px-4 py-2.5 font-medium text-right">Variance</th>
                    <th className="px-4 py-2.5 font-medium text-right">Lineage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E9F0]">
                  {inv.discrepant_accounts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-6 text-center text-[#168363]">
                        All accounts in this batch reconcile within $0.05 tolerance.
                      </td>
                    </tr>
                  ) : (
                    inv.discrepant_accounts.map((a) => (
                      <tr key={a.account_external_id} className="hover:bg-[#F9FAFB]">
                        <td className="px-4 py-2.5 font-mono font-medium">{a.account_external_id}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(a.opening_assets_usd)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(a.external_inflows_usd)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(a.external_outflows_usd)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(a.expected_closing_usd)}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatUsd(a.custody_closing_usd)}</td>
                        <td className="px-4 py-2.5 text-right font-mono font-semibold text-[#C74242] tabular-nums">
                          {formatUsd(a.variance_usd)}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setSelectedAcct(a.account_external_id)}
                            className="text-[#3267D6] font-medium hover:underline"
                          >
                            Trace Source →
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Account Source Lineage */}
          {lineage && (
            <div className="rounded-lg border border-[#3267D6]/30 bg-white p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-[#101828]">
                <GitCommitHorizontal className="h-4 w-4 text-[#3267D6]" />
                Source Lineage for {lineage.account_external_id}
              </div>
              <div className="text-xs text-[#667085]">
                Custody File: <span className="font-mono text-[#101828]">{lineage.custody_source.file_name}</span> • Row{" "}
                {lineage.custody_source.row_number} • Currency {lineage.custody_source.original_currency} (FX{" "}
                {lineage.custody_source.fx_rate_applied})
              </div>
              <div className="overflow-x-auto max-h-64 overflow-y-auto border border-[#E5E9F0] rounded">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
                    <tr>
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Txn ID</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Flow Class</th>
                      <th className="px-3 py-2 font-medium text-right">Amount (USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E9F0]">
                    {lineage.transactions.map((t) => (
                      <tr key={t.id}>
                        <td className="px-3 py-1.5 font-mono text-[#667085]">{t.row_number}</td>
                        <td className="px-3 py-1.5 font-mono">{t.external_txn_id}</td>
                        <td className="px-3 py-1.5">{t.trade_date}</td>
                        <td className="px-3 py-1.5">{t.txn_type}</td>
                        <td className="px-3 py-1.5 text-[#667085]">{t.flow_classification}</td>
                        <td className="px-3 py-1.5 text-right font-mono tabular-nums">{formatUsd(t.net_amount_usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function InvestigatePage() {
  return (
    <Suspense fallback={<div className="p-6 text-xs text-[#667085]">Loading investigator...</div>}>
      <InvestigateContent />
    </Suspense>
  );
}
