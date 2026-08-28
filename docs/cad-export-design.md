# CAD Export — screen design brief

For a designer producing a mockup. It lists every control the screen needs once the planned DXF
work lands, what each one does, and how they should be arranged. It is a brief, not a
specification of the final visual design — spacing, type and component choices are the designer's.

The engineering behind it is planned but not built; today's dialog carries four checkboxes and a
file name. This describes where it is going, so the mockup can be drawn once rather than twice.

---

## What this screen is for

Someone has drawn a linkage in PMKS+ and now wants it in SolidWorks, Fusion or NX — not as a
picture, but as the **starting geometry of a real model**. They will make a part per link, put
holes where the joints are, assemble the parts with mates, and drive the assembly to check it moves
and clears. Everything on this screen exists to make that first hour easier.

That framing decides what the screen is. It is **not** a DXF options panel. A reader who wanted to
argue about entity types and header variables would be using a different program. The screen should
ask, as far as possible, one question — *what are you going to do with this?* — and then be honest
about the handful of decisions that genuinely change the file. Every control below earns its place
by changing something the reader would otherwise have to redo by hand in CAD.

## Design direction

**Lead with a destination, not with a feature list.** The strongest thing this screen can do is
offer two or three named presets at the top and let most people leave without touching anything
else. *Build parts in CAD* is the default and should produce: a layer per link, the drawing moved
to the origin, joint circles cut to a real pin diameter, dimensions included, and the companion
data file attached. *Reference sketch* is the opposite — one layer, model coordinates, joint marks
only — for someone tracing over the linkage rather than building from it. *Custom* appears the
moment any detail is changed. This matters because the ten decisions below are not equally
important: the preset carries nine of them correctly, and the reader who cares can still open the
detail. A wall of eleven checkboxes with no recommended path is the failure mode to avoid.

**Group the detail by what it changes, and keep the groups short.** Four collapsed sections —
*File*, *Geometry*, *Layers*, *Data* — read better than one long list, and each should hold three to
five controls. *Geometry* is the one that changes the actual shapes (origin, pin holes, paths,
dimensions); *Layers* is only ever "what comes across", and reads well as a checklist; *Data* is one
choice. Collapsed by default with the preset's answers summarised on each header ("Geometry — origin
at ground A, Ø6 mm holes") lets someone confirm without opening anything.

**Tell them what they are about to get, before they get it.** The single most useful addition beyond
the controls is a live summary — entity count, layer count, drawing extents and units — updating as
options change, sitting just above the export button. It answers "did I remember the forces?" and
"is this in millimetres?" without a round trip through CAD. A small preview thumbnail of the
exported geometry would be better still, and is worth mocking up even if it ships later.

**Keep the two warnings that are already there, and keep them quiet.** The drawing is the *start
pose*, and it is *centerlines, not fabrication profiles*. Both are true, both surprise people, and
both belong on the screen — but as a settled note near the top, not as an alert. They are the
scope of the feature, not a problem with it.

**It has to work at 390px wide.** The dialog is reachable on a phone and the e2e suite measures it
there. Sections that collapse, full-width controls and a footer that does not wrap are the whole
requirement.

---

## Layout skeleton

```
┌──────────────────────────────────────────────┐
│ CAD Export                               [×] │   title row
│ DXF R2000 · centerline sketch                │   subtitle
├──────────────────────────────────────────────┤
│ ⓘ Built from the start pose. Centerlines,    │   scope note (static)
│   not fabrication profiles.                  │
│                                              │
│ What is this for?                            │   PRESET  (segmented, 3 options)
│ [ Build parts ][ Reference ][ Custom ]       │
│                                              │
│ ▸ File            mechanism.dxf · mm         │   collapsed section + summary
│ ▸ Geometry        origin at A · Ø6 holes     │
│ ▸ Layers          6 of 9 included            │
│ ▸ Data            DXF + CSV (zip)            │
│                                              │
│ ── 412 entities · 9 layers · 240 × 180 mm ── │   live summary
├──────────────────────────────────────────────┤
│                      [ Cancel ] [ Export ▾ ] │
└──────────────────────────────────────────────┘
```

---

## Control inventory

### 0 · Preset

| Control | Type | Default | Notes |
| --- | --- | --- | --- |
| **What is this for?** | Segmented, 3 options | `Build parts in CAD` | `Build parts in CAD` · `Reference sketch` · `Custom`. Choosing a preset sets every control below. Changing any control below switches this to `Custom` without discarding the values. |

### 1 · File

| Control | Type | Default | Notes |
| --- | --- | --- | --- |
| **File name** | Text, `.dxf` suffix shown | `mechanism` | Already exists. Suffix is decoration, not typed. Invalid characters are stripped rather than refused. |
| **Units** | Select | The project's length unit | mm · cm · m · in. Writes `$INSUNITS` and scales coordinates. Shown rather than assumed: importers ask, and the reader should know the answer before they are asked. Changing it here does not change the project. |
| **DXF version** | Select | `R2000 (AC1015)` | `R2000` · `R12`. Advanced; R2000 is right for every current CAD package, R12 exists for old CAM. Consider hiding this behind the Custom preset only. |

### 2 · Geometry — what shapes come out

