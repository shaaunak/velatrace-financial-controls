"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  XOctagon,
} from "lucide-react";
import { API_BASE, ApiError, apiFetch, formatUsd } from "@/lib/api";
import { useAppState } from "@/components/providers";
import { StatusBadge } from "@/components/StatusBadge";

interface ReportItem {
  id: string;
  batch_id: string;
  version_number: number;
  reporting_date: string;
  report_title: string;
  publication_status: string;
  total_assets_usd: number;
  net_external_flows_usd: number;
  market_movement_usd: number;
  financial_variance_usd: number;
  content_fingerprint: string;
  published_by: string;
  published_at: string;
  notes: string | null;
}

interface BatchOpt {
  id: string;
  batch_code: string;
  reporting_date: string;
  status: string;
}

export default function ReportsPage() {
  const { actor } = useAppState();
  const qc = useQueryClient();
  const [filterType, setFilterType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPublishBox, setShowPublishBox] = useState(false);
  const [pubBatchId, setPubBatchId] = useState("");
  const [pubDiagnostic, setPubDiagnostic] = useState(false);
  const [pubFeedback, setPubFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data, isLoading } = useQuery<{ items: ReportItem[] }>({
    queryKey: ["reports"],
    queryFn: () => apiFetch("/reports"),
  });

  const { data: batchesData } = useQuery<{ items: BatchOpt[] }>({
    queryKey: ["batches-for-reports"],
    queryFn: () => apiFetch("/batches?limit=30"),
  });

  const publishMut = useMutation({
    mutationFn: () =>
      apiFetch<{ id: string; publication_status: string; version_number: number }>(
        "/reports/publish",
        {
          method: "POST",
          actor,
          body: JSON.stringify({
            batch_id: pubBatchId || batchesData?.items?.[0]?.id,
            diagnostic_only: pubDiagnostic,
            notes: `Published from Reports Center by ${actor.displayName}`,
          }),
        }
      ),
    onSuccess: (res) => {
      setPubFeedback({
        type: "ok",
        text: `Issued ${res.publication_status} report v${res.version_number}.`,
      });
      setSelectedId(res.id);
      setShowPublishBox(false);
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
    onError: (err: Error) => {
      const msg = err instanceof ApiError ? `HTTP ${err.status}: ${err.message}` : err.message;
      setPubFeedback({ type: "err", text: msg });
    },
  });

  const allReports = data?.items || [];
  const filteredReports = allReports.filter((r) => {
    if (filterType && r.publication_status !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        r.report_title.toLowerCase().includes(q) ||
        r.content_fingerprint.toLowerCase().includes(q) ||
        r.published_by.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedReport =
    filteredReports.find((r) => r.id === selectedId) || filteredReports[0] || null;

  const officialCount = allReports.filter((r) => r.publication_status === "OFFICIAL").length;
  const diagnosticCount = allReports.filter((r) => r.publication_status === "DIAGNOSTIC").length;

  return (
    <div className="space-y-6">
      {/* Top Filter & Publish Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#372E40] bg-[#201927] p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: "All Reports", val: "", count: allReports.length },
            { label: "Official", val: "OFFICIAL", count: officialCount },
            { label: "Diagnostic", val: "DIAGNOSTIC", count: diagnosticCount },
          ].map((t) => (
            <button
              key={t.label}
              onClick={() => setFilterType(t.val)}
              className={`inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 font-mono text-[11px] font-medium cursor-pointer ${
                filterType === t.val
                  ? "border-[#D9F66F] bg-[#D9F66F] text-[#171E00]"
                  : "border-[#372E40] bg-[#241D2B] text-[#B7A9C7] hover:border-[#B7A9C7]"
              }`}
            >
              <span>{t.label}</span>
              <span className="font-mono text-[10px] opacity-80">({t.count})</span>
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 text-[#90937E] absolute left-3 top-2" />
            <input
              type="text"
              placeholder="Search title, hash, signer..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="rounded-[4px] border border-[#372E40] bg-[#120B19] pl-8 pr-3 py-1.5 font-mono text-xs text-[#EBDEF2] placeholder-[#90937E] focus:border-[#D9F66F] focus:outline-none"
            />
          </div>
          <button
            onClick={() => setShowPublishBox(!showPublishBox)}
            className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#D9F66F] px-3.5 py-1.5 font-mono text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64] cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            Publish Report
          </button>
        </div>
      </div>

      {/* Publish Modal / Drawer */}
      {showPublishBox && (
        <div className="rounded-[4px] border border-[#D9F66F] bg-[#241D2B] p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-[#D9F66F]">
              ISSUE MANAGEMENT REPORT VERSION (GATE ENFORCED)
            </span>
            <button
              onClick={() => setShowPublishBox(false)}
              className="font-mono text-xs text-[#B7A9C7] hover:text-[#EBDEF2]"
            >
              Close
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={pubBatchId || batchesData?.items?.[0]?.id || ""}
              onChange={(e) => setPubBatchId(e.target.value)}
              className="flex-1 min-w-[240px] rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-2 font-mono text-xs text-[#EBDEF2]"
            >
              {(batchesData?.items || []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.batch_code} — {b.reporting_date} [{b.status}]
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-2 font-mono text-xs text-[#B7A9C7] cursor-pointer">
              <input
                type="checkbox"
                checked={pubDiagnostic}
                onChange={(e) => setPubDiagnostic(e.target.checked)}
                className="rounded-[2px] border-[#372E40]"
              />
              Diagnostic Only (Non-Official)
            </label>
            <button
              onClick={() => publishMut.mutate()}
              disabled={publishMut.isPending}
              className="rounded-[4px] bg-[#D9F66F] px-4 py-2 font-mono text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64] cursor-pointer"
            >
              {publishMut.isPending ? "Evaluating Gate..." : "Execute Publication"}
            </button>
          </div>
        </div>
      )}

      {pubFeedback && (
        <div
          className={`flex items-center justify-between rounded-[4px] border px-4 py-3 font-mono text-xs ${
            pubFeedback.type === "ok"
              ? "border-[#2E7D52] bg-[#162E21] text-[#8AE2A4]"
              : "border-[#DE785F] bg-[#2F1B22] text-[#FF9D85]"
          }`}
        >
          <span className="flex items-center gap-2">
            {pubFeedback.type === "ok" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <XOctagon className="h-4 w-4 shrink-0" />
            )}
            {pubFeedback.text}
          </span>
          <button onClick={() => setPubFeedback(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      {/* Editorial Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
            REGULATORY &amp; ATTESTATION ENGINE // 7-SHEET OPENPYXL WORKBOOKS
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
            Audited Reports &amp; Publication Attestation
          </h1>
          <p className="mt-1 text-xs text-[#B7A9C7]">
            Official reports are only issued when the Publication Gate passes; prior versions remain
            immutably retained with SHA-256 content fingerprints.
          </p>
        </div>
      </div>

      {/* Selected Report Governance Card + Porcelain Statement Preview */}
      {selectedReport && (
        <div className="space-y-4">
          <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-5 space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#372E40] pb-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-[2px] border border-[#372E40] bg-[#120B19] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#D9F66F]">
                    VERSION v{selectedReport.version_number}
                  </span>
                  <StatusBadge status={selectedReport.publication_status} />
                  <span className="font-mono text-[10px] text-[#90937E]">
                    DATE: {selectedReport.reporting_date}
                  </span>
                </div>
                <h2 className="mt-2 font-display text-xl font-bold text-[#EBDEF2]">
                  {selectedReport.report_title}
                </h2>
              </div>

              <a
                href={`${API_BASE}/api/v1/reports/${selectedReport.id}/download`}
                className="inline-flex items-center gap-2 rounded-[4px] bg-[#D9F66F] px-4 py-2 font-mono text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64]"
              >
                <Download className="h-3.5 w-3.5" />
                Download 7-Sheet Excel (.xlsx)
              </a>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-6 rounded-[4px] border border-[#372E40] bg-[#120B19] p-4 space-y-2.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#D9F66F]">
                  INSTITUTIONAL POSITION SUMMARY
                </div>
                <div className="flex justify-between text-xs border-b border-[#372E40] pb-2">
                  <span className="text-[#B7A9C7]">Total Assets Reported</span>
                  <span className="font-mono text-base font-bold text-[#EBDEF2] tabular-nums">
                    {formatUsd(selectedReport.total_assets_usd)}
                  </span>
                </div>
                <div className="flex justify-between text-xs border-b border-[#372E40] pb-2">
                  <span className="text-[#B7A9C7]">Net External Cash Flows</span>
                  <span className="font-mono font-semibold text-[#EBDEF2] tabular-nums">
                    {formatUsd(selectedReport.net_external_flows_usd)}
                  </span>
                </div>
                <div className="flex justify-between text-xs border-b border-[#372E40] pb-2">
                  <span className="text-[#B7A9C7]">Market Movement</span>
                  <span className="font-mono font-semibold text-[#EBDEF2] tabular-nums">
                    {formatUsd(selectedReport.market_movement_usd)}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-[#B7A9C7]">Reconciled Variance</span>
                  <span
                    className={`font-mono font-semibold tabular-nums ${
                      Math.abs(selectedReport.financial_variance_usd) > 0.01
                        ? "text-[#FF9D85]"
                        : "text-[#8AE2A4]"
                    }`}
                  >
                    {formatUsd(selectedReport.financial_variance_usd)}
                  </span>
                </div>
              </div>

              <div className="lg:col-span-6 rounded-[4px] border border-[#372E40] bg-[#120B19] p-4 flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                    <span>CRYPTOGRAPHIC ATTESTATION</span>
                    <ShieldCheck className="h-4 w-4 text-[#8AE2A4]" />
                  </div>
                  <div className="mt-3 space-y-2 text-xs">
                    <div>
                      <span className="text-[#90937E]">Published By:</span>{" "}
                      <span className="font-mono text-[#EBDEF2]">
                        {selectedReport.published_by}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#90937E]">Timestamp:</span>{" "}
                      <span className="font-mono text-[#EBDEF2]">
                        {new Date(selectedReport.published_at).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#90937E]">Content Fingerprint (SHA-256):</span>
                      <div className="mt-1 break-all rounded-[2px] border border-[#372E40] bg-[#241D2B] p-2 font-mono text-[11px] text-[#D9F66F]">
                        {selectedReport.content_fingerprint}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 font-mono text-[10px] text-[#8AE2A4]">
                  <Lock className="h-3.5 w-3.5" />
                  FORMULA-INJECTION SANITIZED • 7 WORKBOOK TABS VERIFIED
                </div>
              </div>
            </div>
          </div>

          {/* Warm Porcelain Editorial Document Preview */}
          <div className="rounded-[4px] border border-[#372E40] bg-[#201927] overflow-hidden">
            <div className="flex items-center justify-between border-b border-[#372E40] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              <span className="flex items-center gap-2">
                <span className="h-2 w-2 bg-[#D9F66F]" />
                DOCUMENT PREVIEW // SOVEREIGN FINANCIAL STATEMENT RENDER
              </span>
              <span>CLASSIFICATION: {selectedReport.publication_status}</span>
            </div>

            <div className="p-4 sm:p-8 bg-[#120B19]">
              <div className="mx-auto max-w-4xl rounded-[2px] border border-[#D5CCC0] bg-[#F5F1E9] p-6 sm:p-10 text-[#19141E]">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#19141E] pb-5">
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5263]">
                      NORTHBRIDGE WEALTH — INSTITUTIONAL ASSURANCE
                    </div>
                    <h3 className="mt-1 font-display text-xl font-bold tracking-tight text-[#19141E]">
                      STATEMENT OF ASSURED ASSETS &amp; ROLL-FORWARD
                    </h3>
                    <div className="mt-1 font-mono text-[11px] text-[#5A5263]">
                      AS OF {selectedReport.reporting_date} (VERSION v{selectedReport.version_number})
                    </div>
                  </div>
                  <div className="text-right font-mono text-[10px] text-[#5A5263]">
                    <div>CURRENCY: USD ($)</div>
                    <div>PRECISION: NUMERIC(20,4)</div>
                    <div>STATUS: {selectedReport.publication_status}</div>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="flex justify-between border-b border-[#19141E] pb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5A5263]">
                    <span>STATEMENT LINE ITEM</span>
                    <span>CONSOLIDATED AMOUNT (USD)</span>
                  </div>
                  <div className="divide-y divide-[#D5CCC0] text-sm">
                    <div className="flex justify-between py-3">
                      <span className="font-medium">Total Assets Under Reporting (AUR)</span>
                      <span className="font-mono font-bold tabular-nums">
                        {formatUsd(selectedReport.total_assets_usd)}
                      </span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="font-medium">Net External Client Cash Flows (NNA)</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatUsd(selectedReport.net_external_flows_usd)}
                      </span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="font-medium">Portfolio Market Movement</span>
                      <span className="font-mono font-semibold tabular-nums">
                        {formatUsd(selectedReport.market_movement_usd)}
                      </span>
                    </div>
                    <div className="flex justify-between py-3">
                      <span className="font-medium">Unreconciled Roll-Forward Variance</span>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          Math.abs(selectedReport.financial_variance_usd) > 0.01
                            ? "text-[#A24A34]"
                            : "text-[#168363]"
                        }`}
                      >
                        {formatUsd(selectedReport.financial_variance_usd)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Version History Table */}
      <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
        <div className="border-b border-[#372E40] bg-[#201927] px-4 py-3 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#B7A9C7]">
          PUBLISHED REPORT VERSION HISTORY ({filteredReports.length})
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase text-[#90937E]">
              <tr>
                <th className="px-4 py-2.5">Report Title</th>
                <th className="px-4 py-2.5">Classification</th>
                <th className="px-4 py-2.5 text-right">Total Assets</th>
                <th className="px-4 py-2.5 text-right">Net Flows</th>
                <th className="px-4 py-2.5">Fingerprint</th>
                <th className="px-4 py-2.5">Published By</th>
                <th className="px-4 py-2.5 text-right">Excel (.xlsx)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#372E40]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center font-mono text-[#90937E]">
                    Loading published reports...
                  </td>
                </tr>
              ) : filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center font-mono text-[#90937E]">
                    No reports published yet.
                  </td>
                </tr>
              ) : (
                filteredReports.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={`cursor-pointer transition-colors hover:bg-[#302839] ${
                      selectedReport?.id === r.id
                        ? "border-l-[3px] border-l-[#D9F66F] bg-[#201927]"
                        : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-medium text-[#EBDEF2]">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-[#8AE2A4] shrink-0" />
                        <span>{r.report_title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.publication_status} />
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#EBDEF2]">
                      {formatUsd(r.total_assets_usd)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-[#B7A9C7]">
                      {formatUsd(r.net_external_flows_usd)}
                    </td>
                    <td className="px-4 py-3 font-mono text-[#90937E]">
                      {r.content_fingerprint.slice(0, 14)}…
                    </td>
                    <td className="px-4 py-3 font-mono text-[#B7A9C7]">{r.published_by}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`${API_BASE}/api/v1/reports/${r.id}/download`}
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 rounded-[4px] border border-[#372E40] bg-[#120B19] px-2.5 py-1 font-mono text-[11px] font-medium text-[#D9F66F] hover:border-[#D9F66F]"
                      >
                        <Download className="h-3 w-3" />
                        Download
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
