# UI style guide

What to know before adding or changing anything a reader sees. The component gallery
(`npm run storybook`) shows what the building blocks look like; this page covers what a gallery
cannot show: how things behave, how they move, and how they are worded.

It links to the source rather than restating it. When a link and this page disagree, the link wins,
and this page needs a fix.

---

## Principles

The four principles are in the README's [Philosophy](../README.md#philosophy) section, written as
the concrete rules they amount to in the code. Everything below follows from them. Read that
section first.

---

## Interaction patterns

### Select, then act

A click selects (`ActiveObjService`). What the reader can then do with the selection is offered in
two places, and nowhere else:

- **The Edit panel** shows the selection's properties as fields and switches.
- **The context menu** (right-click, or a long press on touch through `LongPressDirective`) offers
  the actions. It is built for whatever was right-clicked, in the current mode, by
  [`context-menu-builder.service.ts`](../src/app/services/context-menu-builder.service.ts).
  A new action is a row in the builder. The canvas only supplies the gesture handlers.

Do not add a floating button, a toolbar or a one-off popup for an action on a part. In the
analysis modes a click still selects, and a drag tunes: a drag does not change what the panel is
graphing.

### Every refusal says why, and what to do

A control the reader could expect to use is **grayed, with its reason beside it**. A control that
can never apply to this kind of object is **absent**. Nothing is clickable only to be refused
afterward. The wording rules are in
[Refusals wear their reason](ui-vocabulary.md#refusals-wear-their-reason).

**The reason comes from the model that enforces the rule, never from the template.** Quote one of
these:

| Question | Ask |
| --- | --- |
| May this edit happen right now? | [`model/edit-permission.ts`](../src/app/model/edit-permission.ts), through [`edit-permission.service.ts`](../src/app/services/edit-permission.service.ts) |
| Can this joint be driven? | `describeActuatorRefusal` in [`model/actuator.ts`](../src/app/model/actuator.ts) |
| Can this joint be welded? | `weldRefusal` in [`grid-utils.service.ts`](../src/app/services/grid-utils.service.ts) |
| Is a Lock holding this part? | `locksHolding` in [`model/lock-set.ts`](../src/app/model/lock-set.ts) |

A condition such as `@if (joint.links.length < 2)` with its own words is a second copy of the rule.
It will drift from the first copy, and then the menu, the panel and the drag ring disagree. The
permission model exists because six surfaces used to answer the same question in different ways.
See [Editing, playback, and who is allowed to say
no](tips-and-tricks.md#editing-playback-and-who-is-allowed-to-say-no).

A disabled button takes no pointer events, so a tooltip on the button itself never opens.
`button-block` hangs its tooltip on the row for that reason. Do the same.

### One undo per gesture

Undo is a stack of URL strings
([`save-history.service.ts`](../src/app/services/save-history.service.ts)). An edit enters it
through `MechanismService.updateMechanism(true)`. A gesture that changes several things still saves
**once**, at its end. `MechanismService.capturingPose` holds the inner saves for that reason, and
removing a whole machine is minted as one entry, not one per joint. To check a gesture, do it once,
press Undo once, and confirm the drawing is back where it started.

### Drags stage, then commit

A pointer move is provisional. Each move solves a provisional cycle, and nothing is written into the
design until release. `finishMechanismDrag`
([`new-grid.component.ts`](../src/app/component/new-grid/new-grid.component.ts)) then commits the
whole outcome, including any joint merge, and re-anchors each machine ([`model/mechanism/anchor.ts`](../src/app/model/mechanism/anchor.ts)).
Cancelling a drag is a commit without the save. An edit that captures the pose it is made at, such
as adding a link, welding or dropping a cylinder, is staged the same way through `capturingPose`.
The whole argument is §5.3 of [`edit-mode-playback-plan.md`](edit-mode-playback-plan.md). Once an
edit is committed it lands; it is never reverted afterward for anchor reasons.

### Nothing silently clamps

If the app cannot honor a value, it either refuses and says why, or accepts and warns. It never
quietly changes what the reader typed or sized. Two examples in the source:

- `MechanismService.cylinderReachWarning` warns when a mechanism cannot use its cylinder's whole
  stroke. It does not clamp, because clamping would silently resize a part the reader sized, and it
  would hide the one interesting fact.
- A block that would run past the end of its own slot is refused, not clamped
  ([`position-solver.ts`](../src/app/model/mechanism/position-solver.ts)). The mechanism runs to the
  limit and reverses there, the way a cylinder does at the end of its stroke.

---

## Layout

The screen regions and the components that own them are in the table under [UI
layer](../CLAUDE.md#ui-layer) in `CLAUDE.md`: top strip, left mode card, full-bleed canvas,
transport, view controls, status strip and right drawer. Put a new control in the region whose job
it is. Do not invent a new region.

**There is one breakpoint: 600px.** It is `PHONE_MAX_WIDTH` in
[`viewport.service.ts`](../src/app/services/viewport.service.ts). Ask `ViewportService.isPhone()`,
or key off the class it sets. Do not write another width into a stylesheet. Below the breakpoint
the mode panel becomes a bottom sheet. The sheet starts collapsed, declares
`data-canvas-inset="bottom"` so the canvas frames above it, and publishes `--sheet-height`.
`isTouch` is a separate question: the layout follows the window, but the words for a gesture follow
the input. `e2e/mobile.mjs` guards the phone layout.

---

## Motion

- **Motion shows a change the reader watched happen.** The `segmented-block` pill slides between
  two options when the reader presses one, but snaps into place when the control first appears. A
  pill sliding into a panel that has just opened suggests a choice that nobody made.
- **Animate between measured sizes, not between caps.** `LeftTabsComponent.slide` measures the
  bottom sheet's real heights and animates between them with the Web Animations API. A CSS
  transition on `max-height` spends most of its time moving a ceiling nothing touches. The result
  looks like a snap followed by a crawl.
- **Respect reduced motion.** Every animation checks `prefers-reduced-motion: reduce`: in script,
  as `slide` does, or in a `@media` block, as `segmented-block` and `loading-overlay` do. Where a
  panel ends up is not an animation, so it still happens.
- **Prove it with a filmstrip, not a screenshot.** A screenshot shows the end state, and motion bugs
  live in the frames before it. Use [`e2e/filmstrip.mjs`](../e2e/filmstrip.mjs) and its contact
  sheet, and look at the sheet yourself. The [`ui-validate`](../.claude/skills/ui-validate/SKILL.md)
  skill makes this mandatory for anything that animates or responds to a drag.

---

## Canvas grammar

The source is [`joint-types-plan.md` §2.8](joint-types-plan.md#28-visual-grammar). In short:

- **Link colors carry no meaning.** They are generated per link, and nothing on the canvas may depend
  on which color a link has.
- **Carrier and rider are told apart by structure, not color.** The slot is a hole in the carrier,
  the block sits in the hole, and the rider attaches at the marker. A slot's block is a fixed dark
  neutral. A slide's block is a darkened shade of the rider's own color.
- **The driven arrow is always white.** Both kinds of block are forced dark so that the arrow stays
  visible.
- **The selection ring is interaction state only.** Never use it to show a joint's type.

A gallery of canvas entities is planned for stage S6 of the bodies-and-joints migration, not built
yet. Its stories will go in [`src/stories/canvas/`](../src/stories/canvas/README.md).

---

## Words

**One thing, one name. Say what happened, why, and what to do about it.**

[`ui-vocabulary.md`](ui-vocabulary.md) is the only place that defines vocabulary: which verb, which
noun, Title Case or sentence, what a tooltip is for. Link to it; do not copy from it. If a word you
need is not there, add it there first.

Spell American English, in identifiers as well as prose. See [the spelling
rule](tips-and-tricks.md#spelling-american-everywhere). [`e2e/ui-copy.mjs`](../e2e/ui-copy.mjs)
reads the running app and fails on banned words.

Messages go through `NotificationService`
([`notification.service.ts`](../src/app/services/notification.service.ts)). Choose the kind by who
acted, not by how bad it is:

- `refusal`: the app declined something the reader just asked for.
- `warning`: the drawing is now in a state that is worth knowing about.
- `news`: something happened, and nothing failed.
- `success` and `failure`: the remaining two cases.

The gallery shows all five kinds.

---

## Components and tokens

**Build from BLOCKS.** The primitives in `src/app/component/BLOCKS/` are shown state by state in
the gallery. Run it with `npm run storybook`, or build it as a static site with
`npm run build-storybook`. Its stories are in `src/stories/blocks/`. Use a block for each job:

| Job | Block |
| --- | --- |
| A labeled number | `input-block` |
| A pair of numbers | `dual-input-block` |
| A choice of one option | `segmented-block`, or `radio-block` when bound to a form |
| A switch | `toggle-block` |
| A panel card | `panel-section` |
| A hand-written `<input>` | add `appStandardField` |

If a block cannot do what you need, extend the block and add a story for the new state. Do not copy
a neighbor's CSS into a new component; that is how the app once had three different pick-one
controls. A block's styles are a theme mixin, `@include`d from `src/mytheme.scss`, so a new block
needs its mixin added there as well.

**New colors, radii, shadows and gaps must be tokens.** A token is a CSS custom property on `:root`,
defined once in [`src/styles/_tokens.scss`](../src/styles/_tokens.scss) and grouped by role:
surfaces, borders, text tiers, brand, selection, accent, warning, refusal, success, canvas marks,
shadows, radii and the card gap. Write `var(--token)`; no import is needed.

- **Reach for a role, not a shade.** There are about sixty tokens because every distinct hex the
  stylesheets once used was collapsed into the role it was playing. If no role fits, add one; do
  not add a second shade of one that does.
- **A raw hex color in a component stylesheet fails CI.** `npm run lint:styles` (stylelint) rejects it
  everywhere but the token file. If no role fits, add one there, with a comment saying what it is
  for.

The gallery's **Tokens** page reads the custom properties from the loaded stylesheets at runtime,
so it always shows what is actually defined.

---

## UI pull request checklist

Copy this into the PR description, and check each box.

- [ ] A screenshot is attached, or a **filmstrip** if anything moves or responds to a drag.
- [ ] Every refusal reason comes from the model that enforces the rule. No rule is restated in a
      template.
- [ ] Every new or changed word is checked against [`ui-vocabulary.md`](ui-vocabulary.md).
- [ ] The spelling is American English, in identifiers and in copy.
- [ ] `e2e/ui-copy.mjs` was run against the change and passes.
- [ ] A new or changed BLOCKS state has a story.
- [ ] One gesture is one undo, and nothing clamps silently.
- [ ] Layout changes were checked below 600px (`e2e/mobile.mjs`) and with reduced motion on.
