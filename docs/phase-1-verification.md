# Phase 1 Verification Record

**Scope:** Graph foundation only. This record covers the server-only CognoDB driver boundary, repeatable schema, idempotent seed, frozen graph counts, and required seed-scenario verification. It does not claim that the later application evaluator, tRPC API, UI, or approval mutation is complete.

## Executed checks

| Check | Command or method | Result |
|---|---|---|
| Driver secret/connectivity validation | Focused Vitest integration test using the project-managed CognoDB credentials and the official `neo4j-driver`. | Passed. |
| Frozen schema setup | `pnpm graph:schema` against the live CognoDB database. | Passed. |
| Idempotent schema and seed verification | `pnpm graph:verify`; applies schema, runs the seed twice, checks graph coverage, and evaluates each scenario. | Passed. |
| Lint | `pnpm lint`. | Passed. |
| Strict TypeScript | `pnpm check`. | Passed. |
| Unit and integration tests | `pnpm test`. | Passed. |
| Production build | `pnpm build` with a bounded Node heap in the sandbox. | Passed with an existing bundle-size advisory from the template dependencies. |

## Live scenario outcomes

The verification command queried the live graph and applied its Phase 1 verification logic to graph-derived facts. It did not use record counts as the verdict check.

| Scenario | Required outcome | Live verification result |
|---|---|---|
| `ALLOWED` | `ALLOWED` | Passed. |
| `BLOCKED_POLICY` | `BLOCKED` | Passed. |
| `APPROVAL_REQUIRED` | `APPROVAL_REQUIRED` | Passed. |
| `UNAUTHORIZED_AGENT` | `BLOCKED` | Passed. |
| `UNVERIFIED_CUSTOMER` | `BLOCKED` | Passed. |
| `MISSING_APPROVER` | `BLOCKED` | Passed. |
| `NO_APPLICABLE_POLICY` | `BLOCKED` | Passed. |

## Notes

All runtime database values used by seed and verification queries are passed as Cypher parameters. Schema labels, relationship types, and schema object names are frozen static application constants rather than user-controlled values.

The Phase 1 verifier is a narrow live-data verification harness. Phase 3 will replace its local verification verdict function with the reusable, independently unit-tested application evaluator while retaining the frozen result contract and scenario expectations.
