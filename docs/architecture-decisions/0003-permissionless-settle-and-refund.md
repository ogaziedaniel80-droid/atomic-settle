# ADR-0003: Permissionless settle() and refund()

**Date:** 2026-07-11  
**Status:** Accepted  
**Deciders:** initial maintainers

---

## Context

A common attack or failure mode in two-party escrow protocols is one party refusing to submit the settlement transaction once they determine the outcome will be unfavourable, or simply going offline. If `settle()` could only be called by a specific party, a non-cooperative counterparty could stall settlement indefinitely. Similarly, if `refund()` required the cooperation of a party who has gone offline or is acting maliciously, locked funds could be permanently inaccessible.

## Decision

Both `settle()` and `refund()` are permissionless once their preconditions are met:

- `settle()` can be called by anyone once both legs are locked. It calls the compliance gate and executes atomically — the caller gains no advantage from this (they cannot influence the outcome, only trigger it).
- `refund()` can be called by anyone once the `expiry_ledger` is reached or the trade is in the `Refunding` state.

`lock_cash_leg()`, `lock_asset_leg()`, and `cancel()` remain authenticated operations (`require_auth()`) because they involve moving funds on behalf of a specific party.

## Consequences

**Positive:**
- Neither counterparty can stall settlement or block a post-expiry refund by refusing to act.
- The orchestrator can call `settle()` on behalf of both parties as a convenience without needing a special privilege — it is just any caller.
- Funds cannot be permanently locked due to a party going offline.

**Negative / trade-offs:**
- A third party (e.g. a miner/validator) could race to call `settle()` or `refund()` at a strategically chosen time. For `settle()` this is harmless — the outcome is fully determined by the contract state and compliance gate. For `refund()` post-expiry, it means a party cannot prevent refund once the ledger is reached, which is intentional.
- There is a theoretical MEV-style concern around the timing of `settle()` vs expiry — if a trade expires at the same ledger it becomes settleable, the race between `settle()` and `refund()` callers is resolved by Soroban's transaction ordering within the ledger. This edge case should be documented in testnet dry-run results.
