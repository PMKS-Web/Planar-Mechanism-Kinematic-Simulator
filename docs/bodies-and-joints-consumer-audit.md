# Consumer classification at the migration baseline

> **Status:** Partly built — inventory of legacy consumers and the remaining S5–S7 cutover work.

The [site inventory](bodies-and-joints-consumers.tsv) freezes the direct graph/property scan
at `487d535`: 1,592 sites in 85 files, grouped into 590 enclosing operations. It also records
the exported surfaces of eight transitive geometry/scale helpers found by following the
Link, slider-mark and synthesis dependencies. Each site names its operation, concerns and
native owner. The [baseline JSON](bodies-and-joints-baseline.json) summarizes that mapping.

Classification is at the **operation boundary**. One expression can feed several outputs:
`deleteJoint`, for example, changes connectivity, attached material geometry and ownership.
Its sites deliberately retain all three concerns. This avoids calling every `.joints`
expression topology, or incorrectly treating every `instanceof` as a physics constraint.
Comments/declarations remain with the responsibility they describe. Parser character access
and the `view.centerOfMass` shortcut are identified as false positives, not removal targets.

This is a conversion inventory, not evidence that every listed operation is reachable in the
default editor or that anything has been removed. Keeping an overinclusive baseline prevents
an unreachable legacy panel from disappearing from the audit merely because it was not on a
browser test's path. S6/S7 must prove each remaining caller's purpose or delete it; all
conversion statuses remain pending until then.

## Decisions that follow from reading the consumers

| Existing responsibility | Native replacement and important distinction |
| --- | --- |
| `Mechanism.joints` in graphs, drive profiles, exports and playback | These are **sample arrays**, not editable connectivity. Use snapshot samples, per-machine times and availability. A native attachment list cannot be substituted for their `.length`. |
| `MechanismService.joints` in presence checks and lookup | Native document presence and stable record lookup. A loose body still makes the document nonempty even if it has no physical connection. |
| `Link.joints` in length, hull, custom CoM frame and force anchoring | Authored geometry and body-local points. The old array supplied several incompatible frames; attachment additions must no longer redraw the hull or relocate a load. |
| `Link.joints` in collision, path, circle and outline methods | Render geometry. Preserve useful pure winding/union math, but a circle display override is not a change of mass distribution. |
| `uniformBodyOf` | Native material properties must retain the ordinary slender-bar idealization, `m L² / 12`. Display width and object scale never enter that formula. A native disk or authored polygon has its own area-based distribution. |
| `subset` in lifecycle, load ownership and slot recovery | Persistent material records plus derived weld groups. The native transaction chooses explicit deletion/split scope; no carrier recovery by shared endpoints survives. |
| `subset` in drawing and export | A derived presentation grouping may still union member paths, but the members remain separately owned/selectable. The union cannot own a cylinder bore or a load. |
| `PrisJoint` checks | Split into a typed relationship, any actual carriage material, coordinate kind, and glyph selection. A relationship contributes no mass. Production grounded-slider import must retain real carriage mass. |
| New-grid hit testing and mouse-down creation | Native attachment/body/pair selections and commands. Construction previews and commits quote the same planner, including all six old link-creation paths. |
| Grid-utils/holds/locks | Native design versus rigid-pose edits and atomic closure validation. The old cylinder repair/interior exemption disappears; locks and held dimensions remain. |
| Multi-edit and selection-batch | Typed stable selection, copy remap and planned cascade. A label change cannot retarget a selection or a force. Multiway operations name an actual pair. |
| Analyses, readiness and force labels | Native coordinate/wrench kinds and owned versus sampled membership. Do not equate a pin glyph with a two-body reaction or every grounded attachment with a fixed material body. |
| Synthesis and tutorial | Native construction commands and semantic progression, preserving three desired coupler poses and signed input direction. The existing two-point `model/pose.ts` is a synthesis record, not the new body pose. |
| Legacy codec and URL helpers | Bounded production decoded-record import and native `pmks2:` documents. Character access used for encoding flags is not a joint-letter identity assumption; legacy graph reconstruction and serialization disappear after cutover. |
| `MODEL_SCALE`, `OBJECT_SCALE`, joint marks | Preserve their visual purpose at the view boundary. Native documents and solvers store physical lengths/radians/SI values, never scaled SVG coordinates. |

The baseline's 43 public template IDs, three development IDs, 66 gallery names, historical
payloads, nine reference hashes and timing distributions are frozen separately. Conversion
must account for those exact teaching surfaces, not only fixtures convenient for the new
solver. The original drag performance test already exceeds several historical thresholds on
this machine; its exact-source reproduction is retained. This does not waive S7's comparison
against the measured baseline or authorize changing a threshold.
