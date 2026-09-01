# PMKS+ — Analysis-mode editing: visual brief

**For:** design review
**Scope:** the visual treatments added when we made the analysis modes editable. Behaviour is
shipped and working; this brief is about how it *looks*, and where I think it needs a second opinion.

---

## What the feature is

PMKS+ is a linkage simulator. Historically the two analysis modes (Kinematic, Force) were read-only:
you built a mechanism in Edit, switched to analysis, and looked at graphs of position, velocity,
acceleration and reaction force over one cycle of the machine.

That lock is gone. You can now **drag a joint while the graphs are open**, and the graphs re-solve
under your hand. The workflow this exists for is one sentence: *watch the acceleration peak, move
the coupler pivot, watch the peak come down.*

So the central design problem is **comparison**. A curve that changes while you drag tells you
nothing unless you can still see what it was.

---

## 1. The comparison overlay

When a drag begins, the graph snapshots every curve currently plotted and keeps drawing it
underneath the live one.

| | Before curve | Live curve |
|---|---|---|
| Colour | the series' own colour at **35% alpha** | the series' own colour, full |
| Stroke | 2px solid | 2px, **dashed (5) while the hand is down**, solid on release |
| Draw order | behind | in front |
| Legend name | `X before`, `Y before`, `Z before` | `X`, `Y`, `Z` |

Series palette: **X `#313aa7`** (indigo), **Y `#ea2b29`** (red), **Z / Magnitude `#fdb50e`** (amber).

Two encodings are doing work here, deliberately:

- **Ghosting = "earlier."** It's the same word the canvas uses for the start-pose ghost (see §4), so
  a reader learns it once.
- **Dashing = "provisional."** It's dashed only while your finger is down. On release the curve
  becomes an ordinary solid line, because it's no longer a preview — it's what the mechanism does
  now. From then on, ghosting alone separates the two.

**Lifecycle.** One baseline per gesture. It survives the release (the tuning loop is drag → look →
drag again, and taking the comparison away at the moment you finally have a still frame to read
would serve the code, not the reader). It is replaced by the next drag, cleared by the **Clear**
button, and dropped automatically on undo/redo.

**The y-axis rule** is the least obvious part and probably worth scrutiny:

- The axis freezes to the range the *before* curve was drawn to.
- It **widens but never shrinks** while you drag. Recomputed per frame, it swam under the very curve
  you were watching — a drag through a toggle sent it to 30,000 and the next frame brought it back
  to 800, and every frame looked identically tall.
- Outlier trimming (1st–99th percentile) applies **only to the live curve**, and only when the full
  spread is more than 4× the inner spread. Acceleration near a toggle position is a true
  singularity: two samples out of 360 read twenty thousand against a curve whose real range is 0–12.
  Fitted to that, every real feature collapses onto the zero line.

---

## 2. The peak readout

Two curves is squinting. Two numbers and an arrow is reading. So above the plot:

```
peak 35.61  ↘  21.04
```

It is the **largest absolute value** of each curve — before and after — across whichever series are
currently shown. Three states:

| State | Rule | Background | Text | Glyph |
|---|---|---|---|---|
| Improved | after < before | `#e6f4ea` green | `#1e7d32` | `south_east` ↘ |
| Worse | after > before | `#fdf1e3` amber | `#8a6100` | `north_east` ↗ |
| Unchanged | within **0.5%** | `#f4f4f7` grey | `#5f6368` | `drag_handle` — |

Pill: `inline-flex`, `border-radius 9px`, `padding 0 6px`, 13px icon, tabular numerals.

The 0.5% deadband exists because a rounding difference painted green is a lie — an arrow claiming an
improvement nobody made is worse than no arrow.

Both numbers are each curve's **true** peak, deliberately not the trimmed range the axis is drawn
to. Earlier they disagreed with the plot: the pill read `35.61 → 77.13` above a curve that visibly
reached 180. The axis is the thing allowed to trim; a curve leaving the top of the plot is how it
says so.