| Control | Type | Default | Notes |
| --- | --- | --- | --- |
| **Origin** | Select | `First ground joint` | `Keep model coordinates` · `First ground joint` · `Centre of drawing` · `Choose a joint…`. Moves the whole drawing so that point lands on (0, 0). Without this, a linkage drawn a metre from the origin imports a metre from the part origin, which is a fight every single time. |
| **Origin joint** | Select of joint ids | first ground joint | Only when **Origin** is `Choose a joint…`. |
| **Joint circles** | Radio, 3 options | `Pin holes at Ø` | `None (points only)` · `Marks only` · `Pin holes at Ø`. Today the export draws an 0.08-unit circle that means nothing in CAD and has to be deleted. `Pin holes` makes that circle the hole the reader will actually cut. `Marks only` keeps today's behaviour on a layer that can be switched off. |
| **Pin diameter** | Number + unit | `6 mm` (`0.25 in`) | Only when **Joint circles** is `Pin holes at Ø`. One diameter for every joint; per-joint diameters are out of scope. |
| **Link dimensions** | Checkbox | on | Aligned DIMENSION entities between joint centres. These arrive in SolidWorks and NX as real driven dimensions, so the reader does not retype numbers they can already see. |
| **Dimension style** | Radio, 2 options | `Dimension entities` | `Dimension entities` · `Text table`. The second writes the same numbers as a block of TEXT on the notes layer, for importers that mangle DIMENSION. Only when **Link dimensions** is on. |
| **Traced paths** | Checkbox | on | Coupler curves as polylines. Disabled with the reason shown when no joint is set to trace: *"No joint is tracing a path. Turn one on from the Edit panel."* |
| **Slot travel** | Checkbox | on | Slot axis plus explicit start/end points for every prismatic joint, so the stroke can be modelled rather than inferred. |

### 3 · Layers — what is included

A checklist. Each row is a layer, named as it will appear in CAD, so the reader can match what they
see here to what they see there.

| Control | Type | Default | CAD layer |
| --- | --- | --- | --- |
| **One layer per link** | Checkbox | on | `PMKS_LINK_AB`, `PMKS_LINK_BC`, … instead of one shared centreline layer. This is the highest-value option on the screen: Fusion makes a sketch per layer and SolidWorks imports layers selectively, so this is what lets a reader get one part per link without separating anything by hand. |
| **Link centrelines** | Checkbox, always on | on | `PMKS_LINK_CENTERLINES` — shown disabled-on, because a drawing without them is empty. |
| **Joint centres** | Checkbox, always on | on | `PMKS_JOINT_CENTERS` |
| **Ground points** | Checkbox | on | `PMKS_GROUND_POINTS` — bare points at the fixed joints. The ground *symbol* is a drawing convention; what a CAD user needs is which points do not move. |
| **Kinematic annotations** | Checkbox | on | `PMKS_KINEMATIC_ANNOTATIONS` — ground hatches, input arrows. Exists today. |
| **Forces** | Checkbox | off | `PMKS_FORCES`. Exists today. Disabled with a reason when the drawing carries no forces. |
| **Construction guides** | Checkbox | on | `PMKS_CONSTRUCTION`. Exists today. |
| **Labels** | Checkbox | off | `PMKS_LABELS` — joint and body names. Exists today; off by default for a clean sketch. |
| **Notes** | Checkbox | on | `PMKS_NOTES` — units, source, export date, and the dimension table if that style is chosen. |

### 4 · Data — the numbers DXF cannot carry

| Control | Type | Default | Notes |
| --- | --- | --- | --- |
| **Include data file** | Radio, 3 options | `CSV` | `None` · `CSV` · `JSON`. A joint table (id, x, y, type, grounded, input) and a link table (id, joints, length, mass, inertia). This is what somebody rebuilding the mechanism in an assembly otherwise retypes off the screen. |
| **Delivery** | Automatic, shown as text | — | Not a control. One file downloads as `.dxf`; two download as a `.zip` named after the file name. Say which will happen, do not ask. |

### 5 · Footer

| Control | Type | Notes |
| --- | --- | --- |
| **Live summary** | Static text | `412 entities · 9 layers · 240 × 180 mm`. Updates as options change. |
| **Cancel** | Text button | Closes without exporting. |
| **Export** | Filled button, optional split | Label follows the outcome: `Export DXF` or `Export DXF + CSV`. A split-button menu offering `Copy to clipboard` is a possible extra, not a requirement. |

---

## States the mockup should cover

1. **Default** — Build-parts preset, everything collapsed, summary populated.
2. **Custom, expanded** — every section open, so the designer can see the full stack at once.
3. **A control that cannot be used** — Traced paths disabled because nothing traces, with its
   reason visible. The rule the app already follows elsewhere: a greyed control says *why*, and the
   explanation is reachable by hover on the row rather than on the disabled control itself, which
   receives no pointer events.
4. **Nothing to export** — an empty grid. The export button is disabled and the summary reads
   *"Nothing to export yet — draw a mechanism first."*
5. **Narrow, 390px** — the whole thing on a phone, sections collapsed, footer not wrapping.

## Copy that already exists and should survive

- Title: **CAD Export**  · Subtitle: **DXF R2000 · centerline sketch**
- Scope note: **Built from the start pose.** Exports mechanism geometry in the project's units.
- Footnote: **This is a kinematic centerline drawing, not a fabrication profile.** Add physical
  widths, holes, tolerances and material in CAD.

The footnote needs a small revision once pin holes ship — with `Pin holes at Ø` chosen, the drawing
*does* carry one fabrication feature, and the sentence should say "widths, tolerances and material"
rather than claiming there are no holes.

## Not controls — decided in code, no UI

Reusable symbols emitted as DXF **blocks** (ground hatch, input arrow, joint mark), a **text style**
table entry so labels do not import at unpredictable sizes, and the header's extents. These are
quality-of-output fixes with no decision for the reader to make, and should not appear on screen.

## Open questions for the designer

- Is the preset a segmented control, a set of cards, or a select? Cards can carry a line of
  description each, which may be worth the height.
- Should the live summary be a footer strip or a right-hand rail on wide screens?
- Is a geometry preview worth the space at 520px wide, or does it only earn its place on desktop?
