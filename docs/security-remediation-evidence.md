# Dependency Security Remediation Evidence

## Baseline audit

The 2026-08-27 production audit reported **81 advisory entries**: 1 critical, 21 high, 49 moderate, and 10 low. The principal direct roots were `axios@1.12.2`, tRPC 11.6, the AWS SDK 3.907 chain, `drizzle-orm@0.44.6`, Express 4.21, `nanoid@5.1.6`, and unused template-only `streamdown`/`recharts` components.

| Advisory | Affected baseline package | Remediation source |
|---|---|---|
| `GHSA-m7jm-9gc2-mpf2` | Transitive `fast-xml-parser@5.2.5` through the AWS SDK XML builder | https://github.com/advisories/GHSA-m7jm-9gc2-mpf2 |
| `GHSA-q8qp-cvcw-x6jj` | Direct `axios@1.12.2` | https://github.com/advisories/GHSA-q8qp-cvcw-x6jj |
| `GHSA-gpj5-g38j-94v9` | Direct `drizzle-orm@0.44.6` | https://github.com/advisories/GHSA-gpj5-g38j-94v9 |
| `GHSA-28wg-ghj8-5hjv` | Direct `nanoid@5.1.6` | https://github.com/advisories/GHSA-28wg-ghj8-5hjv |
| `GHSA-37ch-88jc-xwx2` | Transitive `path-to-regexp@0.1.12` through Express 4.21 | https://github.com/advisories/GHSA-37ch-88jc-xwx2 |
| `GHSA-r5fr-rjxr-66jc` | `lodash`/`lodash-es` through unused template charts and Markdown rendering | https://github.com/advisories/GHSA-r5fr-rjxr-66jc |

## Applied minimal remediation

The remediation preserved the existing React/Vite + Express/tRPC architecture. It upgraded direct dependencies only within compatible major versions: Axios to 1.18.0, all three tRPC packages to 11.8.0, the AWS S3 packages to 3.1119.0, Express to 4.22.2, Drizzle ORM to 0.45.2, and NanoID to 5.1.16. The unused `streamdown` and `recharts` template dependencies and their unreferenced components were removed rather than replaced.

## Final audit

The final `pnpm audit --prod --json` result is clean: **0 critical, 0 high, 0 moderate, and 0 low advisories** across 245 production dependencies. It returned an empty actions list and empty advisory object. The only installation note is a non-failing Vite 7 peer-range warning from the unused-at-runtime template development plugin `@builder.io/vite-plugin-jsx-loc`; it is not a production dependency advisory.

## Regression evidence

After remediation, lint, strict TypeScript checking, the complete **8-file / 28-test** suite, production build, and the live seven-scenario CognoDB verification all passed. The seeded Playwright workflow also passed both browser tests. The live evidence integration test changes current policy text and removes the policy’s current `TARGETS` edge before reading the historical record; its immutable explanation snapshot remains unchanged, and the test restores the graph state before it completes.
