"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  MessageSquare,
  Search,
  ShieldAlert,
  UserCheck,
  X,
} from "lucide-react";
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
  comments: Array<{
    id: number;
    author_id: string;
    author_role: string;
    body: string;
    created_at: string;
  }>;
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
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [search, setSearch] = useState("");
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

  const allItems = data?.items || [];
  const filteredItems = allItems.filter((item) => {
    if (criticalOnly && !item.is_blocking && item.severity !== "CRITICAL") return false;
    if (search) {
      const q = search.toLowerCase();
      return (
        item.exception_code.toLowerCase().includes(q) ||
        item.rule_id.toLowerCase().includes(q) ||
        item.entity_id.toLowerCase().includes(q) ||
        item.title.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const activeId = selectedId || filteredItems[0]?.id || null;

  const { data: detail, refetch: refetchDetail } = useQuery<ExcDetail>({
    queryKey: ["exception-detail", activeId],
    queryFn: () => apiFetch(`/exceptions/${activeId}`),
    enabled: Boolean(activeId),
  });

  const transitionMut = useMutation({
    mutationFn: ({
      id,
      new_status,
      assigned_to,
    }: {
      id: string;
      new_status: string;
      assigned_to?: string;
    }) =>
      apiFetch(`/exceptions/${id}/transition`, {
        method: "PATCH",
        actor,
        body: JSON.stringify({
          new_status,
          assigned_to,
          resolution_notes: `Updated by ${actor.actorId}`,
        }),
      }),
    onSuccess: () => {
      setFeedback({ type: "ok", text: "Exception record updated and logged to audit trail." });
      qc.invalidateQueries({ queryKey: ["exceptions"] });
      qc.invalidateQueries({ queryKey: ["shell-overview-meta"] });
      refetchDetail();
    },
    onError: (e: Error) => setFeedback({ type: "err", text: e.message }),
  });

  const commentMut = useMutation({
    mutationFn: () =>
      apiFetch(`/exceptions/${activeId}/comments`, {
        method: "POST",
        actor,
        body: JSON.stringify({ body: noteText }),
      }),
    onSuccess: () => {
      setNoteText("");
      refetchDetail();
    },
    onError: (e: Error) => setFeedback({ type: "err", text: e.message }),
  });

  const waiverReqMut = useMutation({
    mutationFn: () =>
      apiFetch(`/exceptions/${activeId}/waivers`, {
        method: "POST",
        actor,
        body: JSON.stringify({ justification: waiverReason }),
      }),
    onSuccess: () => {
      setWaiverReason("");
      setFeedback({
        type: "ok",
        text: "Waiver requested. Pending second-person Controller approval.",
      });
      qc.invalidateQueries({ queryKey: ["exceptions"] });
      refetchDetail();
    },
    onError: (e: Error) =>
      setFeedback({ type: "err", text: e instanceof ApiError ? e.message : e.message }),
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
      qc.invalidateQueries({ queryKey: ["shell-overview-meta"] });
      refetchDetail();
    },
    onError: (e: Error) =>
      setFeedback({ type: "err", text: e instanceof ApiError ? e.message : e.message }),
  });

  const exportCsv = () => {
    const header = "exception_code,rule_id,entity_id,severity,status,variance_amount_usd,title\n";
    const rows = filteredItems
      .map(
        (i) =>
          `"${i.exception_code}","${i.rule_id}","${i.entity_id}","${i.severity}","${i.status}",${i.variance_amount_usd},"${i.title.replace(/"/g, '""')}"`
      )
      .join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "velatrace_exceptions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const criticalCount = allItems.filter((i) => i.is_blocking || i.severity === "CRITICAL").length;
  const openExposure = filteredItems.reduce((acc, i) => acc + Math.abs(i.variance_amount_usd || 0), 0);

  return (
    <div className="space-y-4">
      {/* Top Search & Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-[#372E40] bg-[#201927] p-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="h-3.5 w-3.5 text-[#90937E] absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Filter by Exception ID, Account, Rule ID, or Description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-[4px] border border-[#372E40] bg-[#120B19] pl-8 pr-3 py-1.5 font-mono text-xs text-[#EBDEF2] placeholder-[#90937E] focus:border-[#D9F66F] focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {detail && (
            <button
              onClick={() =>
                transitionMut.mutate({
                  id: detail.exception.id,
                  new_status: "INVESTIGATING",
                  assigned_to: actor.actorId,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#372E40] bg-[#241D2B] px-3 py-1.5 font-mono text-[11px] font-medium text-[#EBDEF2] hover:border-[#D9F66F] cursor-pointer"
            >
              <UserCheck className="h-3.5 w-3.5 text-[#D9F66F]" />
              ASSIGN TO ME
            </button>
          )}
          <button
            onClick={exportCsv}
            className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#372E40] bg-[#241D2B] px-3 py-1.5 font-mono text-[11px] font-medium text-[#EBDEF2] hover:border-[#B7A9C7] cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 text-[#D9F66F]" />
            EXPORT CSV
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { label: "All", val: "", crit: false, count: allItems.length },
            { label: "Critical Blockers", val: "", crit: true, count: criticalCount },
            { label: "Open", val: "OPEN", crit: false },
            { label: "Investigating", val: "INVESTIGATING", crit: false },
            { label: "Waiver Requested", val: "WAIVER_REQUESTED", crit: false },
            { label: "Resolved", val: "RESOLVED", crit: false },
          ].map((tab) => {
            const active =
              statusFilter === tab.val && criticalOnly === tab.crit;
            return (
              <button
                key={tab.label}
                onClick={() => {
                  setStatusFilter(tab.val);
                  setCriticalOnly(tab.crit);
                }}
                className={`inline-flex items-center gap-1.5 rounded-[4px] border px-3 py-1.5 font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                  active
                    ? "border-[#D9F66F] bg-[#D9F66F] text-[#171E00]"
                    : "border-[#372E40] bg-[#241D2B] text-[#B7A9C7] hover:border-[#B7A9C7]"
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`rounded-[2px] px-1 text-[10px] ${
                      active ? "bg-[#171E00]/15 text-[#171E00]" : "bg-[#120B19] text-[#EBDEF2]"
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="font-mono text-[11px] text-[#B7A9C7]">
          EXPOSURE: <span className="font-semibold text-[#D9F66F] tabular-nums">{formatUsd(openExposure)}</span>
        </div>
      </div>

      {feedback && (
        <div
          className={`flex items-center justify-between rounded-[4px] border px-4 py-2.5 text-xs ${
            feedback.type === "ok"
              ? "border-[#2E7D52] bg-[#162E21] text-[#8AE2A4]"
              : "border-[#DE785F] bg-[#2F1B22] text-[#FF9D85]"
          }`}
        >
          <span className="flex items-center gap-2 font-mono">
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

      {/* Split-Pane Desk */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Queue Table (7 Cols) */}
        <div className="lg:col-span-7 rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-[#372E40] bg-[#201927] px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
              <span>EXCEPTIONS QUEUE ({filteredItems.length} RECORDS)</span>
              <span className="text-[#D9F66F]">LIVE POSTGRESQL</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-[#372E40] bg-[#120B19] font-mono text-[10px] uppercase tracking-[0.08em] text-[#90937E]">
                  <tr>
                    <th className="px-3.5 py-2.5">Code</th>
                    <th className="px-3.5 py-2.5">Rule &amp; Description</th>
                    <th className="px-3.5 py-2.5">Severity</th>
                    <th className="px-3.5 py-2.5">Status</th>
                    <th className="px-3.5 py-2.5 text-right">Variance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#372E40]">
                  {isLoading ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center font-mono text-[#90937E]">
                        Loading exceptions queue...
                      </td>
                    </tr>
                  ) : filteredItems.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center font-mono text-[#90937E]">
                        No exceptions match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredItems.map((ex) => {
                      const isSel = activeId === ex.id;
                      return (
                        <tr
                          key={ex.id}
                          onClick={() => setSelectedId(ex.id)}
                          className={`cursor-pointer transition-colors hover:bg-[#302839] ${
                            isSel
                              ? "border-l-[3px] border-l-[#D9F66F] bg-[#201927]"
                              : ex.is_blocking
                              ? "border-l-[3px] border-l-[#DE785F]"
                              : ""
                          }`}
                        >
                          <td className="px-3.5 py-3 font-mono font-semibold text-[#D9F66F] whitespace-nowrap">
                            {ex.exception_code}
                          </td>
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono text-[10px] font-semibold text-[#B7A9C7]">
                                {ex.rule_id}
                              </span>
                              <span className="font-medium text-[#EBDEF2] line-clamp-1">
                                {ex.title}
                              </span>
                            </div>
                            <div className="mt-0.5 font-mono text-[10px] text-[#90937E]">
                              {ex.entity_type}: {ex.entity_id} • {ex.source_system}
                            </div>
                          </td>
                          <td className="px-3.5 py-3">
                            <StatusBadge status={ex.severity} />
                          </td>
                          <td className="px-3.5 py-3">
                            <StatusBadge status={ex.status} />
                          </td>
                          <td className="px-3.5 py-3 text-right font-mono tabular-nums font-semibold text-[#FF9D85] whitespace-nowrap">
                            {formatUsd(ex.variance_amount_usd)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-[#372E40] bg-[#120B19] px-4 py-2 font-mono text-[10px] text-[#90937E] flex justify-between">
            <span>ACTOR: {actor.displayName} [{actor.role}]</span>
            <span>MAKER-CHECKER RBAC ACTIVE</span>
          </div>
        </div>

        {/* Right Investigation & Remediation Drawer (5 Cols) */}
        <div className="lg:col-span-5 rounded-[4px] border border-[#372E40] bg-[#241D2B] flex flex-col justify-between">
          {detail ? (
            <div className="divide-y divide-[#372E40]">
              {/* Drawer Header */}
              <div className="p-4 bg-[#201927]">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-semibold text-[#D9F66F]">
                    {detail.exception.exception_code} {"//"} {detail.exception.severity}
                  </span>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={detail.exception.status} />
                    <button
                      onClick={() => setSelectedId(null)}
                      className="text-[#90937E] hover:text-[#EBDEF2]"
                      aria-label="Clear selection"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <h2 className="mt-2 font-display text-base font-bold text-[#EBDEF2]">
                  {detail.exception.title}
                </h2>
              </div>

              {/* Material Variance Callout */}
              <div className="p-4 bg-[#2F1B22]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 font-mono text-xs font-semibold text-[#FF9D85]">
                    <AlertTriangle className="h-4 w-4 text-[#DE785F]" />
                    {formatUsd(detail.exception.variance_amount_usd)} Variance Impact
                  </span>
                  <span className="font-mono text-[10px] text-[#FF9D85]">
                    {detail.exception.is_blocking ? "HARD BLOCKER" : "NON-BLOCKING"}
                  </span>
                </div>
                <p className="mt-1.5 text-xs text-[#EBDEF2]/90 leading-relaxed">
                  {detail.exception.description}
                </p>
              </div>

              {/* Section 1: Affected Entity & Lineage Link */}
              <div className="p-4 space-y-2.5">
                <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                  <span>SECTION 1: AFFECTED LEDGER ENTITY</span>
                  <span>RULE: {detail.exception.rule_id}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                    <div className="font-mono text-[9px] text-[#90937E]">ENTITY ID</div>
                    <div className="mt-0.5 font-mono font-semibold text-[#EBDEF2]">
                      {detail.exception.entity_id}
                    </div>
                  </div>
                  <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5">
                    <div className="font-mono text-[9px] text-[#90937E]">ASSIGNED TO</div>
                    <div className="mt-0.5 font-mono font-semibold text-[#D9F66F]">
                      {detail.exception.assigned_to || "Unassigned"}
                    </div>
                  </div>
                </div>
                <Link
                  href={`/app/investigate?batchId=${detail.exception.batch_id}`}
                  className="inline-flex items-center gap-1.5 font-mono text-[11px] font-semibold text-[#D9F66F] hover:underline"
                >
                  Open Batch Lineage in Investigation Workbench →
                </Link>
              </div>

              {/* Section 2: Status Transitions */}
              <div className="p-4 space-y-2.5">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                  SECTION 2: WORKFLOW TRANSITIONS
                </div>
                <div className="flex flex-wrap gap-2">
                  {["INVESTIGATING", "RESOLVED", "FALSE_POSITIVE"].map((st) => (
                    <button
                      key={st}
                      disabled={
                        transitionMut.isPending || detail.exception.status === st
                      }
                      onClick={() =>
                        transitionMut.mutate({
                          id: detail.exception.id,
                          new_status: st,
                        })
                      }
                      className={`rounded-[4px] border px-3 py-1.5 font-mono text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-40 ${
                        st === "RESOLVED"
                          ? "border-[#2E7D52] bg-[#162E21] text-[#8AE2A4] hover:bg-[#1E3D2C]"
                          : "border-[#372E40] bg-[#120B19] text-[#EBDEF2] hover:border-[#D9F66F]"
                      }`}
                    >
                      {st.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              {/* Section 3: Comments & Maker-Checker Waivers */}
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                    <MessageSquare className="h-3.5 w-3.5 text-[#D9F66F]" />
                    INVESTIGATION NOTES ({detail.comments.length})
                  </div>
                  {detail.comments.length > 0 && (
                    <div className="space-y-1.5 max-h-28 overflow-y-auto">
                      {detail.comments.map((c) => (
                        <div
                          key={c.id}
                          className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2 text-xs"
                        >
                          <div className="flex justify-between font-mono text-[10px] text-[#90937E]">
                            <span>
                              {c.author_id} [{c.author_role}]
                            </span>
                            <span>{new Date(c.created_at).toLocaleDateString()}</span>
                          </div>
                          <p className="mt-1 text-[#EBDEF2]">{c.body}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add forensic investigation note..."
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      className="flex-1 rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-1.5 text-xs text-[#EBDEF2] placeholder-[#90937E] focus:border-[#D9F66F] focus:outline-none"
                    />
                    <button
                      onClick={() => noteText.trim() && commentMut.mutate()}
                      disabled={!noteText.trim() || commentMut.isPending}
                      className="rounded-[4px] bg-[#D9F66F] px-3 py-1.5 font-mono text-[11px] font-semibold text-[#171E00] hover:bg-[#CEEA64] disabled:opacity-40 cursor-pointer"
                    >
                      Save
                    </button>
                  </div>
                </div>

                {/* Waiver Workflow */}
                <div className="border-t border-[#372E40] pt-3 space-y-2">
                  <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                    MAKER-CHECKER WAIVER ({detail.exception.is_waivable ? "WAIVABLE" : "NON-WAIVABLE"})
                  </div>

                  {detail.waivers.map((w) => (
                    <div
                      key={w.id}
                      className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-2.5 text-xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] text-[#B7A9C7]">
                          Requested by {w.requested_by}
                        </span>
                        <StatusBadge status={w.status} />
                      </div>
                      <p className="text-[#EBDEF2]">{w.justification}</p>
                      {w.status === "PENDING" && (
                        <div className="flex gap-2 pt-1">
                          <button
                            onClick={() =>
                              waiverReviewMut.mutate({ waiverId: w.id, decision: "APPROVED" })
                            }
                            className="flex-1 rounded-[4px] border border-[#2E7D52] bg-[#162E21] py-1 font-mono text-[10px] font-semibold text-[#8AE2A4] hover:bg-[#1E3D2C] cursor-pointer"
                          >
                            Approve (Controller)
                          </button>
                          <button
                            onClick={() =>
                              waiverReviewMut.mutate({ waiverId: w.id, decision: "REJECTED" })
                            }
                            className="flex-1 rounded-[4px] border border-[#DE785F] bg-[#331A1E] py-1 font-mono text-[10px] font-semibold text-[#FF9D85] cursor-pointer"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {detail.exception.is_waivable && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Waiver justification..."
                        value={waiverReason}
                        onChange={(e) => setWaiverReason(e.target.value)}
                        className="flex-1 rounded-[4px] border border-[#372E40] bg-[#120B19] px-3 py-1.5 text-xs text-[#EBDEF2] placeholder-[#90937E] focus:border-[#D9F66F] focus:outline-none"
                      />
                      <button
                        onClick={() => waiverReason.trim() && waiverReqMut.mutate()}
                        disabled={!waiverReason.trim() || waiverReqMut.isPending}
                        className="rounded-[4px] border border-[#372E40] bg-[#201927] px-3 py-1.5 font-mono text-[11px] font-semibold text-[#EBDEF2] hover:border-[#D9F66F] disabled:opacity-40 cursor-pointer"
                      >
                        Request Waiver
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center font-mono text-xs text-[#90937E]">
              Select an exception from the queue to inspect root cause, transition status, or
              request a Maker-Checker waiver.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
