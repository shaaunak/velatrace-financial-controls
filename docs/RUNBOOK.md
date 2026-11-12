# VelaTrace — Operations Runbook

## Local Startup
1. Start PostgreSQL on port `5435` (or configure `DATABASE_URL` in `.env`).
2. Run migrations: `cd backend && .venv/bin/alembic upgrade head`.
3. Seed Northbridge Wealth demo data: `backend/.venv/bin/python scripts/seed_demo.py`.
4. Start API: `cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000`.
5. Start Frontend: `cd frontend && npm run dev`.

## Incident Triage (When a Batch is BLOCKED)
1. Open **Reconciliation Runs** and click the `BLOCKED` batch.
2. Inspect **Failed Control Details** and navigate to **Investigate** to locate the first discrepancy boundary.
3. Check **Exceptions** for assigned owner and SLA due date.
4. Remediate the upstream source feed and ingest a new corrected batch; never overwrite prior raw snapshots.
