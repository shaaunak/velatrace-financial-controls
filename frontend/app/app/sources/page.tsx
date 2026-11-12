"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, FileCode2 } from "lucide-react";
import { apiFetch, formatNumber, formatUsd } from "@/lib/api";
import { StatusBadge } from "@/components/StatusBadge";

interface SourceItem {
  id: string;
  batch_id: string;
  source_system: string;
  reporting_date: string;
  file_name: string;
  row_count: number;
  declared_control_total: number | null;
  source_hash: string;
  idempotency_key: string;
  parser_version: string;
  payload_format: string;
  processing_status: string;
  received_at: string;
}

export default function SourcesPage() {
  const [previewId, setPreviewId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ items: SourceItem[] }>({
    queryKey: ["sources"],
    queryFn: () => apiFetch("/sources"),
  });

  const { data: preview } = useQuery<{
    id: string;
    file_name: string;
    source_system: string;
    row_count: number;
    source_hash: string;
    preview_lines: string[];
  }>({
    queryKey: ["source-preview", previewId],
    queryFn: () => apiFetch(`/sources/${previewId}/preview`),
    enabled: Boolean(previewId),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-[#101828]">Data Sources & Immutable Snapshots</h1>
        <p className="text-xs text-[#667085] mt-0.5">
          Every ingested source file is fingerprinted with SHA-256 and deduplicated via natural idempotency keys.
        </p>
      </div>

      {preview && (
        <div className="rounded-lg border border-[#3267D6]/30 bg-white p-4 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#101828]">
              <FileCode2 className="h-4 w-4 text-[#3267D6]" />
              {preview.file_name} ({preview.source_system}) — {formatNumber(preview.row_count)} rows
            </div>
            <button onClick={() => setPreviewId(null)} className="text-xs text-[#667085] hover:text-[#172033]">
              Close
            </button>
          </div>
          <pre className="overflow-x-auto rounded bg-[#101828] p-3 text-[11px] font-mono text-[#E5E9F0] leading-relaxed">
            {preview.preview_lines.join("\n")}
          </pre>
        </div>
      )}

      <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
              <tr>
                <th className="px-4 py-3 font-medium">Source System</th>
                <th className="px-4 py-3 font-medium">File Name</th>
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium text-right">Rows</th>
                <th className="px-4 py-3 font-medium text-right">Declared Total (USD)</th>
                <th className="px-4 py-3 font-medium">Source Hash</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E9F0]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-[#667085]">
                    Loading source snapshots...
                  </td>
                </tr>
              ) : (
                (data?.items || []).map((s) => (
                  <tr key={s.id} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-2.5 font-medium text-[#101828]">{s.source_system}</td>
                    <td className="px-4 py-2.5 font-mono">{s.file_name}</td>
                    <td className="px-4 py-2.5 text-[#667085]">{s.reporting_date}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatNumber(s.row_count)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">
                      {s.declared_control_total !== null ? formatUsd(s.declared_control_total) : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#667085]">{s.source_hash.slice(0, 16)}…</td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={s.processing_status === "INGESTED" ? "PASS" : s.processing_status} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setPreviewId(s.id)}
                        className="inline-flex items-center gap-1 rounded border border-[#E5E9F0] px-2 py-1 text-[11px] font-medium hover:bg-[#F2F4F7]"
                      >
                        <Eye className="h-3 w-3" /> Preview
                      </button>
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
