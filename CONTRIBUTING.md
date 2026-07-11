# Contributing to atomic-settle

Thank you for your interest in contributing. This document covers everything you need to go from a fresh clone to an open pull request.

---

## Table of contents

1. [Prerequisites](#prerequisites)
2. [Local development setup](#local-development-setup)
3. [Project structure](#project-structure)
4. [Running the tests](#running-the-tests)
5. [Coding conventions](#coding-conventions)
6. [Commit messages](#commit-messages)
7. [Pull request process](#pull-request-process)
8. [Reporting bugs and requesting features](#reporting-bugs-and-requesting-features)
9. [Security issues](#security-issues)

---

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Rust | ≥ 1.91 | `rustup target add wasm32v1-none` after install |
| stellar CLI | ≥ 27 | Download pre-built binary — building from source is slow |
| Node.js | 20 LTS | |
| Docker | any recent | For the local Stellar network and the PostgreSQL dev database |

Install the correct wasm target:

```bash
rustup target add wasm32v1-none
```

Install stellar CLI (Linux x86_64):

```bash
curl -fsSL -o stellar.tar.gz \
  https://github.com/stellar/stellar-cli/releases/download/v27.0.0/stellar-cli-27.0.0-x86_64-unknown-linux-gnu.tar.gz
tar xzf stellar.tar.gz && sudo mv stellar /usr/local/bin/
```

---

## Local development setup

### 1. Clone and configure environment

```bash
git clone https://github.com/your-org/atomic-settle.git
cd atomic-settle

# Orchestrator environment
cp orchestrator/.env.example orchestrator/.env
# Edit orchestrator/.env — at minimum set DB_PASSWORD and ORCHESTRATOR_SECRET_KEY
```

### 2. Start local infrastructure

```bash
# Local Stellar network (Soroban + Horizon)
stellar network start local

# PostgreSQL for the orchestrator (Docker)
docker run -d \
  --name atomic-settle-db \
  -e POSTGRES_USER=atomic_settle \
  -e POSTGRES_PASSWORD=atomic_settle \
  -e POSTGRES_DB=atomic_settle \
  -p 5432:5432 \
  postgres:16-alpine
```

### 3. Build and deploy contracts locally

```bash
# Build both contracts (workspace shortcut)
cargo build --manifest-path Cargo.toml --target wasm32v1-none --release

# Or build each individually
cd contracts/settlement-escrow && cargo build --target wasm32v1-none --release
cd ../compliance-gate          && cargo build --target wasm32v1-none --release

# Deploy to local network
stellar contract deploy \
  --wasm contracts/settlement-escrow/target/wasm32v1-none/release/settlement_escrow.wasm \
  --network local

stellar contract deploy \
  --wasm contracts/compliance-gate/target/wasm32v1-none/release/compliance_gate.wasm \
  --network local
```

If you reset the lockfile, re-apply the ed25519-dalek pin:

```bash
cd contracts/settlement-escrow && cargo update "ed25519-dalek@3.0.0" --precise 2.2.0
cd ../compliance-gate           && cargo update "ed25519-dalek@3.0.0" --precise 2.2.0
```

### 4. Start the orchestrator

```bash
cd orchestrator
npm install
npm run start:dev
```

### 5. Start the ops dashboard

```bash
cd ops-dashboard
npm install
npm run start
```

---

## Project structure

```
contracts/
  settlement-escrow/   Soroban contract — core atomic swap / escrow logic
  compliance-gate/     Soroban contract — pluggable compliance oracle
orchestrator/          NestJS service — instruction intake, matching, event listener
ops-dashboard/         Angular app — trade monitoring and exception handling
scripts/               Shell scripts for deployment
docs/
  architecture-decisions/   ADRs (see below)
```

---

## Running the tests

### Contracts (Rust)

```bash
# All contracts from the workspace root
cargo test

# Single contract
cd contracts/settlement-escrow && cargo test
cd contracts/compliance-gate   && cargo test
```

All PRs touching contract code must pass `cargo test` with no regressions. New behaviour must be accompanied by new tests — see existing tests in `src/test.rs` for the pattern.

### Orchestrator (NestJS)

```bash
cd orchestrator
npm test              # unit tests
npm run test:cov      # coverage report
npm run test:e2e      # end-to-end (requires running DB)
```

Target: maintain ≥ 80% line coverage on `src/trades/` and `src/events/`.

### Ops dashboard (Angular)

```bash
cd ops-dashboard
npm test -- --watch=false --browsers=ChromeHeadless
```

---

## Coding conventions

### Rust (contracts)

- Format with `rustfmt` before committing: `cargo fmt --all`
- Lint with Clippy: `cargo clippy -- -D warnings`
- No `unwrap()` in non-test code — use `expect("descriptive message")` or proper error handling
- All public functions must have a doc comment explaining preconditions, state transitions triggered, and panics
- Keep `#[no_std]` — do not introduce `std` dependencies

### TypeScript (orchestrator + dashboard)

- Prettier + ESLint are configured; run `npm run lint` before pushing
- Use `strict: true` TypeScript — no `any` except where genuinely unavoidable, and always with a comment explaining why
- NestJS patterns: services for business logic, controllers for HTTP surface only, DTOs with class-validator for all inputs
- No secrets in code — use `ConfigService` with environment variables

### General

- Keep commits atomic — one logical change per commit
- Do not commit generated build artifacts (`target/`, `dist/`, `node_modules/`)
- Do not commit `.env` files — use `.env.example` as the template

---

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer: BREAKING CHANGE or issue refs]
```

Types: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`, `ci`

Scopes: `escrow`, `compliance`, `netting`, `orchestrator`, `dashboard`, `scripts`, `ci`, `deps`

Examples:

```
feat(escrow): add expiry-ledger guard to settle()
fix(compliance): return false instead of panic on missing whitelist entry
docs(contributing): add ed25519-dalek pin instructions
test(orchestrator): cover trades service cancel path
```

---

## Pull request process

1. **Fork** the repo and create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes, write tests, run the full test suite locally.
3. Run linters:
   ```bash
   cargo fmt --all && cargo clippy -- -D warnings
   cd orchestrator && npm run lint
   ```
4. Push and open a PR against `main`. Fill in the PR template.
5. CI must pass (contract tests, orchestrator tests, Angular build). The PR template has a checklist — complete it honestly.
6. At least one maintainer review is required before merge.
7. Squash-merge is preferred for feature branches; merge commits are used for release branches.

**Do not open a PR that:**
- Introduces breaking changes to the `settlement-escrow` public interface without a corresponding ADR in `docs/architecture-decisions/`
- Removes or weakens compliance checks
- Bypasses `require_auth()` on any state-mutating function
- Disables or lowers test coverage thresholds

---

## Reporting bugs and requesting features

Use the issue templates:

- **Bug report**: `.github/ISSUE_TEMPLATE/bug-report.yml`
- **Feature request**: `.github/ISSUE_TEMPLATE/feature-request.yml`

For questions and discussion, open a blank issue or start a GitHub Discussion.

---

## Security issues

**Do not open a public issue for security vulnerabilities.**

See [SECURITY.md](./SECURITY.md) for the responsible disclosure process.
