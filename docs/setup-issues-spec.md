# Setup issues list: implementation and writing spec

> **Status:** Built — the setup drawers, their issue rows, the `part-link` block, and every setup message follow this spec. Where it and the repo's guides disagreed, the guides won; see [Where the build departs from the spec](#8-where-the-build-departs-from-the-spec) at the end.

Design reference: `Setup Messages Catalog.dc.html`, option **5a** (six drawers).
Applies to the Kinematic Analysis setup drawer, the Force Analysis setup drawer, and the "Not in any mechanism" section.
Branch it was designed against: `feature/explain-blockers-check-answers`.

---

## 1. What changes, in one paragraph

Each issue splits into **what is wrong** (title and one-line summary, always visible) and **how to fix it** (an explanation and a list of suggested fixes, hidden behind a "Show fixes" button). The full-width "Go To …" buttons are removed. Every joint or link named in an issue's text becomes an inline link. Hovering it highlights that part on the grid, and clicking it selects the part so the edit panel opens. Each mechanism section keeps its header and chip, and it can be collapsed.

---

## 2. Anatomy of one issue

```
[icon]  Title                                   ← always visible
        Summary, with {joint C} links           ← always visible
        Show fixes ▾                            ← text button
        ┌───────────────────────────────────┐   ← appears only when open
        │ Explanation (teaching)            │
        │ Required to run. Some ways to fix it:
        │ • Fix one, with {joint C}         │
        │ • Fix two                         │
        └───────────────────────────────────┘
```

| Part | Visible | Purpose | Length |
|---|---|---|---|
| Icon | always | Severity. Filled `error` (red) for blockers, filled `warning` (amber) for warnings, `scatter_plot` (grey) for unassigned parts | – |
| Title | always | Names the problem in the student's terms | 3–7 words, one line where possible |
| Summary | always | The single fact that makes it a problem **in this drawing** | one clause, ≤ 16 words |
| Show fixes | always | Opens and closes the panel | – |
| Explanation | when open | Teaches the rule behind the problem, so the student can fix the next one alone | 1–2 sentences, ≤ 35 words |
| Label | when open | Says whether the fix is required, and presents the list as suggestions | fixed strings, see §4 |
| Fixes | when open | Concrete edits to try | 0–3 items, ≤ 10 words each |
| Note | when open, only if there are no fixes | What to expect, when nothing needs changing | one sentence |

---

## 3. Data model

Replace `body`, `at`, `action` and `ways` with structured fields. Text that names parts is built as **prose**: an array of strings and part references, so the panel can render the parts as links without parsing sentences.

```ts
export type PartRef = { part: Joint | Link; label: string };   // label: "joint C", "link DE", "slider D", "cylinder EF"
export type Prose = ReadonlyArray<string | PartRef>;

export type IssueSeverity = 'blocker' | 'warning' | 'unassigned';

export interface SetupIssue {
  severity: IssueSeverity;
  title: string;          // plain text
  summary: Prose;
  explain: string;        // plain text; teaches the concept, names no parts
  fixes: Prose[];         // 0–3, most likely first
  note?: string;          // only when fixes is empty
}
```

A tagged template keeps the sentence-building code readable:

```ts
const s = prose`${joint(c)} is welded, so the links it joins can’t move relative to each other.`;
// joint(x) → { part: x, label: `joint ${nameOf(x)}` }; link(), slider(), cylinder() likewise
```

Migration notes:
- `ReadinessCheck`, `UnassignedReport` and `ForceRequirement` (unmet rows) all map onto `SetupIssue`. Unassigned reports use `severity: 'unassigned'`, and force warnings use `'warning'`.
- `ways[]` becomes `fixes[]`. Drop the per-way `action` label.
- Drop `at` and `action`. The part links in the text replace them.
- Drop `ForceRequirement.act: 'gravity'`. The fix is written as the text "Turn on gravity in the Settings panel". There are no in-panel action buttons.
- Met force requirements are no longer shown as rows. Readiness shows as the green "Ready" chip only.
- `mobility-sentences.ts` `resolution()` should return `Prose[]` rather than one joined sentence. That removes "Any one of these would leave one degree of freedom:" from the body.

---

## 4. Rendering

Uses the existing drawer tokens: Roboto, primary `#3f51b5`, card top border 5px primary, section rule `#eceef5`, and the existing chips (`#fce8e6` / `#c5221f`, `#fef3e0` / `#b26a00`, `#e6f4ea` / `#137333`).

