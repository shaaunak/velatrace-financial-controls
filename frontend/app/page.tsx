import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  GitBranch,
  Lock,
  Play,
  ShieldCheck,
  Terminal,
  XOctagon,
} from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#F7F8FA] text-[#172033]">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-[#E5E9F0] bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#101828] text-white font-semibold text-sm tracking-tight">
              VT
            </div>
            <div>
              <span className="font-semibold text-[#101828] tracking-tight">VelaTrace</span>
              <span className="ml-2 hidden sm:inline-block text-xs text-[#667085] border-l border-[#E5E9F0] pl-2">
                Financial Reporting Assurance
              </span>
            </div>
          </div>
          <nav className="hidden md:flex items-center gap-7 text-sm text-[#667085]">
            <a href="#problem" className="hover:text-[#172033] transition-colors">Problem</a>
            <a href="#pipeline" className="hover:text-[#172033] transition-colors">How It Works</a>
            <a href="#capabilities" className="hover:text-[#172033] transition-colors">Capabilities</a>
            <a href="#architecture" className="hover:text-[#172033] transition-colors">Architecture</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/app/failure-lab?guided=1"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-[#E5E9F0] bg-white px-3.5 py-2 text-xs font-medium text-[#172033] hover:bg-[#F7F8FA] transition-colors"
            >
              <Play className="h-3.5 w-3.5 text-[#3267D6]" />
              Run Guided Investigation
            </Link>
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 rounded-md bg-[#101828] px-4 py-2 text-xs font-medium text-white hover:bg-[#1D2939] transition-colors"
            >
              Explore Live Demo
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="mx-auto max-w-7xl px-6 pt-16 pb-14">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#E5E9F0] bg-white px-3 py-1 text-xs font-medium text-[#667085] mb-6">
            <span className="h-2 w-2 rounded-full bg-[#168363]" />
            Northbridge Wealth — Synthetic Demonstration Environment
          </div>
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-[#101828] leading-[1.1]">
            Financial reporting, with proof built in.
          </h1>
          <p className="mt-5 text-lg text-[#667085] leading-relaxed max-w-2xl">
            Reconcile fragmented financial data, detect exceptions before publication, and trace
            every management figure back to its source.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3.5">
            <Link
              href="/app"
              className="inline-flex items-center gap-2 rounded-md bg-[#3267D6] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#2554B8] transition-colors"
            >
              Explore Live Demo
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#architecture"
              className="inline-flex items-center gap-2 rounded-md border border-[#E5E9F0] bg-white px-5 py-2.5 text-sm font-medium text-[#172033] hover:bg-[#F2F4F7] transition-colors"
            >
              View Architecture
            </a>
            <Link
              href="/app/failure-lab?guided=1"
              className="inline-flex items-center gap-2 rounded-md border border-[#D0D5DD] bg-white px-4 py-2.5 text-sm font-medium text-[#101828] hover:border-[#3267D6] transition-colors"
            >
              <Play className="h-4 w-4 text-[#3267D6]" />
              Run Guided Investigation
            </Link>
          </div>
        </div>

        {/* Institutional UI Preview Card */}
        <div className="mt-12 rounded-xl border border-[#E5E9F0] bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between border-b border-[#E5E9F0] bg-[#F9FAFB] px-5 py-3">
            <div className="flex items-center gap-3 text-xs text-[#667085]">
              <span className="font-mono font-medium text-[#101828]">VT-20261030-PRD</span>
              <span>•</span>
              <span>Reporting Date: 2026-10-30</span>
              <span>•</span>
              <span>Currency: USD</span>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-md border border-[#ABEFC6] bg-[#ECFDF3] px-2.5 py-0.5 text-[11px] font-semibold text-[#168363]">
              <CheckCircle2 className="h-3 w-3" />
              PUBLICATION GATE: ELIGIBLE
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 divide-y md:divide-y-0 md:divide-x divide-[#E5E9F0]">
            <div className="p-5">
              <div className="text-xs font-medium text-[#667085]">Assets Under Reporting</div>
              <div className="mt-1.5 text-2xl font-semibold text-[#101828] tabular-nums">$934,052,679.81</div>
              <div className="mt-1 text-xs text-[#168363]">600 accounts reconciled</div>
            </div>
            <div className="p-5">
              <div className="text-xs font-medium text-[#667085]">Ledger Transactions</div>
              <div className="mt-1.5 text-2xl font-semibold text-[#101828] tabular-nums">12,000</div>
              <div className="mt-1 text-xs text-[#667085]">24 wealth advisors</div>
            </div>
            <div className="p-5">
              <div className="text-xs font-medium text-[#667085]">Financial Variance</div>
              <div className="mt-1.5 text-2xl font-semibold text-[#168363] tabular-nums">$0.00</div>
              <div className="mt-1 text-xs text-[#667085]">Custody vs Calculated Mart</div>
            </div>
            <div className="p-5">
              <div className="text-xs font-medium text-[#667085]">Control Gate</div>
              <div className="mt-1.5 text-2xl font-semibold text-[#101828] tabular-nums">16 / 16</div>
              <div className="mt-1 text-xs text-[#667085]">Registered rules evaluated</div>
            </div>
          </div>
          <div className="border-t border-[#E5E9F0] bg-[#F9FAFB] px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#667085]">
            <span>
              Fundamental Question: <strong className="text-[#172033]">Can management safely trust these financial numbers?</strong>
            </span>
            <Link href="/app/failure-lab" className="font-medium text-[#3267D6] hover:underline">
              Test with Failure Lab ($125,000 Discrepancy) →
            </Link>
          </div>
        </div>
      </section>

      {/* The Problem */}
      <section id="problem" className="border-t border-[#E5E9F0] bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <div className="max-w-2xl">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#3267D6]">
              The Financial Reporting Problem
            </h2>
            <p className="mt-2 text-2xl font-semibold text-[#101828]">
              Manual spreadsheet reconciliation hides silent breaks until after reports are circulated.
            </p>
            <p className="mt-3 text-sm text-[#667085] leading-relaxed">
              Wealth management institutions aggregate daily feeds from custodians, internal ledgers,
              trading desks, CRM systems, and market data vendors. Without automated controls,
              a single duplicated wire, reversed sign, or missing FX rate can overstate AUM and Net New Assets.
            </p>
          </div>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-lg border border-[#E5E9F0] bg-[#F7F8FA] p-6">
              <div className="text-sm font-semibold text-[#101828]">Flow vs. Market Confusion</div>
              <p className="mt-2 text-sm text-[#667085]">
                Internal BUY/SELL reallocations must never be counted as external client inflows.
                VelaTrace enforces strict roll-forward accounting per account.
              </p>
            </div>
            <div className="rounded-lg border border-[#E5E9F0] bg-[#F7F8FA] p-6">
              <div className="text-sm font-medium text-[#101828]">Unchecked Publication</div>
              <p className="mt-2 text-sm text-[#667085]">
                Spreadsheet workflows cannot enforce a hard publication gate. VelaTrace blocks
                official report issuance server-side whenever a blocking control fails.
              </p>
            </div>
            <div className="rounded-lg border border-[#E5E9F0] bg-[#F7F8FA] p-6">
              <div className="text-sm font-semibold text-[#101828]">Broken Audit Lineage</div>
              <p className="mt-2 text-sm text-[#667085]">
                Overwriting raw files destroys evidence. VelaTrace preserves immutable raw snapshots
                and chains every decision in a SHA-256 audit log.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How VelaTrace Works */}
      <section id="pipeline" className="border-t border-[#E5E9F0] bg-[#F7F8FA] py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#3267D6]">
            How VelaTrace Works
          </h2>
          <p className="mt-2 text-2xl font-semibold text-[#101828]">
            Six deterministic stages from raw feed to signed-off management report
          </p>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              ["1. Raw Snapshot", "Immutable SHA-256 source storage & idempotency key"],
              ["2. Staging", "Canonical ID mapping & exact Decimal FX conversion"],
              ["3. Reporting Marts", "Account roll-forward & advisor AUM rollups in SQL"],
              ["4. Control Engine", "16 YAML-configured rules across 7 control families"],
              ["5. Publication Gate", "PASS, PASS WITH WARNINGS, or BLOCKED"],
              ["6. Excel & Audit", "7-sheet workbook & hash-chained audit evidence"],
            ].map(([title, desc]) => (
              <div key={title} className="rounded-lg border border-[#E5E9F0] bg-white p-4">
                <div className="text-sm font-semibold text-[#101828]">{title}</div>
                <p className="mt-1.5 text-xs text-[#667085] leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Six Core Capabilities */}
      <section id="capabilities" className="border-t border-[#E5E9F0] bg-white py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-[#3267D6]">
            Core Capabilities
          </h2>
          <p className="mt-2 text-2xl font-semibold text-[#101828]">
            Built for financial control, data engineering, and audit teams
          </p>
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: ShieldCheck,
                title: "16 Registered Financial Controls",
                desc: "Completeness, uniqueness, referential integrity, balance continuity, cross-system reconciliation, reasonableness, and schema drift.",
              },
              {
                icon: XOctagon,
                title: "Server-Side Publication Gate",
                desc: "Official reports are rejected with HTTP 409 when blocking controls fail. Diagnostic previews remain clearly separated.",
              },
              {
                icon: Terminal,
                title: "Signature Failure Lab",
                desc: "Inject 11 deterministic failure modes—including The $125,000 Discrepancy—in an isolated sandbox and verify full recovery.",
              },
              {
                icon: GitBranch,
                title: "End-to-End Variance Lineage",
                desc: "Compare Source → Staging → Reporting Mart → Published Report side-by-side and trace any figure to raw source rows.",
              },
              {
                icon: Lock,
                title: "Maker-Checker Governance",
                desc: "Role-based authorization (Analyst, Controller, Auditor) prevents self-approval of waivers and enforces non-waivable rules.",
              },
              {
                icon: FileSpreadsheet,
                title: "7-Sheet OpenPyXL Reporting",
                desc: "Reproducible Excel management workbooks with live formulas, conditional formatting, formula-injection protection, and content fingerprints.",
              },
            ].map((item) => (
              <div key={item.title} className="rounded-lg border border-[#E5E9F0] bg-[#F7F8FA] p-6">
                <item.icon className="h-5 w-5 text-[#3267D6]" />
                <h3 className="mt-3 text-base font-semibold text-[#101828]">{item.title}</h3>
                <p className="mt-2 text-sm text-[#667085] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Architecture & Trust */}
      <section id="architecture" className="border-t border-[#E5E9F0] bg-[#F7F8FA] py-16">
        <div className="mx-auto max-w-7xl px-6 grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[#3267D6]">
              Technical Architecture
            </h2>
            <p className="mt-2 text-2xl font-semibold text-[#101828]">
              PostgreSQL NUMERIC precision with FastAPI & Next.js
            </p>
            <ul className="mt-5 space-y-3 text-sm text-[#667085]">
              <li className="flex items-start gap-2.5">
                <Database className="h-4 w-4 text-[#3267D6] mt-0.5 shrink-0" />
                <span>
                  <strong className="text-[#172033]">PostgreSQL 18 + SQLAlchemy 2.x + Alembic:</strong>{" "}
                  All monetary amounts stored as <code className="text-xs bg-white px-1.5 py-0.5 rounded border border-[#E5E9F0]">NUMERIC(20,4)</code>.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <ShieldCheck className="h-4 w-4 text-[#3267D6] mt-0.5 shrink-0" />
                <span>
                  <strong className="text-[#172033]">FastAPI + Pydantic + OpenPyXL:</strong>{" "}
                  Registered YAML-configured control handlers and deterministic Excel report generation.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-[#3267D6] mt-0.5 shrink-0" />
                <span>
                  <strong className="text-[#172033]">Pytest + Hypothesis:</strong>{" "}
                  18 automated integration and property-based tests verifying every control and invariant.
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-xl border border-[#E5E9F0] bg-white p-6">
            <h3 className="text-base font-semibold text-[#101828]">Trust & Transparency</h3>
            <p className="mt-2 text-sm text-[#667085] leading-relaxed">
              Every figure in VelaTrace is calculated from synthetic records stored in PostgreSQL
              for the fictional <strong>Northbridge Wealth — Demonstration Environment</strong> (fixed seed{" "}
              <code className="text-xs bg-[#F7F8FA] px-1.5 py-0.5 rounded border border-[#E5E9F0]">20261112</code>).
              No real client data, external paid AI APIs, or invented performance claims are used.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/app"
                className="inline-flex items-center gap-2 rounded-md bg-[#101828] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#1D2939] transition-colors"
              >
                Open VelaTrace Workspace
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/app/failure-lab?guided=1"
                className="inline-flex items-center gap-2 rounded-md border border-[#E5E9F0] bg-white px-4 py-2.5 text-sm font-medium text-[#172033] hover:bg-[#F7F8FA] transition-colors"
              >
                Launch Guided Investigation
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[#E5E9F0] bg-white py-6">
        <div className="mx-auto max-w-7xl px-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-[#667085]">
          <span>VelaTrace — Every number. Verified. Every decision. Traceable.</span>
          <span>Northbridge Wealth Demonstration Environment (100% Synthetic Data)</span>
        </div>
      </footer>
    </div>
  );
}
