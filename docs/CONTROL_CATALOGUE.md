# VelaTrace — Financial Control Catalogue

16 registered controls configured via [rules.yaml](file:///Users/shaaunak/Downloads/reconIQ/backend/app/controls/rules.yaml):

| Rule ID | Name | Family | Severity | Blocking | Waivable |
|---|---|---|---|---|---|
| `CTL-COMP-001` | Required Source Files Present | Completeness | CRITICAL | Yes | No |
| `CTL-COMP-002` | Non-Empty Source Feed | Completeness | CRITICAL | Yes | No |
| `CTL-COMP-003` | Manifest Row Count & Control Total Match | Completeness | CRITICAL | Yes | No |
| `CTL-UNIQ-001` | Duplicate External Transaction ID | Uniqueness | CRITICAL | Yes | No |
| `CTL-UNIQ-002` | Suspicious Duplicate Business Key | Uniqueness | MEDIUM | No | Yes |
| `CTL-REF-001` | Valid Canonical Account Reference | Referential Integrity | CRITICAL | Yes | No |
| `CTL-REF-002` | Valid Advisor Assignment | Referential Integrity | HIGH | Yes | No |
| `CTL-REF-003` | FX Rate Coverage for Reporting Currency | Referential Integrity | CRITICAL | Yes | No |
| `CTL-REF-004` | Market Price Coverage for Traded Securities | Referential Integrity | HIGH | Yes | Yes |
| `CTL-BAL-001` | Account Balance Roll-Forward Continuity | Balance Continuity | CRITICAL | Yes | No |
| `CTL-XSYS-001` | Cross-System Custody vs Calculated Mart Total | Cross-System Reconciliation | CRITICAL | Yes | No |
| `CTL-XSYS-002` | Trading System vs Ledger Trade Settlement Match | Cross-System Reconciliation | HIGH | No | Yes |
| `CTL-RSN-001` | Thousand-Times Amount Scaling Anomaly | Reasonableness | CRITICAL | Yes | Yes |
| `CTL-RSN-002` | Transaction Sign Convention Check | Reasonableness | CRITICAL | Yes | No |
| `CTL-RSN-003` | Backdated Transaction Cut-Off Check | Reasonableness | MEDIUM | No | Yes |
| `CTL-STR-001` | Source Schema & Transaction Category Integrity | Structural Controls | CRITICAL | Yes | No |
