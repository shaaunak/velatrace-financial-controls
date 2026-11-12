"use client";

import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, CheckCircle2, MessageSquare, ShieldAlert } from "lucide-react";
import { ApiError, apiFetch, formatUsd } from "@/lib/api";
import { useAppState } from "@/components/providers";
import { StatusBadge } from "@/components/StatusBadge";

interface ExcItem {
  id: string;
  exception_code: string;
  batch_id: string;
  rule_id: string;
  rule_version: string;
  entity_type: string;
  entity_id: string;
  source_system: string;
  severity: string;
  is_blocking: boolean;
  variance_amount_usd: number;
  title: string;
  description: string;
  status: string;
  assigned_to: string | null;
  age_hours: number;
}

interface ExcDetail {
  exception: ExcItem & { is_waivable: boolean };
  comments: Array<{ id: number; author_id: string; author_role: string; body: string; created_at: string }>;
  waivers: Array<{
    id: string;
    requested_by: string;
    justification: string;
    status: string;
    reviewed_by: string | null;
    review_notes: string | null;
  }>;
}

export default function ExceptionsPage() {
  const { actor } = useAppState();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [waiverReason, setWaiverReason] = useState("");
  const [feedback, setFeedback] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const { data, isLoading } = useQuery<{ items: ExcItem[] }>({
    queryKey: ["exceptions", statusFilter],
    queryFn: () => {
      const p = new URLSearchParams();
      if (statusFilter) p.set("status", statusFilter);
      return apiFetch(`/exceptions?${p.toString()}`);
    },
  });

  const { data: detail, refetch: refetchDetail } = useQuery<ExcDetail>({
    queryKey: ["exception-detail", selectedId],
    queryFn: () => apiFetch(`/exceptions/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const transitionMut = useMutation({
    mutationFn: ({ id, new_status }: { id: string; new_status: string }) =>
      apiFetch(`/exceptions/${id}/transition`, {
        method: "PATCH",
        actor,
        body: JSON.stringify({ new_status, resolution_notes: `Updated by ${actor.actorId}` }),
      }),
    onSuccess: () => {
      setFeedback({ type: "ok", text: "Exception status updated." });
      qc.invalidateQueries({ queryKey: ["exceptions"] });
      refetchDetail();
    },
    onError: (e: Error) => setFeedback({ type: "err", text: e.message }),
  });

  const commentMut = useMutation({
    mutationFn: () =>
      apiFetch(`/exceptions/${selectedId}/comments`, {
        method: "POST",
        actor,
        body: JSON.stringify({ body: noteText }),
      }),
    onSuccess: () => {
      setNoteText("");
      refetchDetail();
    },
  });

  const waiverReqMut = useMutation({
    mutationFn: () =>
      apiFetch(`/exceptions/${selectedId}/waivers`, {
        method: "POST",
        actor,
        body: JSON.stringify({ justification: waiverReason }),
      }),
    onSuccess: () => {
      setWaiverReason("");
      setFeedback({ type: "ok", text: "Waiver requested. Pending second-person Controller approval." });
      qc.invalidateQueries({ queryKey: ["exceptions"] });
      refetchDetail();
    },
    onError: (e: Error) => setFeedback({ type: "err", text: e instanceof ApiError ? e.message : e.message }),
  });

  const waiverReviewMut = useMutation({
    mutationFn: ({ waiverId, decision }: { waiverId: string; decision: "APPROVED" | "REJECTED" }) =>
      apiFetch(`/waivers/${waiverId}/review`, {
        method: "POST",
        actor,
        body: JSON.stringify({ decision, review_notes: `Reviewed by ${actor.displayName}` }),
      }),
    onSuccess: () => {
      setFeedback({ type: "ok", text: "Waiver review recorded in audit trail." });
      qc.invalidateQueries({ queryKey: ["exceptions"] });
      refetchDetail();
    },
    onError: (e: Error) => setFeedback({ type: "err", text: e instanceof ApiError ? e.message : e.message }),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[#101828]">Exception Management Queue</h1>
          <p className="text-xs text-[#667085] mt-0.5">
            Track open breaks, investigation notes, SLA ageing, and Maker-Checker policy waivers.
          </p>
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-[#E5E9F0] bg-white px-3 py-1.5 text-xs"
        >
          <option value="">All Statuses</option>
          <option value="OPEN">OPEN</option>
          <option value="INVESTIGATING">INVESTIGATING</option>
          <option value="WAIVER_REQUESTED">WAIVER REQUESTED</option>
          <option value="WAIVED">WAIVED</option>
          <option value="RESOLVED">RESOLVED</option>
        </select>
      </div>

      {feedback && (
        <div
          className={`flex items-center gap-2 rounded-lg border p-3 text-xs ${
            feedback.type === "ok"
              ? "border-[#ABEFC6] bg-[#ECFDF3] text-[#168363]"
              : "border-[#FECDCA] bg-[#FEF3F2] text-[#C74242]"
          }`}
        >
          {feedback.type === "ok" ? <CheckCircle2 className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          <span>{feedback.text}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 rounded-lg border border-[#E5E9F0] bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F9FAFB] text-[#667085] border-b border-[#E5E9F0]">
                <tr>
                  <th className="px-4 py-3 font-medium">Exception</th>
                  <th className="px-4 py-3 font-medium">Rule</th>
                  <th className="px-4 py-3 font-medium">Entity</th>
                  <th className="px-4 py-3 font-medium">Severity</th>
                  <th className="px-4 py-3 font-medium text-right">Impact</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E9F0]">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#667085]">
                      Loading exceptions...
                    </td>
                  </tr>
                ) : (data?.items || []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-[#667085]">
                      No exceptions found.
                    </td>
                  </tr>
                ) : (
                  data!.items.map((e) => (
                    <tr
                      key={e.id}
                      onClick={() => {
                        setSelectedId(e.id);
                        setFeedback(null);
                      }}
                      className={`cursor-pointer hover:bg-[#F9FAFB] ${
                        selectedId === e.id ? "bg-[#EFF4FF]/60" : ""
                      }`}
                    >
                      <td className="px-4 py-2.5 font-mono font-medium text-[#3267D6]">{e.exception_code}</td>
                      <td className="px-4 py-2.5 font-mono">{e.rule_id}</td>
                      <td className="px-4 py-2.5">{e.entity_id}</td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={e.severity} />
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {formatUsd(e.variance_amount_usd)}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge status={e.status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Exception Detail Drawer */}
        <div className="rounded-lg border border-[#E5E9F0] bg-white p-5 space-y-4">
          {!detail ? (
            <div className="text-xs text-[#667085] py-10 text-center">
              <AlertOctagon className="h-6 w-6 mx-auto mb-2 text-[#D0D5DD]" />
              Select an exception row to inspect details, add notes, or manage waivers.
            </div>
          ) : (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-semibold text-[#3267D6]">
                    {detail.exception.exception_code}
                  </span>
                  <StatusBadge status={detail.exception.status} />
                </div>
                <h2 className="mt-1 text-sm font-semibold text-[#101828]">{detail.exception.title}</h2>
                <p className="mt-1.5 text-xs text-[#475467] leading-relaxed">{detail.exception.description}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {detail.exception.status === "OPEN" && (
                  <button
                    onClick={() => transitionMut.mutate({ id: detail.exception.id, new_status: "INVESTIGATING" })}
                    className="rounded border border-[#E5E9F0] px-2.5 py-1 text-xs font-medium hover:bg-[#F2F4F7]"
                  >
                    Start Investigation
                  </button>
                )}
                {["OPEN", "INVESTIGATING"].includes(detail.exception.status) && (
                  <button
                    onClick={() => transitionMut.mutate({ id: detail.exception.id, new_status: "RESOLVED" })}
                    className="rounded bg-[#168363] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#126B50]"
                  >
                    Mark Resolved
                  </button>
                )}
              </div>

              {/* Maker-Checker Waiver Section */}
              <div className="border-t border-[#E5E9F0] pt-3 space-y-2.5">
                <div className="text-xs font-semibold text-[#101828]">
                  Policy Waiver ({detail.exception.is_waivable ? "Eligible" : "Non-Waivable Critical Control"})
                </div>
                {detail.waivers.map((w) => (
                  <div key={w.id} className="rounded border border-[#E5E9F0] bg-[#F9FAFB] p-2.5 text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Requested by {w.requested_by}</span>
                      <StatusBadge status={w.status} />
                    </div>
                    <p className="text-[#475467]">{w.justification}</p>
                    {w.status === "PENDING" && (
                      <div className="flex gap-2 pt-1">
                        <button
                          onClick={() => waiverReviewMut.mutate({ waiverId: w.id, decision: "APPROVED" })}
                          className="rounded bg-[#168363] px-2 py-1 text-[11px] font-medium text-white"
                        >
                          Approve (Controller)
                        </button>
                        <button
                          onClick={() => waiverReviewMut.mutate({ waiverId: w.id, decision: "REJECTED" })}
                          className="rounded bg-[#C74242] px-2 py-1 text-[11px] font-medium text-white"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {["OPEN", "INVESTIGATING"].includes(detail.exception.status) && (
                  <div className="space-y-1.5">
                    <textarea
                      rows={2}
                      placeholder="Waiver justification (min 10 chars)..."
                      value={waiverReason}
                      onChange={(e) => setWaiverReason(e.target.value)}
                      className="w-full rounded border border-[#E5E9F0] p-2 text-xs"
                    />
                    <button
                      onClick={() => waiverReqMut.mutate()}
                      disabled={waiverReason.length < 10 || waiverReqMut.isPending}
                      className="rounded border border-[#E5E9F0] bg-white px-2.5 py-1 text-xs font-medium hover:bg-[#F2F4F7] disabled:opacity-50"
                    >
                      Request Policy Waiver
                    </button>
                  </div>
                )}
              </div>

              {/* Investigation Notes */}
              <div className="border-t border-[#E5E9F0] pt-3 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#101828]">
                  <MessageSquare className="h-3.5 w-3.5 text-[#3267D6]" />
                  Investigation Notes ({detail.comments.length})
                </div>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {detail.comments.map((c) => (
                    <div key={c.id} className="rounded bg-[#F7F8FA] p-2 text-xs">
                      <div className="font-medium text-[#101828]">
                        {c.author_id} <span className="text-[#667085]">({c.author_role})</span>
                      </div>
                      <div className="mt-0.5 text-[#475467]">{c.body}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add note..."
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    className="flex-1 rounded border border-[#E5E9F0] px-2.5 py-1 text-xs"
                  />
                  <button
                    onClick={() => commentMut.mutate()}
                    disabled={noteText.length < 2}
                    className="rounded bg-[#101828] px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Post
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
