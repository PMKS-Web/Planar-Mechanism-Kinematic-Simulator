# Words this app uses

> **Status:** Reference — follow it when writing any label, message or tooltip. `e2e/ui-copy.mjs` enforces its spelling rule.

A reference for anyone adding a label, a message or a tooltip. It exists
because the words drifted further than the code did: four verbs for adding a
thing, three names for playing the mechanism, and two ideas about what a message
is for. See `docs/ui-copy-audit.md` for the survey this came out of.

The rule underneath all of it: **one thing, one name — and say what happened,
why, and what to do about it.**

---

## Voice

**Controls are Title Case. Everything else is a sentence.**

| | |
| --- | --- |
| Buttons, menu items, section headings, field labels | `Add Cylinder`, `Input Settings`, `Starts at` |
| Messages, tooltips, refusals, warnings | `Switch to Edit mode to change the mechanism.` |

One carve-out: the **action chips on a notification** stay sentence case, because they are
written as the end of the sentence above them — `Keep it, insert a new one` is a phrase, not
a control name, and Title Case makes it absurd.

**Spell American.** `analyze`, `analyzed`, `analyzing` — never `analyse`. The noun is
`Analysis`, which is spelled the same either way, and it is what named the modes.

**Write to the person, about their mechanism.** Not about the program.

| Instead of | Write |
| --- | --- |
| `Check Force Angle` | `That is not an angle. Type a number of degrees.` |
| `Cannot edit while in Synthesis mode. Switch to Edit mode to edit` | `Switch to Edit mode to change the mechanism.` |
| `This feature is not available yet` | `Not built yet.` |
| `Don't link a joint to itself` | `A link needs two different joints.` |

**Say the way out.** A refusal that only names the wall makes the user guess. A
refusal that names the door costs the same number of words.

**Do not announce what the user just did.** Deleting something removes it from
the screen; pressing Undo moves the mechanism. `Deleted Selected Object.` and
`Redo Called!` both shipped, and both told the user something they had just
done on purpose. The snackbar is the one channel for saying something they
*could not* see, so spending it on confirmations is expensive.

**Two sentences is a tooltip's ceiling.** It is read one-handed with the pointer
held still. If a third sentence is needed, the control needs a better label or
the canvas needs to show it.

**A tooltip says the one or two things the reader cannot work out from what is
already on screen.** Everything else is padding, and padding is what pushes the
useful sentence out of the first line. In particular:

| Do not spend a tooltip on | Because |
| --- | --- |
| the unit the field is in | it is printed in the field |
| that the setting is kept in the URL | everything is; the URL *is* the document |
| how the value is used internally | that is a comment, not a tooltip |
| the mode the reader is already in | `Available in Edit mode`, read from Edit mode, is the one line that cannot help |
| a name for a thing the app never draws | `swatch`, `reciprocating mass`, `Right hand rule` — jargon the reader has no way to attach to anything |

`Joint Color` needs `The color of this joint.` and nothing else. A way out
belongs in a tooltip **only while the control is actually grayed** — build it
conditionally, the way `SettingsService`'s units note is, so the sentence
appears for the reader it can help and for nobody else.

---

## Naming things

### Verbs

| Where | Verb | Examples |
| --- | --- | --- |
| On the bare grid — a new free-standing member | **Add** | `Add Link`, `Add Cylinder` |
| On an existing object — a member joined to it | **Attach** | `Attach Link`, `Attach Cylinder`, `Attach Tracer Point`, `Attach Force` |
| A property that is present or absent | **Add** / **Remove** | `Add Ground` / `Remove Ground`, `Add Input` / `Remove Input`, `Add Slider` / `Remove Slider` |
| Fusing bodies | **Weld** / **Unweld** | `Weld Joint`, `Unweld Joint`, `Un-weld All` |
| Removing anything | **Delete** | `Delete Joint`, `Delete Link`, `Delete Cylinder` |

`Make` is gone. It survived in one place — `Make Force Global` / `Make Force
Local` — precisely because that pair was a switch between two states rather
than the presence or absence of one, and the right-click menu now writes states
as states: the row is `Global Frame`, ticked or not. Do not reach for `Make`
anywhere.

### Verbs, and the switches that are not verbs

The rule above is for **controls that do something**. A control that *describes
a state the object is already in* is named after the state and carries a tick,
so no label rewrites itself as it is used:

