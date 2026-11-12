"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  FlaskConical,
  GitBranch,
  Lock,
  Play,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  XOctagon,
} from "lucide-react";
import { apiFetch, formatNumber, formatUsd } from "@/lib/api";
import { VelaTraceLogo } from "@/components/VelaTraceLogo";

interface LandingOverview {
  selected_batch: {
    batch_code: string;
    reporting_date: string;
    status: string;
    total_assets_usd: number;
    custody_total_usd: number;
    calculated_total_usd: number;
    financial_variance_usd: number;
    records_validated: number;
    reconciliation_coverage_pct: number;
  } | null;
}

const FAILURE_PREVIEWS = [
  {
    key: "duplicate_txn",
    chip: "DUP-01: Duplicate Wire Injection",
    ruleId: "CTL-UNIQ-001",
    variance: "+$125,000.00",
    headline: "Duplicate Settlement Event Identified on Wire TXN-20261030-000001",
    summary:
      "Ingestion engine detected a duplicate wire deposit in ledger_transactions.csv. Roll-forward balance continuity immediately failed and locked official publication.",
    rawJson: `{
  "txn_id": "TXN-20261030-000001",
  "account": "NB-ACC-0001",
  "txn_type": "DEPOSIT",
  "amount_usd": "125000.0000",
  "source": "LEDGER_CSV"
}`,
    diffJson: `{
  "batch": "SANDBOX-DUP-001",
  "duplicate_count": 2,
  "expected_closing": "1842500.0000",
  "custody_closing": "1717500.0000",
  "variance_usd": "+125000.0000",
  "gate_status": "BLOCKED"
}`,
  },
  {
    key: "sign_reversal",
    chip: "SIGN-02: Debit/Credit Inversion",
    ruleId: "CTL-BAL-001",
    variance: "-$84,500.00",
    headline: "Sign Inversion Detected in External Cash Flow Leg",
    summary:
      "A withdrawal event was ingested with inverted polarity. Balance roll-forward reconciliation caught the exact 2x delta before report generation.",
    rawJson: `{
  "txn_id": "TXN-20261030-000114",
  "account": "NB-ACC-0042",
  "txn_type": "WITHDRAWAL",
  "amount_usd": "-42250.0000",
  "source": "LEDGER_CSV"
}`,
    diffJson: `{
  "batch": "SANDBOX-SIGN-002",
  "rule_triggered": "CTL-BAL-001",
  "polarity_error": true,
  "variance_usd": "-84500.0000",
  "gate_status": "BLOCKED"
}`,
  },
  {
    key: "missing_fx",
    chip: "FX-03: Missing Treasury Rate",
    ruleId: "CTL-REF-002",
    variance: "+$31,240.00",
    headline: "Missing EUR/USD Spot Fixing for Custody Valuation",
    summary:
      "Upstream treasury feed omitted the daily spot rate for EUR positions. Referential integrity gate blocked fallback estimation.",
    rawJson: `{
  "pair": "EUR/USD",
  "rate_date": "2026-10-30",
  "spot_rate": null,
  "source": "TREASURY_FX"
}`,
    diffJson: `{
  "batch": "SANDBOX-FX-003",
  "rule_triggered": "CTL-REF-002",
  "unvalued_positions": 14,
  "gate_status": "BLOCKED"
}`,
  },
];

