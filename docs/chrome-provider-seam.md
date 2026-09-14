# Chrome provider seam

> **Status:** Partly built — PR A implements the legacy seam; review and merge are required before the native shell work resumes.

## Decision and ledger

The bodies-and-joints migration's **S5 is incomplete**. Draft
[PR #13](https://github.com/PMKS-Web/Planar-Mechanism-Kinematic-Simulator/pull/13)
remains open and must not merge before this seam. S6 has not started.

The separate `chrome-provider-seam` branch starts at staging `ed38b443`. Its sole purpose is
to let the existing chrome consume provider contracts without changing public behavior.
There is one `AppComponent` root, with the existing top strip, left panel, canvas, transport,
view controls, bottom bar and right drawer. The retired Debug menu and drawer are removed
at review request; the remaining layout, icons and rendering defaults are unchanged. No Fable review is requested for this work.

| Checkpoint | State |
| --- | --- |
| PR A: legacy provider seam | Implemented here; awaiting human review and merge |
| PR #13: rebase onto staging containing PR A | Waiting for PR A to merge |
| S5: native providers and existing canvas/Edit panel slots | Reopened; not accepted |
| S6: analysis/export/tutorial/default cutover | Blocked on corrected S5 acceptance |

> PR #22 is merged. The historical seam scope below describes that PR; PR #13 supplies the native follow-through described at the end.

## What the seam promises

`src/app/services/chrome/chrome-contracts.ts` contains the seven interfaces consumed by
`app-top-bar`, `app-left-tabs`, `app-playback-bar`, `app-view-controls` and `app-bottombar`.
The right drawer no longer consumes these services after its Debug content was removed.
Scalar commands keep their existing types. Graph-valued readings expose
only the fields those components use; the chrome does not need a full `Mechanism`, `Joint`
or `Link` instance. Part references are passed back unchanged, not reconstructed from an id.

`chrome-tokens.ts` exposes typed injection tokens. Default factories resolve the existing
services, preserving TestBed and Storybook service overrides. `legacy-chrome-providers.ts`
uses `useExisting`, so the chrome and the canvas share the same singleton, settings streams,
selection and history. No service state is copied into a snapshot or wrapper.

`main.ts` selects the provider set before bootstrap can construct a loader. It always
bootstraps `AppComponent`. This PR installs only the legacy set, including when a development
URL requests `?editor=native`. `selectEditorProviders` can select a future installed native
set only on an explicit development request; production always selects legacy in this PR.
Selecting an installed native set validates that every chrome token has an explicit provider,
including nested provider arrays. Missing tokens throw by name before any service is
constructed; the root factories cannot silently fill an incomplete native set.

Three existing representation-dependent operations move behind the services: finding the
input of a deferred partition, identifying a material link with mass, reporting the selected
link's raw hold. Their predicates and effects are retained. The cycle exposes `sampleCount`
(the number of sampled poses, not the number of joints); the document exposes `hasParts()`
without forcing another provider to materialize arrays merely to report a count.
`MechanismService` remains the only implementation here, as requested. Its lint cap grows by
eleven executable lines for these existing chrome readings; this is not new mechanism
behavior or permission to add more. Introducing another legacy adapter service merely to
avoid that move would defeat this PR's requirement to keep the existing implementations.

## What this does not yet promise

Overriding a chrome token does not construct that token's legacy default. It does **not**
prove that an entire native application is isolated: descendants and other services still
use the legacy document in this PR. In particular, the grid and Edit/analysis/setup/export
content, project URL loading/saving, tutorial/synthesis services, and the top bar's history
permission helper still need their migration work. Do not hide these dependencies behind a
second root or duplicate shell.

PR #13 must prove whole-application isolation before enabling its native provider set. Put a
throwing `MechanismService` factory on that route and exercise initial load, selection,
playback, history, project actions and drawer opening; merely resolving one token is not that
proof. Replace content in the existing slots and adapt remaining consumers in place.

## S5 and S6 follow-through after this PR merges

Rebase PR #13 onto staging. Before providing native implementations, write the scalar
contract signatures explicitly and drop the legacy service type imports: the contracts must
own their shape once two models implement them. Part handles still require passing the
original reference back; introduce a brand if callers ever need to construct such handles.
Provide native implementations behind this seam; the legacy
`MechanismService` must never be constructed on the native route. Render the native grid
and inspector in the existing canvas and Edit panel slots. Reuse `joint-colors.ts`,
`render-scale.ts`, the existing grid policy, registered SVG icons and 0.7 fill treatment.
Delete `native-editor.component.*`, including its duplicate chrome stylesheet.

S5 acceptance is a tracked paired comparison of the same fixture and flows on legacy and
native: identical chrome DOM and screenshots, plus paired S0 filmstrips inspected by a person.
It includes shadows, spacing, palette, wording, focus, transitions and reduced motion.
A passing native-only suite is not parity evidence. Necessary joint-pair/attachment controls
are the limited intended difference, not permission to redesign the surrounding app.

When the migration plan and progress ledger on PR #13 are updated after rebase, carry this
sequence into their S5 and S6 sections. S6 builds analysis and export inside the **existing
right drawer** and existing mode panels, never a copied native drawer. S7 removes obsolete
model code and redundant presentation, preserving reusable UI components.

## Validation

Run `e2e/chrome-provider-parity.mjs` with `PMKS_BASELINE_URL` pointing to a second,
untouched staging server; [e2e/README.md](../e2e/README.md#chrome-provider-seam-comparison)
holds the command requirements. The gate needs independent builds and must not be run in a
single-server CI lane pretending to compare two builds.

## Native follow-through in PR #13 (S5)

`AppComponent` remains the only root. The development query dynamically imports a complete
native provider set before bootstrap. Production still chooses the legacy set. The seven
chrome contracts now declare their own structural signatures. Additional project, status,
tutorial, settings-command and grid-document ports close the indirect consumers found in
S5; their legacy defaults preserve the public route. `EDITOR_CONTENT` varies the canvas and
panel contents inside the existing cards, without copying navigation or layout.

The native canvas uses the same `SvgGridService`, viewport handle, ruling, filters, mark
geometry, palette and scale. Native settings persist through the document authority; grid
preferences remain view state. Unit conversion is one edit and viewport compensation also
covers Undo/Redo. Native project actions consume their own codec and recovery stores.
Unfinished analysis, synthesis, library and export capabilities name the S6 boundary in the
real panels/drawer instead of constructing their legacy consumers. S6 replaces those contents
in place.

`e2e/native-chrome-parity.mjs` publishes paired frames of all S0 mechanisms plus the production
slider-crank. It compares shared chrome DOM, computed presentation and pixels. It excludes the
cursor's model coordinates and numerical readout text; sample-position handles are bounded
by sample spacing before masking their moving pixels. Initial stationary controls remain an
exact pixel check. The native inspector's new entity fields are filmed separately from the
shared panel frame. The independent public-route seam comparison remains required too.
