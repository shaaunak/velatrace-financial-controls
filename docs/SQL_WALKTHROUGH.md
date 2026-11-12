# VelaTrace — PostgreSQL SQL Engineering Walkthrough

All queries are located in [velatrace_queries.sql](file:///Users/shaaunak/Downloads/reconIQ/sql/velatrace_queries.sql) and operate on `NUMERIC(20,4)` / `NUMERIC(18,8)` columns in PostgreSQL 18.

---

## Query 1: Account Roll-Forward Balance Continuity (`CTE` + `Conditional Aggregation`)
- **Business Question:** Does every investment account satisfy `Opening + External Inflows - External Outflows + Market Movement - Fees = Custody Closing`?
- **SQL Technique:** Uses a `WITH ledger_flows AS (...)` CTE with `SUM(CASE WHEN flow_classification = ... THEN ... ELSE 0 END)` conditional aggregation, followed by a `LEFT JOIN` to `stg_custody_balances` and sorting by `ABS(variance)`.
- **Why it matters:** Separates external client cash flows from internal reallocations (`BUY`/`SELL`) and market performance so management never confuses trading activity with Net New Assets.

## Query 2: Exact Duplicate Transaction ID Detection (`GROUP BY` + `HAVING`)
- **Business Question:** Were any `external_txn_id` records ingested multiple times within a single batch?
- **SQL Technique:** Groups `stg_ledger_transactions` by `external_txn_id` with `HAVING COUNT(*) > 1`, calculating exact dollar overstatement as `SUM(net_amount_usd) - (SUM(net_amount_usd) / COUNT(*))`.

## Query 3: Suspicious Duplicate Business-Key Candidates (`Window Function`)
- **Business Question:** Are there distinct transaction IDs that share an identical `(account, trade_date, txn_type, net_amount_orig)`?
- **SQL Technique:** Uses `COUNT(*) OVER (PARTITION BY account_external_id, trade_date, txn_type, net_amount_orig)` to surface ambiguous duplicates for analyst investigation without auto-deleting legitimate identical trades.

## Query 4: Referential Integrity Anti-Join (`LEFT JOIN ... WHERE IS NULL`)
- **Business Question:** Which custody balance rows reference an unknown or missing canonical account?
- **SQL Technique:** Anti-join between `stg_custody_balances` and `accounts` on `(workspace_id, external_account_id)`.

## Query 5: Chronological Running Cash Balance (`Window Frame`)
- **Business Question:** What is the running net cash movement per account across the reporting period?
- **SQL Technique:** `SUM(net_amount_usd) OVER (PARTITION BY account_external_id ORDER BY trade_date, row_number ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`.

## Query 6: Advisor-Level AUM & Net External Flows Rollup
- **Business Question:** How do total assets, inflows, outflows, and market movement roll up by wealth advisor?
- **SQL Technique:** Multi-table `JOIN` from `mart_account_balances` to `advisors` with `GROUP BY` aggregation ordered by AUM.

## Query 7: Cross-System Trade Settlement Reconciliation (`FULL OUTER JOIN`)
- **Business Question:** Do gross fills in `stg_trades` reconcile to `BUY`/`SELL` settlements in `stg_ledger_transactions`?
- **SQL Technique:** Two CTEs (`trade_totals` and `ledger_trades`) joined via `FULL OUTER JOIN` with `COALESCE` to catch unmatched trades in either system.

## Query 8: Exception Ageing & SLA Breach Analysis (`EXTRACT(EPOCH ...)`)
- **Business Question:** Which open exceptions have breached or are approaching their SLA?
- **SQL Technique:** Computes elapsed hours via `EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0` and classifies SLA status with `CASE`.

## Query 9: Missing FX Conversion Rate Anti-Join (`UNION` + `LEFT JOIN`)
- **Business Question:** Are there any non-USD currencies in custody or ledger missing a USD FX rate?
- **SQL Technique:** `UNION` of distinct active currencies anti-joined against `stg_fx_rates`.

## Query 10: Multi-Batch Reconciliation Health Trend (`LAG` Window Function)
- **Business Question:** How have institutional AUM and financial variance changed across consecutive reporting batches?
- **SQL Technique:** `LAG(total_assets_usd) OVER (ORDER BY reporting_date, started_at)` to compute period-over-period AUM delta.
