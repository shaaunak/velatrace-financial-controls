# VelaTrace — Business Requirements Document (BRD)

**Institution:** Northbridge Wealth — Demonstration Environment (Synthetic)  
**Product:** VelaTrace — Financial Reporting Assurance & Reconciliation Platform

---

## 1. Stakeholder Personas
1. **Reporting Analyst (`analyst_maya`)** — Executes daily/month-end ingestion, investigates exceptions, prepares remediation, and requests policy waivers where eligible.
2. **Financial Operations Manager / Controller (`controller_marcus`)** — Reviews reconciliation health, approves or rejects waiver requests (Maker-Checker), and grants final sign-off for Official Management Reports.
3. **Data Engineering Team** — Maintains source contracts (`custody_balances`, `ledger_transactions`, `trades`, `crm_accounts`, `market_prices`, `fx_rates`), schema drift controls, and idempotent ingestion.
4. **Risk & Control Reviewer / Internal Auditor (`auditor_elena`)** — Verifies control evidence, reviews immutable raw snapshots, and audits the hash-chained event log.
5. **Senior Management** — Consumes published Excel management reports knowing every figure is reconciled and traceable.

## 2. Current-State Problem vs. Future-State Workflow
- **Current-State Manual Problem:** Wealth reporting teams manually combine CSV/JSON exports from Custody, Internal Ledger, Trading, and CRM in spreadsheets. Duplicate wires, sign reversals, missing FX rates, or schema changes can silently overstate AUM or Net New Assets, with no enforced publication gate or audit lineage.
- **Future-State VelaTrace Workflow:** Automated, idempotent ingestion into PostgreSQL (`NUMERIC(20,4)`), 16 registered financial controls, deterministic `PASS / PASS_WITH_WARNINGS / BLOCKED` publication gating, Maker-Checker waiver governance, and reproducible 7-sheet Excel management reporting.

## 3. Functional & Non-Functional Requirements
- **FR-1:** Idempotent raw source ingestion preserving original payloads and SHA-256 hashes.
- **FR-2:** Exact `Decimal` / PostgreSQL `NUMERIC` roll-forward continuity separating external flows from internal reallocations and market movement.
- **FR-3:** Server-side publication gate rejecting `OFFICIAL` report issuance when any blocking control fails (`HTTP 409`).
- **FR-4:** Maker-Checker workflow prohibiting self-approval of waivers and blocking waivers on non-waivable critical rules.
- **FR-5:** Deterministic 7-sheet Excel export with formula-injection sanitization and canonical content fingerprinting.
- **NFR-1:** Full auditability via append-only SHA-256 hash-chained `audit_events`.
- **NFR-2:** Isolated Failure Lab sandbox (`ws_velatrace_sandbox`) so simulations never mutate production/demo reference data.
