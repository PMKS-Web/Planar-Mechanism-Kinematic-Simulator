# Drawing styles and object sizing

Settings has one **Drawing Style** choice, using the same radio block as Global Units:

- **Standard:** filled colored bodies and prominent joint symbols.
- **Fine:** slimmer filled bodies and smaller coordinated symbols.
- **Schematic:** joint connections and outlined cylinder/slider symbols. Welded compounds,
  cylinder members, forces, synthesis previews, and start-pose ghosts use the same presentation.

There is no manual size field, size preset row, separate Lines switch, or Auto-size button.
The style is a local view preference, remembered between visits. Existing Lines preferences migrate
into Schematic. Opening a mechanism or using Undo/Redo does not change the style; choosing a style
adds no undo entry and runs no analysis.

## Zoom behavior

Marks scale with geometry through the ordinary zoom range, then stop becoming smaller or larger
at readable screen limits. This is deliberately not a fixed-pixel drawing at every zoom. The style
never switches itself. The normal pin diameter ranges are 12–27px for Standard, 7.5–15px for Fine,
and 6–9.6px for Schematic. Bodies, force heads, welds, ground marks and sliders use the same bounded
scale; labels retain readable minimum sizes and invisible pointer targets remain generous.

`SettingsService.drawingScale` is presentation only. It combines the document's legacy scale,
current zoom and the selected style, without publishing to `OBJECT_SCALE`. No view operation
changes document coordinates, geometric tolerances, stroke, constraints, or solver fingerprints.
Fit to view now moves the camera only; it never silently rewrites a legacy document's scale.
Before the very first part is created, the initial geometry scale is still established from the
empty viewport so new parts start with sensible clearances.

## Cylinder lengths, history and exports

The document's legacy object scale and appended preserved cylinder scale continue to decode and
serialize exactly as before. They remain the physical sizing/tolerance inputs. Unit conversion
converts them with the other lengths. In particular, a cylinder's head length along its axis always
uses physical clearance, even for older URLs whose preserved scale is zero. Its visual width can
change without moving the mouth, head ends, or mounting joints.

Typed Barrel Length, Rod Length, Starts at, available stroke, mass properties, forces, and solved
motion survive style changes and zoom. Undo/Redo still addresses the user's edits. Explicit length
edits retain their existing validation and constraint behavior.

`link-artwork.ts` builds display copies at the bounded width and caches their rigid placement across
animation frames. It does not overwrite a link's document outline or CAD loops. Thus CAD exports
remain independent of style and zoom. A held start-pose ghost takes its own geometry snapshot so
changing its style cannot accidentally pick up an unreachable edited pose.

## Verification

- `e2e/drawing-styles.mjs`: all symbol types, style and zoom filmstrips, welded cylinder playback,
  unchanged document/CAD data, local preference persistence, and narrow Settings layouts.
- `e2e/bug-fixes-2.mjs`: types barrel and rod lengths in ordinary and welded cylinders; exercises
  styles, zoom, Undo/Redo, units, and saved URLs against authored geometry and solved samples.
- Model tests cover bounded scaling, display-copy isolation, animated compound placement,
  legacy head lengths, and held ghosts.

## Design references

[AutoCAD point styles](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT/files/GUID-48AD2AE9-1EDE-4BF1-B3FA-F5B15225189E.htm)
distinguish screen-relative marks from absolute geometry.
[Rhino curve display](https://docs.mcneel.com/rhino/8/help/en-us/options/view_display_mode_curves.htm)
and [Onshape display modes](https://cad.onshape.com/help/Content/View/shaded_unshaded__and_translucent.htm)
provide presentation controls separately from dimensions. PMKS groups coordinated presentation into
three styles, with automatic limits at extreme zoom, instead of asking readers to manage several
independent size and appearance controls.
