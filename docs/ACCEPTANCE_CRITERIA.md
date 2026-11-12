# VelaTrace — Testable Acceptance Criteria

1. **Publication Gate (`US-01`):**
   - Given a batch with status `BLOCKED`, when `POST /api/v1/reports/publish` is called with `diagnostic_only=false`, then the backend returns `HTTP 409 Conflict` (`PUBLICATION_BLOCKED`), creates no official report, and records a `PUBLICATION_BLOCKED` audit event.
   - Given `diagnostic_only=true`, a `DIAGNOSTIC` preview workbook may be generated for investigation.
2. **Idempotent Ingestion (`US-02`):**
   - Ingesting the exact same `(workspace_id, batch_id, source_system, reporting_date, source_hash, parser_version)` twice returns `created_new=false` and the same `raw_file_id` without duplicating rows.
3. **Maker-Checker Waiver (`US-04`):**
   - Requesting a waiver on a non-waivable rule (`CTL-UNIQ-001`, `CTL-BAL-001`) returns `HTTP 403`.
   - Attempting to approve one's own waiver request returns `HTTP 403`.
   - Only a distinct `CONTROLLER` can approve a pending waiver on a waivable rule.
4. **Failure Lab `$125,000 Discrepancy` (`US-06`):**
   - Injecting `duplicate_transaction` creates a `BLOCKED` batch with `CTL-UNIQ-001` failed and ~$125,000 variance.
   - Running correction & revalidate produces a new `PASS`/`PASS_WITH_WARNINGS` batch while retaining all prior raw snapshots.
