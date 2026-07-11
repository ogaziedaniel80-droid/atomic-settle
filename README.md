# atomic-settle

An atomic DvP settlement protocol on Soroban

A programmable delivery-versus-payment (DvP) settlement layer for institutional assets, built on Stellar's Soroban smart contract platform. Two counterparties lock a cash leg and an asset leg into a single contract; the contract releases both simultaneously, atomically, and only if compliance conditions are met — or reverts both to their original owners. There is no window in which one leg has moved and the other hasn't.

---

## Table of contents

1. [Problem statement](#problem-statement)
2. [Why Soroban / Stellar](#why-soroban--stellar)
3. [System architecture](#system-architecture)
4. [Core concept: atomic swap mechanics](#core-concept-atomic-swap-mechanics)
5. [Contract design](#contract-design)
6. [Trade lifecycle & state machine](#trade-lifecycle--state-machine)
7. [Compliance layer](#compliance-layer)
8. [Contract interface reference](#contract-interface-reference)
9. [Data model](#data-model)
10. [Security model](#security-model)
11. [Failure modes & recovery](#failure-modes--recovery)
12. [Repository structure](#repository-structure)
13. [Local development setup](#local-development-setup)
14. [Testing strategy](#testing-strategy)
15. [Testnet deployment](#testnet-deployment)
16. [Deployment](#deployment)
17. [Off-chain services (NestJS)](#off-chain-services-nestjs)
18. [Operations dashboard (Angular)](#operations-dashboard-angular)
19. [Roadmap](#roadmap)
20. [Glossary](#glossary)
21. [License](#license)

---

## Problem statement

Institutional settlement today runs on infrastructure that separates the cash leg and the asset leg of a trade into two distinct operations, cleared through different systems, on different timelines:

- **Correspondent banking** requires pre-funded nostro/vostro accounts and settles cross-border payments in T+1 to T+2, with multiple intermediary banks each adding cost and latency.
- **Securities settlement** (bonds, fund shares, repo) is not truly atomic in most markets — cash moves through one rail (RTGS, ACH, SWIFT), the asset moves through another (a central securities depository), and the gap between the two creates genuine counterparty and settlement risk. This is precisely the risk DvP standards were designed to eliminate, and most implementations still fall short of true atomicity.
- **FX and interbank netting** between institutions in different jurisdictions is largely manual, batch-based, and opaque to the counterparties involved.

This project removes the gap entirely: both legs of a trade are held in a single smart contract and released in a single atomic transaction. If either leg fails to meet its condition — funds not locked, compliance not cleared, expiry reached — neither leg moves.

## Why Soroban / Stellar

- **Native atomicity.** A Soroban transaction either fully executes or fully reverts. There is no partial-execution state to reason about — the same guarantee that traditional DvP infrastructure spends enormous engineering effort trying to approximate across two separate systems.
- **Sub-5-second finality.** Settlement finality on this timescale collapses T+1/T+2 into effectively T+0.
- **Programmable compliance at the asset layer.** SEP-8 (regulated assets) supports issuer-enforced transfer approval, whitelisting, and clawback. Soroban contracts extend this with arbitrary custom logic — netting, multi-party sign-off, time-boxed settlement windows.
- **An existing, live anchor network.** Stellar already has regulated on/off ramps and real institutional issuance (tokenized money market funds, regulated stablecoins) in production. This project builds on existing rails rather than requiring a closed permissioned network and a consortium of banks to bootstrap.
- **Low, predictable fees.** Settlement economics don't get dominated by gas volatility the way they would on a general-purpose L1.

## System architecture

The system has three layers: an on-chain settlement layer (Soroban), an off-chain orchestration layer (NestJS), and an operator-facing layer (Angular).

```
┌──────────────────────────────────────────────────────────────────┐
│                        Angular ops dashboard                     │
│   Instruction monitoring · exception handling · audit trail      │
└───────────────────────────────┬────────────────────────────────┘
                                 │ REST / WebSocket
┌───────────────────────────────▼────────────────────────────────┐
│                       NestJS orchestration layer                 │
│  Instruction matching · KYC/AML integration · anchor (SEP-24/31) │
│  integration · compliance oracle · event listeners · reporting   │
└───────────────────────────────┬────────────────────────────────┘
                                 │ Soroban RPC (Stellar SDK)
┌───────────────────────────────▼────────────────────────────────┐
│                         Soroban contracts                        │
│  ┌───────────────┐  ┌────────────────────┐  ┌────────────────┐  │
│  │  Escrow /     │  │  Compliance hook   │  │  Netting /     │  │
│  │  atomic swap  │◄─┤  (SEP-8 gated      │  │  batch engine  │  │
│  │  contract     │  │  transfer checks)  │  │  (multi-leg)   │  │
│  └───────────────┘  └────────────────────┘  └────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

Institutions never interact with the chain directly — they submit signed instructions to the NestJS layer, which builds and submits the Soroban transactions, watches for settlement events, and surfaces state to the ops dashboard.

## Core concept: atomic swap mechanics

The escrow contract is a two-party conditional vault:

1. **Institution A** deposits the cash leg (a SEP-41 token, e.g. a regulated stablecoin or tokenized deposit) into the contract, specifying the trade terms.
2. **Institution B** deposits the asset leg (a SEP-41 token representing a bond, fund share, or other instrument) into the same contract instance, referencing the same trade ID.
3. Once both legs are locked, the contract checks the **compliance hook** — an on-chain call to a whitelisted oracle contract that confirms both counterparties are cleared to receive the respective assets (KYC status, transfer limits, jurisdictional restrictions).
4. If compliance passes and neither party has cancelled, **`settle()`** executes: the cash leg transfers to Institution B and the asset leg transfers to Institution A in the same transaction. Both transfers succeed or the entire transaction reverts — Soroban's execution model makes partial settlement impossible by construction.
5. If compliance fails, the expiry ledger is reached, or either party invokes a valid cancellation before both legs are locked, **`refund()`** returns each leg to its original depositor.

There is no intermediate state where one party has given up their asset without receiving the other. This is the entire value proposition condensed into one guarantee.

## Contract design

The protocol is split into three Soroban contracts, each independently auditable:

### 1. `settlement-escrow`
The core atomic swap contract. Holds locked balances, enforces the state machine, and executes the atomic transfer. One contract instance is deployed (or one trade record is created within a shared instance, depending on deployment model — see [Deployment](#deployment)) per trade.

### 2. `compliance-gate`
A thin contract implementing a standard interface (`check(address, asset, amount) -> bool`) that the escrow contract calls before settlement. This is deliberately decoupled from the escrow logic so compliance rules can be upgraded, jurisdiction-specific variants deployed, or a different provider's oracle substituted without touching the settlement contract itself.

### 3. `netting-engine` (phase 2)
An optional batching layer that accepts multiple bilateral trade legs, computes net obligations across more than two parties, and submits the resulting reduced set of transfers to `settlement-escrow` instances. This is where multilateral netting economics — the actual reason large institutions care about netting infrastructure — gets realized.

## Trade lifecycle & state machine

```
      init_trade()
           │
           ▼
      ┌─────────┐
      │ Created │
      └────┬────┘
           │ lock_cash_leg() / lock_asset_leg()
           │ (either order, either party)
           ▼
    ┌─────────────────┐
    │ PartiallyLocked │──────────┐
    └────────┬────────┘          │ expiry_ledger reached
             │ other leg locked  │ OR cancel() by depositing party
             ▼                   ▼
      ┌─────────────┐      ┌───────────┐
      │ BothLocked  │      │ Refunding │
      └──────┬──────┘      └─────┬─────┘
             │ settle()          │ refund()
             │ (calls            ▼
             │  compliance-gate) ┌──────────┐
             ▼                   │ Refunded │
    ┌─────────────────┐          └──────────┘
    │ compliance pass?│
    └───┬─────────┬───┘
        │ yes      │ no
        ▼          ▼
   ┌─────────┐  ┌───────────┐
   │ Settled │  │ Refunding │
   └─────────┘  └───────────┘
```

Every state transition emits a Soroban event consumed by the NestJS event listener, which updates the ops dashboard in real time and drives downstream reporting.

## Compliance layer

Compliance is enforced at two points, not one, to avoid a single point of failure:

- **Asset-level (SEP-8):** the token contracts themselves reject transfers to non-whitelisted addresses. Even if the escrow contract's logic had a bug, the underlying regulated asset would refuse the transfer.
- **Contract-level (`compliance-gate`):** before `settle()` executes, the escrow contract makes a cross-contract call to the compliance gate, which can check conditions beyond simple whitelisting — aggregate exposure limits, time-of-day trading windows, sanctions list status, jurisdiction-pair restrictions.

This double-gate design means compliance logic can evolve (new jurisdictions, new rule types) by upgrading or redeploying `compliance-gate` without touching the escrow contract or re-auditing the core atomic swap logic.

## Contract interface reference

### `settlement-escrow`

| Function | Caller | Description |
|---|---|---|
| `init_trade(trade_id, party_a, party_b, cash_token, cash_amount, asset_token, asset_amount, compliance_gate, expiry_ledger)` | Either party or orchestrator | Registers trade terms. No funds move yet. |
| `lock_cash_leg(trade_id)` | Party A | Transfers `cash_amount` of `cash_token` from party A into the contract. Requires `party_a.require_auth()`. |
| `lock_asset_leg(trade_id)` | Party B | Transfers `asset_amount` of `asset_token` from party B into the contract. Requires `party_b.require_auth()`. |
| `settle(trade_id)` | Either party or orchestrator (permissionless once both legs locked) | Calls `compliance-gate.check()` for both legs; on success, executes both transfers atomically and marks `Settled`. Reverts entirely on compliance failure. |
| `cancel(trade_id)` | The depositing party, only before the other leg is locked | Withdraws a single locked leg back to its depositor. |
| `refund(trade_id)` | Anyone, only after `expiry_ledger` | Returns any locked legs to their original depositors. Callable by anyone to guarantee funds are never stuck waiting on a specific party's cooperation. |
| `get_trade(trade_id)` | Anyone (read-only) | Returns current trade state and terms. |

### `compliance-gate`

| Function | Caller | Description |
|---|---|---|
| `check(party, asset, amount) -> bool` | `settlement-escrow` (cross-contract call) | Returns whether the party is cleared to receive the given asset and amount under current rules. |
| `set_rule(jurisdiction_pair, rule_config)` | Contract admin | Updates compliance parameters for a given pair of jurisdictions. |
| `add_to_whitelist(party, asset_class)` / `remove_from_whitelist(...)` | Contract admin | Manages the underlying whitelist backing `check()`. |

## Data model

```rust
#[contracttype]
pub struct Trade {
    pub trade_id: BytesN<32>,
    pub party_a: Address,
    pub party_b: Address,
    pub cash_token: Address,
    pub cash_amount: i128,
    pub asset_token: Address,
    pub asset_amount: i128,
    pub compliance_gate: Address,
    pub expiry_ledger: u32,
    pub state: TradeState,
}

#[contracttype]
pub enum TradeState {
    Created,
    PartiallyLocked,
    BothLocked,
    Settled,
    Refunding,
    Refunded,
}
```

Trade records are stored in persistent contract storage keyed by `trade_id`, generated by the orchestration layer as a hash of the trade terms plus a nonce to prevent collisions.

## Security model

- **No custodial keys held by the protocol.** All transfers are executed via SEP-41 `transfer`/`transfer_from` calls authorized by the depositing party's own signature (`require_auth`) — the contract never holds an operator key capable of moving funds independently.
- **Atomicity is enforced by the Soroban runtime, not application logic.** The `settle()` function's transfers happen within a single host function invocation; there is no code path where one transfer can succeed and the other be skipped due to an exception, since a panic anywhere in the call reverts the entire transaction.
- **Permissionless settlement and refund.** Neither `settle()` nor `refund()` require a specific caller once their preconditions are met — this prevents a counterparty from stalling settlement, or from blocking a refund after expiry, by simply refusing to submit a transaction.
- **Compliance gate is pluggable but not bypassable.** `settle()` hard-fails if the cross-contract call to `compliance-gate` returns `false` or panics — there is no fallback path that settles without a compliance check.
- **Reentrancy.** Soroban's execution model and this contract's design (state transition happens before external calls where possible, and the compliance check is read-only by interface contract) mitigate classic reentrancy patterns, but this remains a priority item for external audit before mainnet deployment with real funds — see [Roadmap](#roadmap).

This project has **not yet undergone external audit.** Do not deploy to mainnet with real institutional funds prior to a completed audit engagement.

## Failure modes & recovery

| Scenario | Outcome |
|---|---|
| Only one party locks their leg, other never does | `refund()` callable by anyone after `expiry_ledger`, returning the single locked leg |
| Both legs locked, compliance check fails | `settle()` call reverts; trade moves to `Refunding`, both legs returned via `refund()` |
| One party attempts to cancel after both legs are locked | Rejected — `cancel()` is only valid in `PartiallyLocked` state, preventing a party from unilaterally exiting once the counterparty has committed |
| Compliance gate contract itself is unreachable or errors | `settle()` reverts (fail-closed, not fail-open) — funds remain locked until compliance is restored or `expiry_ledger` triggers a refund |
| Duplicate `trade_id` submitted | `init_trade()` rejects if the trade ID already exists in storage |

## Repository structure

```
.
├── contracts/
│   ├── settlement-escrow/
│   │   ├── src/lib.rs
│   │   ├── src/test.rs
│   │   └── Cargo.toml
│   ├── compliance-gate/
│   │   ├── src/lib.rs
│   │   ├── src/test.rs
│   │   └── Cargo.toml
│   └── netting-engine/          # phase 2
├── orchestrator/                 # NestJS service
│   ├── src/
│   │   ├── trades/               # trade instruction intake, matching
│   │   ├── compliance/           # KYC/AML provider integration
│   │   ├── anchors/              # SEP-24 / SEP-31 fiat rail integration
│   │   ├── events/               # Soroban event listener → DB → WS
│   │   └── reporting/            # regulatory / audit export
│   └── package.json
├── ops-dashboard/                 # Angular application
│   └── src/app/
│       ├── instructions/
│       ├── exceptions/
│       └── audit-trail/
├── scripts/
│   ├── deploy-testnet.sh
│   └── deploy-mainnet.sh
└── docs/
    └── architecture-decisions/
```

## Local development setup

**Prerequisites:**
- Rust toolchain ≥ 1.91 with `wasm32v1-none` target (required by soroban-sdk 27 — note: `wasm32-unknown-unknown` is no longer supported from Rust 1.82+)
- [stellar CLI v27+](https://github.com/stellar/stellar-cli/releases/tag/v27.0.0)
- Node.js 20+
- Docker (for local Stellar network)

```bash
# Install Rust and the correct wasm target
rustup target add wasm32v1-none

# Install stellar CLI (download pre-built binary — building from source is slow)
# Linux x86_64:
curl -fsSL -o stellar.tar.gz \
  https://github.com/stellar/stellar-cli/releases/download/v27.0.0/stellar-cli-27.0.0-x86_64-unknown-linux-gnu.tar.gz
tar xzf stellar.tar.gz && sudo mv stellar /usr/local/bin/

# Apply the ed25519-dalek pin (soroban-env-host 27 / rand_core version split)
# Already committed to Cargo.lock — run this if you reset the lockfile:
cd contracts/settlement-escrow && cargo update "ed25519-dalek@3.0.0" --precise 2.2.0
cd ../compliance-gate && cargo update "ed25519-dalek@3.0.0" --precise 2.2.0

# Build contracts
cd contracts/settlement-escrow
cargo build --target wasm32v1-none --release

# Run contract unit tests
cargo test

# Run a local Stellar network for development
stellar network start local

# Deploy to local network
stellar contract deploy \
  --wasm target/wasm32v1-none/release/settlement_escrow.wasm \
  --network local

# Start orchestrator (NestJS)
cd ../../orchestrator
npm install
npm run start:dev

# Start ops dashboard (Angular)
cd ../ops-dashboard
npm install
npm run start
```

## Testing strategy

- **Contract unit tests** (`cargo test`, Soroban's native test environment): cover every state transition, every failure mode in the table above, and boundary conditions (exact-expiry-ledger settlement attempts, zero-amount trades, duplicate trade IDs).
- **Property-based tests**: fuzz trade parameter combinations to assert the invariant "no state exists where exactly one leg has moved" holds under arbitrary sequences of calls.
- **Integration tests**: full trade lifecycle against a local Soroban network, including the compliance-gate cross-contract call path and simulated compliance failures.
- **Orchestrator tests**: NestJS unit and e2e tests for instruction matching, event listener correctness (no missed or duplicated settlement events), and anchor integration mocks.
- **Testnet dry runs**: before any mainnet deployment, run a full trade cycle on Stellar testnet with test institutional counterparties to validate end-to-end behavior under real network conditions (latency, fee estimation, ledger close timing).

## Testnet deployment

### Deployed contracts (Stellar Testnet — Protocol 27, deployed 2026-07-11)

| Contract | Address |
|---|---|
| `compliance-gate` | `CCZNLLABH3K6KU2OACOD3OZ2TOF2O24OBEKGHJYXDP24XOZBEGO656QH` |
| `settlement-escrow` | `CAI5Q5MXCSI3IBMLSNFDPNX2QZMPXJBOAPEZ44DX6235CRUEDXSPD7ZG` |
| Deployer | `GDMT7L7N5HQHG73QVYZOB5DIWF7OPI5KQTAAQXEK5XWXIKOVQTGF5VGA` |

Explorer links:
- [compliance-gate on stellar.expert](https://stellar.expert/explorer/testnet/contract/CCZNLLABH3K6KU2OACOD3OZ2TOF2O24OBEKGHJYXDP24XOZBEGO656QH)
- [settlement-escrow on stellar.expert](https://stellar.expert/explorer/testnet/contract/CAI5Q5MXCSI3IBMLSNFDPNX2QZMPXJBOAPEZ44DX6235CRUEDXSPD7ZG)

### Deploy your own instance

```bash
# One-command deploy (generates and funds a deployer key automatically):
./scripts/deploy-testnet.sh

# Reuse an existing stellar key:
./scripts/deploy-testnet.sh --account my-key-name
```

The script builds both WASM artifacts, deploys them, and writes `orchestrator/.env.testnet` with all connection details.

### Configure the orchestrator

```bash
cd orchestrator
cp ../.env.testnet .env   # or .env.testnet if you prefer
npm install
npm run start:dev
```

### Interact with the deployed contracts directly

```bash
# Check whitelist status (read-only)
stellar contract invoke \
  --id CCZNLLABH3K6KU2OACOD3OZ2TOF2O24OBEKGHJYXDP24XOZBEGO656QH \
  --source <your-key> --network testnet \
  -- check --party <ADDRESS> --asset <TOKEN_CONTRACT> --amount 1000

# Whitelist a party for an asset (admin only)
stellar contract invoke \
  --id CCZNLLABH3K6KU2OACOD3OZ2TOF2O24OBEKGHJYXDP24XOZBEGO656QH \
  --source <deployer-key> --network testnet --send=yes \
  -- add_to_whitelist --party <ADDRESS> --asset <TOKEN_CONTRACT>

# Create a trade
stellar contract invoke \
  --id CAI5Q5MXCSI3IBMLSNFDPNX2QZMPXJBOAPEZ44DX6235CRUEDXSPD7ZG \
  --source <your-key> --network testnet --send=yes \
  -- init_trade \
  --trade_id <32_BYTE_HEX> \
  --party_a <ADDRESS_A> --party_b <ADDRESS_B> \
  --cash_token <CASH_TOKEN_CONTRACT> --cash_amount 1000000 \
  --asset_token <ASSET_TOKEN_CONTRACT> --asset_amount 1000 \
  --compliance_gate CCZNLLABH3K6KU2OACOD3OZ2TOF2O24OBEKGHJYXDP24XOZBEGO656QH \
  --expiry_ledger <FUTURE_LEDGER>

# Query trade state
stellar contract invoke \
  --id CAI5Q5MXCSI3IBMLSNFDPNX2QZMPXJBOAPEZ44DX6235CRUEDXSPD7ZG \
  --source <your-key> --network testnet \
  -- get_trade --trade_id <32_BYTE_HEX>
```

## Deployment

Two deployment models are supported, and the choice affects gas economics and isolation guarantees:

1. **Per-trade contract instances** — maximum isolation, simpler auditing per trade, higher deployment overhead per trade.
2. **Shared instance with trade records keyed by `trade_id`** — lower overhead, recommended for production once the contract has been audited and the storage-keyed model has been stress-tested for state collisions and storage growth.

Start on testnet with per-trade instances for clarity during audit; migrate to the shared-instance model post-audit for production economics.

```bash
# Testnet
./scripts/deploy-testnet.sh

# Mainnet (requires signed-off audit report and multisig admin key setup)
./scripts/deploy-mainnet.sh
```

## Off-chain services (NestJS)

The orchestrator does not hold custody of funds or have unilateral settlement authority — it exists to make the on-chain protocol usable by institutions that don't want to build their own Soroban integration:

- **Trade intake & matching**: institutions submit trade instructions via API; the orchestrator matches counterparty instructions before constructing the `init_trade()` transaction.
- **KYC/AML integration**: pluggable provider interface feeding the `compliance-gate` contract's whitelist and rule configuration.
- **Anchor integration (SEP-24/31)**: bridges fiat on/off ramps to the cash leg token, so institutions can fund and withdraw in fiat without separately managing on-chain asset custody.
- **Event listener**: subscribes to Soroban contract events, persists trade state changes, and pushes real-time updates to the ops dashboard via WebSocket.
- **Regulatory reporting**: exports settlement records in formats required by relevant reporting regimes (to be scoped per target jurisdiction).

## Operations dashboard (Angular)

- **Instruction monitoring**: live view of trades in each state of the lifecycle, with filtering by counterparty, asset, and status.
- **Exception handling**: surfaces compliance failures, near-expiry unsettled trades, and stuck states requiring manual intervention (e.g. manually triggering `refund()` on behalf of a counterparty).
- **Audit trail**: immutable, timestamped log of every state transition per trade, cross-referenced against the on-chain event log for reconciliation.

## Roadmap

- [x] Contract unit tests: full state machine coverage (13 tests, 8 escrow + 5 compliance-gate)
- [x] Testnet deployment (Protocol 27, both contracts live — see [Testnet deployment](#testnet-deployment))
- [ ] Testnet deployment with a single design-partner counterparty pair (real tokens)
- [ ] External security audit of `settlement-escrow` and `compliance-gate`
- [ ] Netting engine (multi-party net settlement)
- [ ] Multi-currency path-payment integration for cross-currency DvP
- [ ] Mainnet deployment with a narrow instrument wedge (single asset class, single design partner)
- [ ] Regulatory reporting module scoped to first target jurisdiction

## Glossary

- **DvP (Delivery versus Payment)**: a settlement mechanism ensuring the transfer of an asset only occurs if the corresponding payment transfer occurs, eliminating principal risk.
- **SEP-8**: Stellar Ecosystem Proposal defining the regulated assets standard, allowing issuers to enforce transfer approval logic.
- **SEP-41**: Stellar Ecosystem Proposal defining the standard token interface used by Soroban contracts.
- **SEP-24 / SEP-31**: Stellar Ecosystem Proposals defining interactive and direct anchor interfaces for fiat on/off ramps.
- **Anchor**: a regulated entity that issues Stellar-network representations of off-chain assets (fiat, securities) and provides on/off ramps.
- **Atomic swap**: an exchange of two assets that either both complete or both fail, with no intermediate partial state.

## License

MIT — see [`LICENSE`](./LICENSE).
