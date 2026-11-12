-- ============================================================================
-- VelaTrace — PostgreSQL Financial Control & Reconciliation Queries
-- ============================================================================

-- 1. Account Roll-Forward Balance Continuity (CTE + Conditional Aggregation)
-- Business Question: Does every account satisfy Opening + Inflows - Outflows + Market - Fees = Closing?
WITH ledger_flows AS (
    SELECT
        batch_id,
        account_external_id,
        SUM(CASE WHEN flow_classification = 'EXTERNAL_INFLOW' THEN net_amount_usd ELSE 0 END) AS external_inflows_usd,
        SUM(CASE WHEN flow_classification = 'EXTERNAL_OUTFLOW' THEN ABS(net_amount_usd) ELSE 0 END) AS external_outflows_usd,
        SUM(CASE WHEN flow_classification = 'FEE' THEN ABS(net_amount_usd) ELSE 0 END) AS fees_usd
    FROM stg_ledger_transactions
    WHERE batch_id = :batch_id
    GROUP BY batch_id, account_external_id
)
SELECT
    c.account_external_id,
    c.opening_value_usd,
    COALESCE(l.external_inflows_usd, 0) AS external_inflows_usd,
    COALESCE(l.external_outflows_usd, 0) AS external_outflows_usd,
    c.market_movement_usd,
    COALESCE(l.fees_usd, 0) AS fees_usd,
    (c.opening_value_usd + COALESCE(l.external_inflows_usd, 0) - COALESCE(l.external_outflows_usd, 0)
     + c.market_movement_usd - COALESCE(l.fees_usd, 0)) AS expected_closing_usd,
    c.total_value_usd AS custody_closing_usd,
    (c.opening_value_usd + COALESCE(l.external_inflows_usd, 0) - COALESCE(l.external_outflows_usd, 0)
     + c.market_movement_usd - COALESCE(l.fees_usd, 0) - c.total_value_usd) AS variance_usd
FROM stg_custody_balances c
LEFT JOIN ledger_flows l
    ON l.batch_id = c.batch_id AND l.account_external_id = c.account_external_id
WHERE c.batch_id = :batch_id
ORDER BY ABS(
    c.opening_value_usd + COALESCE(l.external_inflows_usd, 0) - COALESCE(l.external_outflows_usd, 0)
    + c.market_movement_usd - COALESCE(l.fees_usd, 0) - c.total_value_usd
) DESC;

-- 2. Exact Duplicate Transaction ID Detection (Aggregation + HAVING)
-- Business Question: Are any external_txn_id values ingested more than once in the ledger?
SELECT
    external_txn_id,
    COUNT(*) AS occurrence_count,
    MIN(row_number) AS first_row,
    MAX(row_number) AS last_row,
    SUM(net_amount_usd) AS total_usd,
    SUM(net_amount_usd) - (SUM(net_amount_usd) / COUNT(*)) AS overstatement_usd
FROM stg_ledger_transactions
WHERE batch_id = :batch_id
GROUP BY external_txn_id
HAVING COUNT(*) > 1;

-- 3. Suspicious Duplicate Business-Key Candidates (Window Function)
-- Business Question: Which distinct transaction IDs share identical account, date, type, and amount?
WITH ranked_keys AS (
    SELECT
        external_txn_id,
        account_external_id,
        trade_date,
        txn_type,
        net_amount_orig,
        COUNT(*) OVER (
            PARTITION BY account_external_id, trade_date, txn_type, net_amount_orig
        ) AS business_key_count
    FROM stg_ledger_transactions
    WHERE batch_id = :batch_id
)
SELECT *
FROM ranked_keys
WHERE business_key_count > 1
ORDER BY account_external_id, trade_date;

-- 4. Referential Integrity Anti-Join: Unknown Accounts in Custody
-- Business Question: Which custody records fail to map to a canonical account?
SELECT
    c.row_number,
    c.account_external_id,
    c.total_value_usd
FROM stg_custody_balances c
LEFT JOIN accounts a
    ON a.workspace_id = c.workspace_id AND a.external_account_id = c.account_external_id
WHERE c.batch_id = :batch_id AND a.id IS NULL;

-- 5. Running Cash Balance per Account (Window Function SUM() OVER)
-- Business Question: What is the chronological running net cash flow per account?
SELECT
    account_external_id,
    trade_date,
    external_txn_id,
    txn_type,
    net_amount_usd,
    SUM(net_amount_usd) OVER (
        PARTITION BY account_external_id
        ORDER BY trade_date, row_number
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    ) AS running_net_usd
FROM stg_ledger_transactions
WHERE batch_id = :batch_id
ORDER BY account_external_id, trade_date, row_number;

