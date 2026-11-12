# VelaTrace — 3–5 Minute Interview Demonstration Guide

Use the **Run Guided Investigation** entry point in `/app/failure-lab` (or `/app`):

1. **Healthy Baseline:** Show the latest Northbridge Wealth batch (`~$934M` AUM, 600 accounts, 12,000 transactions, `$0.00` variance) and its published `OFFICIAL` Excel report.
2. **Inject Controlled Failure:** Trigger **"The $125,000 Discrepancy"** (`duplicate_transaction`) in the isolated sandbox.
3. **Observe Automated Blocking:** Point out `CTL-UNIQ-001` and `CTL-BAL-001` firing, exact `$125,000.00` variance, and `BLOCKED` status.
4. **Prove Publication Gate:** Click **Attempt Official Publication** and show the backend `HTTP 409` rejection + `PUBLICATION_BLOCKED` audit event.
5. **Investigate Lineage:** Trace `NB-ACC-0001` from the mart variance back to the duplicated `TXN-20261030-000001` row in `ledger_transactions.csv`.
6. **Correct & Revalidate:** Click **Correct & Rerun Pipeline** to produce a new `PASS` batch while preserving both prior raw versions.
7. **Publish & Verify Audit:** Publish the new `OFFICIAL` version, download the 7-sheet Excel workbook, and run **Verify Hash Chain** in Audit Trail.
