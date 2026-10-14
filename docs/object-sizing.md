# Object sizing

Visual thickness is proportional to a typical primitive link span, not to the current zoom.
Normal uses 18% of the median primitive span; Compact and Large multiply that by 0.65 and 1.4.
A compound contributes its primitive members, so welding does not change the scale recommendation.
Auto-size Objects applies that recommendation explicitly. Fit may adopt it for a legacy drawing
that still uses the default size; an authored custom size is preserved. Zoom never resizes geometry.

Settings also offers Lines for dense drawings. Ordinary links become their joint skeletons with
wide invisible pointer targets; cylinders keep their recognizable barrel and rod. This is a local
view preference, not a physical or exported CAD change.

## Cylinder lengths and travel

Historically Object Size also set piston clearance and therefore available stroke. Before changing
visual thickness, preserve that original physical scale. All cylinder editing and solving reads the
preserved scale; only display width reads Object Size. The head's axial length also stays physical,
so growing its displayed width does not push it through the barrel's mouth. Typed barrel and rod
lengths, Starts at, joint coordinates, mass properties, and solved motion stay unchanged.

The preserved physical scale is an appended decimal URL setting. Missing/zero keeps old URLs'
original behavior, and unused trailing zeros are omitted to keep old encodings unchanged. Undo,
Redo, and reload restore both sizes. Unit conversion converts both scales before recording history.
A user can still explicitly change a member's Length; its existing validation and constraints apply.

Regression coverage: `e2e/bug-fixes-2.mjs` types both member lengths in ordinary and welded cylinders,
then checks presets, zoom, Undo/Redo, units, and saved URLs against the authored geometry and motion.

## Design references

[AutoCAD point styles](https://help.autodesk.com/cloudhelp/2026/ENU/AutoCAD-LT/files/GUID-48AD2AE9-1EDE-4BF1-B3FA-F5B15225189E.htm)
distinguish screen-relative symbols from absolute sizes.
[FreeCAD link display](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/Std_LinkMake.md)
and [HiDPI guidance](https://github.com/FreeCAD/FreeCAD-documentation/blob/main/wiki/HiDPI_support.md)
separate drawing presentation from geometry. PMKS uses a geometry-relative default with explicit
size presets: unlike continuously screen-relative sizing, this keeps the drawing's proportions
stable while zooming and avoids making physical cylinder lengths depend on the viewport.