| A verb, because it acts | A state, because it describes |
| --- | --- |
| `Attach Link`, `Delete Joint`, `Reverse Direction` | `Grounded`, `Driven Input`, `Locked`, `Trace Path`, `Global Frame`, `Drawn as a Disc` |

The Edit panel spells the same states the same way — its toggles read
`Grounded` and `Trace Path`, not `Ground` or `Show Joint Path`. Where the panel
has a button rather than a switch it names the act without reaching for
`Make`: the disc control is `Draw as a Disc` / `Draw as a Bar`, which is the
right-click menu's `Drawn as a Disc` said as a verb.

### A joint's type

A joint is one of four things, and the reader picks which in one choice,
**Joint Type**, in the Edit panel and at the top of a joint's right-click menu.
It replaced two switches, `Slider` and `Welded`, which between them hid the
four. The values are Title Case, because each one labels an option:

| Value | What the joint is |
| --- | --- |
| **Revolute** | a pin: the bodies meeting here turn about it |
| **Prismatic** | a block welded to what rides it: it slides along its slot and does not turn |
| **Pin-in-slot** | a pin riding a slot: it slides along the slot and turns in it |
| **Welded** | the bodies meeting here fused into one |

**Welded** is the type's name as well as the state it describes, because it is
the same fact. **Grounded** is not a type: it stays a switch beside the choice,
and turning it on swaps the four glyphs for the set that stands on the frame.

| Use | For |
| --- | --- |
| **Slider Angle** | the field that aims a grounded slot, on a row of its own under Grounded |
| **Nowhere to slide.** | the bold lead of the one state the choice says in words: a block with no slot and no ground. `dangling` is the code's word for it, never the reader's |
| **Starts at** | where a cylinder's rod begins its cycle, as a share of the stroke |
| **Barrel**, **Rod** | a cylinder's two members, once each has a panel of its own (Stage 2 of `joint-type-and-cylinder-plan.md`) |
| **Split Joint** | action that replaces one shared point with one slightly separated Revolute pin per link; Title Case on controls |
| **inside a cylinder** | the short refusal on either joint a cylinder places for itself — the square it slides on, and the barrel's buried end (Stage 2) |
| **ground an end joint instead** | the refusal on Grounded at that square: a cylinder is bolted to the world at its ends, never in the middle |

The Edit panel's toggles already worked this way; the right-click menu followed
in the context-menu redesign, which is why `Add Ground` / `Remove Ground` no
longer appear there. On a menu whose group heading already carries the verb —
`ADD` on the bare grid, `ATTACH` on a part — the rows below it are bare nouns
(`Link`, `Cylinder`, `Tracer Point`), because the heading has said the verb
once and repeating it down five rows says nothing new.

### Refusals wear their reason

A control a reader could reasonably expect is **grayed with the reason beside
it**, in three or four lower-case words — `needs 2 links`, `it is driven`,
`unlock first` — with the model's own longer sentence on hover. A control that
is *structurally* impossible for that kind of object is **absent**, because a
row that can never be used on any joint of this kind is noise rather than
information. Nothing is clickable and then refused by a snackbar.

**Delete means the thing you named goes**, along with anything that cannot
stand without it. `Delete Cylinder` on one of a cylinder's joints deletes the
cylinder and leaves the joint if another link still holds it; `Delete` on that
joint deletes the joint. If those two want different outcomes, they need different labels — which
is why they have them. What goes with it is named **on a second line** — `Delete Joint` with `Also removes Link OA`,
or `Delete Link` with `Also removes Joints C, D`. This keeps the menu compact and leaves its
keyboard shortcut visible. A **Lock never grays a delete row, nor an attach row**: it says where a part is,
not whether it may go or what may be built onto it.

### The mechanism

| Use | For | Not |
| --- | --- | --- |
| **mechanism** | one machine on the grid — a drawing may hold several, named M1, M2… | ~~linkage~~ (stops being true the moment it has a cylinder), ~~assembly~~ |
| **project** | the saved document | — |
| **animation** | playing the mechanism | ~~simulation~~, ~~playback~~ (internal only) |
| **input** | in controls: the driven joint | — |
| **driven** | in prose about the mechanism | ~~actuator~~ (internal only) |
| **Synthesis / Edit / Kinematic / Force** | the four modes, capitalised as the tabs spell them | ~~Analyze~~ (it split into Kinematic and Force), ~~analysis mode~~ |

`Share Project` and `New Project` are about the document, and stay.

### Parts

