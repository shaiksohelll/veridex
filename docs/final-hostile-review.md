# Veridex Final Hostile Engineering Review

**Review date:** 2026-08-27  
**Scope:** The implemented React/Vite + Express/tRPC submission, live CognoDB integration, deterministic evaluator, approval/evidence workflows, tests, and current repository hygiene.

> **Review standard:** Treat the system as if it were being defended in a take-home interview. A workflow is accepted only when the graph relationship has a product purpose, the decision is deterministic, runtime Cypher data is parameterized, and the visible result is backed by a passing check.

## Acceptance review

| Review area | Inspection evidence | Result |
|---|---|---|
| Deterministic authority | `server/decision/evaluator.ts` is a pure function with no driver, HTTP, or LLM import. Its ordered guards reject invalid amount, inactive agent, missing authorization path, invalid resource context, unverified customer, absent policy, and missing approval resolution before an allow result. | Pass |
| Default deny and policy precedence | The evaluator sorts effects as `BLOCK` > `REQUIRE_APPROVAL` > `ALLOW`, then lower numeric priority and lexical policy ID. An empty applicable-policy set returns `BLOCKED / NO_APPLICABLE_POLICY`. | Pass |
| Amount boundaries | `isPolicyApplicableForAmount` applies optional inclusive `minAmount` and `maxAmount` bounds before selection. | Pass |
| Active approval role | The evaluator now fails safely with `APPROVAL_ROLE_MISSING` when an approval policy has no role or points at an inactive role. The new adversarial unit test covers this condition. | Pass |
| Single-resource MVP | The evaluator emits `RESOURCE_NOT_FOUND` for zero resources and `RESOURCE_CONTEXT_INVALID` for more than one; it never silently chooses an arbitrary resource. | Pass |
| Graph read boundaries | `server/graph/repository.ts` uses static Cypher strings and parameter maps for request ID, agent ID, action type, tier, and required-role values. The module returns normalized facts only; it does not decide a verdict. | Pass |
| Graph write boundaries | `requests.ts` and `governance.ts` use static Cypher and parameter maps for action request, approval, evidence, outcome, timestamps, and identifiers. Dynamic labels, relationship types, and user-supplied query fragments are absent. | Pass |
| Approval concurrency | `decideApproval` executes a single write transaction containing `WHERE approval.status = 'PENDING'`, terminal state assignment, deciding-user relation, and evidence creation. A concurrent integration test proves exactly one terminal attempt is fulfilled and exactly one approval-decision event is added. | Pass |
| Duplicate transition | A second decision reads the current approval state and maps a terminal record to an explicit conflict. The router integration test asserts the `CONFLICT` result. | Pass |
| Approval eligibility | The transition query requires both the assigned role and an active deciding user with `HAS_ROLE`; otherwise it returns a safe eligibility error. | Pass |
| Evidence immutability | There is no application update or delete operation for `Evidence`. Decision evidence is created in the same transaction as the approval when needed; approval evidence is created in the terminal-transition transaction. Seed evidence uses create-only merge behavior. | Pass |
| Evidence snapshot | Newly generated decision evidence persists action request, action type, amount, customer, resource, policy/version, reason code/reasons, verdict, and timestamp. A live router integration test asserts the snapshot fields. | Pass |
| Safe public errors | Shared tRPC formatting replaces malformed-input details with a generic message and removes stack metadata. Router tests assert that Zod and regex details are absent. Database errors are mapped to safe service responses. | Pass |
| Secret boundary | `server/cognodb/config.ts` reads only the standard `COGNODB_URI`, `COGNODB_USERNAME`, and `COGNODB_PASSWORD` Bolt settings from `process.env`. Veridex does not read `COGNODB_DATABASE`; every graph session uses `driver.session()` without a database option, delegating selection to CognoDB/the driver rather than guessing. A client-source audit found no `COGNODB`, `neo4j-driver`, or CognoDB configuration references under `client/`. The driver remains server-only. | Pass |
| Secret-file hygiene | `.gitignore` excludes `.env` and `.env.*`; the managed project secret mechanism supplies the live credentials. The platform restricts direct environment-file creation, so the placeholder-only example contract is documented in `README.md` rather than fabricating a secret file. | Pass with documented platform limitation |
| Browser behavior | The reproducible Playwright suite verifies the neutral initial state, approval-required evaluation, real relationship path, approval by an eligible demo user, terminal state, appended evidence, and visible explanation/evidence refresh failures. | Pass |
| Repository hygiene | Repository remotes include the private GitHub delivery remote. The local author identity is `Shaik Sohel <shaiksohelll05@gmail.com>`. `.gitignore` excludes environment files, builds, logs, coverage, and Playwright test artifacts. `git diff --check` reports no whitespace errors. | Pass pending final commit |

## Remediated findings

| Finding | Risk | Remediation and verification |
|---|---|---|
| Repository test assumed policy array index zero was the approval policy. | A legitimate higher-precedence block policy made a valid graph test flaky/incorrect. | The test now locates the approval policy by stable ID and still asserts its required role and eligible approver. The full suite passes. |
| A selected approval role could be inactive. | An inactive governance role might still yield an approval-required decision. | The pure evaluator now returns `BLOCKED / APPROVAL_ROLE_MISSING` if the role is absent or inactive; dedicated unit coverage passes. |
| New evidence did not persist the full decision snapshot. | A later policy change could make an audit read depend too heavily on mutable graph context. | Create-only evidence now captures action/action type, amount, customer, resource, policy/version, reason/reasons, verdict, and timestamp; live integration coverage verifies it. |
| tRPC validation errors exposed internal schema detail. | The client could observe Zod/regex implementation internals. | Shared error formatting returns a generic bad-request message with no serialized stack; HTTP-level validation tests pass. |
| Playwright result artifacts appeared as untracked output. | Test output could pollute source delivery. | `test-results/` and `playwright-report/` are ignored. |

## Final verification record

| Check | Result |
|---|---|
| `pnpm graph:verify` | Pass: schema applied, seed run twice, all seven required scenarios returned expected verdicts. |
| `pnpm lint` | Pass with zero warnings. |
| `pnpm check` | Pass in TypeScript strict mode. |
| `pnpm test` | Pass: 8 files / 27 tests, including live credential-gated CognoDB integration and a provider-default database session assertion. |
| `pnpm build` | Pass; Vite reports a non-blocking client bundle-size advisory. |
| `VERIDEX_E2E_BASE_URL=http://localhost:3000 pnpm test:e2e` | Pass: 2 browser tests. |
| GitHub Actions quality gate | Configured to run frozen-lockfile install, lint, type-check, Vitest, and production build on pushes and pull requests. |

## Deliberate MVP limitations and remaining risks

The application is intentionally public and demo-only. It has **no production authentication**, tenant isolation, operator provisioning, notification, or policy-authoring interface; it must not authorize real users or actions until those controls exist. Self-approval remains permitted by the frozen MVP contract.

The exactly-one-resource rule is enforced in the evaluator. Neo4j-compatible graph constraints cannot generally enforce a one-to-one outgoing relationship cardinality by themselves, so any trusted administrative graph writer must preserve the same invariant. The application writer creates no more than one `TOUCHES` edge, and the evaluator blocks both zero and multiple edges.

Policy impact analysis and simulation are intentionally deferred so they do not delay the required flow. The browser suite is opt-in in CI because it requires a running server and real CognoDB credentials; the mandatory GitHub Actions gate still runs deterministic unit/API tests and the production build. The production bundle has a non-blocking chunk-size warning that can be addressed later by code splitting if real usage indicates a need.
