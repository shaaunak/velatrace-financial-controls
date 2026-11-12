# VelaTrace — Reporting & Publication Policy

1. **Three Validation Outcomes:** `PASS`, `PASS_WITH_WARNINGS`, `BLOCKED` (computed strictly by the backend).
2. **Publication Gate:** `BLOCKED` runs cannot produce an `OFFICIAL` report. Only a `DIAGNOSTIC` preview may be generated for investigation.
3. **Version Retention:** Each official publication increments `version_number` for `(workspace_id, reporting_date)`. Prior versions remain permanently accessible.
4. **Role Segregation:** `ANALYST` runs pipelines and investigates exceptions; `CONTROLLER` approves waivers and publishes official reports; `AUDITOR` inspects evidence and verifies hash chains.
5. **Cut-Off & Currency:** Daily cut-off 17:00:00 EST; reporting currency `USD` using `fx_rates.csv` on `reporting_date`.