| Use | For |
| --- | --- |
| **joint** | a pin, a slider, a tracer point — anything with an id letter |
| **link** | a bar between joints |
| **body** | a link carrying more than two joints — it is not a bar any more |
| **compound** | several links welded into one rigid body |
| **ground** | a joint fixed to the frame |
| **slider** / **block** | a joint that slides, and the black block drawn on it |
| **slot** | the channel a floating slider runs in |
| **force** | an applied load |

### Units and numbers

Show the unit the mechanism is currently in — never a list of the alternatives.
`in {{ forceUnitLabel }}`, not `in Newtons | lbf`. The parser accepts a bare
number or a number with a unit, and messages should say so once:
`Type a number, with or without a unit — 2, 2 cm, 0.75 in.`

Spell it **center of mass** in prose and **CoM** in a label. Not `COM`, not
`Center of Mass` mid-sentence, not both forms in one panel.

---

## The cylinder

| Use | For | Not |
| --- | --- | --- |
| **cylinder** | the whole part | ~~ram~~ |
| **barrel** | the fat outer body it slides in | ~~cylinder~~ (that is the whole part here) |
| **rod** | the thin bar that slides out | — |
| **joint** | either end, where it attaches — and the square between them | ~~mount~~, ~~seal~~ |
| **stroke** / **travel** | how far the rod moves | — |
| **closed** / **open** | the two ends of the travel | ~~retracted~~, ~~extended~~ |
| **closing** / **opening** | which way it is moving right now | ~~retracting~~, ~~extending~~ |

The black block on the rod is **a joint, and is called one**. It is the sliding
joint the rod hangs on: it wears a letter, it can be selected, dragged and given
an input, and its panel is headed `Edit Joint C` like any other (Stage 2c,
decision D9). What it must not be called is a piston, a head or a seal —
describe what it does, "where the rod begins its cycle", if it needs describing
at all.

**`mount` is a code word, not a user word.** `barrelFar`, `rodFar`,
`dragCylinderMount` keep it, because in code it usefully separates the two
joints at the ends from the ones the part places for itself. A user never sees
the barrel's buried inner end, and calls all three of the rest "joint", so
"joint" is unambiguous from their side. Same treatment as `playback` and
`actuator`.

**The barrel's buried inner end is never named, anywhere a reader reads.** Not
on the canvas, not in a panel, not in a menu, not in a notification, not in an
`aria-label`, and **not in a file the app writes** — no CSV column, no JSON
field, no DXF layer name, no report. A link's id is the sorted ids of its
joints, so the name to avoid is not only `C1` but every id built on one: `CC1`
for the barrel, `CC1F` for a bracket welded to its mount. `visibleBodyName` in
`model/body-label.ts` is the one answer, reached through
`MechanismService.visibleBodyName` / `bodyLabel` on screen and through
`services/export/export-names.ts` in a file. The **one exception** is the
developer drawer (right-panel tab 4), which production never reaches and which
exists to show the model as the model is. `e2e/hidden-joint-audit.mjs` is what
keeps the rest honest. This used to say the ids were fine in an export because
the export was keyed on them; the maintainer overruled it on September 21,
2026 — "a user should not see it under any circumstance" — and a key that has
to stay unique now says what kind of body it is (`AD welded`) rather than
falling back to the id.

**Barrel and Rod are the names in every mode, not just Edit.** The two members
are selected apart and hold different numbers, so `Kinematics for Barrel AC` and
`Forces for Rod CB` read exactly as `Edit Barrel AC` and `Edit Rod CB` do, and
the cylinder's own name — `Cylinder AD`, by its two end joints — is for the
whole part: the export catalog's row for it, and a sentence about the part.

**`ram` survives in code comments** — 113 of them — and was left there
deliberately. This guide governs what the app *says*; rewriting a hundred
explanations to change a synonym would churn a lot of carefully-worded prose for
no reader's benefit. Do not use it in new comments, and never in the UI.

### Editor bug-fix wording

Use **Flip Force** for reversing the arrowhead at fixed endpoints; this reverses the physical force while the application-point disc stays on the body. Its ring means Grid; its keyway means Local. **Input** is the noun for a joint that supplies motion; the generic setup hint is “Ground a joint and set one joint as an input.” Keep specific failure explanations when setup is already complete. A context-menu refusal that needs the initial pose says “return to start.” Restarting the tutorial offers **Cancel**. A disconnected joint says “Joint is Orphaned. Drag another joint to merge it or create a new link.”
