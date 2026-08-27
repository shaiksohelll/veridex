# Veridex UI Redesign Plan

## Design thesis

Veridex will present authorization as a **decision dossier**, not a dashboard. The interface is an editorial technical workspace: a persistent utility rail provides orientation, a focused command surface collects evaluation inputs, and the result becomes the visual center of gravity. Evidence remains legible as an operational record rather than an afterthought.

> **Identity:** VERIDEX — *Every decision has a reason.*

The design applies general hierarchy, density, accessibility, and motion principles recorded in [`ui-research.md`](./ui-research.md); it does not reproduce a reference product’s branding, layout, components, or assets.

## Original design system

| Dimension | Direction |
|---|---|
| Visual language | Editorial + technical + enterprise. Warm graphite canvas, mineral-white working surface, ink typography, sparse rules, no gradient, glass, soft-card stack, or decorative graph. |
| Typography | Instrument Sans for interface and editorial headlines; IBM Plex Mono for labels, identifiers, timestamps, relationship verbs, and system state. The scale is deliberate: large decision headline, readable operational body, compact metadata. |
| Layout | Fixed desktop utility rail; constrained content canvas; asymmetric evaluation and decision columns; trace/evidence views retain a stable reading line. Mobile converts the rail to a compact top bar and preserves source order. |
| Status | Each verdict combines a named state, icon, pattern/edge treatment, and an accessible text reason. Color supports rather than carries meaning. |
| Controls | Inputs use labeled rows, plain borders, visible focus, and server-derived context. High-consequence actions retain a second state cue: acknowledgement text, disabled/in-progress state, and terminal confirmation. |
| Motion | Only opacity/transform. Evaluation result enters in 180 ms; status badge shifts in 140 ms; disclosure/timeline expansion takes 160 ms. The content frame remains fixed to avoid disorienting layout movement. Reduced-motion users receive no nonessential transitions. |

## Screen architecture

| Surface | Purpose | Essential content |
|---|---|---|
| Application shell | Keep workflow orientation stable without dashboard clutter. | Product mark, active workflow stage, graph connection state, demo-only note, compact system timestamp. |
| Evaluate | Operate as an engineering control surface, not a generic form. | Agent, action, resource, amount, graph-derived customer/tier context, primary evaluation command, validation and database states. |
| Decision | Make the deterministic verdict unmistakable within seconds. | Verdict word + icon, reason, action, agent, resource, customer, policy, risk/control mode, request ID, selected-policy metadata. |
| Explain | Make the real path feel forensic and inspectable. | Ordered relationship ledger with numbered steps, typed node chips, relationship verbs, deterministic rationale, empty/error/recheck states. |
| Approvals | Show a serious, bounded approval work area. | Required role, agent/request/resource/amount/policy, pending/approved/rejected state, eligible approver selection, guarded action buttons, conflict/error response. |
| Evidence | Treat historical fact as a durable record. | Timestamp, event, actor, decision reason, policy, approval, immutable snapshot status, captured graph path, empty/loading/error states. |

## Implementation constraints

The redesign will change only `client/` presentation structure, styles, and local display types. It will preserve the CognoDB schema, graph relationships, evaluator, tRPC contract, approval state machine, evidence behavior, and existing tests. It may render fields already returned by evidence reads, including the immutable explanation snapshot, but will not change their semantics.
