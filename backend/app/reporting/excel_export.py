"""Reproducible 7-sheet OpenPyXL Management Report generator for VelaTrace."""

import hashlib
import io
import json
from decimal import Decimal
from typing import Any
from openpyxl import Workbook
from openpyxl.formatting.rule import CellIsRule
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.entities import (
    ControlException,
    ControlExecutionResult,
    MartAccountBalance,
    MartAdvisorSummary,
    PublishedReport,
    RawSourceFile,
    ReconciliationBatch,
)

NAVY_FILL = PatternFill("solid", fgColor="101828")
SUBHEADER_FILL = PatternFill("solid", fgColor="F2F4F7")
PASS_FILL = PatternFill("solid", fgColor="ECFDF3")
FAIL_FILL = PatternFill("solid", fgColor="FEF3F2")
WARN_FILL = PatternFill("solid", fgColor="FFFAEB")

HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
TITLE_FONT = Font(name="Calibri", size=15, bold=True, color="101828")
SECTION_FONT = Font(name="Calibri", size=11, bold=True, color="172033")
BODY_FONT = Font(name="Calibri", size=10, color="172033")
BOLD_FONT = Font(name="Calibri", size=10, bold=True, color="172033")

THIN_BORDER = Border(
    left=Side(style="thin", color="E5E9F0"),
    right=Side(style="thin", color="E5E9F0"),
    top=Side(style="thin", color="E5E9F0"),
    bottom=Side(style="thin", color="E5E9F0"),
)

CURRENCY_FMT = "$#,##0.00;($#,##0.00);\"-\""
PCT_FMT = "0.00%"


def sanitize_excel_cell(value: Any) -> Any:
    """Prevent spreadsheet formula injection in exported text fields."""
    if isinstance(value, str) and value and value[0] in ("=", "+", "-", "@", "\t", "\r"):
        return "'" + value
    return value


def compute_content_fingerprint(
    batch: ReconciliationBatch,
    advisors: list[MartAdvisorSummary],
    accounts: list[MartAccountBalance],
    controls: list[ControlExecutionResult],
) -> str:
    """Deterministic SHA-256 fingerprint of normalized business content (independent of XLSX zip timestamps)."""
    canonical = {
        "batch_code": batch.batch_code,
        "reporting_date": batch.reporting_date.isoformat(),
        "status": batch.status,
        "total_assets_usd": f"{batch.total_assets_usd:.4f}",
        "financial_variance_usd": f"{batch.financial_variance_usd:.4f}",
        "advisors": [
            {
                "advisor_id": a.advisor_id,
                "total_assets_usd": f"{a.total_assets_usd:.4f}",
                "net_flows_usd": f"{a.net_flows_usd:.4f}",
            }
            for a in sorted(advisors, key=lambda x: x.advisor_id)
        ],
        "accounts": [
            {
                "account_external_id": m.account_external_id,
                "expected_closing_usd": f"{m.expected_closing_usd:.4f}",
                "custody_closing_usd": f"{m.custody_closing_usd:.4f}",
                "variance_usd": f"{m.variance_usd:.4f}",
            }
            for m in sorted(accounts, key=lambda x: x.account_external_id)
        ],
        "controls": [
            {
                "rule_id": c.rule_id,
                "rule_version": c.rule_version,
                "status": c.status,
                "failed_count": c.failed_count,
            }
            for c in sorted(controls, key=lambda x: x.rule_id)
        ],
    }
    encoded = json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def _style_header_row(ws, row_idx: int, col_count: int) -> None:
    for c in range(1, col_count + 1):
        cell = ws.cell(row=row_idx, column=c)
        cell.fill = NAVY_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
        cell.border = THIN_BORDER
    ws.row_dimensions[row_idx].height = 24


def _auto_fit_columns(ws, max_width: int = 42) -> None:
    for col in ws.columns:
        col_letter = get_column_letter(col[0].column)
        max_len = 0
        for cell in col:
            val_str = str(cell.value or "")
            if val_str.startswith("="):
                val_str = "$123,456,789.00"
            max_len = max(max_len, len(val_str))
        ws.column_dimensions[col_letter].width = min(max(max_len + 4, 12), max_width)


