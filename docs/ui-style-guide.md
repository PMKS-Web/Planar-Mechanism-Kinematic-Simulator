# UI style guide

> **Status:** Reference — how anything a reader sees should look, behave and be worded.

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

**There is one layout breakpoint: 600px.** It is `PHONE_MAX_WIDTH` in
[`viewport.service.ts`](../src/app/services/viewport.service.ts) and `$phone-max-width` in
[`left-tabs.vars.scss`](../src/app/component/left-tabs/left-tabs.vars.scss), and
`stylesheet-fences.spec.ts` fails if the two ever differ. Ask `ViewportService.isPhone()`, key off
the class it sets, or write `@media (max-width: nav.$phone-max-width)`. Below the breakpoint the
mode panel becomes a bottom sheet. The sheet starts collapsed, declares
`data-canvas-inset="bottom"` so the canvas frames above it, and publishes `--sheet-height`.
`isTouch` is a separate question: the layout follows the window, but the words for a gesture follow
the input. `e2e/mobile.mjs` guards the phone layout.

**A width two files share is named in `left-tabs.vars.scss`**, beside the card gap and the rest
of the chrome's measurements: `$lower-line-tightens` (720px, where the transport and the view
controls give up padding together), `$narrow-phone` (380px, the narrowest window the chrome is
laid out for), `$cluster-wraps` (780px) and `$cluster-clears-panel` (1340px). A media query that
writes one of those numbers as a literal fails the spec. A width one element needs for itself
alone may stay a literal, with a comment saying what overflowed at it.

**Layers are tokens.** Who paints over whom at the app level is the `--layer-*` group in the token
file: panel, strip, status, cluster, drawer, menu, toast, loading, in that order. A card's own
stacking context keeps small literals (a sticky head over its rows, a thumb over its track), and
`isolation: isolate` on the card keeps them local. Do not write a new number above 9 anywhere
else; if two cards need a new order, name the layer.

---

## Motion

- **Motion shows a change the reader watched happen.** The `segmented-block` pill slides between
  two options when the reader presses one, but snaps into place when the control first appears. A
  pill sliding into a panel that has just opened suggests a choice that nobody made.
- **Animate between measured sizes, not between caps.** `LeftTabsComponent.slide` measures the
  bottom sheet's real heights and animates between them with the Web Animations API. A CSS
  transition on `max-height` spends most of its time moving a ceiling nothing touches. The result
  looks like a snap followed by a crawl.
- **Reduced motion is honored in one place.** [`src/styles.scss`](../src/styles.scss) shortens
  every transition and animation to nothing under `prefers-reduced-motion: reduce`, so a
  stylesheet needs no guard of its own. A script-driven animation still asks `matchMedia` itself,
  as `LeftTabsComponent.slide` does, because the Web Animations API does not read the stylesheet.
  Where a panel ends up is not motion, so it still happens. `e2e/reduced-motion.mjs` opens the
  app with the preference on and checks that everything still arrives.
- **Prove it with a filmstrip, not a screenshot.** A screenshot shows the end state, and motion bugs
  live in the frames before it. Use [`e2e/filmstrip.mjs`](../e2e/filmstrip.mjs) and its contact
  sheet, and look at the sheet yourself. The [`ui-validate`](../.claude/skills/ui-validate/SKILL.md)
  skill makes this mandatory for anything that animates or responds to a drag.

---

## Accessibility

Accessibility is one of the four principles, and it is checked, not assumed.

- **Every control works from the keyboard.** A button is a `<button>`, a switch is a switch, and
  a control drawn as a `<div>` needs a role, a `tabindex` and a key handler. App-wide keys go
  through `KeyboardShortcutsService`
  ([`keyboard-shortcuts.service.ts`](../src/app/services/keyboard-shortcuts.service.ts)), the one
  registry: a shortcut gets an id, a section and a label there, and `appShortcutTip` shows its
  keys in the control's tooltip.
- **Focus is visible.** A focused control shows a ring. Style `:focus-visible`, so a mouse click
  does not draw one, and never write `outline: none` without putting a ring back.
- **An icon-only control has an `aria-label`**, in the vocabulary's words. A control that shows a
  state carries `aria-pressed`, as `app-view-button` does. A grayed control carries its reason
  where a screen reader can reach it, not only in a tooltip.
