## Summary

<!-- One or two sentences describing what this PR does and why. -->

## Changes

<!-- Bullet-point list of what changed. Be specific: which functions, modules, or files. -->

-
-

## Type of change

- [ ] Bug fix (non-breaking)
- [ ] New feature (non-breaking)
- [ ] Breaking change (contract interface, API, or deployment procedure change)
- [ ] Refactor / internal improvement
- [ ] Documentation only
- [ ] CI / tooling

## Testing

<!-- Describe what you tested and how. Include any new test cases added. -->

- [ ] `cargo test` passes for all contracts
- [ ] `npm test` passes for the orchestrator
- [ ] `npm test` passes for the ops dashboard
- [ ] New behaviour is covered by new or updated tests

## Contract changes checklist

_Skip if this PR does not touch Soroban contracts._

- [ ] No public function signatures were changed without a corresponding ADR in `docs/architecture-decisions/`
- [ ] No `require_auth()` calls were removed or weakened
- [ ] No compliance gate bypass was introduced
- [ ] Storage key layout changes are documented

## Breaking changes

_Skip if not a breaking change._

<!-- Describe the migration path for existing deployments. -->

## Related issues

<!-- Closes #NNN -->
