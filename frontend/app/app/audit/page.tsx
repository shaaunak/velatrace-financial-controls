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
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
            CRYPTOGRAPHIC LEDGER // APPEND-ONLY LOG
          </div>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2]">
            Hash-Chained Audit Trail
          </h1>
          <p className="mt-1 text-xs text-[#B7A9C7]">
            Every exception transition, waiver, publication gate block, and Failure Lab action is
            cryptographically chained with SHA-256.
          </p>
        </div>
        <button
          onClick={() => verifyMut.mutate()}
          disabled={verifyMut.isPending}
          className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#D9F66F] px-4 py-2 font-mono text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64] cursor-pointer"
        >
          <ShieldCheck className="h-3.5 w-3.5" />
          Verify Hash Chain
        </button>
      </div>

      {verifyRes && (
        <div
          className={`flex items-center gap-2 rounded-[4px] border p-3.5 font-mono text-xs ${
            verifyRes.valid
              ? "border-[#2E7D52] bg-[#162E21] text-[#8AE2A4]"
              : "border-[#DE785F] bg-[#2F1B22] text-[#FF9D85]"
          }`}
        >
          {verifyRes.valid ? (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          ) : (
            <XOctagon className="h-4 w-4 shrink-0" />
          )}
          <span>
            {verifyRes.details} ({verifyRes.total_events} events verified in {workspaceId})
          </span>
        </div>
      )}

      <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase tracking-[0.08em] text-[#90937E]">
              <tr>
                <th className="px-4 py-3">Seq</th>
                <th className="px-4 py-3">Timestamp</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Entity</th>
                <th className="px-4 py-3">Reason</th>
                <th className="px-4 py-3">Event Hash</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#372E40]">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center font-mono text-[#90937E]">
                    Loading immutable audit events...
                  </td>
                </tr>
              ) : (
                (data?.items || []).map((ev) => (
                  <tr key={ev.id} className="hover:bg-[#302839]">
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#D9F66F]">
                      #{ev.sequence_num}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#90937E] whitespace-nowrap">
                      {new Date(ev.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#EBDEF2]">
                      {ev.actor_id} <span className="text-[#90937E]">[{ev.actor_role}]</span>
                    </td>
                    <td className="px-4 py-2.5 font-mono font-semibold text-[#8AE2A4]">
                      {ev.action}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#B7A9C7]">
                      {ev.entity_type}:{ev.entity_id.slice(0, 14)}
                    </td>
                    <td className="px-4 py-2.5 text-[#EBDEF2] max-w-xs truncate">
                      {ev.reason || "—"}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-[#90937E]">
                      {ev.event_hash.slice(0, 14)}…
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
