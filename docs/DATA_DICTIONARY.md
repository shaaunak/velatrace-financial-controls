# VelaTrace — Data Dictionary

- **Reporting Currency:** `USD` (all non-USD balances/transactions converted using `stg_fx_rates` on `reporting_date`).
- **Monetary Precision:** PostgreSQL `NUMERIC(20,4)` for amounts; `NUMERIC(18,8)` for FX rates; Python `Decimal` with `ROUND_HALF_UP`.
- **Flow Classification Policy:**
  - `DEPOSIT` → `EXTERNAL_INFLOW` (increases Net New Assets)
  - `WITHDRAWAL` → `EXTERNAL_OUTFLOW` (decreases Net New Assets)
  - `BUY` / `SELL` → `INTERNAL_REALLOCATION` (does NOT affect Net New Assets)
  - `FEE` → `FEE` (reduces closing balance)
- **Canonical Entities:**
  - `workspaces` → `advisors` (`ADV-0001..`) → `clients` (`CLI-00001..`) → `accounts` (`NB-ACC-0001..`)
- **Pipeline Tables:**
  - Raw: `raw_source_files`, `raw_records`
  - Staging: `stg_custody_balances`, `stg_ledger_transactions`, `stg_trades`, `stg_crm_accounts`, `stg_market_prices`, `stg_fx_rates`
  - Marts: `mart_account_balances`, `mart_advisor_summary`
  - Controls & Governance: `control_rules`, `control_execution_results`, `exceptions`, `exception_comments`, `waiver_requests`, `published_reports`, `audit_events`, `failure_lab_runs`