**Section header (mechanism, Force Analysis, Not in any mechanism)**
- 44px min-height, 15px/500, primary. The "Not in any mechanism" header uses `#5f6368`.
- Chip after the name: "N fix(es)" (red) if there are any blockers, otherwise "N to check" (amber) if there are warnings, otherwise "Ready" (green). The unassigned section shows its count in amber.
- The whole header row is the toggle, with an `expand_less` / `expand_more` chevron (24px) on the right. A section with no issues shows no chevron and doesn't toggle.
- Default: sections with issues start open. "Not in any mechanism" keeps its current default (collapsed).
- Under the unassigned header, one line: "Drawn dashed on the grid. Analysis skips these." (12px `#5f6368`).

**Issue**
- Row: icon column 18px (icon 17px), 10px gap, 14px between issues, 15px side padding.
- Title: 13px/500, `#2c2c2c`. **Never coloured by severity.** Colour is carried by the icon and the chip only.
- Summary: 12px, line-height 20px, `#5f6368`.
- Show fixes: text button, 12px/500, primary, 24px tall, hover background `#e8eaf6`, trailing chevron 18px. The label reads "Show fixes" / "Hide fixes", or "Show more" / "Show less" when there are no fixes.
- Panel: directly under the button. Background `#f5f6fb`, radius 4px, padding 10px 12px, 8px gap.
  - Explanation: 12px/18px, `#3c4043`.
  - Label: 11px/500, in the severity colour (red, amber, or `#5f6368` for unassigned).
  - Fixes: 12.5px/21px `#2c2c2c`. With **two or more** fixes, each gets a 4px `#7986cb` dot. A **single** fix gets no bullet. There are no "or" lines between fixes.
- Fixes start collapsed. The open or closed state is held per issue for as long as the drawer is open.

**Label strings (exact)**

| Severity | Fixes | Label |
|---|---|---|
| blocker | 1 | Required to run. One way to fix it: |
| blocker | 2–3 | Required to run. Some ways to fix it: |
| warning | 1 | Optional, it runs as is. Something to try: |
| warning | 2–3 | Optional, it runs as is. Some things to try: |
| warning | 0 | Optional, it runs as is. |
| unassigned | 1 | Optional, analysis skips it for now. Something to try: |
| unassigned | 2–3 | Optional, analysis skips it for now. Some things to try: |

The fix lists are suggestions, and the labels say so. Don't write "do one of these" or "any one of these would…".

**Part links**
- Inline chip: padding 0 4px, radius 3px, background `#e8eaf6`, text primary 500, line-height 18px. Hover background `#c5cae9`.
- Hover: highlight the part on the grid with the same highlight the grid uses on its own hover. Clear it on leave.
- Click: select the part, exactly as if it had been clicked on the grid, so the edit panel shows it. The drawer stays open.
- Links appear in the summary and in the fixes. The explanation names no parts.

---

## 5. Order and what to show

- Keep the current dependency order from `readinessOf` (refusal, then the before-the-solve checks, then solver failures, then warnings). It is deliberate: the list is worked from the top down.
- Keep the current suppression rules. A refused input still hides the downstream solver blocker.
- Drop the drawer's summary sentence ("1 fix before this mechanism will run."). The chip already says it.
- If a drawing has several parts with the same problem, write one issue that names all of them in the summary, not one issue per part.

---

## 6. Writing guidelines

These are guidelines, not rules. The test for every sentence: *does a first-year student know what to look at and what to try?*

### 6.1 Each part has one job

| Part | Answers | Must not |
|---|---|---|
| Title | "What's wrong?" | Explain, or give a fix |
| Summary | "Why is that a problem here?" | Repeat the title, give a fix, or teach the rule |
| Explanation | "What's the rule I broke?" | Name this drawing's parts, or give a fix |
| Fix | "What can I try?" | Explain why |

Most of today's messages put all four jobs into one `body`. Splitting them is most of the work.

### 6.2 Length budgets

- Title 3–7 words. Summary ≤ 16 words. Explanation ≤ 35 words. Fix ≤ 10 words.
- Everything visible before "Show fixes" should total about 25 words or fewer.
- If an explanation needs more than two sentences, it's teaching two rules. Keep the one this issue needs.

### 6.3 Titles

