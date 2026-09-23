import { cylinderCreationLayout, cylinderHeadHalf } from './cylinder';
import { barrelPath, cylinderBlockPath, rodBodyPath, slideMarkPath } from './joint-marks';

/**
 * The ghost cylinder of the creation gesture, in the seal's own frame (+x
 * toward the rod), drawn the way the committed part will be in either style.
 */
export interface CylinderPreview {
  x: number;
  y: number;
  rotation: number;
  barrel: string;
  rod: string;
  block: string;
  fill: string;
  /** Schematic's drawing of it: where mount A and the rod's end land, and the seal's mark. */
  anchor: number;
  reach: number;
  seal: string;
}

/**
 * `cylinderScale` lays the part out, exactly as the click will build it;
 * `drawingScale` only sizes what is drawn.
 */
export function cylinderPreviewOf(
  start: { x: number; y: number },
  end: { x: number; y: number },
  cylinderScale: number,
  drawingScale: number,
  fill: string
): CylinderPreview {
  const creation = cylinderCreationLayout(start, end, cylinderScale);
  const r = 0.15 * drawingScale;
  const head = cylinderHeadHalf(creation.barrelLength);
  const anchor = -creation.sealFromMount;
  return {
    x: creation.seal.x,
    y: creation.seal.y,
    rotation: (creation.angleRad * 180) / Math.PI,
    // The preview is the part it will become: the barrel at its own length,
    // straddling the piston, with the rod telescoping out of its mouth.
    barrel: barrelPath(r, anchor, anchor + creation.barrelLength),
    rod: rodBodyPath(r, creation.rodLength, head),
    block: cylinderBlockPath(r, head),
    fill,
    anchor,
    reach: creation.rodLength,
    seal: slideMarkPath(r, head),
  };
}
