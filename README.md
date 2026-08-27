# Veridex

> **Every decision has a reason.**

Veridex is a graph-native authorization workspace for automated actions. It resolves a deterministic authorization verdict from connected identity, permission, resource, customer, tier, policy, approval, and evidence context. The product supports the end-to-end workflow **Evaluate → Explain → Approve → Audit** and returns exactly one of `ALLOWED`, `BLOCKED`, or `APPROVAL_REQUIRED`.

Authorization is deliberately **not** AI-driven. No LLM participates in policy evaluation, policy precedence, approval eligibility, or state transitions. Any future explanation enhancement must describe an already determined decision; the current explanation is generated directly from the graph-derived relationship path.

## Product behavior

The interface is a restrained technical workspace intended to make a decision understandable immediately. A user submits one demo agent, action type, resource, and amount. The server creates an `ActionRequest`, derives customer context from the graph, evaluates policy facts in pure TypeScript, persists append-only decision evidence, and returns the verdict plus the actual relationships used.

For an approval-required result, Veridex creates a `PENDING` approval in the same graph write transaction as decision evidence. An eligible active demo user can approve or reject it. The first terminal decision wins, a duplicate attempt returns a safe conflict, and a distinct immutable evidence record is appended for the terminal event.

| Capability | Implemented behavior |
|---|---|
| Evaluate | Creates a one-resource `ActionRequest`, derives graph facts, and returns a deterministic verdict. |
| Explain | Shows actual typed relationship segments, not a decorative graph visualisation. |
| Approve | Creates and resolves a role-assigned approval with first-terminal-decision-wins semantics. |
| Audit | Displays persisted append-only decision and approval evidence records. |
| Safety | Validates input, parameterizes all runtime Cypher values, hides raw database/schema details, and uses demo-only identities. |

## Why CognoDB

The decision depends on a real multi-hop relationship chain rather than on isolated fields. An agent is authorized through its operator, roles, permissions, and action type. The action's resource supplies customer and tier context, which selects policies, which may in turn require a role and eligible approvers. CognoDB keeps these traversals close to the domain and makes the path available for explanation.

```text
Agent → User → Role → Permission → ActionType
Agent → ActionRequest → Resource → Customer → Tier
Policy → ActionType and Tier → optional required Role → eligible Users
ActionRequest → Approval / Evidence
```

## Architecture

The repository intentionally uses the existing full-stack scaffold rather than a framework migration: **React 19 + Vite**, **Express**, **tRPC**, **TypeScript strict mode**, **Tailwind 4**, and **Vitest**. It is a single Node process that is appropriate for managed autoscaling and requires no worker or queue.

| Layer | Responsibility |
|---|---|
| `client/src/pages/Home.tsx` | Tactile evaluate, explain, approval, and evidence workflow. The client displays server output only; it makes no authorization decision. |
| `server/routers/veridex.ts` | Public, schema-validated tRPC boundary for metadata, evaluation, explanation, approval queue, approval decision, and evidence retrieval. |
| `server/graph/repository.ts` | Server-only parameterized reads that normalize authorization, context, policy, and approver facts from CognoDB. |
| `server/decision/evaluator.ts` | Pure deterministic evaluator. It has no database, HTTP, or UI dependency. |
| `server/graph/requests.ts` | Transactional `ActionRequest` creation, fact loading, evaluation, and decision-evidence persistence. |
| `server/graph/governance.ts` | Transactional approval creation/resolution and append-only evidence persistence. |
| `server/cognodb/*` | Server-only validated configuration and the official Neo4j-compatible JavaScript driver boundary. |
| `server/graph/schema.ts`, `server/graph/seed.ts` | Static repeatable schema/index definitions and idempotent demo data. |
| `.github/workflows/quality.yml` | GitHub Actions gate for install, lint, type-check, tests, and production build. |

The application connects to CognoDB only through the official `neo4j-driver` package. It uses a lazily created, process-local driver with per-operation sessions and explicit transaction functions. The driver package is never imported into browser code.