export default function EditorialLandingPage() {
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);
  const { data: overview } = useQuery<LandingOverview>({
    queryKey: ["landing-overview"],
    queryFn: () => apiFetch("/overview"),
    retry: 0,
  });

  const batch = overview?.selected_batch;
  const activePreview = FAILURE_PREVIEWS[activeScenarioIdx];

  return (
    <div className="min-h-screen bg-[#F5F1E9] text-[#19141E]">
      {/* Sticky Editorial Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-[#D5CCC0] bg-[#F5F1E9]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1360px] items-center justify-between px-4 sm:px-8 lg:px-12">
          <Link href="/" className="shrink-0">
            <VelaTraceLogo variant="light" subtitle="FINANCIAL ASSURANCE" />
          </Link>

          <nav className="hidden md:flex items-center gap-8 text-[13px] font-medium text-[#5A5263]">
            <a href="#systems" className="hover:text-[#19141E] transition-colors">
              Platform
            </a>
            <a href="#gate" className="hover:text-[#19141E] transition-colors">
              Publication Gate
            </a>
            <a href="#failure-lab" className="hover:text-[#19141E] transition-colors">
              Failure Lab
            </a>
            <a href="#architecture" className="hover:text-[#19141E] transition-colors">
              Architecture
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <Link
              href="/app/failure-lab"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-[4px] border border-[#D5CCC0] bg-[#ECE7DC] px-3.5 py-2 text-xs font-semibold text-[#19141E] hover:border-[#19141E] transition-colors"
            >
              <Play className="h-3.5 w-3.5" />
              Watch Simulation
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-[4px] border border-[#19141E] bg-[#D9F66F] px-4 py-2 text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64] transition-colors"
            >
              Explore Platform
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="border-b border-[#D5CCC0] bg-[#F5F1E9]">
        <div className="mx-auto max-w-[1360px] px-4 py-12 sm:px-8 sm:py-16 lg:px-12 lg:py-20">
          <div className="inline-flex items-center gap-2 rounded-[2px] border border-[#D5CCC0] bg-[#ECE7DC] px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5A5263]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#DE785F]" />
            NORTHBRIDGE WEALTH // DETERMINISTIC RECONCILIATION &amp; CONTROL GATING
          </div>

          <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
            {/* Left Copy */}
            <div className="lg:col-span-5 space-y-6">
              <h1 className="font-display text-4xl font-bold tracking-[-0.03em] text-[#19141E] sm:text-5xl lg:text-[52px] lg:leading-[1.05]">
                Numbers don&apos;t earn trust. They{" "}
                <span className="inline-block bg-[#D9F66F] px-2 py-0.5 text-[#171E00]">
                  prove it.
                </span>
              </h1>

              <p className="text-base leading-relaxed text-[#5A5263]">
                Reconcile fragmented financial data across Custody, Internal Ledgers,
                Trading Systems, and CRM Masters. Catch discrepancies before publication,
                and trace every reported balance back to its immutable cryptographic source.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/app"
                  className="inline-flex items-center gap-2 rounded-[4px] border border-[#19141E] bg-[#D9F66F] px-5 py-3 text-sm font-semibold text-[#171E00] hover:bg-[#CEEA64] transition-colors"
                >
                  Explore the Platform
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/app/failure-lab"
                  className="inline-flex items-center gap-2 rounded-[4px] border border-[#19141E] bg-white px-5 py-3 text-sm font-semibold text-[#19141E] hover:bg-[#ECE7DC] transition-colors"
                >
                  <FlaskConical className="h-4 w-4" />
                  Launch Failure Simulation
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 border-t border-[#D5CCC0] pt-6">
                <div className="min-w-0">
                  <div className="font-display text-xl font-bold tracking-tight text-[#19141E] tabular-nums">
                    {batch ? `$${(batch.total_assets_usd / 1_000_000).toFixed(2)}M` : "$934.05M"}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5263]">
                    ASSETS ASSURED
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="font-display text-xl font-bold tracking-tight text-[#19141E] tabular-nums">
                    {batch ? `${batch.reconciliation_coverage_pct.toFixed(2)}%` : "100.00%"}
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5263]">
                    CONTROL COVERAGE
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="font-display text-xl font-bold tracking-tight text-[#19141E] tabular-nums">
                    16 Rules
                  </div>
                  <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5263]">
                    7 CONTROL FAMILIES
                  </div>
                </div>
              </div>
            </div>

            {/* Right Dark Plum Terminal Preview */}
            <div className="lg:col-span-7">
              <div className="rounded-[6px] border border-[#372E40] bg-[#17111E] text-[#EBDEF2] overflow-hidden">
                {/* Terminal Header */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#372E40] bg-[#120B19] px-4 py-3 font-mono text-[11px]">
                  <div className="flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5 text-[#D9F66F]" />
                    <span className="font-semibold text-[#EBDEF2]">
                      {batch ? `BATCH ${batch.batch_code}` : "BATCH VT-20261030-PRD"} {"//"} CUSTODY RECONCILIATION
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-[2px] border border-[#2E7D52] bg-[#162E21] px-2 py-0.5 text-[10px] font-semibold text-[#8AE2A4]">
                      POSTGRES NUMERIC(20,4)
                    </span>
                  </div>
                </div>

                {/* Gate Strip */}
                <div className="flex items-center justify-between border-b border-[#372E40] bg-[#2F1B22] px-4 py-2 font-mono text-[11px] text-[#FF9D85]">
                  <span className="flex items-center gap-2 font-semibold">
                    <Lock className="h-3.5 w-3.5 text-[#DE785F]" />
                    FAILURE LAB INTERCEPT: $125,000.00 VARIANCE DETECTED
                  </span>
                  <span className="text-[10px] uppercase">PUBLICATION HALTED (HTTP 409)</span>
                </div>

                {/* 3 Metric Cells */}
                <div className="grid grid-cols-1 sm:grid-cols-3 border-b border-[#372E40] divide-y sm:divide-y-0 sm:divide-x divide-[#372E40]">
                  <div className="p-4 bg-[#241D2B]">
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                      GENERAL LEDGER (INTERNAL)
                    </div>
                    <div className="mt-1.5 font-display text-lg font-bold text-[#EBDEF2] tabular-nums">
                      {batch ? formatUsd(batch.calculated_total_usd) : "$934,052,679.81"}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#90937E]">
                      {batch ? `${formatNumber(batch.records_validated)} records validated` : "600 accounts • 12,000 txns"}
                    </div>
                  </div>
                  <div className="p-4 bg-[#241D2B]">
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                      CUSTODY STATEMENT (BNY)
                    </div>
                    <div className="mt-1.5 font-display text-lg font-bold text-[#EBDEF2] tabular-nums">
                      {batch ? formatUsd(batch.custody_total_usd) : "$934,052,679.81"}
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#90937E]">
                      SHA-256 Snapshot Verified
                    </div>
                  </div>
                  <div className="p-4 bg-[#2F1B22]">
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#FF9D85]">
                      SANDBOX DISCREPANCY DEMO
                    </div>
                    <div className="mt-1.5 font-display text-lg font-bold text-[#FF9D85] tabular-nums">
                      +$125,000.00
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-[#DE785F]">
                      Tolerance Exceeded ($0.00)
                    </div>
                  </div>
                </div>

                {/* Active Discrepancy Example */}
                <div className="p-4 space-y-3 bg-[#17111E]">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7]">
                    <span>ACTIVE CONTROL INTERCEPT (SIMULATION PREVIEW)</span>
                    <span className="text-[#D9F66F]">RULE ENGINE v1.0</span>
                  </div>

                  <div className="rounded-[4px] border border-[#DE785F] bg-[#241D2B] p-3.5 border-l-[3px] border-l-[#DE785F]">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded-[2px] border border-[#DE785F] bg-[#331A1E] px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#FF9D85]">
                            CTL-UNIQ-001
                          </span>
                          <span className="font-semibold text-sm text-[#EBDEF2]">
                            Duplicate Wire Deposit Blocked
                          </span>
                        </div>
                        <p className="mt-1 font-mono text-[11px] text-[#B7A9C7]">
                          Wire: TXN-20261030-000001 | Account: NB-ACC-0001 | Hash Collision
                        </p>
                      </div>
                      <Link
                        href="/app/failure-lab"
                        className="rounded-[4px] bg-[#D9F66F] px-2.5 py-1 font-mono text-[10px] font-semibold text-[#171E00] hover:bg-[#CEEA64]"
                      >
                        Run in Failure Lab →
                      </Link>
                    </div>
                  </div>

                  {/* Terminal Log */}
                  <div className="rounded-[4px] border border-[#372E40] bg-[#120B19] p-3 font-mono text-[11px] leading-relaxed text-[#B7A9C7]">
                    <div>
                      <span className="text-[#8AE2A4]">[INGEST]</span> Loaded 600 custody balances &amp; 12,000 ledger transactions.
                    </div>
                    <div>
                      <span className="text-[#FF9D85]">[CTL-BAL-001]</span> Roll-forward variance +$125,000.00 on NB-ACC-0001.
                    </div>
                    <div>
                      <span className="text-[#D9F66F]">[GATE_LOCK]</span> Official publication rejected (HTTP 409). Audit event chained.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Four Systems */}
      <section id="systems" className="border-b border-[#D5CCC0] bg-[#F5F1E9]">
        <div className="mx-auto max-w-[1360px] px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="max-w-2xl">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5A5263]">
              MULTI-SYSTEM RECONCILIATION ARCHITECTURE
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.02em] text-[#19141E] sm:text-4xl">
              One report. Four systems. A thousand ways to disagree.
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#5A5263]">
              Institutional reporting fails when siloed enterprise databases maintain localized
              versions of truth. VelaTrace enforces deterministic multi-source reconciliation before
              numbers enter official management reporting.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12 items-stretch">
            {/* Left 4 Source Feeds */}
            <div className="lg:col-span-4 space-y-3">
              {[
                {
                  name: "Custody & Clearing",
                  sub: "custody_balances.csv • 600 Accounts",
                  tag: "SHA-256",
                },
                {
                  name: "Internal Ledger",
                  sub: "ledger_transactions.csv • 12,000 Txns",
                  tag: "DECIMAL(20,4)",
                },
                {
                  name: "Trade Execution",
                  sub: "trades.csv • BUY/SELL Reallocations",
                  tag: "INTERNAL FLOW",
                },
                {
                  name: "CRM & Market Pricing",
                  sub: "crm_accounts.csv • fx_rates.json",
                  tag: "SPOT FX",
                },
              ].map((src) => (
                <div
                  key={src.name}
                  className="flex items-center justify-between rounded-[4px] border border-[#D5CCC0] bg-white p-4"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-[#D5CCC0] bg-[#ECE7DC]">
                      <Database className="h-4 w-4 text-[#19141E]" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-display text-sm font-semibold text-[#19141E]">
                        {src.name}
                      </div>
                      <div className="truncate font-mono text-[11px] text-[#5A5263]">
                        {src.sub}
                      </div>
                    </div>
                  </div>
                  <span className="rounded-[2px] border border-[#D5CCC0] bg-[#F5F1E9] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#5A5263]">
                    {src.tag}
                  </span>
                </div>
              ))}
            </div>

            {/* Center Convergence Node */}
            <div className="lg:col-span-4 flex flex-col justify-between rounded-[6px] border border-[#372E40] bg-[#17111E] p-6 text-[#EBDEF2]">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#D9F66F]">
                  CENTRAL ENGINE
                </span>
                <span className="rounded-[2px] border border-[#2E7D52] bg-[#162E21] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#8AE2A4]">
                  DETERMINISTIC
                </span>
              </div>

              <div className="my-6 text-center space-y-3">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[4px] border border-[#D9F66F] bg-[#241D2B]">
                  <GitBranch className="h-6 w-6 text-[#D9F66F]" />
                </div>
                <h3 className="font-display text-xl font-bold text-[#EBDEF2]">
                  VelaTrace Convergence Node
                </h3>
                <p className="text-xs leading-relaxed text-[#B7A9C7]">
                  Normalizes canonical account keys, separates internal reallocations from external
                  cash flows, and verifies exact roll-forward continuity across every account.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 border-t border-[#372E40] pt-4 font-mono">
                <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-2.5">
                  <div className="text-[9px] uppercase text-[#B7A9C7]">ARITHMETIC</div>
                  <div className="mt-0.5 text-sm font-semibold text-[#D9F66F]">Python Decimal</div>
                </div>
                <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-2.5">
                  <div className="text-[9px] uppercase text-[#B7A9C7]">DB PRECISION</div>
                  <div className="mt-0.5 text-sm font-semibold text-[#EBDEF2]">NUMERIC(20,4)</div>
                </div>
              </div>
            </div>

            {/* Right Roll-Forward Continuity Proof */}
            <div className="lg:col-span-4 flex flex-col justify-between rounded-[4px] border border-[#D5CCC0] bg-white p-6">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5A5263]">
                    CONTINUITY IDENTITY
                  </span>
                  <span className="rounded-[2px] border border-[#DE785F] bg-[#FCE8E4] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-[#A24A34]">
                    HARD GATE
                  </span>
                </div>
                <h3 className="mt-2 font-display text-lg font-bold text-[#19141E]">
                  Account Roll-Forward Proof
                </h3>
                <div className="mt-4 space-y-2 border-y border-[#D5CCC0] py-3 font-mono text-xs">
                  <div className="flex justify-between">
                    <span className="text-[#5A5263]">Opening Balance</span>
                    <span className="font-semibold text-[#19141E]">+ Opening</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5A5263]">External Deposits / Withdrawals</span>
                    <span className="font-semibold text-[#19141E]">+ Net Flows</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#5A5263]">Market Movement &amp; Fees</span>
                    <span className="font-semibold text-[#19141E]">+ MTM − Fees</span>
                  </div>
                  <div className="flex justify-between border-t border-dashed border-[#D5CCC0] pt-2">
                    <span className="font-semibold text-[#19141E]">Internal BUY / SELL</span>
                    <span className="text-[#5A5263]">Excluded (NNA Neutral)</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-[4px] border border-[#DE785F]/40 bg-[#FCE8E4] p-3 text-xs text-[#7C2D1A]">
                <strong>Zero-Trust Gate:</strong> Any variance exceeding control tolerance trips{" "}
                <code className="font-mono font-semibold">CTL-BAL-001</code> and blocks official
                publication.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Publication Gate Pipeline */}
      <section id="gate" className="border-b border-[#D5CCC0] bg-[#ECE7DC]">
        <div className="mx-auto max-w-[1360px] px-4 py-14 sm:px-8 lg:px-12 lg:py-20">
          <div className="text-center max-w-2xl mx-auto">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5A5263]">
              AUTOMATED CONTROL PIPELINE
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.02em] text-[#19141E] sm:text-4xl">
              Nothing gets published on assumption.
            </h2>
            <p className="mt-2 text-sm text-[#5A5263]">
              A rigid five-stage pipeline separating raw upstream telemetry from official
              management reporting.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {[
              {
                step: "STEP 01",
                title: "Raw Ingestion",
                desc: "Immutable CSV/JSON snapshots hashed with SHA-256 and idempotency keys.",
                active: false,
              },
              {
                step: "STEP 02",
                title: "Schema & Precision",
                desc: "Strict column validation, Decimal FX conversion, and canonical ID mapping.",
                active: false,
              },
              {
                step: "STEP 03",
                title: "16 Control Rules",
                desc: "Completeness, uniqueness, referential integrity, and roll-forward checks.",
                active: false,
              },
              {
                step: "STEP 04",
                title: "The Publication Gate",
                desc: "Deterministic circuit breaker. Official release withheld on any blocker.",
                active: true,
              },
              {
                step: "STEP 05",
                title: "7-Sheet Workbook",
                desc: "Reproducible OpenPyXL report with SHA-256 content fingerprint.",
                active: false,
              },
            ].map((s) => (
              <div
                key={s.step}
                className={`rounded-[4px] border p-4 flex flex-col justify-between ${
                  s.active
                    ? "border-[#19141E] bg-[#17111E] text-[#EBDEF2]"
                    : "border-[#D5CCC0] bg-white text-[#19141E]"
                }`}
              >
                <div>
                  <div
                    className={`font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${
                      s.active ? "text-[#D9F66F]" : "text-[#5A5263]"
                    }`}
                  >
                    {s.step}
                  </div>
                  <h3 className="mt-2 font-display text-base font-bold">{s.title}</h3>
                  <p
                    className={`mt-1.5 text-xs leading-relaxed ${
                      s.active ? "text-[#B7A9C7]" : "text-[#5A5263]"
                    }`}
                  >
                    {s.desc}
                  </p>
                </div>
                {s.active && (
                  <div className="mt-4 inline-flex items-center gap-1.5 rounded-[2px] bg-[#D9F66F] px-2 py-1 font-mono text-[10px] font-semibold text-[#171E00] w-fit">
                    <Lock className="h-3 w-3" />
                    ENFORCED SERVER-SIDE
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Three Publication Gate States */}
          <div className="mt-8 rounded-[4px] border border-[#D5CCC0] bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#D5CCC0] pb-4">
              <div>
                <h3 className="font-display text-base font-bold text-[#19141E]">
                  The Three Publication Gate States
                </h3>
                <p className="text-xs text-[#5A5263]">
                  Deterministic criteria governing official management report release.
                </p>
              </div>
              <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5263]">
                POLICY: HTTP 409 ENFORCEMENT
              </span>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="rounded-[4px] border border-[#2E7D52]/40 bg-[#F2FBF6] p-4">
                <span className="inline-block rounded-[2px] border border-[#2E7D52] bg-[#162E21] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#8AE2A4]">
                  PASS
                </span>
                <h4 className="mt-2 font-display text-sm font-bold text-[#19141E]">
                  Official Release Approved
                </h4>
                <p className="mt-1 text-xs text-[#5A5263]">
                  Zero open blocking exceptions. All 16 controls pass. Official Excel workbook is
                  signed and fingerprinted.
                </p>
              </div>

              <div className="rounded-[4px] border border-[#C27803]/40 bg-[#FFF9ED] p-4">
                <span className="inline-block rounded-[2px] border border-[#C27803] bg-[#2E2415] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#FFCE73]">
                  PASS WITH WARNINGS
                </span>
                <h4 className="mt-2 font-display text-sm font-bold text-[#19141E]">
                  Conditional Controller Sign-Off
                </h4>
                <p className="mt-1 text-xs text-[#5A5263]">
                  Non-blocking warnings or approved maker-checker waivers documented. Full
                  disclosure included in Excel Exception Log.
                </p>
              </div>

              <div className="rounded-[4px] border border-[#DE785F] bg-[#FCE8E4] p-4">
                <span className="inline-block rounded-[2px] border border-[#DE785F] bg-[#331A1E] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#FF9D85]">
                  BLOCKED
                </span>
                <h4 className="mt-2 font-display text-sm font-bold text-[#19141E]">
                  Publication Gate Locked
                </h4>
                <p className="mt-1 text-xs text-[#7C2D1A]">
                  Material variance or blocking control failure detected. Official report API
                  returns HTTP 409 Conflict and logs an audit event.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Dark Interactive Failure Lab Showcase */}
      <section id="failure-lab" className="border-b border-[#372E40] bg-[#17111E] text-[#EBDEF2]">
        <div className="mx-auto max-w-[1360px] px-4 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#FF9D85]">
                <FlaskConical className="h-3.5 w-3.5 text-[#D9F66F]" />
                LIVE STRESS SIMULATION // FAILURE LABORATORY
              </div>
              <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.02em] text-[#EBDEF2] sm:text-4xl">
                Break the data.{" "}
                <span className="text-[#D9F66F]">Watch the controls hold.</span>
              </h2>
              <p className="mt-2 text-sm text-[#B7A9C7]">
                Inject corrupted ledger entries, sign reversals, or missing FX rates inside an
                isolated synthetic sandbox before they contaminate official management reporting.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {FAILURE_PREVIEWS.map((sc, idx) => (
                <button
                  key={sc.key}
                  onClick={() => setActiveScenarioIdx(idx)}
                  className={`rounded-[4px] border px-3 py-1.5 font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                    activeScenarioIdx === idx
                      ? "border-[#D9F66F] bg-[#D9F66F] text-[#171E00]"
                      : "border-[#372E40] bg-[#241D2B] text-[#B7A9C7] hover:border-[#B7A9C7]"
                  }`}
                >
                  {sc.chip}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Variance Intercept Card */}
            <div className="lg:col-span-5 space-y-4">
              <div className="rounded-[4px] border border-[#DE785F] bg-[#2F1B22] p-6">
                <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#FF9D85]">
                  DETECTED FINANCIAL VARIANCE INTERCEPTED
                </div>
                <div className="mt-2 font-display text-4xl font-bold text-[#EBDEF2] tabular-nums">
                  {activePreview.variance}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-[#FF9D85]/90">
                  Variance threshold set at $0.00 for cash continuity. Publication gate automatically
                  interlocks official report generation.
                </p>
              </div>

              <div className="rounded-[4px] border border-[#372E40] bg-[#241D2B] p-6 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="rounded-[2px] border border-[#DE785F] bg-[#331A1E] px-2 py-0.5 font-mono text-[10px] font-semibold text-[#FF9D85]">
                    {activePreview.ruleId}
                  </span>
                  <span className="font-mono text-[10px] text-[#90937E]">SANDBOX ISOLATED</span>
                </div>
                <h3 className="font-display text-base font-bold text-[#EBDEF2]">
                  {activePreview.headline}
                </h3>
                <p className="text-xs leading-relaxed text-[#B7A9C7]">{activePreview.summary}</p>
                <div className="flex items-center justify-between border-t border-[#372E40] pt-3 font-mono text-[11px]">
                  <span className="text-[#90937E]">Gate Action:</span>
                  <span className="font-semibold text-[#FF9D85]">HALT REPORT DISSEMINATION</span>
                </div>
              </div>
            </div>

            {/* Right Deterministic Diff Inspector */}
            <div className="lg:col-span-7 rounded-[4px] border border-[#372E40] bg-[#241D2B] overflow-hidden flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between border-b border-[#372E40] bg-[#120B19] px-4 py-3 font-mono text-[11px]">
                  <span className="font-semibold text-[#D9F66F]">
                    DETERMINISTIC ROOT-CAUSE INSPECTOR
                  </span>
                  <span className="text-[#B7A9C7]">RAW vs CORRUPTED SNAPSHOT</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[#372E40]">
                  <div className="p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#B7A9C7] mb-2">
                      1. INGESTED SOURCE RECORD
                    </div>
                    <pre className="overflow-x-auto rounded-[4px] border border-[#372E40] bg-[#120B19] p-3 font-mono text-[11px] text-[#EBDEF2]">
                      {activePreview.rawJson}
                    </pre>
                  </div>
                  <div className="p-4">
                    <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#FF9D85] mb-2">
                      2. CONTROL ENGINE EVALUATION
                    </div>
                    <pre className="overflow-x-auto rounded-[4px] border border-[#DE785F]/50 bg-[#120B19] p-3 font-mono text-[11px] text-[#FFCE73]">
                      {activePreview.diffJson}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#372E40] bg-[#201927] px-4 py-3.5">
                <span className="flex items-center gap-2 text-xs text-[#B7A9C7]">
                  <CheckCircle2 className="h-4 w-4 text-[#8AE2A4]" />
                  Recoverable in-app: Correct snapshot → Rerun → Publish Official Report
                </span>
                <Link
                  href="/app/failure-lab"
                  className="inline-flex items-center gap-1.5 rounded-[4px] bg-[#D9F66F] px-4 py-2 text-xs font-semibold text-[#171E00] hover:bg-[#CEEA64]"
                >
                  Run Live in Failure Lab
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 5: Architecture & Capabilities */}
      <section id="architecture" className="border-b border-[#D5CCC0] bg-[#F5F1E9]">
        <div className="mx-auto max-w-[1360px] px-4 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="max-w-2xl">
            <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#5A5263]">
              ARCHITECTURE &amp; GOVERNANCE
            </div>
            <h2 className="mt-2 font-display text-3xl font-bold tracking-[-0.02em] text-[#19141E] sm:text-4xl">
              Engineered for forensic accounting and continuous institutional assurance.
            </h2>
          </div>

          <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="md:col-span-2 rounded-[4px] border border-[#D5CCC0] bg-white p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5263]">
                01 // AUTOMATION
              </div>
              <h3 className="mt-2 font-display text-xl font-bold text-[#19141E]">
                Automated Cross-Source Reconciliation
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-[#5A5263]">
                Reconcile Custody balances, internal ledger transactions, trade executions, CRM
                account masters, and FX spot rates in one deterministic PostgreSQL pipeline using
                exact <code className="font-mono text-xs">NUMERIC(20,4)</code> precision.
              </p>
            </div>

            <div className="rounded-[4px] border border-[#372E40] bg-[#17111E] p-6 text-[#EBDEF2]">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#D9F66F]">
                02 // CONTROLS
              </div>
              <h3 className="mt-2 font-display text-xl font-bold">16 YAML-Configured Rules</h3>
              <p className="mt-2 text-xs leading-relaxed text-[#B7A9C7]">
                7 control families spanning Completeness, Uniqueness, Referential Integrity,
                Balance Continuity, Cross-System Recon, Reasonableness, and Structural Checks.
              </p>
            </div>

            <div className="rounded-[4px] border border-[#D5CCC0] bg-white p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5263]">
                03 // TRIAGE &amp; RBAC
              </div>
              <h3 className="mt-2 font-display text-base font-bold text-[#19141E]">
                Maker-Checker Exception Desk
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#5A5263]">
                Server-side role enforcement across Analyst, Controller, and Auditor personas with
                waiver approvals and immutable comments.
              </p>
            </div>

            <div className="rounded-[4px] border border-[#D5CCC0] bg-white p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5263]">
                04 // FORENSICS
              </div>
              <h3 className="mt-2 font-display text-base font-bold text-[#19141E]">
                Deterministic Investigation Workbench
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#5A5263]">
                Drill down from batch-level variance to individual discrepant accounts, raw CSV
                line numbers, SHA-256 hashes, and cash-flow classifications.
              </p>
            </div>

            <div className="rounded-[4px] border border-[#D5CCC0] bg-white p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#5A5263]">
                05 // REPORTING
              </div>
              <h3 className="mt-2 font-display text-base font-bold text-[#19141E]">
                7-Sheet OpenPyXL Workbooks
              </h3>
              <p className="mt-1.5 text-xs leading-relaxed text-[#5A5263]">
                Export management-ready Excel packages with live formulas, formula-injection
                sanitization, and SHA-256 content fingerprints.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom Dark CTA */}
      <section className="bg-[#120B19] text-[#EBDEF2]">
        <div className="mx-auto max-w-[1360px] px-4 py-16 text-center sm:px-8 lg:px-12 lg:py-20">
          <div className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#D9F66F]">
            INSTITUTIONAL ASSURANCE PLATFORM
          </div>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-[-0.02em] sm:text-4xl">
            Confidence is a control, not a feeling.
          </h2>
          <p className="mt-3 mx-auto max-w-xl text-sm text-[#B7A9C7]">
            Explore the seeded Northbridge Wealth demonstration environment or trigger the $125,000
            Failure Lab walkthrough end-to-end.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-[4px] bg-[#D9F66F] px-6 py-3 text-sm font-semibold text-[#171E00] hover:bg-[#CEEA64]"
            >
              Open VelaTrace Console
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/app/reports"
              className="inline-flex items-center gap-2 rounded-[4px] border border-[#372E40] bg-[#241D2B] px-6 py-3 text-sm font-semibold text-[#EBDEF2] hover:border-[#B7A9C7]"
            >
              <FileSpreadsheet className="h-4 w-4 text-[#D9F66F]" />
              Inspect Reports &amp; Exports
            </Link>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-6 font-mono text-[11px] text-[#90937E]">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-[#8AE2A4]" />
              HASH-CHAINED AUDIT LOG
            </span>
            <span className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-[#D9F66F]" />
              16 ACTIVE CONTROL RULES
            </span>
            <span className="flex items-center gap-1.5">
              <XOctagon className="h-3.5 w-3.5 text-[#DE785F]" />
              HTTP 409 PUBLICATION GATE
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
