# VelaTrace — Financial Reporting Assurance & Reconciliation Platform

**Every number. Verified. Every decision. Traceable.**

VelaTrace is a financial reporting assurance, reconciliation, and control-gating platform designed for wealth management operations and financial control teams.

> **Synthetic Data Notice:** All institution names, advisors, clients, accounts, balances, and transactions in this project belong to the fictional **Northbridge Wealth — Demonstration Environment** generated deterministically with fixed seed `20261112`. No real client data exists anywhere in this repository.

---

## 1. The Financial Reporting Problem

Wealth management reporting teams aggregate daily data across disconnected systems: custody feeds, internal accounting ledgers, trade execution systems, CRM account masters, market prices, and treasury FX rates. Manual spreadsheet reconciliation introduces silent risks:
- Duplicated wire deposits or withdrawals inflating Assets Under Reporting or Net New Assets.
- Confusion between internal portfolio reallocations (`BUY`/`SELL`) and external client cash flows (`DEPOSIT`/`WITHDRAWAL`).
- Undetected sign reversals, missing FX rates, or upstream schema drift.
- Reports circulated before exceptions are resolved, with no immutable source trail.

## 2. Product Overview

VelaTrace answers one fundamental question: **Can management safely trust these financial numbers, and can we demonstrate exactly why?**

