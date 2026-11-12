"""Seed Northbridge Wealth — Demonstration Environment into PostgreSQL."""

import sys
from datetime import date
from pathlib import Path
from sqlalchemy import select

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
sys.path.insert(0, str(ROOT_DIR))
sys.path.insert(0, str(BACKEND_DIR))

from data.synthetic_generators.generator import generate_northbridge_dataset, write_dataset_to_dir
from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.entities import ReconciliationBatch
from app.pipelines.ingestion import ensure_workspace_and_reference_data, run_batch_pipeline
from app.reporting.publication import publish_report_for_batch
from app.services.failure_lab import dataset_to_payloads


def seed() -> None:
    settings = get_settings()
    ws_id = settings.demo_workspace_id
    db = SessionLocal()
    try:
        existing = db.execute(
            select(ReconciliationBatch).where(ReconciliationBatch.workspace_id == ws_id)
        ).scalars().first()
        if existing:
            print(f"Workspace {ws_id} already seeded ({existing.batch_code}). Skipping.")
            return

        # Generate full-scale dataset for 2026-10-30 (250 clients, 24 advisors, 600 accounts, 12,000 txns)
        ds_main = generate_northbridge_dataset(
            reporting_date=date(2026, 10, 30),
            seed=20261112,
            num_advisors=24,
            num_clients=250,
            num_accounts=600,
            target_transactions=12000,
        )
        write_dataset_to_dir(ds_main, ROOT_DIR / "data" / "generated" / "2026-10-30")

        ensure_workspace_and_reference_data(
            db,
            workspace_id=ws_id,
            workspace_name="Northbridge Wealth — Demonstration Environment (Synthetic)",
            is_demo=True,
            is_sandbox=False,
            advisors=ds_main.advisors,
            clients=ds_main.clients,
            accounts=ds_main.accounts,
        )

        # Prior dates for multi-date history & trend charts
        for dt, seed_val, n_txns in [
            (date(2026, 10, 28), 20261110, 3600),
            (date(2026, 10, 29), 20261111, 3600),
        ]:
            ds_hist = generate_northbridge_dataset(
                reporting_date=dt,
                seed=seed_val,
                num_advisors=24,
                num_clients=250,
                num_accounts=600,
                target_transactions=n_txns,
            )
            batch = run_batch_pipeline(
                db,
                workspace_id=ws_id,
                reporting_date=dt,
                source_payloads=dataset_to_payloads(ds_hist, store_raw_rows=False),
                triggered_by="analyst_maya",
                actor_role="ANALYST",
                notes=f"Scheduled daily wealth reconciliation for {dt.isoformat()}",
            )
            if batch.status in ("PASS", "PASS_WITH_WARNINGS"):
                publish_report_for_batch(
                    db,
                    batch=batch,
                    actor_id="controller_marcus",
                    actor_role="CONTROLLER",
                    notes=f"Controller sign-off for {dt.isoformat()}",
                )

        # Latest reporting date (2026-10-30) with full 12,000 transactions
        latest_batch = run_batch_pipeline(
            db,
            workspace_id=ws_id,
            reporting_date=date(2026, 10, 30),
            source_payloads=dataset_to_payloads(ds_main, store_raw_rows=False),
            triggered_by="analyst_maya",
            actor_role="ANALYST",
            notes="Month-end wealth management reconciliation (12,000 transactions, 600 accounts)",
        )
        if latest_batch.status in ("PASS", "PASS_WITH_WARNINGS"):
            publish_report_for_batch(
                db,
                batch=latest_batch,
                actor_id="controller_marcus",
                actor_role="CONTROLLER",
                notes="Month-end official management report published after 16/16 controls passed.",
            )

        db.commit()
        print(
            f"Seeded {ws_id}: latest batch {latest_batch.batch_code} | "
            f"status={latest_batch.status} | assets=${latest_batch.total_assets_usd:,.2f} | "
            f"variance=${latest_batch.financial_variance_usd:,.2f}"
        )
    finally:
        db.close()


if __name__ == "__main__":
    seed()