- Name the problem from the student's side: "Slider D has no slot", not "A slider has nothing to slide along".
- Put the part name in the title when there is exactly one part involved.
- Numbers are fine when they are the point: "2 degrees of freedom, needs 1". Avoid "-1 degrees of freedom". For over-constrained cases, say "Over-constrained, can't move" instead.
- Use sentence case and no final period.

### 6.4 Summaries

- State the one fact about this drawing. "Joint C is welded, so the links it joins can't move relative to each other."
- Use one "so" at most. If you need "because … so … which means", cut it down.
- Don't start with "This mechanism…" or "It…" when the title already sets the subject. Start with the part.

### 6.5 Explanations

- Explain the general idea behind the check. "An input creates motion between two links. A weld locks them together, so there is nothing for the input to turn."
- Write it so it's true for any drawing. No part names, no numbers from this drawing.
- A warning's explanation says when the thing is fine (clamps use toggles on purpose, idealized bars are massless).

### 6.6 Fixes

- Start with a verb, one edit per fix: "Ground joint E", "Delete link DE", "Unweld joint C".
- Include the part as a link whenever there is one.
- Most likely fix first, three at most. If the diagnosis finds more, show the first three.
- Don't prescribe the UI gesture when there is more than one way to do it. Write "Set joint A as the input, from its right-click menu or the edit panel", not "Right-click joint A…". Name a panel only where the setting lives in just one place ("Turn on gravity in the Settings panel").
- Don't write "instead", "any one of these", or "would leave one degree of freedom". The label already frames the list.

### 6.7 Vocabulary

| Use | Avoid |
|---|---|
| input | driven joint, drive, actuator |
| link | body, bar (except "frame") |
| ground, grounded | fixed to the frame, anchored (as a verb) |
| joint C, link DE, slider D, cylinder EF | "a joint", "some part" when the part is known |
| can't, isn't, doesn't | cannot, is not (in summaries and fixes) |
| the mechanism | this machine, the partition, the solver |
| starts at a limit | dead position (in titles; fine in explanations) |
| can't move | there is no position to solve for |

Punctuation: no em dashes, no semicolons, and no "or" on a line of its own. Use a comma or a new sentence.

### 6.8 Before and after (from `readiness.ts`)

**Dangling slider**
- Before: *A slider has nothing to slide along.* Slider D has no slot and no ground, so there is no direction for it to move in. Drag it onto a link to cut a slot, or ground it to fix its direction. `[Go To Slider]`
- After: **Slider D has no slot.** Summary: With no slot and no ground, `slider D` has no direction to move in. Explanation: A slider moves along a line, either a slot cut into a link or a fixed direction on the ground. Fixes: Drag `slider D` onto a link to cut a slot · Ground `slider D` to fix its direction.

**Refused input (welded)**
- Before: *This joint cannot be an input.* This joint is welded, so the bodies it joins cannot move relative to each other. Unweld it, or set a joint with a freedom as the input. Set the input on joint A instead. `[Go To Joint]`
- After: **Joint C can't be the input.** Summary: `joint C` is welded, so the links it joins can't move relative to each other. Fixes: Unweld `joint C` · Move the input to `joint A`.

**Too free, with ways**
- Before: *This mechanism has 2 degrees of freedom.* With the input held still, links CD and DE can still move, so the input alone cannot say where they go. Any one of these would leave one degree of freedom: … (three button rows)
- After: **2 degrees of freedom, needs 1.** Summary: With the input held still, `link CD` and `link DE` can still move. Explanation: One input controls one independent motion. With 2 degrees of freedom, part of the linkage moves on its own. Take away one freedom to get to 1. Fixes: Ground `joint E` · Delete `link DE` · Attach a grounded link at `joint E`.

**Toggle (warning, no fix)**
- Before: 75 words starting "Somewhere in the cycle this mechanism reaches a position where…"
- After: **Passes through a toggle.** Summary: Near dead-center, a small input move gives a large output move. Explanation: At a toggle, two links line up and the input has almost no leverage over the output. Clamps use this on purpose. Note: Nothing to change. Expect sharp peaks in the velocity and acceleration graphs.

**Motion never repeats**
- Before: This mechanism never comes back to the pose it started in, so there is no cycle to animate. The closest it comes is 0.14 units away — a loop that only just fails to close usually has a link length slightly off.
- After: **The motion never repeats.** Summary: It comes within 0.14 units of its start pose but never returns. Explanation: Animation needs a cycle. A loop that only just misses closing usually has one link length slightly off. Fix: Check the link lengths.

