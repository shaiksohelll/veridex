# Veridex Pre-Deployment Verification

**Review date:** 2026-08-27  
**Scope:** Assignment-level functional, graph, browser, build, repository, and dependency checks. This review does **not** publish or deploy the application.

> **Outcome:** The required take-home workflow is demonstrably functional in the managed development environment. It is **not production-ready for a public launch** until the dependency findings, authentication scope, and immutable explanation-path gap are resolved.

## Verification record

| Check | Evidence-backed result |
|---|---|
| Current delivery state | `main` matches the private GitHub remote at `2dd94fd`; the only local change during this review is this verification record and its tracker entry. The latest GitHub Actions run completed successfully. |
| Live graph scenarios | `pnpm graph:verify` passed. It applied repeatable schema/seed operations and returned the expected verdicts for `ALLOWED`, `BLOCKED_POLICY`, `APPROVAL_REQUIRED`, `UNAUTHORIZED_AGENT`, `UNVERIFIED_CUSTOMER`, `MISSING_APPROVER`, and `NO_APPLICABLE_POLICY`. |
| Deterministic/application tests | The immediately preceding full local run passed all **8 Vitest files / 27 tests**, including the live provider-default CognoDB session assertion. The corrected source has not changed since that run. |
| Browser journey | `VERIDEX_E2E_BASE_URL=http://localhost:3000 pnpm test:e2e` passed **2 Playwright tests**, including evaluate → explain → approve → audit and visible safe query-failure states. |
| Production artifact | The already-built `dist` server started under `NODE_ENV=production` on an isolated local port and served the compiled application with a successful HTTP smoke check. It was then stopped. |
| Responsive visual check | Desktop and 375 px mobile captures retain the numbered evaluate/explain/approval structure with no observed horizontal overflow. The initial neutral/loading state is rendered deliberately rather than leaving a blank page. |
| Client secret boundary | A source audit found no `COGNODB`, `neo4j-driver`, or `cognodb` references under `client/`. No environment files are tracked by Git. |
| Repository delivery | `git fsck --no-reflogs` passed. `shaiksohelll/veridex` is private, and the CI workflow uses read-only contents permission with pinned action revisions. |

## Pre-deployment issues

| Severity | Finding | Evidence and consequence | Required disposition before public production use |
|---|---|---|---|
| **Blocker** | Production dependency audit is not clean. | `pnpm audit --prod --json` exited non-zero with **81 advisories**: 1 critical, 21 high, 49 moderate, and 10 low. The critical item is transitive `fast-xml-parser@5.2.5` from the AWS SDK chain; its advisory recommends `>=5.3.5`. Direct `axios@1.12.2` accounts for multiple high/moderate findings, and its patch recommendations extend through `>=1.18.0`. The GitHub Actions gate does not run a dependency audit. [1] [2] | Upgrade or remove unneeded production dependencies; then re-lock, run a fresh audit with no critical/high finding accepted, and rerun the full quality and browser suite. Add a non-blocking or enforcing audit policy to CI as appropriate for the deployment policy. |
| **Major** | Decision evidence does not save the evaluated relationship-path snapshot. | `DecisionResult.explanationPath` is returned for the current UI, but `recordDecisionEvidence` persists decision fields without an `explanationPathJson` (or equivalent) property. If the graph changes later, the exact relationship traversal used by a historical decision cannot be reconstructed solely from the immutable evidence node. | Persist a serialized, validated relationship-path snapshot when decision evidence is created; expose it on audit reads and add an integration assertion. |
| **Major** | MVP is deliberately unauthenticated. | The public tRPC flow relies on seeded demo identities, and the repository documentation explicitly states that it must not authorize real users or actions. | Deploy only as a clearly labeled take-home demonstration with demo data, or add authenticated actor identity and authorization before any real-world use. |
| **Minor** | Recent delivery commits use the `Manus <dev-agent@manus.ai>` author, not the requested `Shaik Sohel <shaiksohelll05@gmail.com>` identity. | `2dd94fd` and `8ac7967` have the Manus author identity, while the principal feature commit has the requested identity. This does not alter runtime behavior but weakens the requested handoff hygiene. | Decide whether to preserve history as-is or rewrite/recreate the affected commits with the requested identity before final external submission. Do not force-push without an explicit decision. |
| **Minor** | Visual capture can show the intentionally neutral/loading state. | Browser E2E passes, and console/network review found no recent browser exception. However, an early visual capture showed metadata-loading skeletons before the public data query completed. | For the recording, wait for selectors to populate before capture and demonstrate a completed decision rather than the neutral page. |

## Deliberate assignment limitations

The focused scope remains appropriate for the take-home: one resource per request, demo identities, no policy authoring or impact-analysis UI, and managed secret configuration. The managed environment prevents direct creation of `.env.example`; the placeholder-only environment contract is documented in `README.md`. The production build retains a non-blocking Vite chunk-size advisory.

## Readiness decision

The submission is ready to **demonstrate** in the managed preview and to record the required workflow. It should **not be published as a production authorization service** until the blocker and major items above are addressed. No deployment action was taken in this phase.

## References

[1]: https://github.com/advisories/GHSA-m7jm-9gc2-mpf2 "fast-xml-parser entity encoding bypass advisory"
[2]: https://github.com/advisories/GHSA-q8qp-cvcw-x6jj "Axios prototype-pollution read-side gadget advisory"