## Frozen graph model

The graph contains exactly **12 node labels** and **16 meaningful relationship types**. Every relationship supports a concrete product decision, explanation, eligibility, or audit requirement.

| Node labels | Product purpose |
|---|---|
| `Agent`, `User`, `Role`, `Permission` | Represent operating identity and action-specific authorization. |
| `ActionType`, `ActionRequest` | Distinguish a governed action definition from a persisted evaluation instance. |
| `Resource`, `Customer`, `Tier` | Supply server-derived ownership and customer criticality context. |
| `Policy` | Defines ordered `ALLOW`, `BLOCK`, or `REQUIRE_APPROVAL` behavior. |
| `Approval`, `Evidence` | Record race-safe human resolution and immutable auditable events. |

| Relationship type | Source → target | Product purpose |
|---|---|---|
| `OPERATED_BY` | `Agent → User` | Identifies the user responsible for the agent. |
| `HAS_ROLE` | `User → Role` | Resolves authorization and approval eligibility. |
| `GRANTS` | `Role → Permission` | Grants an action-specific permission. |
| `ALLOWS` | `Permission → ActionType` | Maps permission to governed action capability. |
| `REQUESTED` | `Agent → ActionRequest` | Attributes a persisted evaluation to an agent. |
| `IS_TYPE` | `ActionRequest → ActionType` | Identifies the requested action class. |
| `TOUCHES` | `ActionRequest → Resource` | Enforces the MVP's exactly-one-resource domain boundary. |
| `BELONGS_TO` | `Resource → Customer` | Derives ownership rather than trusting caller input. |
| `HAS_TIER` | `Customer → Tier` | Supplies tier context for policy applicability. |
| `GOVERNS` | `Policy → ActionType` | Makes a policy applicable to an action class. |
| `TARGETS` | `Policy → Tier` | Makes a policy applicable to a customer tier. |
| `REQUIRES_ROLE` | `Policy → Role` | Assigns the approver role for approval-required policies. |
| `HAS_APPROVAL` | `ActionRequest → Approval` | Connects a request to its pending or terminal approval. |
| `ASSIGNED_TO` | `Approval → Role` | Preserves the role required to decide the approval. |
| `DECIDED` | `User → Approval` | Attributes the first terminal decision to an eligible active user. |
| `GENERATES` | `ActionRequest → Evidence` | Connects immutable decision and approval event records to the request. |

Stable IDs are unique for all 12 node labels. The schema also applies targeted lookup indexes for action-request scenario lookup, policy effect, approval status, and evidence event type. Schema labels, relationship names, constraints, and indexes are static code constants; they are never built from a caller-supplied string.

## Deterministic decision contract

The graph repository returns facts. The pure evaluator applies the rules in this order and emits stable reason codes, a selected policy when applicable, eligible approvers, a relationship-path snapshot, and an immutable evidence snapshot.

1. Validate that the request has exactly one resource and a finite positive amount.
2. Require that the agent exists and is active.
3. Require a complete authorization path: `Agent → User → Role → Permission → ActionType`.
4. Require the action request and resource context to exist.
5. Require the resource's customer and tier context, and require the customer to be verified.
6. Select applicable active policies that govern the action type, target the tier, and include the amount using inclusive optional bounds.
7. If no policy is applicable, return `BLOCKED / NO_APPLICABLE_POLICY`.
8. Apply precedence: `BLOCK` > `REQUIRE_APPROVAL` > `ALLOW`. Within the winning effect, lower numeric priority wins; then lexicographically lower policy ID wins.
9. For `REQUIRE_APPROVAL`, resolve the required role and at least one eligible active user. Otherwise return `BLOCKED / MISSING_APPROVER`.
10. Return `ALLOWED`, `BLOCKED`, or `APPROVAL_REQUIRED` and persist the decision evidence snapshot.

