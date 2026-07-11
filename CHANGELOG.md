# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> **Note:** Versions before 1.0.0 do not carry stability guarantees. Contract interfaces may change between minor versions until the first external audit is complete.

---

## [Unreleased]

### Added
- Contributor infrastructure: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, `CHANGELOG.md`
- `.env.example` for the orchestrator documenting all required environment variables
- GitHub Actions CI workflows for contracts (Rust), orchestrator (NestJS), and ops dashboard (Angular)
- GitHub issue templates (bug report, feature request) and pull request template
- Architecture decision records (ADRs) in `docs/architecture-decisions/`
- `scripts/deploy-mainnet.sh` stub with pre-flight checklist
- Workspace-level `Cargo.toml` for building all contracts from the repository root

---

## [0.2.0] — 2026-07-11

### Added
- NestJS orchestrator: trade intake, matching, Soroban event listener, WebSocket push to dashboard
- Angular ops dashboard: instruction monitoring, exception handling, audit trail views
- `scripts/deploy-testnet.sh`: one-command testnet deployment with automatic key generation
- Testnet deployment on Stellar Protocol 27 (contract addresses in README)

### Changed
- `settlement-escrow`: `cancel()` now validates that the caller is the depositing party for the locked leg
- `compliance-gate`: constructor uses `__constructor` pattern required by Soroban SDK 27

---

## [0.1.0] — 2026-07-11

### Added
- `settlement-escrow` Soroban contract: `init_trade`, `lock_cash_leg`, `lock_asset_leg`, `settle`, `cancel`, `refund`, `get_trade`
- `compliance-gate` Soroban contract: `check`, `add_to_whitelist`, `remove_from_whitelist`, `set_rule`, `get_rule`
- Full state machine: Created → PartiallyLocked → BothLocked → Settled / Refunding → Refunded
- 13 contract unit tests (8 escrow + 5 compliance-gate) covering all state transitions and failure modes
- README with architecture overview, interface reference, data model, security model, and local setup guide

[Unreleased]: https://github.com/your-org/atomic-settle/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/your-org/atomic-settle/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/your-org/atomic-settle/releases/tag/v0.1.0