def build_management_workbook(
    db: Session,
    batch: ReconciliationBatch,
    *,
    publication_status: str,
    version_number: int,
) -> tuple[bytes, str]:
    """Build the 7-sheet management Excel workbook and return (xlsx_bytes, content_fingerprint)."""
    advisors = db.execute(
        select(MartAdvisorSummary)
        .where(MartAdvisorSummary.batch_id == batch.id)
        .order_by(MartAdvisorSummary.advisor_id.asc())
    ).scalars().all()

    accounts = db.execute(
        select(MartAccountBalance)
        .where(MartAccountBalance.batch_id == batch.id)
        .order_by(MartAccountBalance.account_external_id.asc())
    ).scalars().all()

    exceptions = db.execute(
        select(ControlException)
        .where(ControlException.batch_id == batch.id)
        .order_by(ControlException.severity.asc(), ControlException.exception_code.asc())
    ).scalars().all()

    controls = db.execute(
        select(ControlExecutionResult)
        .where(ControlExecutionResult.batch_id == batch.id)
        .order_by(ControlExecutionResult.rule_id.asc())
    ).scalars().all()

    raw_files = db.execute(
        select(RawSourceFile)
        .where(RawSourceFile.batch_id == batch.id)
        .order_by(RawSourceFile.source_system.asc())
    ).scalars().all()

    prior_reports = db.execute(
        select(PublishedReport)
        .where(
            PublishedReport.workspace_id == batch.workspace_id,
            PublishedReport.reporting_date == batch.reporting_date,
        )
        .order_by(PublishedReport.version_number.asc())
    ).scalars().all()

    fingerprint = compute_content_fingerprint(batch, advisors, accounts, controls)

    total_inflows = sum((a.external_inflows_usd for a in accounts), Decimal("0.00"))
    total_outflows = sum((a.external_outflows_usd for a in accounts), Decimal("0.00"))
    net_flows = total_inflows - total_outflows
    total_market = sum((a.market_movement_usd for a in accounts), Decimal("0.00"))
    total_fees = sum((a.fees_usd for a in accounts), Decimal("0.00"))

    wb = Workbook()

    # ------------------------------------------------------------------
    # Sheet 1: Executive Summary
    # ------------------------------------------------------------------
    ws1 = wb.active
    ws1.title = "Executive Summary"
    ws1.views.sheetView[0].showGridLines = True

    ws1["A1"] = "VelaTrace — Financial Reporting Assurance"
    ws1["A1"].font = TITLE_FONT
    ws1["A2"] = (
        f"Northbridge Wealth (Synthetic Demo) | Reporting Date: {batch.reporting_date.isoformat()} | "
        f"Classification: {publication_status} (v{version_number})"
    )
    ws1["A2"].font = BODY_FONT

    summary_rows = [
        ("Reporting Batch Code", batch.batch_code, None),
        ("Reporting Date", batch.reporting_date.isoformat(), None),
        ("Reporting Currency", "USD", None),
        ("Control Gate Status", batch.status, None),
        ("Publication Classification", publication_status, None),
        ("Total Assets Under Reporting (USD)", float(batch.total_assets_usd), CURRENCY_FMT),
        ("External Inflows (USD)", float(total_inflows), CURRENCY_FMT),
        ("External Outflows (USD)", float(total_outflows), CURRENCY_FMT),
        ("Net External Flows (USD)", float(net_flows), CURRENCY_FMT),
        ("Market Movement (USD)", float(total_market), CURRENCY_FMT),
        ("Advisory Fees (USD)", float(total_fees), CURRENCY_FMT),
        ("Institutional Financial Variance (USD)", float(batch.financial_variance_usd), CURRENCY_FMT),
        ("Accounts Reconciled", len(accounts), "#,##0"),
        ("Open / Detected Exceptions", batch.exceptions_count, "#,##0"),
        ("Content Fingerprint (SHA-256)", fingerprint, None),
    ]
    ws1.cell(row=4, column=1, value="Metric")
    ws1.cell(row=4, column=2, value="Value")
    _style_header_row(ws1, 4, 2)
    for idx, (label, val, fmt) in enumerate(summary_rows, start=5):
        c1 = ws1.cell(row=idx, column=1, value=label)
        c2 = ws1.cell(row=idx, column=2, value=sanitize_excel_cell(val))
        c1.font = BOLD_FONT
        c2.font = BODY_FONT
        c1.border = THIN_BORDER
        c2.border = THIN_BORDER
        if fmt:
            c2.number_format = fmt
    ws1.freeze_panes = "A5"
    _auto_fit_columns(ws1, max_width=68)

    # ------------------------------------------------------------------
    # Sheet 2: Advisor Performance
    # ------------------------------------------------------------------
    ws2 = wb.create_sheet("Advisor Performance")
    headers2 = [
        "Advisor ID",
        "Advisor Name",
        "Region",
        "Accounts",
        "Total Assets (USD)",
        "Net Inflows (USD)",
        "Net Outflows (USD)",
        "Net Flows (USD)",
        "Market Movement (USD)",
        "Fees (USD)",
    ]
    for c_i, h in enumerate(headers2, start=1):
        ws2.cell(row=1, column=c_i, value=h)
    _style_header_row(ws2, 1, len(headers2))

    for r_i, adv in enumerate(advisors, start=2):
        vals = [
            adv.advisor_id,
            sanitize_excel_cell(adv.advisor_name),
            adv.region,
            adv.account_count,
            float(adv.total_assets_usd),
            float(adv.net_inflows_usd),
            float(adv.net_outflows_usd),
            f"=F{r_i}-G{r_i}",
            float(adv.market_movement_usd),
            float(adv.fees_usd),
        ]
        for c_i, v in enumerate(vals, start=1):
            cell = ws2.cell(row=r_i, column=c_i, value=v)
            cell.font = BODY_FONT
            cell.border = THIN_BORDER
            if c_i >= 5:
                cell.number_format = CURRENCY_FMT

    if advisors:
        tot_row = len(advisors) + 2
        ws2.cell(row=tot_row, column=1, value="TOTAL").font = BOLD_FONT
        ws2.cell(row=tot_row, column=4, value=f"=SUM(D2:D{tot_row-1})").number_format = "#,##0"
        for col_idx, col_let in [(5, "E"), (6, "F"), (7, "G"), (8, "H"), (9, "I"), (10, "J")]:
            c = ws2.cell(row=tot_row, column=col_idx, value=f"=SUM({col_let}2:{col_let}{tot_row-1})")
            c.font = BOLD_FONT
            c.number_format = CURRENCY_FMT
        ws2.auto_filter.ref = f"A1:J{tot_row-1}"
    ws2.freeze_panes = "A2"
    _auto_fit_columns(ws2)

    # ------------------------------------------------------------------
    # Sheet 3: Account Reconciliation
    # ------------------------------------------------------------------
    ws3 = wb.create_sheet("Account Reconciliation")
    headers3 = [
        "Account ID",
        "Advisor ID",
        "Opening Assets (USD)",
        "External Inflows (USD)",
        "External Outflows (USD)",
        "Market Movement (USD)",
        "Fees (USD)",
        "Expected Closing (USD)",
        "Custody Closing (USD)",
        "Absolute Variance (USD)",
        "Control Status",
    ]
    for c_i, h in enumerate(headers3, start=1):
        ws3.cell(row=1, column=c_i, value=h)
    _style_header_row(ws3, 1, len(headers3))

    for r_i, acct in enumerate(accounts, start=2):
        vals = [
            acct.account_external_id,
            acct.advisor_id or "",
            float(acct.opening_assets_usd),
            float(acct.external_inflows_usd),
            float(acct.external_outflows_usd),
            float(acct.market_movement_usd),
            float(acct.fees_usd),
            f"=C{r_i}+D{r_i}-E{r_i}+F{r_i}-G{r_i}",
            float(acct.custody_closing_usd),
            f"=H{r_i}-I{r_i}",
            acct.control_status,
        ]
        for c_i, v in enumerate(vals, start=1):
            cell = ws3.cell(row=r_i, column=c_i, value=v)
            cell.font = BODY_FONT
            cell.border = THIN_BORDER
            if 3 <= c_i <= 10:
                cell.number_format = CURRENCY_FMT
    if accounts:
        ws3.auto_filter.ref = f"A1:K{len(accounts)+1}"
        ws3.conditional_formatting.add(
            f"K2:K{len(accounts)+1}",
            CellIsRule(operator="equal", formula=['"FAIL"'], fill=FAIL_FILL),
        )
        ws3.conditional_formatting.add(
            f"K2:K{len(accounts)+1}",
            CellIsRule(operator="equal", formula=['"PASS"'], fill=PASS_FILL),
        )
    ws3.freeze_panes = "A2"
    _auto_fit_columns(ws3)

    # ------------------------------------------------------------------
    # Sheet 4: Exceptions
    # ------------------------------------------------------------------
    ws4 = wb.create_sheet("Exceptions")
    headers4 = [
        "Exception Code",
        "Rule ID",
        "Severity",
        "Blocking",
        "Entity Type",
        "Entity ID",
        "Source System",
        "Variance (USD)",
        "Status",
        "Assigned To",
        "Description",
    ]
    for c_i, h in enumerate(headers4, start=1):
        ws4.cell(row=1, column=c_i, value=h)
    _style_header_row(ws4, 1, len(headers4))
    for r_i, exc in enumerate(exceptions, start=2):
        vals = [
            exc.exception_code,
            exc.rule_id,
            exc.severity,
            "YES" if exc.is_blocking else "NO",
            exc.entity_type,
            sanitize_excel_cell(exc.entity_id),
            exc.source_system,
            float(exc.variance_amount_usd),
            exc.status,
            exc.assigned_to or "",
            sanitize_excel_cell(exc.description),
        ]
        for c_i, v in enumerate(vals, start=1):
            cell = ws4.cell(row=r_i, column=c_i, value=v)
            cell.font = BODY_FONT
            cell.border = THIN_BORDER
            if c_i == 8:
                cell.number_format = CURRENCY_FMT
    ws4.freeze_panes = "A2"
    _auto_fit_columns(ws4, max_width=55)

    # ------------------------------------------------------------------
    # Sheet 5: Control Evidence
    # ------------------------------------------------------------------
    ws5 = wb.create_sheet("Control Evidence")
    headers5 = [
        "Rule ID",
        "Version",
        "Status",
        "Blocking",
        "Evaluated",
        "Failed",
        "Measured Variance (USD)",
        "Threshold",
        "Evidence Summary",
    ]
    for c_i, h in enumerate(headers5, start=1):
        ws5.cell(row=1, column=c_i, value=h)
    _style_header_row(ws5, 1, len(headers5))
    for r_i, ctl in enumerate(controls, start=2):
        vals = [
            ctl.rule_id,
            ctl.rule_version,
            ctl.status,
            "YES" if ctl.is_blocking else "NO",
            ctl.evaluated_count,
            ctl.failed_count,
            float(ctl.measured_variance_usd),
            sanitize_excel_cell(ctl.threshold_description),
            sanitize_excel_cell(ctl.evidence_summary),
        ]
        for c_i, v in enumerate(vals, start=1):
            cell = ws5.cell(row=r_i, column=c_i, value=v)
            cell.font = BODY_FONT
            cell.border = THIN_BORDER
            if c_i == 7:
                cell.number_format = CURRENCY_FMT
    ws5.freeze_panes = "A2"
    _auto_fit_columns(ws5, max_width=55)

    # ------------------------------------------------------------------
    # Sheet 6: Data Provenance
    # ------------------------------------------------------------------
    ws6 = wb.create_sheet("Data Provenance")
    headers6 = [
        "Source System",
        "File Name",
        "Row Count",
        "Declared Control Total (USD)",
        "Parser Version",
        "Processing Status",
        "Source SHA-256",
        "Idempotency Key",
    ]
    for c_i, h in enumerate(headers6, start=1):
        ws6.cell(row=1, column=c_i, value=h)
    _style_header_row(ws6, 1, len(headers6))
    for r_i, rf in enumerate(raw_files, start=2):
        vals = [
            rf.source_system,
            sanitize_excel_cell(rf.file_name),
            rf.row_count,
            float(rf.declared_control_total) if rf.declared_control_total is not None else None,
            rf.parser_version,
            rf.processing_status,
            rf.source_hash,
            rf.idempotency_key,
        ]
        for c_i, v in enumerate(vals, start=1):
            cell = ws6.cell(row=r_i, column=c_i, value=v)
            cell.font = BODY_FONT
            cell.border = THIN_BORDER
            if c_i == 4 and v is not None:
                cell.number_format = CURRENCY_FMT
    ws6.freeze_panes = "A2"
    _auto_fit_columns(ws6, max_width=68)

    # ------------------------------------------------------------------
    # Sheet 7: Change Log
    # ------------------------------------------------------------------
    ws7 = wb.create_sheet("Change Log")
    headers7 = [
        "Version",
        "Classification",
        "Batch ID",
        "Total Assets (USD)",
        "Variance (USD)",
        "Published By",
        "Published At",
        "Notes",
    ]
    for c_i, h in enumerate(headers7, start=1):
        ws7.cell(row=1, column=c_i, value=h)
    _style_header_row(ws7, 1, len(headers7))
    for r_i, rep in enumerate(prior_reports, start=2):
        vals = [
            f"v{rep.version_number}",
            rep.publication_status,
            rep.batch_id,
            float(rep.total_assets_usd),
            float(rep.financial_variance_usd),
            rep.published_by,
            rep.published_at.isoformat(),
            sanitize_excel_cell(rep.notes or ""),
        ]
        for c_i, v in enumerate(vals, start=1):
            cell = ws7.cell(row=r_i, column=c_i, value=v)
            cell.font = BODY_FONT
            cell.border = THIN_BORDER
            if c_i in (4, 5):
                cell.number_format = CURRENCY_FMT
    ws7.freeze_panes = "A2"
    _auto_fit_columns(ws7, max_width=50)

    out = io.BytesIO()
    wb.save(out)
    return out.getvalue(), fingerprint
