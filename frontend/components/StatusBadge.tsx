import React from "react";
import { CheckCircle2, AlertTriangle, XOctagon, ShieldAlert, Clock } from "lucide-react";

const STYLES: Record<string, string> = {
  PASS: "bg-[#ECFDF3] text-[#168363] border-[#ABEFC6]",
  OFFICIAL: "bg-[#ECFDF3] text-[#168363] border-[#ABEFC6]",
  RESOLVED: "bg-[#ECFDF3] text-[#168363] border-[#ABEFC6]",
  APPROVED: "bg-[#ECFDF3] text-[#168363] border-[#ABEFC6]",
  CORRECTED_PASSED: "bg-[#ECFDF3] text-[#168363] border-[#ABEFC6]",
  PASS_WITH_WARNINGS: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
  WARN: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
  WARNING: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
  MEDIUM: "bg-[#FFFAEB] text-[#B54708] border-[#FEDF89]",
  INVESTIGATING: "bg-[#EFF4FF] text-[#3267D6] border-[#B2DDFF]",
  WAIVER_REQUESTED: "bg-[#EFF4FF] text-[#3267D6] border-[#B2DDFF]",
  DIAGNOSTIC: "bg-[#F2F4F7] text-[#344054] border-[#D0D5DD]",
  WAIVED: "bg-[#F2F4F7] text-[#344054] border-[#D0D5DD]",
  BLOCKED: "bg-[#FEF3F2] text-[#C74242] border-[#FECDCA]",
  BLOCKED_VERIFIED: "bg-[#FEF3F2] text-[#C74242] border-[#FECDCA]",
  FAIL: "bg-[#FEF3F2] text-[#C74242] border-[#FECDCA]",
  CRITICAL: "bg-[#FEF3F2] text-[#C74242] border-[#FECDCA]",
  HIGH: "bg-[#FEF3F2] text-[#C74242] border-[#FECDCA]",
  OPEN: "bg-[#FEF3F2] text-[#C74242] border-[#FECDCA]",
};

export function StatusBadge({ status, size = "sm" }: { status: string; size?: "sm" | "md" }) {
  const key = status.toUpperCase();
  const cls = STYLES[key] || "bg-[#F2F4F7] text-[#475467] border-[#E5E9F0]";
  const pad = size === "md" ? "px-3 py-1 text-xs font-semibold" : "px-2 py-0.5 text-[11px] font-medium";

  let Icon = Clock;
  if (["PASS", "OFFICIAL", "RESOLVED", "APPROVED", "CORRECTED_PASSED"].includes(key)) {
    Icon = CheckCircle2;
  } else if (["PASS_WITH_WARNINGS", "WARN", "WARNING", "MEDIUM"].includes(key)) {
    Icon = AlertTriangle;
  } else if (["BLOCKED", "BLOCKED_VERIFIED", "FAIL", "CRITICAL"].includes(key)) {
    Icon = XOctagon;
  } else if (["OPEN", "HIGH"].includes(key)) {
    Icon = ShieldAlert;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md border ${cls} ${pad} whitespace-nowrap`}>
      <Icon className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      {status.replace(/_/g, " ")}
    </span>
  );
}
