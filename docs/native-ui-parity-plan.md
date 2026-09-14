# Native route: a 1:1 copy of the public UI

> **Status:** Plan of record, September 14, 2026. Supersedes the S5 UI scope in
> [bodies-and-joints-plan.md](bodies-and-joints-plan.md) wherever the two disagree.

## The decision

The maintainer reviewed the shared-shell native route (`?editor=native`) after the S5 rework
and rejected its UI: the Edit panel, menus and interactions had drifted from the public
editor, the route was laggy, and it crashed. The migration is a **model migration under the
existing UI**, so the native route now starts from a pixel-identical copy of the public UI
with the new document model underneath, and any UX change is proposed afterwards, one at a
time, on top of that baseline.

**Exactly one difference is allowed:** in the joint Edit panel, the three toggles *Grounded /
Slider / Welded* are replaced by the joint-type choice (Revolute · Prismatic · Pin-in-slot ·
Weld) with its connection-pair picker. It sits where the three toggles sat, in the same block
style as the rest of the panel (the existing `segmented-block` look, no letter-spaced bold
labels, no explanatory paragraph). Everything else in the panel, the menus, the canvas, the
transport, the drawer and the phone sheet is identical to the public route.

The public route itself does not change. No file under `component/new-grid/`,
`component/edit-panel/`, `services/context-menu-builder.service.ts` or `component/BLOCKS/` is
touched for this work; if a block cannot express something the native panel needs, the panel
is wrong, not the block.

## Template of record

- Edit panel: `src/app/component/edit-panel/edit-panel.component.html` and `.scss`. The native
  panel (`component/native-editor/native-inspector.component.*`) is rebuilt from the **same
  blocks in the same order with the same labels, help marks, tooltips and section names**:
  `editable-title` (Rename), Lock and Delete actions, `edit-banner` when paused, *Basic
  Settings* (Joint Position as `dual-input`; Length and Angle as `hold-field` with padlocks;
  the `Add Input` button with its icon; *Add tracer point* / *Add force* as the two-button
  row), *Visual Settings* (Trace path toggle, Joint Color picker, link shape), *Mass Settings*
  (not "Mass Properties"), *Distance to Joints*. A link has no X/Y fields, no Connection, no
  Motion Limits, no Input Settings and no "Show Traced Path" button. The cylinder panel
  mirrors the public cylinder panel the same way.
- Context menus: `src/app/services/context-menu-builder.service.ts`. The native builder
  (`services/native-context-menu.service.ts`) produces the same groups, rows, order, icons and
  footer for the grid, a joint, a link, a cylinder and a force: *Attach* (Link, Cylinder,
  Tracer Point, Force), *State* (Grounded, Driven Input, Slider, Welded, Locked), *Traces*
  (Trace path, Velocity Vectors, Acceleration Vectors, Force Vectors), and the destructive
  footer (*Delete Joint (and N links)*, *Delete entire mechanism*). A row the native model
  cannot serve yet is present and grayed with a short reason from the model, never dropped.
- Canvas: `component/new-grid/new-grid.component.html` for glyphs, fills, ghosts, hit areas
  and hover treatment; `native-grid.component.html` matches it.
- Wording: `docs/ui-vocabulary.md`. No new copy on the native route.

## Acceptance

A tracked paired suite opens the same fixture on both routes, selects the same joint, link,
cylinder and force, opens the same menus, and asserts the Edit panel region and the menu are
identical in DOM (tags, text, attributes, disabled state) and in pixels. The joint-type block
is the only masked region, identified by one data attribute, and the mask is the width of
that block and nothing more. A native-only passing suite is not evidence.

## Work packages

| Package | Owner | Files |
| --- | --- | --- |
| A. Edit panel parity: joint, link, cylinder | Opus agent | `component/native-editor/native-inspector.*`, `native-material-properties.*`, `native-joint-limits.*` |
| B. Context menu parity | Opus agent | `services/native-context-menu.service.ts` |
| C. Paired panel/menu gate, plus lag and crash diagnostics | Opus agent | `e2e/native-panel-parity.mjs` (new), report under `artifacts/` |

Each package ends with `npm run check`, the unit specs it touched, and the relevant native
browser suites run against a dev server, with screenshots looked at, not just exit codes.
