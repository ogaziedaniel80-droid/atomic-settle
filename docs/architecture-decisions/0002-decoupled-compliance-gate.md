# ADR-0002: Decouple compliance logic into a separate contract

**Date:** 2026-07-11  
**Status:** Accepted  
**Deciders:** initial maintainers

---

## Context

Compliance rules for institutional asset settlement evolve continuously — new jurisdictions, updated sanctions lists, exposure limit changes, time-of-day trading restrictions. Embedding compliance logic directly inside `settlement-escrow` would require upgrading or redeploying the core settlement contract every time a rule changes. That increases audit surface, redeployment risk, and operational friction.

## Decision

Implement compliance as a separate `compliance-gate` contract that exposes a single interface (`check(party, asset, amount) -> bool`). The `settlement-escrow` contract calls this interface via a cross-contract call during `settle()`. The address of the compliance gate is set per-trade at `init_trade()` time.

## Consequences

**Positive:**
- Compliance rules can be upgraded or swapped (e.g. different gate per jurisdiction) without touching or re-auditing `settlement-escrow`.
- The compliance interface is small and auditable independently.
- A compliance failure in `settle()` is fail-closed: the call to the gate either returns `false` or panics, and in either case the entire `settle()` transaction reverts. There is no code path that settles without a passing compliance check.
- Multiple compliance gate implementations can coexist on-chain; the trade creator selects the appropriate one.

**Negative / trade-offs:**
- Cross-contract calls introduce an external execution dependency inside `settle()`. If the gate contract is broken, upgraded to a buggy version, or its storage becomes corrupted, `settle()` will revert until the gate is fixed — trades remain locked until expiry.
- The gate address is set at `init_trade()` and is not changeable afterwards. A compliance gate that is decommissioned mid-trade will block settlement permanently (mitigated by the `expiry_ledger` refund path).
- Reentrancy across the `settlement-escrow` → `compliance-gate` call boundary must be explicitly verified during audit.
