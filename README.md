# Veridex

> **Every decision has a reason.**

Veridex is a relationship-aware authorization and approval system for automated actions. It derives authorization, customer context, policy applicability, approval eligibility, and audit evidence from connected graph data. The product returns a deterministic `ALLOWED`, `BLOCKED`, or `APPROVAL_REQUIRED` verdict; it is not a chatbot and does not use an LLM to make authorization decisions.

## Current status

The Phase 1 graph foundation is complete. The application has a server-only CognoDB boundary using the official Neo4j-compatible JavaScript driver, a repeatable graph schema setup, idempotent realistic seed data, and live verification of the required seed scenarios. The repository and deterministic application evaluator will be implemented in subsequent phases.

## Core workflow

The product journey is designed around a concise chain of responsibility:

`Evaluate → Decision → Explain → Approve or Reject → Evidence`

The future explanation experience will display the actual relationships used for a decision as a readable vertical sequence rather than as a decorative graph visualization.

## Why a graph database?

The central decision is relationship-dependent. A request is not authorized solely by an action name: its result depends on the agent's operator, the operator's role and permission path, the affected resource's owning customer and tier, policies connected to that action and tier, the assigned approval role, and the users eligible to act in that role. These connected paths are naturally traversed and explained in a graph. A relational database can model the same data, but the graph model keeps the multi-hop traversal and the explanation path close to the domain.

## Architecture

| Boundary | Responsibility |
|---|---|
| React + Vite | Presents the evaluation, explanation, approval, and evidence workflow. |
| Express + tRPC | Provides validated server-side application boundaries. |
| TypeScript | Enforces explicit domain and integration contracts in strict mode. |
| CognoDB | Stores the graph-native policy, authorization, approval, and evidence model. |
| `neo4j-driver` | Connects the server to CognoDB over Bolt. It is never included in browser code. |
| GitHub Actions | Runs the quality gate: dependency installation, lint, type-check, tests, and production build. |

## Frozen graph model

The Phase 1 schema has exactly **12 node labels** and **16 relationship types**. The `Permission` and `Evidence` nodes are required and intentionally retained.

| Node labels | Relationship types |
|---|---|
| `Agent`, `User`, `Role`, `Permission`, `ActionType`, `ActionRequest` | `OPERATED_BY`, `HAS_ROLE`, `GRANTS`, `ALLOWS`, `REQUESTED`, `IS_TYPE` |
| `Resource`, `Customer`, `Tier`, `Policy`, `Approval`, `Evidence` | `TOUCHES`, `BELONGS_TO`, `HAS_TIER`, `GOVERNS`, `TARGETS`, `REQUIRES_ROLE`, `HAS_APPROVAL`, `ASSIGNED_TO`, `DECIDED`, `GENERATES` |

The authorization path is genuinely used by the graph verification and later evaluator:

`Agent -[:OPERATED_BY]-> User -[:HAS_ROLE]-> Role -[:GRANTS]-> Permission -[:ALLOWS]-> ActionType`

The request context is graph-derived:

`Agent -[:REQUESTED]-> ActionRequest -[:TOUCHES]-> Resource -[:BELONGS_TO]-> Customer -[:HAS_TIER]-> Tier`

Policies connect through `GOVERNS` and `TARGETS`; an approval-required policy connects to its required role through `REQUIRES_ROLE`. An approval is linked to the request, assigned role, and deciding user. Evidence is append-only and is connected to its request through `GENERATES`.

## Frozen decision contract

The application evaluator will remain deterministic. The graph returns connected facts, while typed application code applies the rule sequence and produces the verdict.

| Rule | Contract |
|---|---|
| Verdicts | `ALLOWED`, `BLOCKED`, `APPROVAL_REQUIRED` |
| Default deny | No matching policy returns `BLOCKED` with `NO_APPLICABLE_POLICY`. |
| Explicit allowance | An allowed decision requires an applicable `ALLOW` policy. |
| Precedence | `BLOCK` outranks `REQUIRE_APPROVAL`, which outranks `ALLOW`. |
| Tie-breaker | Lower numeric policy priority wins; an equal priority resolves to lexicographically lower `policyId`. |
| Amount bounds | `minAmount` and `maxAmount` are optional and inclusive. |
| Resource scope | An action request must touch exactly one resource. Multiple resources are a clear domain error, not an arbitrary selection. |
| Customer context | Ownership and tier are derived from the graph, never trusted from a caller-supplied customer value. |
| Approvals | A single active user with the required role can decide. `PENDING` transitions once to `APPROVED` or `REJECTED`; the first terminal decision wins. |
| Evidence | Evidence is immutable and append-only. A snapshot keeps policy/version and reason context stable after current policies change. |

