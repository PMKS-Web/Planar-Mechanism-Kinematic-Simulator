# Every message the app can say

An inventory of the snackbar, taken **before** rebuilding it, and kept as the
record of what was there. Only messages that were **reachable** are listed — a
call site that no template bound, or that sat behind a comment, is in the dead
list at the bottom instead.

> **This describes the old system.** What replaced it is in
> `src/app/services/notification.service.ts`: four kinds (`success`, `refusal`,
> `warning`, `failure`), each with its own colour, glyph, and answer to whether
> it takes itself away; a cooldown per message id rather than one for the whole
> app; up to three on screen at once; and an optional action, so a message that
> knows the fix can carry it. Every message below now has an id. The faults
> listed under "What is wrong with the system" are fixed except where marked.

Two surfaces existed:

- `NewGridComponent.sendNotification(text, rateLimitMS?)` — everything below
  except one. Top-centre, white, 4s, no icon, no dismiss.
- `UrlProcessorService` opened its own `MatSnackBar` directly, without the
  `my-custom-snackbar` class or the rate limit.

Nothing carried a severity, an id, or an action.

---

## Good — something the user wanted, happened (3)

| Message | Reached by |
| --- | --- |
| `Loaded Mechanism from File` | Project menu → Open, after the file reads |
| `Mechanism URL copied. If you make additional changes, copy the URL again.` | Project menu → Share Project |
| `Message sent. Thank you for your feedback!` | Help → feedback form, on success |

## Neutral — it happened, but you should know something (4)

| Message | Reached by |
| --- | --- |
| `Merged joint A into B, but B cannot be welded` | Dragging a joint onto a weldable target that cannot take the weld |
| `A and B are now pinned together twice. The linkage still moves, but its forces have no unique solution.` | An edit that creates a duplicate pin |
| `The visual size of the links might be too small. Try using the "Update Object Scale" button…` | Zooming far out — **but see the rate-limit note** |
| `The visual size of the links might be too large. Try using the "Update Object Scale" button…` | Zooming far in — same |

## Bad — you tried something and it did not happen (39)

### Wrong mode, wrong moment (4 texts, many doors)

| Message | Reached by |
| --- | --- |
| `Switch to Edit mode to change the mechanism.` | Any drag or context menu in Analyze |
| `Switch to Edit mode to change the mechanism.` | Same text, separate constant, in Synthesis |
| `Cannot edit while the animation is running.` | Drag, context menu, or any context-menu item while animating |
| `Step back to the start to edit.` | Drag or context menu at a timestep other than 0 |

### Refused drops (11) — all from dragging one joint onto another

`A joint cannot be merged into itself` ·
`These joints are on the same link, so merging them would collapse it` ·
`Drop onto the pin of a slider, not onto its slot` ·
`Only one of these joints can carry a slider` ·
`Merging here would tie the same two joints together twice, over-constraining the linkage` ·
`A slider cannot ride on a link it is part of` ·
`This joint cannot be merged` ·
`A cylinder is one sealed part — attach at its mounts instead` ·
`A welded joint cannot merge with a cylinder mount — unweld it first` ·
`A driven joint can only join two bodies — remove the input first, or attach somewhere else` ·
`A cylinder cannot fold onto itself`

Each is also drawn on the canvas as a refusal marker and a shake, so the
snackbar is the third telling of the same fact.

### Refused inputs (4) — right-click → Add Input

`Only a joint can be driven.` ·
`This joint is welded, so the bodies it joins cannot move relative to each other. Unweld it, or drive a joint that has a freedom.` ·
`A driven joint needs two bodies to move relative to each other.` ·
`This joint joins N bodies, so "driven" would not say which pair moves. Drive a joint where exactly two meet.`

### Refused structural edits (6)

