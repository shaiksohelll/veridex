# Project TODO

- [x] Inspect the existing Veridex scaffold, repository state, package scripts, and GitHub connection.
- [x] Add a minimal GitHub Actions quality gate for dependency installation, lint, type-check, tests, and production build.
- [x] Create or connect a private GitHub repository with a clean take-home-assignment workflow.
- [x] Verify the local quality commands and GitHub workflow configuration before beginning Phase 1 foundation work.
- [x] Establish strict TypeScript, server-only CognoDB driver configuration, graph schema, idempotent seed data, and seeded-scenario verification in Phase 1.
- [x] Add the official Neo4j-compatible JavaScript driver and server-only validated CognoDB environment boundary.
- [ ] Add a committed root `.env.example` placeholder if the managed environment permits environment-file creation; the required variable contract is documented in README.md meanwhile.
- [x] Define repeatable constraints and indexes for the frozen 12-label, 16-relationship CognoDB schema.
- [x] Implement an idempotent seed process for realistic authorization, policy, approval, and evidence context.
- [x] Verify the seven required scenarios against the actual graph without relying on record counts.
- [x] Document frozen Phase 1 rules and record lint, type-check, test, and production-build results before Phase 2.
- [ ] Build server-only graph repository functions that return normalized authorization, context, policy, and approver facts.
- [ ] Implement the reusable pure deterministic evaluator with stable verdicts, reason codes, policy precedence, and one-resource validation.
