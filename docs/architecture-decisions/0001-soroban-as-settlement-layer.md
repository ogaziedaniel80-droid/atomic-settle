# ADR-0001: Use Soroban / Stellar as the settlement layer

**Date:** 2026-07-11  
**Status:** Accepted  
**Deciders:** initial maintainers

---

## Context

We need a programmable settlement layer that can enforce atomicity across two asset transfers (a cash leg and an asset leg) in a single transaction, with sub-10-second finality, at a cost structure that makes per-trade on-chain settlement viable.

Candidates evaluated:

| Platform | Notes |
|---|---|
| Ethereum / EVM L2s | Mature tooling, large developer pool. Gas volatility on L1 is a problem for fee predictability; L2 bridge trust assumptions complicate the "one transaction" atomicity guarantee. |
| Hyperledger Fabric / Besu (permissioned) | True atomicity, predictable costs. Requires a consortium to operate a validator set — bootstrapping cost is high and creates a centralisation dependency. |
| Stellar / Soroban | Native atomicity (full revert semantics), sub-5s finality, low predictable fees, existing live regulated anchor network (stablecoins, tokenised MMFs), SEP-8 regulated asset standard for issuer-enforced compliance at the token layer. |

## Decision

Use Soroban (Stellar's smart contract platform) as the on-chain settlement layer.

## Consequences

**Positive:**
- Transaction atomicity is a runtime guarantee, not an application-level engineering problem to solve.
- An existing live anchor/regulated-asset ecosystem means we can target real institutional instruments without first building the asset issuance layer.
- Predictable, low fees make per-trade on-chain settlement economically viable from the first trade.
- SEP-8 provides a second compliance gate at the asset layer, independent of our contract code.

**Negative / trade-offs:**
- Soroban's developer ecosystem is smaller than EVM's — fewer auditors, fewer open-source reference implementations to draw from.
- `wasm32v1-none` target and SDK versioning constraints (e.g. the ed25519-dalek pin) add some setup friction.
- Cross-contract calls (used by `settle()` to invoke the compliance gate) introduce an external dependency that must fail-closed — auditors must verify this explicitly.