| Message | Reached by |
| --- | --- |
| `This joint is welded, so a cylinder mounted on it would be a third body inside one rigid one. Unweld it, or attach the cylinder to the link instead.` | Drawing a cylinder onto a welded joint |
| `A cylinder is one sealed part — delete the cylinder instead of editing its slider.` | Editing a cylinder's slider |
| `Several links meet at that joint, so a force there would not say which one it acts on.` | Attaching a force at a multi-link joint |
| `That is the shortest cylinder there is — any less and the barrel has no room to slide in.` | Dragging a cylinder shorter than its minimum |
| `Those two joints are already on one link.` | Drawing a link between two joints already linked |
| `Cannot link to a bar. Please create and select a tracer point on the link.` | Starting a link from a bar |

### Nothing selected (1)

`Select something first — Delete removes whatever is selected.` — Delete key

### Rejected typed values (6, `NOT_A`) — was debug-only, now on every field

`That is not a length. Type a number, with or without a unit — 2, 2 cm, 0.75 in.` ·
`That is not an angle. Type a number of degrees.` ·
`That is not a mass. Type a number.` ·
`That is not a moment of inertia. Type a number.` ·
`That is not a force. Type a number.` ·
`A name has to be letters or numbers, and cannot be one already in use.`

These fired only from the linkage table, inside the Debug tab (Project menu →
Debug), while the Edit panel put the old value back without a word.

They now fire from all thirteen of the Edit panel's numeric fields as well, and
each one names the units its field accepts. Every numeric field in the app takes
`2 cm` and `0.75 in` as readily as `2`, and nothing on screen said so — a
rejected value is the moment somebody is most willing to be told.

### Rejected renames (2) — Edit panel title

`The new ID cannot be empty.` · `The new ID must only contain letters and numbers.`

### Feedback form (3)

`Please fill out the form correctly.` ·
`It looks like you are in a development environment. If this is not the case, please try again later or contact us directly at: gr-pmksplus@wpi.edu` ·
`Message failed to send. Please try again later or contact us directly at: gr-pmksplus@wpi.edu`

### File and URL (2)

`No file selected` — Project menu → Open, cancelled ·
`Unable to load the shared mechanism URL.` — a share link that will not decode
(the one message that bypasses `sendNotification` entirely)

## Does not belong to any of the three (1)

| Message | Reached by |
| --- | --- |
| `You attempted to undo. What were you trying to undo? Please let us know through the report button in the help section.` | **Ctrl/Cmd+Z** |

Undo exists and works — it is a button in the top bar, backed by
`SaveHistoryService`. The keyboard shortcut for it fires a user-survey question
from an earlier study and undoes nothing. Verified in the browser: the message
appears, the model is unchanged.

---

## What is wrong with the system, not the words

1. **Ctrl+Z asks a survey question instead of undoing.** Above.

2. **The rate limit is global, and starts armed.** There is one
   `lastNotificationTime` for the whole app, set to `Date.now()` when the canvas
   is constructed. So:
   - nothing at all can be said in the first second after load;
   - the two zoom warnings pass `20000`, which means they are muted for the
     first twenty seconds of every session, and for twenty seconds after any
     other message — I could not make them appear at all until I waited the
     window out, and then they appeared immediately;
   - two *different* refusals within a second show only the first. Drag-refuse,
     then click-refuse, and the second is silent.

3. **Every message looks identical.** Same white bar, same place, same 4s.
   `Message sent. Thank you for your feedback!` and `A cylinder cannot fold onto
   itself` are indistinguishable until you read them.

4. **Nothing can be dismissed or kept.** The action is `''`, so there is no
   button; 4 seconds or nothing. A message you were still reading is gone, and
   a message you have already understood sits there.

5. **Two snackbar paths.** `UrlProcessorService` opens its own, unstyled and
   unlimited, so the one message about a *broken share link* is the one that
   looks unlike the rest.

6. **Messages have no identity.** They are bare strings, so nothing can be
   deduplicated, grouped, counted, replaced in place, or asserted on by id.

7. **Six of them are unreachable outside the Debug tab**, while the panel that
   ships rejects the same bad values in silence.