- **Color is never the only signal.** The canvas grammar says so for links; it holds for chips,
  banners and rows too. A refusal is red and says so.
- **Contrast is a property of a token pairing**, so it is decided once, in the token file, and
  not per component. A new pairing of text and surface is a new decision: 4.5:1 for text, 3:1
  for a large label or a control's edge.
- **The gallery's Accessibility panel is the check.** It runs axe on the story that is open;
  open it for a new or changed story and clear what it reports before the story merges.
  `e2e/mobile.mjs` covers touch: a held finger opens the menu, and the sheet's handle is 44px,
  the smallest thing a thumb can be asked to hit.

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
`npm run build-storybook`. Its stories are in `src/stories/blocks/` and `src/stories/shared/`.
Use the component that does the job:

| Job | Component |
| --- | --- |
| A labeled number | `input-block` |
| A pair of numbers | `dual-input-block` |
| A length or angle with a padlock to hold it | `hold-field-block` |
| A bare field with a derived-or-typed mark | `state-input` |
| A hand-written `<input>` | add `appStandardField` |
| A color | `color-picker` |
| A choice of one option | `segmented-block`, or `radio-block` when bound to a form |
| A switch | `toggle-block` |
| The panel's stroked button | `button-block` |
| Two buttons on one row | `dual-button` |
| A view toggle that shows its state | `app-view-button` |
| A panel card, and a section of it that folds | `panel-section`, `collapsible-subsection` |
| A heading, large or small | `title-block`, `subtitle-block` |
| The editable name at the top of a panel | `editable-title-block` |
| The refusal strip under a panel's title | `app-edit-banner`, `app-lock-banner` |
| A message to the reader | `NotificationService`, never a snackbar of your own |
| An action on a part | a row in `ContextMenuBuilderService` |

If a block cannot do what you need, extend the block and add a story for the new state. Do not copy
a neighbor's CSS into a new component; that is how the app once had three different pick-one
controls. A block's styles are a theme mixin, `@include`d from `src/mytheme.scss`, so a new block
needs its mixin added there as well.

**New colors, radii, shadows, gaps and layers must be tokens.** A token is a CSS custom property
on `:root`, defined once in [`src/styles/_tokens.scss`](../src/styles/_tokens.scss) and grouped
by role: surfaces, borders, text tiers, brand, selection, accent, warning, refusal, success,
canvas marks, washes, shadows, radii, the card gap and the layers. Write `var(--token)`; no import
is needed.

- **Reach for a role, not a shade.** There are about sixty tokens because every distinct hex the
  stylesheets once used was collapsed into the role it was playing. If no role fits, add one; do
  not add a second shade of one that does.
- **A raw hex or named color in a component stylesheet fails CI.** `npm run lint:styles`
  (stylelint) rejects both everywhere but the token file. If no role fits, add one there, with a
  comment saying what it is for.
- **A raw `rgba()` is the same mistake, and stylelint cannot see it.** Text ink is a tier of
  the `--text` ladder, never black at an alpha; the ladder is what the stylesheets' 180-odd
  alphas were folded onto. What remains, under ninety, is black at a low alpha on a border, a
  wash, a shadow or a divider, and `stylesheet-fences.spec.ts` holds that count so it can only
  go down. Use the wash (`--hover-wash`, `--press-wash`) or the shadow (`--scroll-shadow`,
  `--thumb-shadow`), name a new role in the token file if none fits, and lower the ceiling when
  you remove some.
- **Two places may write a color literal**: the canvas, where a mark's color is decided at
  runtime from the link it belongs to, and the exporters, whose output has to stand on its own
  outside the app. Both are named in the token file's header.

The gallery's **Tokens** page reads the custom properties from the loaded stylesheets at runtime,
so it always shows what is actually defined.

---

## UI pull request checklist

The pull request template ([`.github/pull_request_template.md`](../.github/pull_request_template.md))
carries the checklist for a change a reader can see: a screenshot or a filmstrip, refusals quoted
from the model, words checked against the vocabulary, a story for a new block state, one undo per
gesture, the phone layout, reduced motion and the keyboard. GitHub fills it in; do not delete the
section for a change a reader can see.
