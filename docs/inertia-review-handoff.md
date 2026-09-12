# Inertia explanation review handoff

> **Status:** Review reference for `feature/mass-inertia-explanation`. Scope is frozen; physical-shape changes belong to a separate feature.

Base checked: `origin/staging` at `acba1b770a20551b37a9b2f24b459c224c8ed0fc`.

## Calculation audit

| Explanation | Numerical source used by the model and UI |
| --- | --- |
| Slender rod and measured span | `uniform-body.ts`: farthest-pair endpoints, length squared, centroid and squared radius of gyration. `mass-properties.ts` supplies the actual centroidal inertia and endpoint trace. |
| Polygon area, first moments and centroid | `uniform-body.ts`: original unrounded edge accumulation and translated-origin centroid calculation. Named normalized edge/total moments are exposed for display. |
| Polar area moment J and conversion to mass moment I | The same polygon trace supplies polar area moments; `mass-properties.ts` supplies origin and per-edge mass moments. The conversion is uniform areal mass density times J, followed by the centroidal shift. |
| Welded combination | `mass-properties.ts` resolves each member's automatic/custom properties and returns the actual distance, shift and contribution used in the sum. The UI no longer recalculates those contributions. |
| Parallel axes | `parallel-axis.ts` supplies one numerical implementation for member shifts, the rod endpoint and `inertia-about-point.ts`. The latter owns the read-only calculator's refusals. The UI reverses the trace arm only to label displacement G to P. |
| Force contributions | `applied-moments.ts` returns arms, SI force components, signed moments and the applied-load subtotal. Its cross product comes from `force-moment.ts`, also used by the force solver's applied-load moment rows. Editable coordinates need MODEL_SCALE conversion; solved frames already hold project lengths. |

Presentation code retains symbolic equations, numeric substitutions, formatting, coordinate labeling, units and line breaks. It does not independently reintegrate a polygon or evaluate a second mass-property model. For example, spelling the rod closed form in TeX is explanatory text; its reported endpoint value comes from the model trace. The original integration and welded summation order are preserved; display-only trace values are unrounded until formatting.

## Custom properties and welded semantics

Mass is supplied rather than inferred from area, volume or material. A compound mass edit scales its member masses proportionally (equally when their previous total is zero); a member mass edit adjusts its owning compound. Automatic inertia follows the supplied mass. A positive custom inertia stays supplied when mass changes, so the author remains responsible for its consistency. The existing model clears inertia and returns it to automatic when mass becomes zero.

An automatic CoM follows the uniform centroid or weighted member centers. A custom CoM follows its stored body-frame offset through edits and poses. A custom inertia is interpreted about the shown CoM; it is not automatically shifted when the CoM is relocated. These values cannot reveal or reconstruct a physical mass distribution.

The parallel-axis calculator refuses a displaced custom CoM paired with automatic uniform-centroid inertia. This refusal propagates through automatic welded combinations. A supplied compound inertia supersedes its member-derived estimate and is treated as the author's assertion about the complete body. Finite coordinates and nonnegative mass/inertia are required, and zero mass cannot carry nonzero inertia. These are checks on the explanatory calculator, not a new physical-distribution validator for the force solver.

Welded automatic properties are assembled from member masses, centers, centroidal inertias and parallel-axis terms. Overlapping rendered regions are not a single material union. A numerical overlap case uses two coincident 4-unit rods of masses 2 and 3, with zero shifts and both members contributing. In consistent mass-length units:

\[
I_G=\frac{20}{3}
\]

## Behavior and supported working

The folded explanation covers rods, convex plates, points, welded members, per-edge area/first/polar moments, centroidal conversion, parallel axes, and applied-force moments. Local polygon coordinates subtract the first hull vertex; grid coordinates locate the same points in the current pose. J is a polar **area** property with length-to-the-fourth dimensions; I is a **mass** property with mass-times-length-squared dimensions. The force solver balances about G. General-point Newton–Euler working retains the acceleration moment; only the appropriate fixed-pivot special case reduces to inertia about P times angular acceleration.