| Contract | Rule |
|---|---|
| Missing policy | `BLOCKED / NO_APPLICABLE_POLICY` (default deny). |
| Explicit allow | `ALLOWED` requires an applicable `ALLOW` policy. |
| Policy bounds | `minAmount` and `maxAmount` are optional and inclusive. |
| Resource scope | Exactly one `TOUCHES` relationship per evaluated request. Zero and multiple resources are distinct domain failures. |
| Approval transition | `PENDING → APPROVED` or `PENDING → REJECTED` once only; first terminal decision wins. |
| Evidence | Create-only `Evidence` nodes; current policy edits cannot alter saved decision snapshots. |

## Seeded demo scenarios

The seed script is idempotent: rerunning it merges the fixed current-policy graph and ensures all historical demonstration relationships exist. IDs are stable and all identities are explicitly demo-only.

| Scenario | Expected verdict | Representative reason |
|---|---|---|
| `ALLOWED` | `ALLOWED` | An enterprise refund below the approval range matches an explicit allow policy. |
| `BLOCKED_POLICY` | `BLOCKED` | A higher-precedence large-refund block applies. |
| `APPROVAL_REQUIRED` | `APPROVAL_REQUIRED` | An enterprise refund within the approval range resolves the finance-manager approver. |
| `UNAUTHORIZED_AGENT` | `BLOCKED` | The active agent has no complete permission path for the action. |
| `UNVERIFIED_CUSTOMER` | `BLOCKED` | The resource belongs to an unverified customer. |
| `MISSING_APPROVER` | `BLOCKED` | The approval policy applies but no eligible active user has its required role. |
| `NO_APPLICABLE_POLICY` | `BLOCKED` | No policy applies, so default-deny is enforced. |

## Setup

Use Node.js 22 and pnpm 10. The repository lockfile is authoritative.

```bash
pnpm install --frozen-lockfile
pnpm graph:verify
pnpm dev
```

The commands below are intentionally split so the schema, data, and verification sequence is explicit.

| Command | Purpose |
|---|---|
| `pnpm graph:schema` | Checks CognoDB connectivity and applies repeatable constraints/indexes. |
| `pnpm graph:seed` | Checks connectivity and writes the idempotent demo graph. |
| `pnpm graph:verify` | Applies schema, seeds twice, checks semantic graph coverage, and evaluates all seven required scenarios. |
| `pnpm lint` | Runs ESLint with zero warnings permitted. |
| `pnpm check` | Runs TypeScript strict mode without emitting files. |
| `pnpm test` | Runs Vitest unit, router, and credential-gated live graph integration tests. |
| `pnpm test:e2e` | Runs the Playwright journey when `VERIDEX_E2E_BASE_URL` points to a seeded server. |
| `pnpm build` | Produces the Vite client and bundled Node server production build. |

## Environment variables

All values are server-side secrets. Do not commit a real `.env` file or expose a `COGNODB_*` value through `VITE_*` variables. The managed project secret facility is the intended configuration path.

| Variable | Required | Purpose |
|---|---:|---|
| `COGNODB_URI` | Yes | CognoDB Neo4j-compatible Bolt URI. |
| `COGNODB_USERNAME` | Yes | CognoDB database username. |
| `COGNODB_PASSWORD` | Yes | CognoDB database password. |
| `VERIDEX_E2E_BASE_URL` | Only for E2E | Base URL of a running, seeded Veridex server for browser tests. |

`COGNODB_DATABASE` is intentionally not part of Veridex’s required Bolt contract. Every application, schema, seed, and verification session calls `driver.session()` with no database option, so CognoDB/the driver selects the provider default. The application never guesses or hard-codes a database name.

The `.gitignore` excludes `.env` and `.env.*`. The required variable contract is documented here because the managed project environment restricts direct creation of environment files; any `.env.example` outside that environment must contain placeholders only.

## Core Cypher operations

All runtime values are passed as Cypher parameters. The following patterns are static and representative; the source modules contain the complete statements.