- **Three-State Publication Gate:** `PASS`, `PASS_WITH_WARNINGS`, or `BLOCKED`—computed deterministically by the backend. `BLOCKED` runs cannot issue an `OFFICIAL` report (`HTTP 409`).
- **16 Registered Financial Controls:** Configured in validated YAML ([rules.yaml](file:///Users/shaaunak/Downloads/reconIQ/backend/app/controls/rules.yaml)) and executed via registered Python/SQL handlers.
- **Exact Monetary Precision:** PostgreSQL `NUMERIC(20,4)` and `NUMERIC(18,8)` with Python `Decimal` arithmetic.
- **Maker-Checker Governance:** Role-based access control (`ANALYST`, `CONTROLLER`, `AUDITOR`) enforced server-side in FastAPI.
- **Reproducible 7-Sheet Excel Workbooks:** OpenPyXL management reports with live formulas, conditional formatting, formula-injection sanitization, and canonical SHA-256 content fingerprints.

## 3. Signature Feature: Failure Lab ("The $125,000 Discrepancy")

The Failure Lab ([failure-lab/page.tsx](file:///Users/shaaunak/Downloads/reconIQ/frontend/app/app/failure-lab/page.tsx)) runs 11 reproducible failure scenarios inside an isolated synthetic sandbox (`ws_velatrace_sandbox`):
1. **Healthy Baseline:** Clean batch passes all controls.
2. **Inject Duplicate Transaction:** Duplicates wire `TXN-20261030-000001` (`$125,000.00`) in `ledger_transactions.csv`.
3. **Control Detection:** `CTL-UNIQ-001` and `CTL-BAL-001` fail; batch transitions to `BLOCKED`.
4. **Publication Gate Proof:** Attempting official publication returns `HTTP 409 Conflict` and writes a `PUBLICATION_BLOCKED` audit event.
5. **Investigate & Recover:** Traces discrepancy to `NB-ACC-0001`, creates a corrected input version while preserving prior raw snapshots, revalidates to `PASS`, publishes a new `OFFICIAL` version, and exports the 7-sheet Excel workbook.

## 4. Architecture Overview

```text
Source Systems (CSV/JSON)
  -> Immutable Raw Layer (raw_source_files, raw_records, SHA-256, idempotency_key)
  -> Staging Normalization (canonical IDs, Decimal FX conversion, schema checks)
  -> Reporting Marts (mart_account_balances, mart_advisor_summary)
  -> Financial Control Engine (16 rules across 7 control families)
  -> Publication Gate (PASS / PASS_WITH_WARNINGS / BLOCKED)
  -> OpenPyXL Management Reports & Hash-Chained Audit Trail
```

## 5. Data Model Overview

- **Canonical Reference:** `workspaces`, `advisors` (24), `clients` (250), `accounts` (600) — structured for future integration with `WealthPulse` and `Advisor360`.
- **Raw & Staging:** `raw_source_files`, `raw_records`, `stg_custody_balances`, `stg_ledger_transactions` (~12,000 rows), `stg_trades`, `stg_crm_accounts`, `stg_market_prices`, `stg_fx_rates`.
- **Controls & Governance:** `control_rules`, `control_execution_results`, `exceptions`, `exception_comments`, `waiver_requests`, `published_reports`, `audit_events`, `failure_lab_runs`.

## 6. Financial Reconciliation Approach

Every account is validated against the roll-forward continuity identity:
$$\text{Expected Closing} = \text{Opening} + \text{External Inflows} - \text{External Outflows} + \text{Market Movement} - \text{Fees}$$
Internal `BUY` and `SELL` trades are classified as `INTERNAL_REALLOCATION` so they never distort Net New Assets.

## 7. Control Rule Catalogue

16 active rules across **Completeness**, **Uniqueness**, **Referential Integrity**, **Balance Continuity**, **Cross-System Reconciliation**, **Reasonableness**, and **Structural Controls**. See [CONTROL_CATALOGUE.md](file:///Users/shaaunak/Downloads/reconIQ/docs/CONTROL_CATALOGUE.md).

## 8. Technology Stack

- **Backend:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy 2.x, Alembic, psycopg, OpenPyXL, PyYAML, Pytest, Hypothesis.
- **Database:** PostgreSQL 18 (`NUMERIC(20,4)` precision, JSONB, indexed drilldowns).
- **Frontend:** Next.js App Router, TypeScript (strict), Tailwind CSS, TanStack Query, Recharts, Lucide Icons.

## 9. Local Setup

```bash
# 1. Configure environment
cp .env.example .env

# 2. Install backend dependencies & run migrations
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt
cd backend && .venv/bin/alembic upgrade head && cd ..

# 3. Seed Northbridge Wealth synthetic dataset
backend/.venv/bin/python scripts/seed_demo.py

# 4. Start FastAPI backend
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000

# 5. Start Next.js frontend
cd frontend && npm install && npm run dev
```

## 10. Testing Instructions

```bash
# Backend integration, all 11 Failure Lab scenarios, RBAC, Excel & Hypothesis tests
backend/.venv/bin/pytest backend/tests/test_velatrace_e2e.py -v

# Frontend TypeScript, ESLint, and production build
cd frontend && npx tsc --noEmit && npm run lint && npm run build
```

## 11. SQL Engineering Highlights

10 documented PostgreSQL queries (CTEs, conditional aggregation, window functions, anti-joins, `FULL OUTER JOIN`, SLA ageing) are available in [velatrace_queries.sql](file:///Users/shaaunak/Downloads/reconIQ/sql/velatrace_queries.sql) and explained in [SQL_WALKTHROUGH.md](file:///Users/shaaunak/Downloads/reconIQ/docs/SQL_WALKTHROUGH.md).

## 12. Business Analysis Deliverables

- [BUSINESS_REQUIREMENTS.md](file:///Users/shaaunak/Downloads/reconIQ/docs/BUSINESS_REQUIREMENTS.md)
- [USER_STORIES.md](file:///Users/shaaunak/Downloads/reconIQ/docs/USER_STORIES.md)
- [ACCEPTANCE_CRITERIA.md](file:///Users/shaaunak/Downloads/reconIQ/docs/ACCEPTANCE_CRITERIA.md)
- [DATA_DICTIONARY.md](file:///Users/shaaunak/Downloads/reconIQ/docs/DATA_DICTIONARY.md)
- [CONTROL_CATALOGUE.md](file:///Users/shaaunak/Downloads/reconIQ/docs/CONTROL_CATALOGUE.md)
- [REPORTING_POLICY.md](file:///Users/shaaunak/Downloads/reconIQ/docs/REPORTING_POLICY.md)
- [RUNBOOK.md](file:///Users/shaaunak/Downloads/reconIQ/docs/RUNBOOK.md)
- [INTERVIEW_DEMO.md](file:///Users/shaaunak/Downloads/reconIQ/docs/INTERVIEW_DEMO.md)

## 13. Limitations & Future Improvements

- The database hash chain provides tamper detection within the application database; external WORM/object-lock archival would be required for regulatory immutability.
- Demo mode uses explicit actor headers (`X-Actor-Id`, `X-Actor-Role`) rather than enterprise SSO/OIDC.
- Future integration contracts are prepared for `WealthPulse` and `Advisor360`.
