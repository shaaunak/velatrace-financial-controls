"""Deterministic synthetic wealth management dataset generator for Northbridge Wealth."""

import csv
import hashlib
import io
import json
import random
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from typing import Any


QUANT_4 = Decimal("0.0001")
QUANT_2 = Decimal("0.01")

ADVISOR_REGIONS = ["Northeast", "West Coast", "Midwest", "Southeast", "International"]
ADVISOR_TEAMS = ["Private Wealth", "Institutional Advisory", "Family Office", "Core Wealth"]
CLIENT_SEGMENTS = ["Ultra High Net Worth", "High Net Worth", "Affluent", "Endowment"]
RISK_PROFILES = ["Conservative", "Moderate", "Balanced", "Growth", "Aggressive"]
ACCOUNT_TYPES = ["Individual Taxable", "Joint WROS", "Traditional IRA", "Roth IRA", "Revocable Trust", "Corporate"]
CURRENCIES = ["USD", "EUR", "GBP", "INR"]

# Fixed FX rates to USD (reporting currency) per currency
BASE_FX_TO_USD: dict[str, Decimal] = {
    "USD": Decimal("1.00000000"),
    "EUR": Decimal("1.08500000"),
    "GBP": Decimal("1.27200000"),
    "INR": Decimal("0.01190000"),
}

SECURITIES = [
    ("SEC-AAPL", "AAPL", "USD", Decimal("228.50")),
    ("SEC-MSFT", "MSFT", "USD", Decimal("418.20")),
    ("SEC-NVDA", "NVDA", "USD", Decimal("138.40")),
    ("SEC-VOO", "VOO", "USD", Decimal("524.10")),
    ("SEC-AGG", "AGG", "USD", Decimal("98.75")),
    ("SEC-SAP", "SAP", "EUR", Decimal("214.60")),
    ("SEC-ASML", "ASML", "EUR", Decimal("682.00")),
    ("SEC-AZN", "AZN", "GBP", Decimal("112.40")),
    ("SEC-INFY", "INFY", "INR", Decimal("1840.00")),
    ("SEC-TCS", "TCS", "INR", Decimal("4120.00")),
]

FIRST_NAMES = [
    "Arthur", "Beatrice", "Charles", "Diana", "Edward", "Fiona", "George", "Hannah",
    "Ian", "Julia", "Kenneth", "Laura", "Martin", "Nadia", "Oliver", "Priya",
    "Quentin", "Rachel", "Samuel", "Tara", "Ulysses", "Victoria", "Walter", "Zoe",
]
LAST_NAMES = [
    "Sterling", "Vance", "Mercer", "Kensington", "Ashford", "Whitmore", "Caldwell", "Thorne",
    "Sinclair", "Blackwood", "Patel", "Chen", "Rostova", "Lindqvist", "Moreau", "Takahashi",
    "Alvarez", "bhattacharya", "Okafor", "Goldstein", "Harrington", "beaumont", "Castellano", "Kowalski",
]


def _q2(val: Decimal) -> Decimal:
    return val.quantize(QUANT_2, rounding=ROUND_HALF_UP)


def _q4(val: Decimal) -> Decimal:
    return val.quantize(QUANT_4, rounding=ROUND_HALF_UP)


@dataclass
class GeneratedDataset:
    reporting_date: date
    seed: int
    advisors: list[dict[str, Any]]
    clients: list[dict[str, Any]]
    accounts: list[dict[str, Any]]
    fx_rates: list[dict[str, Any]]
    market_prices: list[dict[str, Any]]
    crm_accounts: list[dict[str, Any]]
    custody_balances: list[dict[str, Any]]
    ledger_transactions: list[dict[str, Any]]
    trades: list[dict[str, Any]]
    manifest: dict[str, Any]


def to_csv_string(rows: list[dict[str, Any]], fieldnames: list[str] | None = None) -> str:
    if not rows and not fieldnames:
        return ""
    fields = fieldnames or list(rows[0].keys())
    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    for r in rows:
        writer.writerow(r)
    return buf.getvalue()