8. **Two constants, one sentence.** `CANNOT_EDIT.analyzeMode` and
   `.synthesizeMode` hold the same text.

---

## What changed

Fixed:

- **Ctrl+Z undoes**, and Ctrl+Shift+Z / Ctrl+Y redo. Neither says anything. A
  keystroke aimed at a text field is left to that field, which also stops
  Delete from removing a joint while its name is being typed.
- **The cooldown is per message id**, and starts unarmed. Two different
  refusals in the same second both speak; the same one twice speaks once; a
  message asking for a long quiet period can speak the moment the page loads.
- **The four kinds look different** — colour on the glyph and the left edge,
  the sentence in the app's own text colour.
- **Warnings and failures wait to be dismissed**; successes and refusals take
  themselves away. Everything has a close button.
- **One path.** `UrlProcessorService` goes through the service like everything
  else.
- **Messages have ids**, so they can be deduplicated and asserted on. `e2e/notifications.mjs`
  does both.
- **Up to three stand at once.** The old snackbar showed one and took the
  previous one away to do it, so a refusal could silently swallow a warning
  nobody had read. A fourth displaces the oldest message that was going to
  leave by itself, never one still waiting to be dismissed.
- **A message can carry its own fix.** The zoom warnings offer *Fit to zoom*,
  which is the button they used to send the reader to Settings to find.

Removed entirely:

- **The four mode and timing refusals** — "Switch to Edit mode to change the
  mechanism", "Cannot edit while the animation is running", "Step back to the
  start to edit". Every guard stays; none of them announces itself. Which mode
  you are in is written across the top strip and down the side of the window,
  and whether the animation is running is the thing you are watching.
- **The four driven-joint refusals**, which turned out to be unreachable. Both
  the context menu item and the panel button are disabled on `canToggleInput`,
  which is `input || canDrive` — and `canDrive` is exactly "describeActuator
  did not refuse", asked of the same joint `adjustInput` re-tests. Checked
  across all 25 templates: 147 presses of every enabled control, no refusal.
  The guard stays, silent. The four sentences are still used by the setup
  panel's blocker list, which is where they are actually read.

Reworded or removed:

- `No file selected` — **gone**. It fired when the file picker was dismissed,
  and cancelling a dialogue is not a thing that went wrong.
- The two zoom warnings no longer name buttons; they say what is wrong and
  where to fix it.
- `Mechanism URL copied. If you make additional changes, copy the URL again.` →
  `Link copied. Copy again after your next change.`
- `Loaded Mechanism from File` → `Mechanism loaded.`
- `Cannot link to a bar. Please create and select a tracer point on the link.` →
  `A link joins two joints. Add a tracer point to that bar, then draw to it.`
- `Merged joint A into B, but B cannot be welded` now says what became of the
  weld, and waits.
- `Unable to load the shared mechanism URL.` now says what probably caused it.
- The context menu's guard said the animation was running when what it had
  actually tested was the timestep. It now says what it tested.

Still open:

- **The eleven drop refusals** are still messages, on top of the canvas refusal
  marker and the joint shake. Kept deliberately for now.
- **The six `NOT_A` messages** now fire from the Edit panel too, but the
  linkage table they came from is still reachable only through the Debug tab.
  Whether that table should exist at all is a separate question.

Closed since:

- **Deleting a joint is now undoable** (`Let Ctrl+Z put back a joint you
  deleted`). It ended in `finishStructuralEdit(false)`, so no history entry was
  written and Undo could not bring it back — found while wiring Ctrl+Z, which
  is what made it visible.

## Dead — coded but not reachable

- `synthesis-panel.handleButton()` — `Call your backend function with these
  values! A0: (…)`. No template binds it.
- `NOT_BUILT_YET` in `ui-text.ts` — exported, never imported.
- ~20 commented-out debug calls in `synthesis-panel.component.ts`.
- The Escape-key easter egg and the "tutorial is not ready yet" message, both
  commented out.