| Operation | Static Cypher responsibility | Source |
|---|---|---|
| Authorization facts | Traverse `Agent → User → Role → Permission → ActionType` for a fixed request ID. | `server/graph/repository.ts` |
| Resource context | Traverse `ActionRequest → Resource → Customer → Tier`; return no caller-supplied customer claim. | `server/graph/repository.ts` |
| Policy facts | Match active policies through `GOVERNS` and `TARGETS`, preserving effect, priority, bounds, and optional role. | `server/graph/repository.ts` |
| Request creation | `CREATE` the action request and its one `TOUCHES` relationship inside a write transaction. | `server/graph/requests.ts` |
| Approval creation | Create `Approval`, `HAS_APPROVAL`, `ASSIGNED_TO`, and `DECISION_EVALUATED` evidence atomically. | `server/graph/governance.ts` |
| Approval resolution | `MATCH` a `PENDING` approval and eligible active user, conditionally create `DECIDED`, set terminal fields once, and append evidence in one transaction. | `server/graph/governance.ts` |

## Testing and verification

The deterministic evaluator has pure unit coverage for policy precedence, default deny, amount boundaries, authorization failure, inactive agents, unverified customers, missing approvers, and one-resource validation. Router and live graph integration tests cover input validation, request creation, explanation retrieval, approval creation/resolution, duplicate transitions, concurrent terminal attempts, evidence ordering, and connection/configuration behavior.

The Playwright suite covers the primary visible path:

```text
Evaluate approval-required request
→ show relationship path
→ choose eligible demo approver
→ approve
→ show terminal status and appended evidence
```

It also verifies the neutral pre-evaluation state plus visible safe errors when explanation or evidence refreshes fail. The test is intentionally opt-in because it needs a running server with reachable CognoDB rather than fake client data.

The final local verification run completed with **8 Vitest files / 28 tests passing**, including live provider-default CognoDB and immutable-explanation snapshot assertions, plus lint passing, strict type-checking passing, graph verification passing, a clean production dependency audit, and the production build succeeding. The Playwright suite completed with **2 tests passing** against the seeded local server. GitHub Actions runs installation from the lockfile followed by lint, type-check, Vitest, and the production build on `main` pushes and pull requests.

## Security and operational posture

Veridex treats the client as untrusted. It validates every public procedure with Zod; invalid requests receive a generic safe message rather than raw schema or regex internals. Graph/database failures return a safe service message, and raw Cypher/driver errors are not rendered to users. Every graph operation uses a server-only driver, parameters for runtime data, a fresh session, and explicit read/write transaction boundaries.

Approval state changes are compare-and-set style transitions: terminal records do not transition again. Evidence nodes are write-only from application behavior; there is no update or delete procedure. Each evaluated decision stores a versioned JSON explanation snapshot containing the ordered node list, relationship sequence, identifiers and labels, policy ID/name/version/effect/thresholds, required role, reason code/reasons, verdict, amount, and capture timestamp. Audit reads deserialize that artifact rather than rebuilding it from mutable graph state. **Authentication is intentionally omitted from the MVP. Identities are seeded for demonstration purposes only.** The application must not be used to authorize real people or production systems.

## GitHub delivery and deployment

The project is connected to a private GitHub repository with a small, reviewable commit history. `.github/workflows/quality.yml` is the required quality gate and does not add deployment infrastructure.

The deployment artifact is the existing Vite client plus bundled Node/Express server produced by `pnpm build`. A production host must provide the four `COGNODB_*` secrets and reach CognoDB over Bolt. The current project uses managed autoscale hosting; publishing remains a user-controlled UI action and has not been performed by the application workflow.

## Limitations and next steps

This is a focused take-home MVP. It intentionally supports one resource per request, demo-only identities, one active approval role per applicable approval policy, and a compact fixed seed universe. It has no production authentication/authorization administration, tenant isolation, notification/queue worker, policy authoring UI, policy impact analysis, simulation, retention controls, or real-world identity provisioning.

The first production extensions should be authenticated operator identity, policy lifecycle/versioning controls, configurable self-approval restrictions, richer multi-resource policy semantics, and impact analysis that discovers affected action requests, agents, resources, and customers before a policy change is applied.