def generate_northbridge_dataset(
    reporting_date: date = date(2026, 10, 30),
    seed: int = 20261112,
    num_advisors: int = 24,
    num_clients: int = 250,
    num_accounts: int = 600,
    target_transactions: int = 12000,
) -> GeneratedDataset:
    """
    Generate a mathematically consistent synthetic wealth management dataset.
    Every account satisfies:
      Opening Assets + External Inflows - External Outflows + Market Movement - Fees = Closing Custody Assets
    """
    rng = random.Random(seed)

    # 1. Advisors
    advisors: list[dict[str, Any]] = []
    for i in range(1, num_advisors + 1):
        ext_id = f"ADV-{i:04d}"
        name = f"{FIRST_NAMES[(i * 3) % len(FIRST_NAMES)]} {LAST_NAMES[(i * 5) % len(LAST_NAMES)].title()}"
        advisors.append(
            {
                "external_advisor_id": ext_id,
                "full_name": name,
                "region": ADVISOR_REGIONS[(i - 1) % len(ADVISOR_REGIONS)],
                "team": ADVISOR_TEAMS[(i - 1) % len(ADVISOR_TEAMS)],
            }
        )

    # 2. Clients
    clients: list[dict[str, Any]] = []
    for i in range(1, num_clients + 1):
        ext_id = f"CLI-{i:05d}"
        adv = advisors[(i - 1) % len(advisors)]
        fn = rng.choice(FIRST_NAMES)
        ln = rng.choice(LAST_NAMES).title()
        clients.append(
            {
                "external_client_id": ext_id,
                "full_name": f"{fn} {ln}",
                "segment": rng.choice(CLIENT_SEGMENTS),
                "advisor_external_id": adv["external_advisor_id"],
                "risk_profile": rng.choice(RISK_PROFILES),
            }
        )

    # 3. Accounts (CRM)
    accounts: list[dict[str, Any]] = []
    crm_accounts: list[dict[str, Any]] = []
    for i in range(1, num_accounts + 1):
        ext_id = f"NB-ACC-{i:04d}"
        cli = clients[(i - 1) % len(clients)]
        # Weight USD heavily (~70%), then EUR, GBP, INR
        ccy_roll = rng.random()
        if i == 1:
            ccy = "USD"  # Pin NB-ACC-0001 to USD for the signature $125,000 scenario
        elif ccy_roll < 0.70:
            ccy = "USD"
        elif ccy_roll < 0.82:
            ccy = "EUR"
        elif ccy_roll < 0.92:
            ccy = "GBP"
        else:
            ccy = "INR"

        opened = date(2021, 1, 15) + timedelta(days=rng.randint(0, 1500))
        acct_type = rng.choice(ACCOUNT_TYPES)
        acct = {
            "account_external_id": ext_id,
            "client_external_id": cli["external_client_id"],
            "advisor_external_id": cli["advisor_external_id"],
            "account_type": acct_type,
            "base_currency": ccy,
            "status": "ACTIVE",
            "opened_date": opened.isoformat(),
        }
        accounts.append(acct)
        crm_accounts.append(
            {
                "account_external_id": ext_id,
                "client_external_id": cli["external_client_id"],
                "advisor_external_id": cli["advisor_external_id"],
                "account_type": acct_type,
                "base_currency": ccy,
                "status": "ACTIVE",
            }
        )

    # 4. FX Rates (deterministic slight variation per reporting date)
    date_offset = (reporting_date - date(2026, 10, 1)).days
    fx_rates: list[dict[str, Any]] = []
    fx_map: dict[str, Decimal] = {}
    for ccy, base_rate in BASE_FX_TO_USD.items():
        if ccy == "USD":
            rate = Decimal("1.00000000")
        else:
            bump = Decimal(str(1 + (date_offset % 7 - 3) * 0.0012))
            rate = (base_rate * bump).quantize(Decimal("0.00000001"), rounding=ROUND_HALF_UP)
        fx_map[ccy] = rate
        fx_rates.append(
            {
                "rate_date": reporting_date.isoformat(),
                "from_currency": ccy,
                "to_currency": "USD",
                "rate": f"{rate:.8f}",
                "source_system": "TREASURY_FX",
            }
        )

    # 5. Market Prices
    market_prices: list[dict[str, Any]] = []
    sec_price_map: dict[str, tuple[str, Decimal]] = {}
    for sec_id, ticker, ccy, base_px in SECURITIES:
        bump = Decimal(str(1 + ((date_offset * 3 + len(ticker)) % 9 - 4) * 0.0045))
        px = _q2(base_px * bump)
        sec_price_map[sec_id] = (ccy, px)
        market_prices.append(
            {
                "price_date": reporting_date.isoformat(),
                "security_id": sec_id,
                "ticker": ticker,
                "currency": ccy,
                "close_price": f"{px:.4f}",
                "source_system": "MARKET_DATA",
            }
        )

    # 6. Transactions, Trades, and Custody Balances (exact roll-forward continuity)
    txns_per_acct = max(1, target_transactions // num_accounts)
    ledger_transactions: list[dict[str, Any]] = []
    trades: list[dict[str, Any]] = []
    custody_balances: list[dict[str, Any]] = []

    txn_counter = 1
    trade_counter = 1
    period_start = reporting_date - timedelta(days=29)

    for idx, acct in enumerate(accounts):
        acct_id = acct["account_external_id"]
        ccy = acct["base_currency"]
        scale = Decimal("84.0") if ccy == "INR" else Decimal("1.0")

        opening_assets = _q2(Decimal(str(rng.randint(150_000, 2_500_000))) * scale)
        cash_bal = _q2(opening_assets * Decimal("0.18"))
        sec_bal = opening_assets - cash_bal

        ext_inflows = Decimal("0.00")
        ext_outflows = Decimal("0.00")
        fees_total = Decimal("0.00")

        # Determine number of txns for this account
        n_txns = txns_per_acct

        for t_i in range(n_txns):
            t_date = period_start + timedelta(days=rng.randint(0, 29))
            s_date = min(reporting_date, t_date + timedelta(days=1))

            # Pin the very first transaction of NB-ACC-0001 to a $125,000.00 DEPOSIT
            if idx == 0 and t_i == 0:
                txn_type = "DEPOSIT"
                flow_cls = "EXTERNAL_INFLOW"
                gross = Decimal("125000.00")
                fee = Decimal("0.00")
                net = gross
                sec_id = ""
                qty = ""
                px_str = ""
                desc = "Wire Transfer - Client Capital Contribution"
            else:
                roll = rng.random()
                if roll < 0.20:
                    txn_type = "DEPOSIT"
                    flow_cls = "EXTERNAL_INFLOW"
                    gross = _q2(Decimal(str(rng.randint(5_000, 85_000))) * scale)
                    fee = Decimal("0.00")
                    net = gross
                    sec_id, qty, px_str = "", "", ""
                    desc = "ACH / Wire External Deposit"
                elif roll < 0.32:
                    txn_type = "WITHDRAWAL"
                    flow_cls = "EXTERNAL_OUTFLOW"
                    gross = _q2(Decimal(str(rng.randint(2_000, 35_000))) * scale)
                    fee = Decimal("0.00")
                    net = -gross  # Outflow signed negative in ledger
                    sec_id, qty, px_str = "", "", ""
                    desc = "Client Distribution Wire"
                elif roll < 0.62:
                    txn_type = "BUY"
                    flow_cls = "INTERNAL_REALLOCATION"
                    sec = SECURITIES[rng.randint(0, 4)]  # USD securities for clean settlement
                    sec_id = sec[0]
                    px = sec_price_map[sec_id][1]
                    q_num = Decimal(str(rng.randint(5, 60)))
                    gross = _q2(q_num * px)
                    fee = Decimal("0.00")
                    net = gross
                    qty = f"{q_num:.6f}"
                    px_str = f"{px:.4f}"
                    desc = f"Buy {sec[1]} @ {px}"
                elif roll < 0.85:
                    txn_type = "SELL"
                    flow_cls = "INTERNAL_REALLOCATION"
                    sec = SECURITIES[rng.randint(0, 4)]
                    sec_id = sec[0]
                    px = sec_price_map[sec_id][1]
                    q_num = Decimal(str(rng.randint(3, 45)))
                    gross = _q2(q_num * px)
                    fee = Decimal("0.00")
                    net = gross
                    qty = f"{q_num:.6f}"
                    px_str = f"{px:.4f}"
                    desc = f"Sell {sec[1]} @ {px}"
                else:
                    txn_type = "FEE"
                    flow_cls = "FEE"
                    gross = _q2(Decimal(str(rng.randint(150, 1_200))) * scale)
                    fee = gross
                    net = -gross
                    sec_id, qty, px_str = "", "", ""
                    desc = "Quarterly Advisory Management Fee"

            if flow_cls == "EXTERNAL_INFLOW":
                ext_inflows += gross
                cash_bal += gross
            elif flow_cls == "EXTERNAL_OUTFLOW":
                ext_outflows += gross
                cash_bal -= gross
            elif flow_cls == "FEE":
                fees_total += gross
                cash_bal -= gross
            elif txn_type == "BUY":
                cash_bal -= gross
                sec_bal += gross
            elif txn_type == "SELL":
                cash_bal += gross
                sec_bal -= gross

            txn_id = f"TXN-{reporting_date.strftime('%Y%m%d')}-{txn_counter:06d}"
            txn_counter += 1

            ledger_transactions.append(
                {
                    "external_txn_id": txn_id,
                    "account_external_id": acct_id,
                    "trade_date": t_date.isoformat(),
                    "settlement_date": s_date.isoformat(),
                    "value_date": s_date.isoformat(),
                    "txn_type": txn_type,
                    "flow_classification": flow_cls,
                    "security_id": sec_id,
                    "quantity": qty,
                    "price": px_str,
                    "gross_amount": f"{gross:.4f}",
                    "fee_amount": f"{fee:.4f}",
                    "net_amount": f"{net:.4f}",
                    "currency": ccy if not sec_id else "USD",
                    "description": desc,
                }
            )

            # Mirror BUY/SELL in Trading System
            if txn_type in ("BUY", "SELL"):
                trade_id = f"TRD-{reporting_date.strftime('%Y%m%d')}-{trade_counter:06d}"
                trade_counter += 1
                trades.append(
                    {
                        "external_trade_id": trade_id,
                        "account_external_id": acct_id,
                        "trade_date": t_date.isoformat(),
                        "settlement_date": s_date.isoformat(),
                        "side": txn_type,
                        "security_id": sec_id,
                        "quantity": qty,
                        "price": px_str,
                        "gross_amount": f"{gross:.4f}",
                        "commission": "0.0000",
                        "currency": "USD",
                    }
                )

        # Deterministic market movement on securities
        mkt_move = _q2(sec_bal * Decimal(str(round(rng.uniform(-0.015, 0.032), 5))))
        sec_bal += mkt_move
        closing_total = opening_assets + ext_inflows - ext_outflows + mkt_move - fees_total
        # Keep cash + securities == closing_total exactly
        cash_bal = closing_total - sec_bal

        custody_balances.append(
            {
                "reporting_date": reporting_date.isoformat(),
                "account_external_id": acct_id,
                "opening_value": f"{opening_assets:.4f}",
                "cash_balance": f"{cash_bal:.4f}",
                "securities_value": f"{sec_bal:.4f}",
                "total_value": f"{closing_total:.4f}",
                "market_movement": f"{mkt_move:.4f}",
                "currency": ccy,
            }
        )

    # Calculate declared custody control total in USD
    custody_total_usd = sum(
        Decimal(r["total_value"]) * fx_map[r["currency"]] for r in custody_balances
    )
    ledger_total_usd = sum(
        Decimal(r["net_amount"]) * fx_map[r["currency"]] for r in ledger_transactions
    )

    manifest = {
        "institution": "Northbridge Wealth — Demonstration Environment (Synthetic)",
        "reporting_date": reporting_date.isoformat(),
        "reporting_currency": "USD",
        "seed": seed,
        "cut_off_time": "17:00:00 EST",
        "sources": {
            "custody_balances": {
                "file_name": "custody_balances.csv",
                "row_count": len(custody_balances),
                "declared_control_total_usd": f"{_q4(custody_total_usd):.4f}",
            },
            "ledger_transactions": {
                "file_name": "ledger_transactions.csv",
                "row_count": len(ledger_transactions),
                "declared_control_total_usd": f"{_q4(ledger_total_usd):.4f}",
            },
            "trades": {
                "file_name": "trades.json",
                "row_count": len(trades),
            },
            "crm_accounts": {
                "file_name": "crm_accounts.csv",
                "row_count": len(crm_accounts),
            },
            "market_prices": {
                "file_name": "market_prices.csv",
                "row_count": len(market_prices),
            },
            "fx_rates": {
                "file_name": "fx_rates.csv",
                "row_count": len(fx_rates),
            },
        },
    }

    return GeneratedDataset(
        reporting_date=reporting_date,
        seed=seed,
        advisors=advisors,
        clients=clients,
        accounts=accounts,
        fx_rates=fx_rates,
        market_prices=market_prices,
        crm_accounts=crm_accounts,
        custody_balances=custody_balances,
        ledger_transactions=ledger_transactions,
        trades=trades,
        manifest=manifest,
    )


def write_dataset_to_dir(dataset: GeneratedDataset, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "custody_balances.csv").write_text(to_csv_string(dataset.custody_balances), encoding="utf-8")
    (output_dir / "ledger_transactions.csv").write_text(to_csv_string(dataset.ledger_transactions), encoding="utf-8")
    (output_dir / "crm_accounts.csv").write_text(to_csv_string(dataset.crm_accounts), encoding="utf-8")
    (output_dir / "market_prices.csv").write_text(to_csv_string(dataset.market_prices), encoding="utf-8")
    (output_dir / "fx_rates.csv").write_text(to_csv_string(dataset.fx_rates), encoding="utf-8")
    (output_dir / "trades.json").write_text(json.dumps(dataset.trades, indent=2), encoding="utf-8")
    (output_dir / "source_manifest.json").write_text(json.dumps(dataset.manifest, indent=2), encoding="utf-8")


if __name__ == "__main__":
    ds = generate_northbridge_dataset()
    out = Path(__file__).resolve().parent.parent / "generated" / "2026-10-30"
    write_dataset_to_dir(ds, out)
    print(f"Generated synthetic dataset at {out} ({len(ds.accounts)} accounts, {len(ds.ledger_transactions)} txns)")
