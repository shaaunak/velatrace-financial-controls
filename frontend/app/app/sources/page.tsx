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
        <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
          IMMUTABLE RAW LAYER // SHA-256 SNAPSHOTS
        </div>
        <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
          Data Sources &amp; Immutable Snapshots
        </h1>
        <p className="mt-1 text-xs text-[#B7A9C7]">
          Every ingested source file is fingerprinted with SHA-256 and deduplicated via natural
          idempotency keys.
        </p>
      </div>

      {preview && (
        <div className="rounded-[4px] border border-[#D9F66F] bg-[#241D2B] p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 font-mono text-xs font-semibold text-[#D9F66F]">
              <FileCode2 className="h-4 w-4" />
              {preview.file_name} ({preview.source_system}) — {formatNumber(preview.row_count)} rows
            </div>
            <button
              onClick={() => setPreviewId(null)}
              className="font-mono text-xs text-[#B7A9C7] hover:text-[#EBDEF2] cursor-pointer"
            >
              Close Preview
            </button>
          </div>
          <pre className="overflow-x-auto rounded-[4px] border border-[#372E40] bg-[#120B19] p-3 font-mono text-[11px] text-[#EBDEF2] leading-relaxed">
            {preview.preview_lines.join("\n")}
          </pre>
        </div>
      )}

      <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase tracking-[0.08em] text-[#90937E]">
              <tr>
                <th className="px-4 py-3">Source System</th>
                <th className="px-4 py-3">File Name</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Rows</th>
                <th className="px-4 py-3 text-right">Declared Total (USD)</th>
                <th className="px-4 py-3">Source Hash</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Inspect</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#372E40]">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center font-mono text-[#90937E]">
                    Loading raw source snapshots...
                  </td>
                </tr>
              ) : (
                (data?.items || []).map((s) => (
                  <tr key={s.id} className="h-10 hover:bg-[#302839] transition-colors">
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#D9F66F]">
                      {s.source_system}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#EBDEF2]">{s.file_name}</td>
                    <td className="px-4 py-2.5 font-mono text-[#B7A9C7]">{s.reporting_date}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#B7A9C7]">
                      {formatNumber(s.row_count)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#EBDEF2]">
                      {s.declared_control_total !== null
                        ? formatUsd(s.declared_control_total)
                        : "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#90937E]">
                      {s.source_hash.slice(0, 14)}…
                    </td>
                    <td className="px-4 py-2.5">
                      <StatusBadge status={s.processing_status} />
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setPreviewId(s.id)}
                        className="inline-flex items-center gap-1 rounded-[4px] border border-[#372E40] bg-[#120B19] px-2.5 py-1 font-mono text-[11px] text-[#D9F66F] hover:border-[#D9F66F] cursor-pointer"
                      >
                        <Eye className="h-3 w-3" />
                        Preview
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