-- 6. Advisor-Level AUM & Net External Flows Rollup
-- Business Question: How do assets, inflows, outflows, and market movement aggregate by advisor?
SELECT
    adv.external_advisor_id,
    adv.full_name,
    adv.region,
    COUNT(m.id) AS account_count,
    SUM(m.custody_closing_usd) AS total_assets_usd,
    SUM(m.external_inflows_usd) AS total_inflows_usd,
    SUM(m.external_outflows_usd) AS total_outflows_usd,
    SUM(m.net_external_flows_usd) AS net_external_flows_usd,
    SUM(m.market_movement_usd) AS total_market_movement_usd
FROM mart_account_balances m
JOIN advisors adv ON adv.id = m.advisor_id
WHERE m.batch_id = :batch_id
GROUP BY adv.external_advisor_id, adv.full_name, adv.region
ORDER BY total_assets_usd DESC;

-- 7. Cross-System Trade Settlement Reconciliation (Full Outer Join / CTE)
-- Business Question: Do trading system gross fills match internal ledger BUY/SELL settlements?
WITH trade_totals AS (
    SELECT account_external_id, SUM(gross_amount_usd) AS trades_usd
    FROM stg_trades
    WHERE batch_id = :batch_id
    GROUP BY account_external_id
),
ledger_trades AS (
    SELECT account_external_id, SUM(net_amount_usd) AS ledger_usd
    FROM stg_ledger_transactions
    WHERE batch_id = :batch_id AND txn_type IN ('BUY', 'SELL')
    GROUP BY account_external_id
)
SELECT
    COALESCE(t.account_external_id, l.account_external_id) AS account_external_id,
    COALESCE(t.trades_usd, 0) AS trades_usd,
    COALESCE(l.ledger_usd, 0) AS ledger_usd,
    COALESCE(t.trades_usd, 0) - COALESCE(l.ledger_usd, 0) AS settlement_diff_usd
FROM trade_totals t
FULL OUTER JOIN ledger_trades l ON l.account_external_id = t.account_external_id
WHERE ABS(COALESCE(t.trades_usd, 0) - COALESCE(l.ledger_usd, 0)) > 0.01;

-- 8. Exception Ageing & SLA Breach Analysis
-- Business Question: Which open exceptions are approaching or breaching their SLA?
SELECT
    exception_code,
    rule_id,
    severity,
    status,
    variance_amount_usd,
    ROUND(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600.0, 2) AS age_hours,
    CASE WHEN sla_due_at < NOW() THEN 'BREACHED' ELSE 'WITHIN_SLA' END AS sla_status
FROM exceptions
WHERE workspace_id = :workspace_id
  AND status IN ('OPEN', 'INVESTIGATING', 'WAIVER_REQUESTED')
ORDER BY sla_due_at ASC;

-- 9. Missing FX Conversion Rate Anti-Join
-- Business Question: Are there any active currencies in custody or ledger without a USD rate?
WITH active_currencies AS (
    SELECT DISTINCT original_currency AS ccy FROM stg_custody_balances WHERE batch_id = :batch_id
    UNION
    SELECT DISTINCT original_currency AS ccy FROM stg_ledger_transactions WHERE batch_id = :batch_id
)
SELECT ac.ccy
FROM active_currencies ac
LEFT JOIN stg_fx_rates fx
    ON fx.batch_id = :batch_id AND fx.from_currency = ac.ccy AND fx.to_currency = 'USD'
WHERE ac.ccy <> 'USD' AND fx.id IS NULL;

-- 10. Multi-Batch Reconciliation Health Trend (Window Lag)
-- Business Question: How has institutional AUM and financial variance evolved across recent batches?
SELECT
    batch_code,
    reporting_date,
    status,
    total_assets_usd,
    LAG(total_assets_usd) OVER (ORDER BY reporting_date, started_at) AS prior_batch_assets_usd,
    total_assets_usd - LAG(total_assets_usd) OVER (ORDER BY reporting_date, started_at) AS period_aum_delta_usd,
    financial_variance_usd,
    exceptions_count
FROM reconciliation_batches
WHERE workspace_id = :workspace_id
ORDER BY reporting_date DESC, started_at DESC;
