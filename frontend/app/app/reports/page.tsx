"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
import { API_BASE, apiFetch, formatUsd } from "@/lib/api";
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

export default function ReportsPage() {
  const { data, isLoading } = useQuery<{ items: ReportItem[] }>({
    queryKey: ["reports"],
    queryFn: () => apiFetch("/reports"),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#101828]">Management Reports & Version History</h1>
        <p className="text-xs text-[#667085] mt-0.5">
          7-sheet OpenPyXL workbooks. Official reports are only issued when the Publication Gate passes; prior versions remain retained.
        </p>
      </div>

      <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
              <tr>
                <th className="px-4 py-3 font-medium">Report Title</th>
                <th className="px-4 py-3 font-medium">Classification</th>
                <th className="px-4 py-3 font-medium text-right">Total Assets (USD)</th>
                <th className="px-4 py-3 font-medium text-right">Net Flows (USD)</th>
                <th className="px-4 py-3 font-medium">Fingerprint (SHA-256)</th>
                <th className="px-4 py-3 font-medium">Published By</th>
                <th className="px-4 py-3 font-medium text-right">Excel (.xlsx)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E9F0]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#667085]">
                    Loading published reports...
                  </td>
                </tr>
              ) : (data?.items || []).length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#667085]">
                    No reports published yet.
                  </td>
                </tr>
              ) : (
                data!.items.map((r) => (
                  <tr key={r.id} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-3 font-medium text-[#101828]">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-[#168363]" />
                        <span>{r.report_title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={r.publication_status} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatUsd(r.total_assets_usd)}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{formatUsd(r.net_external_flows_usd)}</td>
                    <td className="px-4 py-3 font-mono text-[#667085]">{r.content_fingerprint.slice(0, 16)}…</td>
                    <td className="px-4 py-3 text-[#475467]">{r.published_by}</td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href={`${API_BASE}/api/v1/reports/${r.id}/download`}
                        className="inline-flex items-center gap-1 rounded-md border border-[#E5E9F0] bg-white px-2.5 py-1 text-[11px] font-medium text-[#172033] hover:bg-[#F2F4F7]"
                      >
                        <Download className="h-3 w-3 text-[#3267D6]" />
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
