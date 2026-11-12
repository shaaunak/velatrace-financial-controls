# VelaTrace — User Stories

- **US-01 (Publication Gate):** As a Financial Controller, I want official report publication blocked server-side whenever a blocking control fails, so that unverified or overstated numbers cannot be circulated to senior management.
- **US-02 (Idempotent Ingestion):** As a Data Engineer, I want repeated file ingestion requests to be deduplicated by natural idempotency keys, so that network retries never double-count client transactions.
- **US-03 (Balance Continuity):** As a Reporting Analyst, I want the system to verify `Opening + External Inflows - External Outflows + Market Movement - Fees = Custody Closing` per account, so that missing flows or custody mismatches are surfaced immediately.
- **US-04 (Maker-Checker Waivers):** As a Risk & Control Reviewer, I want policy waivers to require a second authorized Controller's approval and be prohibited on non-waivable critical controls, so that no single user can bypass financial controls.
- **US-05 (Variance Investigation):** As a Reporting Analyst, I want to trace any reported figure across Source → Staging → Reporting Mart → Published Report down to individual source rows, so that root causes are proven with evidence.
- **US-06 (Failure Lab Simulation):** As a Financial Operations Manager, I want to inject controlled synthetic failures (such as a $125,000 duplicate wire) in an isolated sandbox, so that I can prove our automated controls detect, block, and recover from real-world data defects.
- **US-07 (Excel Management Reporting):** As Senior Management, I want a reproducible 7-sheet Excel workbook containing Executive Summary, Advisor Performance, Account Reconciliation, Exceptions, Control Evidence, Data Provenance, and Change Log.