**Unassigned floating link**
- Before: Neither of its ends reaches ground or the rest of the drawing, so it is part of no mechanism and has no position to solve for. Delete it, or ground one of its joints to make it a mechanism of its own.
- After: **Link GH is attached to nothing.** Summary: `link GH` reaches neither ground nor the drawing. Explanation: Analysis only solves chains that reach ground. Fixes: Ground `joint G` · Delete `link GH`.

**No load (force)**
- Before: Nothing loads this mechanism: gravity is off, so the mass it has weighs nothing. Turn gravity on, or attach a force. `[Turn On Gravity]`
- After: **Nothing loads the mechanism.** Summary: Gravity is off, so link mass weighs nothing. Explanation: Force analysis finds the reactions that balance the loads. With no load, every reaction is zero. Fixes: Turn on gravity in the Settings panel · Attach a force to any link.

---

## 7. Acceptance checklist

- [x] No "Go To …" buttons and no in-panel action buttons remain in either setup drawer.
- [x] Titles and summaries are visible with fixes collapsed, and fixes start collapsed.
- [x] The Show fixes panel opens directly beneath its button.
- [x] Every named joint, link, slider and cylinder in a summary or fix is a link. Hovering highlights it on the grid, and clicking selects it and opens the edit panel.
- [x] Mechanism sections with issues collapse from their header. Ready sections have no chevron.
- [x] A single fix renders without a bullet, and no line contains only "or".
- [x] Labels match §4 exactly.
- [x] No em dashes or semicolons in any message string.
- [x] Every message fits the §6.2 budgets. A unit test on the string builders can check the word counts.

---

## 8. Where the build departs from the spec

Written by the designer against `feature/explain-blockers-check-answers`, then built with the repo's
own guides ahead of it ([`ui-vocabulary.md`](ui-vocabulary.md), [`ui-style-guide.md`](ui-style-guide.md)).
What changed on the way:

- **No "Make".** The vocabulary bans it, so a joint's type is set: "Set joint C to Prismatic",
  "Set joint C to Pin-in-slot".
- **A link is named as its own panel titles it**, not by a blanket "avoid body": "link BCE" for a
  three-joint link, "barrel AC" and "rod CB" for a cylinder's members (`linkRef` in
  `model/prose.ts`, through `bodyLabelParts`).
- **Colors are tokens.** Every hex in §4 is an existing role: `--brand-tint` (part link, toggle
  hover), `--brand-pale` (part link hover), `--brand-wash` (the panel), `--brand-light` (the fix
  dot), `--border-rule`, and the text tiers. The explanation's `#3c4043` is `--text-primary`, the
  nearest tier. The section header is 44px here; the shared `section-header` mixin stays 40px.
- **A part link switches to Edit and selects the part**, as the Go To buttons did, because most
  fixes (delete, weld, attach) are Edit-mode edits. Pointing lights the part through the grid's
  list-pointing mark (`MechanismService.hoveredPart`), which defers to a selection: once a part is
  selected, pointing at another lights nothing, as in the export drawer.
- **Lists name two parts and "N more" past three**, so a summary naming four or more links keeps
  to sixteen words: "link ACD, link CE and 2 more".
- **Budgets hold for every message the drawer builds**, which `setup-issue-budgets.spec.ts` checks
  over the fixture gallery, six hundred generated student mistakes, every solver failure and every
  force-analysis state. The spec's own examples that ran over were cut ("Set joint A as the
  input" without "from its right-click menu or the edit panel").
- **A blocker with no fix** (a force equilibrium with no single answer, an arrangement the force
  model cannot write) shows "Show more" and the label "Required to run." alone. §4's table had no
  row for it.
- **The Masses table in the Force drawer stays**, unchanged: it is not in the design, and the
  change was to issues and their words.
- **Several blockers are said at once**, which §5's "keep the current order" meant in practice: a
  wrong count and a missing input, a slot and an input, a refused input and a count. The order
  among them is unchanged.
- **The part link is a block**, `part-link` (Actions/Part Link in the gallery), with
  `prose-block` and the `prose` sentences of `model/prose.ts`, so any panel can name a part the
  same way. The Reuse backlog lists the places that still do it their own way.
