# Veridex UI Research Notes

**Purpose:** This record distills general interface principles from public references. It does not reproduce branding, layouts, components, assets, or source code from any reference.

| Reference | Observed principle | Original Veridex application |
|---|---|---|
| [Awwwards — Editorial Layout](https://www.awwwards.com/inspiration/editorial-layout) | Treat typography and a deliberate content frame as the primary hierarchy; reserve large visual areas for a single focal object. | Give the current decision one focal, full-width status composition and use restrained metadata rails around it instead of competing cards. |
| [Codrops — Typography](https://tympanus.net/codrops/tag/typography/) | Keep primary navigation compact and let generous whitespace and type scale separate content levels; expressive motion is optional rather than structural. | Use a persistent, narrow navigation rail and stable content frame. Limit motion to short state transitions and expanding trace/evidence details. |
| [Linear — A calmer interface](https://linear.app/now/behind-the-latest-design-refresh) | Support navigation and orientation should recede, core task content should earn the strongest emphasis, and structure can be conveyed with softened, purposeful separators rather than ubiquitous borders. | Establish a dimmer utility sidebar, compact task navigation, and a concentrated decision workspace with sparse rules and no decorative surface chrome. |
| [GitHub Primer](https://primer.style/) | A technical design system benefits from shared foundations, accessible primitives, and consistent typography, spacing, and semantic iconography. | Use a small neutral token system, visible focus treatment, icon-plus-text status signals, and stable information hierarchy rather than product-brand imitation. |
| [Vercel Design](https://vercel.com/design) | Let a precise typographic focal point sit within a carefully controlled frame, while a short navigation set remains visible but visually subordinate. | Use a compact product masthead and a large decision statement only after evaluation; preserve surrounding space for its supporting facts rather than using decoration. |
| [GitLab Pajamas](https://design.gitlab.com/) | An enterprise system can expose many resources through a compact searchable side navigation while organizing the workspace around foundations, components, and patterns. | Group Veridex into workflow-oriented destinations and use a narrow, collapsible sidebar at desktop width while preserving a single-screen mobile reading order. |
| [Shopify Polaris](https://shopify.dev/docs/api/polaris) | A unified administrative framework can offer several surfaces while retaining a consistent product frame, semantic control labels, and contextual navigation. | Treat evaluation, approvals, and evidence as related operational views inside one shell; preserve clear contextual titles and unambiguous actions at every state. |
| [IBM Carbon](https://carbondesignsystem.com/) | An enterprise system can maintain consistency across many surfaces with shared design foundations, reusable primitives, and an explicit accessibility posture. | Make the decision workspace dense only where it carries evidence, then use predictable spacing, control states, and labels to keep operational details legible. |
| [GOV.UK Design System](https://design-system.service.gov.uk/) | Trustworthy systems make task patterns, validation, accessibility, and component lifecycle information explicit instead of relying on implied state. | Pair every verdict with text and iconography, state constraints beside high-consequence actions, keep loading and error messages plain, and preserve responsive source order. |

The requested Stripe design-guideline URL returned a documentation 404, so it is not treated as a research reference.

## Working principles

The Veridex redesign uses a compact stable application shell, a clear editorial type scale, strict alignment, thin structural rules, semantic text-plus-icon verdict treatment, and a trace-first evidence presentation. Navigation and supporting context recede while the current decision stays visually dominant. The application frame and input controls remain stable; only the decision result, trace rows, evidence disclosure, and approval terminal state may move.

| Interaction dimension | Veridex decision |
|---|---|
| Motion timing | Enter/feedback transitions use 140–180 ms; no essential content depends on animation. |
| Easing | Short `cubic-bezier(0.23, 1, 0.32, 1)` transitions provide a fast, controlled arrival without elastic or decorative movement. |
| Visual feedback | The verdict uses named text, an icon, border treatment, and a restrained semantic supporting color. Inputs retain visible focus; in-progress/disabled actions visibly change state. |
| Information density | Dense only in the decision trace and evidence ledger. Form and decision areas preserve readable margins and a single primary action. |
| Responsive behavior | Desktop retains a stable rail and asymmetric workbench. Mobile collapses the rail into a masthead and maintains evaluate → decision → explain → approvals/evidence source order. |

## References

[1]: https://www.awwwards.com/inspiration/editorial-layout "Awwwards — Editorial Layout"
[2]: https://tympanus.net/codrops/tag/typography/ "Codrops — Typography"
[3]: https://linear.app/now/behind-the-latest-design-refresh "Linear — A calmer interface for a product in motion"
[4]: https://primer.style/ "GitHub Primer"
[5]: https://vercel.com/design "Vercel Design"
[6]: https://design.gitlab.com/ "GitLab Pajamas Design System"
[7]: https://shopify.dev/docs/api/polaris "Shopify Polaris references"
[8]: https://carbondesignsystem.com/ "IBM Carbon Design System"
[9]: https://design-system.service.gov.uk/ "GOV.UK Design System"