---

## 3. The chip row that holds it

Sits directly above the chart, flat on the card — a note about what's drawn, not a control sitting
on top of it.

```
▬  Before your drag   [peak 35.61 ↘ 21.04]   (Clear)
```

- **Swatch** — 14×2px, `rgba(0,0,0,0.24)`. Deliberately grey, not a series colour: the chip stands
  for *all* the ghosted curves, and a graph can show three at once, so there is no one colour to
  borrow. What it means is "pale."
- **Label** — 11px, `#5f6368`.
- **Clear** — 18px pill, `#eef1fc` on `#303f9f`.

---

## 4. Related treatments (same feature, other surfaces)

These shipped alongside and share a vocabulary, so they're worth seeing together.

**Start-pose ghost (canvas).** Where the machine's cycle starts, drawn under the live mechanism at
**22% opacity** — same shapes, same colours, plainly the same object earlier. 40% on hover. Pressing
it returns to the start. When a drag takes the linkage somewhere its original start no longer
exists, it becomes a **dotted outline with hollow pins** at 50%, in informational indigo `#303f9f`
rather than an alarm colour — nothing is broken, letting go here just moves the start. A pill tag
`#303f9f` rides the pointer to say so.

**Drag trace (canvas).** While you hold a joint, its full path over the cycle is drawn — literally
the app's existing "Traced Paths" curve, same ink, same weight. *(This was a custom dashed partial
arc until yesterday; it's now the real trace, at the user's request.)*

**Transport row.** A hollow dashed ring marks where the cycle starts on the scrub rail; a
`134° from start` chip appears when you're parked away from it, pressing it goes back, a caret opens
"Move the start here". A `Start moved here` chip (`#e8eaf6` / `#303f9f`) with an inline Undo records
the change.

**Edit panel refusal strip.** When the panel can't be typed into, a full-bleed 54px strip in
`#e8eaf6` / `#303f9f` directly under the title, with the way out written as an *underlined word
inside the sentence* rather than a button beside it. Fixed height in all five states.

**Corner card.** Undo/Redo live there in Edit; Export Data slides in from the right (220ms,
`cubic-bezier(0.4,0,0.2,1)`, animating width + margin so the card grows *with* it) when you enter an
analysis mode.

---

## 5. Where I'd like a designer's eye

Ranked by how unsure I am:

1. **The green/amber peak pill makes a value judgement.** "Smaller peak" is usually what someone
   wants, but not always — and colouring it as good/bad may be overstepping for a teaching tool. Is
   a neutral delta better?
2. **35% alpha on the amber series (`#fdb50e`) is very faint** against white — much weaker than the
   same treatment on indigo. Should ghosting be a fixed grey, a fixed alpha, or per-colour tuned?
3. **Two encodings changing at once** on release (dashed → solid) may be one change too many. Is
   ghosting alone enough to carry "before", with the live curve solid throughout?
4. **The chip row competes for its slot.** An amber "No solution at N of M positions" banner can
   occupy the same strip above the chart. They currently never show at once (the banner is hushed
   mid-gesture) but they are two different shapes in one place.
5. **The peak numbers carry no unit** — the unit is only on the axis. `peak 35.61 → 21.04` is
   ambiguous read on its own.
6. **The panel is 250px wide in Edit and 400px in analysis.** The chip row can wrap at the narrow
   width, and on a phone the panel is a bottom sheet.
7. **Indigo is doing a lot of jobs** — the ghost, the refusal strip, the start chip, the seat, the X
   series. Is that one vocabulary or an overload?

---

## Notes for whoever reviews this

- Everything above is live on `staging` → **https://staging--pmksnew.netlify.app**
- To see the comparison: open any template → Kinematic Analysis → press Play, then Pause mid-cycle →
  click a joint to graph it → drag a *different* joint. Click selects, drag tunes.
- The design rationale for each choice is in the source as comments, and the argument for the
  feature is in `docs/analysis-mode-editing-plan.md`.