Self-approval is permitted in the MVP. A production system would add configurable restrictions.

## Phase 1 graph foundation

The schema setup creates repeatable stable-ID uniqueness constraints for every node label and targeted indexes for action-request scenario lookup, policy effect, approval status, and evidence event type. Schema identifiers and labels are static code constants. Runtime data is passed to Cypher as parameters; user-controlled data is never concatenated into query text.

The idempotent seed uses fully specified stable IDs. It supplies a small, realistic authorization context and a historical approval/evidence record so all 16 relationship types are present for a product-relevant reason.

| Seed scenario | Expected verified result |
|---|---|
| `ALLOWED` | `ALLOWED` |
| `BLOCKED_POLICY` | `BLOCKED` |
| `APPROVAL_REQUIRED` | `APPROVAL_REQUIRED` |
| `UNAUTHORIZED_AGENT` | `BLOCKED` |
| `UNVERIFIED_CUSTOMER` | `BLOCKED` |
| `MISSING_APPROVER` | `BLOCKED` |
| `NO_APPLICABLE_POLICY` | `BLOCKED` |

The verification command applies the schema, runs the idempotent seed twice, verifies every required node label and relationship type is represented, loads graph-derived facts for each scenario, and checks each actual result against its expected verdict. It does not treat raw record counts as proof that the scenarios are correct.

## Environment variables

The server requires the following values, supplied through deployment or local environment configuration. No credentials belong in the repository or browser bundle.

| Variable | Required | Purpose |
|---|---:|---|
| `COGNODB_URI` | Yes | CognoDB Bolt URI, for example `bolt+s://<instance-id>.databases.cognodb.cloud`. |
| `COGNODB_USERNAME` | Yes | CognoDB username; the cloud assignment uses `cognodb`. |
| `COGNODB_PASSWORD` | Yes | CognoDB password. |
| `COGNODB_DATABASE` | No | Explicit database name. Omit to use the provider default. |

Environment values are configured through the project’s secret manager. The repository ignore rules exclude `.env` and `.env.*` while preserving the intended placeholder-only example convention.

## Commands

| Command | Purpose |
|---|---|
| `pnpm graph:schema` | Verifies database connectivity and applies repeatable graph constraints and indexes. |
| `pnpm graph:seed` | Verifies database connectivity and loads idempotent graph seed data. |
| `pnpm graph:verify` | Applies schema, seeds twice, and verifies all seven graph scenarios against expected verdicts. |
| `pnpm lint` | Runs the source quality gate. |
| `pnpm check` | Runs strict TypeScript checking. |
| `pnpm test` | Runs unit tests and the credential-gated driver connectivity integration test. |
| `pnpm build` | Produces the production application build. |

## Quality gate

The repository is private and connected to GitHub. The GitHub Actions quality gate installs dependencies from `pnpm-lock.yaml`, then runs lint, TypeScript checking, Vitest, and the production build on pushes to `main` and pull requests. The initial remote workflow run completed successfully.

## Testing

Phase 1 tests verify the frozen graph label and relationship counts, CognoDB configuration parsing, and real database connectivity through the official driver when credentials are available. The Phase 1 graph verification command performs live schema, idempotency, and scenario checks. Later phases will add pure evaluator, API, and browser-journey coverage.

## Design direction

The selected product direction is **Tactile**: premium, calm, technical, trustworthy, and restrained, with excellent information hierarchy. Future UI work will avoid generic AI styling, decorative graph spaghetti, excessive rounded cards, and dashboard clutter.

## Limitations and future work

Phase 1 intentionally does not expose the main evaluation UI, tRPC application endpoints, the full reusable evaluator, approval mutation, audit interface, policy impact analysis, simulation, production authentication, or production deployment. These are scheduled in subsequent phases after the verified graph foundation.

The MVP uses demo-only seeded identities. This is not production authentication. Multi-resource authorization is also intentionally out of scope; the evaluator will reject a request that touches more than one resource.
