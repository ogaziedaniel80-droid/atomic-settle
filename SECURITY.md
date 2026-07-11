# Security policy

## Scope

This policy covers security vulnerabilities in:

- `contracts/settlement-escrow` — the core atomic swap / escrow contract
- `contracts/compliance-gate` — the on-chain compliance oracle
- `orchestrator/` — the NestJS off-chain service
- `ops-dashboard/` — the Angular operator dashboard
- `scripts/` — deployment scripts

Out of scope: third-party dependencies (report those to the relevant upstream project), the Stellar/Soroban protocol itself, or infrastructure not part of this repository.

---

## Audit status

**This project has not yet undergone an external security audit.**

The `settlement-escrow` and `compliance-gate` contracts are deployed on Stellar testnet for development and review purposes only. Do not use these contracts to settle real institutional assets prior to a completed audit engagement. See the [Roadmap](./README.md#roadmap).

Known areas that require audit attention before mainnet deployment:

- Reentrancy analysis of `settle()` — Soroban's execution model mitigates classic reentrancy, but the interaction between `compliance-gate` cross-contract calls and state updates warrants explicit review.
- Storage growth and key collision analysis for the shared-instance deployment model.
- Orchestrator key management — the service currently holds a Stellar secret key in an environment variable; a production deployment requires integration with a KMS or HSM.

---

## Reporting a vulnerability

**Do not open a public GitHub issue for a security vulnerability.**

Please report security issues by emailing **security@your-org.example.com**.

Include in your report:

1. A description of the vulnerability and its potential impact
2. The affected component and version/commit
3. Step-by-step reproduction instructions
4. Any proof-of-concept code or transaction hashes (testnet only, please)

You will receive an acknowledgement within **2 business days** and a substantive response within **7 business days**.

---

## Disclosure process

1. You report the vulnerability privately.
2. We confirm receipt and begin investigation.
3. We agree on a disclosure timeline — typically 90 days from the initial report, or sooner if a fix is ready and deployed.
4. We publish a security advisory and credit the reporter (unless they prefer to remain anonymous) at the time of disclosure.

We will not take legal action against researchers who act in good faith under this policy.

---

## Severity classification

We use [CVSS v3.1](https://www.first.org/cvss/v3.1/specification-document) to score vulnerabilities and prioritise fixes:

| Severity | CVSS score | Target fix timeline |
|---|---|---|
| Critical | 9.0 – 10.0 | 24 hours |
| High | 7.0 – 8.9 | 7 days |
| Medium | 4.0 – 6.9 | 30 days |
| Low | 0.1 – 3.9 | Next release |

For vulnerabilities in deployed testnet contracts, we will redeploy patched contracts and update the addresses in the README.

---

## Bug bounty

There is no formal bug bounty programme at this stage. Reporters of significant vulnerabilities will be acknowledged in the security advisory and in the project's contributors list.
