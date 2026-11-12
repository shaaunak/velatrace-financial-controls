import React from "react";

const STATUS_STYLES: Record<string, string> = {
  // Verified / Positive
  PASS: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",
  PASSED: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",
  OFFICIAL: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",
  RESOLVED: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",
  APPROVED: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",
  CORRECTED: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",
  BALANCED: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",
  ACTIVE: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",
  MATCH: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",
  VERIFIED: "bg-[#162E21] text-[#8AE2A4] border-[#2E7D52]",

  // Warning / Pending / High
  PASS_WITH_WARNINGS: "bg-[#2E2415] text-[#FFCE73] border-[#C27803]",
  WARNING: "bg-[#2E2415] text-[#FFCE73] border-[#C27803]",
  WARN: "bg-[#2E2415] text-[#FFCE73] border-[#C27803]",
  HIGH: "bg-[#2E2415] text-[#FFCE73] border-[#C27803]",
  INVESTIGATING: "bg-[#2E2415] text-[#FFCE73] border-[#C27803]",
  WAIVER_REQUESTED: "bg-[#2E2415] text-[#FFCE73] border-[#C27803]",
  PENDING: "bg-[#2E2415] text-[#FFCE73] border-[#C27803]",
  DIAGNOSTIC: "bg-[#2E2415] text-[#FFCE73] border-[#C27803]",

  // Blocked / Critical / Variance
  BLOCKED: "bg-[#331A1E] text-[#FF9D85] border-[#DE785F]",
  FAIL: "bg-[#331A1E] text-[#FF9D85] border-[#DE785F]",
  FAILED: "bg-[#331A1E] text-[#FF9D85] border-[#DE785F]",
  CRITICAL: "bg-[#331A1E] text-[#FF9D85] border-[#DE785F]",
  REJECTED: "bg-[#331A1E] text-[#FF9D85] border-[#DE785F]",
  OPEN: "bg-[#331A1E] text-[#FF9D85] border-[#DE785F]",
  COLLISION: "bg-[#331A1E] text-[#FF9D85] border-[#DE785F]",
  HARD_BLOCK: "bg-[#331A1E] text-[#FF9D85] border-[#DE785F]",

  // Citron / Focal
  STAGED: "bg-[#22290A] text-[#D9F66F] border-[#D9F66F]/50",
  READY: "bg-[#22290A] text-[#D9F66F] border-[#D9F66F]/50",
  LIVE: "bg-[#22290A] text-[#D9F66F] border-[#D9F66F]/50",

  // Neutral
  WAIVED: "bg-[#201927] text-[#B7A9C7] border-[#372E40]",
  FALSE_POSITIVE: "bg-[#201927] text-[#B7A9C7] border-[#372E40]",
  MEDIUM: "bg-[#201927] text-[#B7A9C7] border-[#372E40]",
  LOW: "bg-[#201927] text-[#90937E] border-[#372E40]",
  INFO: "bg-[#201927] text-[#B7A9C7] border-[#372E40]",
  INACTIVE: "bg-[#201927] text-[#90937E] border-[#372E40]",
};

export function StatusBadge({
  status,
  label,
}: {
  status: string;
  label?: string;
}) {
  const norm = status.toUpperCase().replace(/\s+/g, "_");
  const cls =
    STATUS_STYLES[norm] ||
    "bg-[#201927] text-[#B7A9C7] border-[#372E40]";

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-[2px] border px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap ${cls}`}
    >
      {label ?? status.replace(/_/g, " ")}
    </span>
  );
}
