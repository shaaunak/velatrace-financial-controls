"use client";

import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ShieldCheck, XOctagon } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAppState } from "@/components/providers";

interface AuditItem {
  id: string;
  sequence_num: number;
  workspace_id: string;
  actor_id: string;
  actor_role: string;
  timestamp: string;
  action: string;
  entity_type: string;
  entity_id: string;
  reason: string | null;
  event_hash: string;
  prev_hash: string;
}

export default function AuditPage() {
  const { workspaceId } = useAppState();
  const [verifyRes, setVerifyRes] = useState<{
    valid: boolean;
    total_events: number;
    details: string;
  } | null>(null);

  const { data, isLoading } = useQuery<{ items: AuditItem[] }>({
    queryKey: ["audit-events"],
    queryFn: () => apiFetch("/audit"),
  });

  const verifyMut = useMutation({
    mutationFn: () =>
      apiFetch<{ valid: boolean; total_events: number; details: string }>(
        `/audit/verify?workspace_id=${workspaceId}`,
        { method: "POST" }
      ),
    onSuccess: (res) => setVerifyRes(res),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#101828]">Hash-Chained Audit Trail</h1>
          <p className="text-xs text-[#667085] mt-0.5">
            Append-only chronological event log with SHA-256 hash chaining for tamper detection.
          </p>
        </div>
        <button
          onClick={() => verifyMut.mutate()}
          disabled={verifyMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-md bg-[#101828] px-3.5 py-2 text-xs font-medium text-white hover:bg-[#1D2939]"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Verify Hash Chain
        </button>
      </div>

      {verifyRes && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3.5 text-xs ${
            verifyRes.valid
              ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#168363]"
              : "border-[#FECDCA] bg-[#FEF3F2] text-[#C74242]"
          }`}
        >
          {verifyRes.valid ? <CheckCircle2 className="h-4 w-4" /> : <XOctagon className="h-4 w-4" />}
          <span>
            {verifyRes.details} ({verifyRes.total_events} events checked in {workspaceId})
          </span>
        </div>
      )}

      <div className="rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
              <tr>
                <th className="px-4 py-3 font-medium">Seq</th>
                <th className="px-4 py-3 font-medium">Timestamp</th>
                <th className="px-4 py-3 font-medium">Actor</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Entity</th>
                <th className="px-4 py-3 font-medium">Reason</th>
                <th className="px-4 py-3 font-medium">Event Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5E9F0]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#667085]">
                    Loading audit trail...
                  </td>
                </tr>
              ) : (
                (data?.items || []).map((ev) => (
                  <tr key={ev.id} className="hover:bg-[#F9FAFB]">
                    <td className="px-4 py-2.5 font-mono text-[#667085]">#{ev.sequence_num}</td>
                    <td className="px-4 py-2.5 font-mono text-[#667085] whitespace-nowrap">
                      {ev.timestamp.replace("T", " ").slice(0, 19)}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="font-medium text-[#101828]">{ev.actor_id}</span>{" "}
                      <span className="text-[10px] text-[#667085]">({ev.actor_role})</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-medium text-[#3267D6]">{ev.action}</td>
                    <td className="px-4 py-2.5 font-mono text-[#475467]">
                      {ev.entity_type}:{ev.entity_id.slice(0, 12)}
                    </td>
                    <td className="px-4 py-2.5 text-[#475467] max-w-xs truncate">{ev.reason || "—"}</td>
                    <td className="px-4 py-2.5 font-mono text-[#667085]">{ev.event_hash.slice(0, 14)}…</td>
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