G/P and mass-domain overlays are ephemeral and pose-aware. Custom values remain distinct from the automatic shape estimate. Display width, rounded caps, fillets, disc style and CAD holes do not enter mass integration. Convex hulls cannot represent concave domains or holes; interior joints do not change the hull. Object Scale does not change automatic mass properties, although its separate cylinder-clearance behavior remains as documented in the design investigation.

## Review map and verification

Start with [`uniform-body.ts`](../src/app/model/uniform-body.ts), [`mass-properties.ts`](../src/app/model/mass-properties.ts), [`parallel-axis.ts`](../src/app/model/parallel-axis.ts), [`inertia-about-point.ts`](../src/app/model/inertia-about-point.ts), [`applied-moments.ts`](../src/app/model/applied-moments.ts), and [`component/inertia-explanation/`](../src/app/component/inertia-explanation/). The `mass-geometry.ts` domain adapter and the two preview services contain no persistent state mutations.

Explicit tests cover rigid translation/rotation, mass preservation, arbitrary parallel-axis offsets, Object Scale, interior-joint motion, automatic/custom mass edits, round-trip cm/m/in project units, overlapping members, supplied member properties, invalid custom pairings and numerical polygon traces. Full unit tests include existing solver/MATLAB, units, serialization and welded regressions.

Final commands: `npm run check`, `npm test -- --watch=false`, `npm run build`, `npm run build-storybook`, `git diff --check`; browser suites `e2e/inertia-explanation.mjs`, `e2e/mass-geometry-explanation.mjs`, `e2e/ui-copy.mjs`, and `e2e/mobile.mjs`; gallery sweep `.storybook/tools/sweep.mjs`. Browser artifacts live under `artifacts/`; disclosure/motion frames must be inspected, not just collected. The inertia suite also checks keyboard use, phone layout and reduced motion.

Final local validation on 2026-09-12 passed: 2,526 tests in 242 files; lint/styles/format and whitespace checks; production and Storybook builds; both inertia browser suites; 17 copy checks; 79 mobile checks; and 147 gallery entries with zero failures. Important examples and disclosure/motion frames were inspected. The optional contact-sheet helper is unavailable on Windows; the individual captured frames were inspected directly.

Gallery review targets: Slender Rod Endpoint, Interior Joint, Visible Outline, Member Decomposition, Coincident Geometry, Translated Plate, Rotated Plate, Applied Loads and Custom Center. The previous geometry pass corrected stale compound drawing in its fixture and overlapping labels for coincident joints.

## Commit sequence and reviewer attention

1. `89b0128c` — Extract the existing mass calculation into a shared model.
2. `dea9ea7c` — Add the inertia explanation.
3. `6aef1664` — Foldable working, grid CoM readouts and parallel axes.
4. `836ae49c` — Polygon traces, current-pose references and force contributions.
5. `c82d0c00` — Mass-domain overlays, educational examples and design investigation.
6. Final hardening commit — Centralize remaining numerical working, tighten unsupported-axis refusals, add explicit invariants and this handoff. Obtain its exact hash from `git log origin/staging..HEAD`.

Pay particular attention to custom CoM/inertia pairing, compound member overrides versus a whole-compound override, MODEL_SCALE versus project/SI units, and overlay ownership when two panels are open. The force-moment subtotal deliberately excludes unsolved reactions and drive/constraint couples. This branch does not change the URL format or implement a new mass geometry.

The future roadmap is [P0–P4 in the existing design investigation](mass-geometry-design.md#staged-handoff-for-a-separate-feature): compatible data model, explicit rectangle, explicit disc, additional parametric shapes, then authored/imported physical outlines. Physical dimensions must be independent of Object Scale; calculation, physical drawing and export should consume that future model rather than mass properties consuming renderer output.
