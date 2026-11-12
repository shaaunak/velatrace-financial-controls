# VelaTrace — System Architecture

**Product:** VelaTrace — Financial Reporting Assurance & Reconciliation Platform  
**Tagline:** Every number. Verified. Every decision. Traceable.  
**Demo Institution:** Northbridge Wealth — Demonstration Environment (100% Synthetic Data)

---

## 1. End-to-End Pipeline Architecture

```text
Source Systems (CSV / JSON)
  ├── custody_balances.csv
  ├── ledger_transactions.csv
  ├── trades.json
  ├── crm_accounts.csv
  ├── market_prices.csv
  └── fx_rates.csv
        │
        ▼
[1. Immutable Raw Layer]
  • raw_source_files (SHA-256 source_hash, idempotency_key, declared_control_total)
  • raw_records (JSONB row-level snapshot + record_hash)
        │
        ▼
[2. Staging & Normalization Layer]
  • Canonical ID resolution (external_account_id -> canonical_account_id)
  • Explicit Decimal/NUMERIC(20,4) monetary arithmetic (zero binary float)
  • FX conversion to USD reporting currency using batch fx_rates
  • Schema contract verification (SCHEMA_DRIFT detection)
        │
        ▼
[3. Reporting Marts]
  • mart_account_balances (Opening + Inflows - Outflows + Market - Fees = Expected Closing vs Custody)
  • mart_advisor_summary (Advisor AUM, Inflows, Outflows, Net Flows, Market Movement, Fees)
        │
        ▼
[4. Financial Control Engine]
  • 16 YAML-configured rules across 7 control families
  • Registered Python/SQL handlers (no arbitrary YAML code execution)
  • Persists control_execution_results & control_exceptions
        │
        ▼
[5. Publication Gate]
  • PASS / PASS_WITH_WARNINGS -> Eligible for OFFICIAL publication (CONTROLLER role required)
  • BLOCKED -> OFFICIAL publication rejected (HTTP 409); DIAGNOSTIC preview only
        │
        ▼
[6. Management Reports & Audit Trail]
  • 7-sheet OpenPyXL Excel workbook with formula-injection sanitization & SHA-256 content_fingerprint
  • Append-only SHA-256 hash-chained audit_events with chain verification endpoint
```

## 2. Database & Domain Boundaries

- **Canonical Reference:** `workspaces`, `advisors`, `clients`, `accounts` — designed with stable canonical IDs compatible with downstream `WealthPulse` and `Advisor360` portfolio projects.
- **Sandbox Isolation:** Failure Lab scenarios execute inside `ws_velatrace_sandbox` with `is_sandbox = True`, never mutating production/demo reference data.
- **Server-Side RBAC:** `X-Actor-Id` and `X-Actor-Role` verified in FastAPI (`ANALYST`, `CONTROLLER`, `AUDITOR`). Maker-checker enforcement prevents a user from approving their own waiver request.
