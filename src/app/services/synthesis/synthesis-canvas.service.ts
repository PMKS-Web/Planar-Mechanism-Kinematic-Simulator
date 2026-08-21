import { Injectable, inject } from '@angular/core';
import { Coord } from 'src/app/model/coord';
import { SettingsService } from '../settings.service';
import { SvgGridService } from '../svg-grid.service';
import { SynthesisBuilderService } from './synthesis-builder.service';
import { SynthesisSolutionService } from './synthesis-solution.service';
import { meet, solveFourBar } from './synthesis-candidates';
import { COR } from './synthesis-util';

/** A bar drawn on the grid: two pins, a fill, and what it is called. */
export interface PoseBar {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  fill: string;
  edge: string;
  selected: boolean;
}

/** A word beside a position, saying what the chosen linkage does with it. */
export interface PoseChip {
  id: number;
  x: number;
  y: number;
  text: string;
  dot: string;
  selected: boolean;
}

export interface Handle {
  id: string;
  x: number;
  y: number;
  cursor: string;
}

export interface SelectionBox {
  /** Degrees, in the flipped drawing frame the grid renders in. */
  rotate: string;
  cx: number;
  cy: number;
  x: number;
  y: number;
  w: number;
  h: number;
  knobY: number;
  corners: Handle[];
}

export interface PreviewLink {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
}

export interface PreviewJoint {
  id: string;
  x: number;
  y: number;
}

const LINK_PALE = '#c5cae9';
const LINK_DEEP = '#303e9f';
const DRIVER_CRANK = '#0d125a';
const DRIVER_COUPLER = '#26a69a';
const REACH_GREEN = '#bfe0c0';
const REACH_AMBER = '#f6dcb0';
const SELECT_AMBER = '#ffc107';

/**
 * What Synthesis draws on the grid, and what the pointer does to it.
 *
 * Kept out of NewGridComponent because none of it is about the mechanism: the
 * positions are a question, the preview is an answer that is not in the
 * drawing yet, and neither earns an undo entry or a rebuild. The grid supplies
 * model-space points and this decides what they mean.
 */
@Injectable({ providedIn: 'root' })
export class SynthesisCanvasService {
  private settings = inject(SettingsService);
  private svgGrid = inject(SvgGridService);
  private design = inject(SynthesisBuilderService);
  private solution = inject(SynthesisSolutionService);

  /** Where the pointer last was, in model coordinates. */
  public cursor: Coord | undefined;

  private drag:
    | {
        kind: 'pose';
        id: number;
        mode: 'move' | 'rotate' | 'length';
        dx: number;
        dy: number;
        grabAngleOffset: number;
      }
    | {
        kind: 'region';
        mode: 'move' | 'corner' | 'draw';
        corner?: string;
        dx: number;
        dy: number;
        originX: number;
        originY: number;
      }
    | undefined;

  get dragging(): boolean {
    return this.drag !== undefined;
  }

  // --- what is drawn -------------------------------------------------------

  /** Half the thickness a pose bar is drawn at, in model units. */
  private barHalfWidth(): number {
    return 0.25 * this.settings.objectScale;
  }

  poseBars(): PoseBar[] {
    const cand = this.solution.chosen();
    return this.design.getAllPoses().map((pose) => {
      const reached = cand ? cand.onBranch[pose.id - 1] : undefined;
      return {
        id: pose.id,
        x1: pose.posBack.x,
        y1: pose.posBack.y,
        x2: pose.posFront.x,
        y2: pose.posFront.y,
        fill: reached === undefined ? LINK_PALE : reached ? REACH_GREEN : REACH_AMBER,
        edge: this.design.selectedPose === pose.id ? SELECT_AMBER : 'rgba(0,0,0,0.42)',
        selected: this.design.selectedPose === pose.id,
      };
    });
  }

  poseChips(): PoseChip[] {
    const cand = this.solution.chosen();
    return this.design.getAllPoses().map((pose) => {
      const reached = cand ? cand.onBranch[pose.id - 1] : undefined;
      const far = pose.posBack.x > pose.posFront.x ? pose.posBack : pose.posFront;
      return {
        id: pose.id,
        x: far.x + 0.5 * this.settings.objectScale,
        y: Math.max(pose.posBack.y, pose.posFront.y) + 0.75 * this.settings.objectScale,
        text:
          reached === undefined ? 'position ' + pose.id : reached ? 'reached' : 'needs reassembly',
        dot: reached === undefined ? '#8a90a0' : reached ? '#43a047' : '#f5a623',
        selected: this.design.selectedPose === pose.id,
      };
    });
  }

  /**
   * The handles on the selected position.
   *
   * The same shape the tracing underlay wears -- a dashed box, four corner
   * grips and a knob on a stalk -- because it is the same gesture: something
   * on the grid that is being placed rather than built. Its corners pull the
   * end-effector length rather than a scale, since that is the one dimension
   * a position has.
   */
  selectionBox(): SelectionBox | undefined {
    const id = this.design.selectedPose;
    if (!this.design.isPoseDefined(id)) return undefined;
    const pose = this.design.getPose(id);
    const grip = this.svgGrid.scaleWithZoom(10);
    const pad = this.svgGrid.scaleWithZoom(14);
    const length = this.design.length;
    const ahead = this.design.COR === COR.CENTER ? length / 2 + pad : length + pad;
    const behind = this.design.COR === COR.CENTER ? length / 2 + pad : pad;
    const half = this.barHalfWidth() + pad / 2;
    // Model coordinates throughout, y up. The grid draws this inside its own
    // y-flip, so the flip is already accounted for -- negating here as well put
    // every handle on the wrong side of the axis.
    const cx = pose.position.x;
    const cy = pose.position.y;
    const x = cx - (this.design.COR === COR.FRONT ? ahead : behind);
    const w = ahead + behind;
    const y = cy - half;
    const h = half * 2;
    // Inside the flip, +y is up, which is the sense a positive angle turns in.
    const cursors: Record<string, string> = {
      tl: 'nwse-resize',
      tr: 'nesw-resize',
      bl: 'nesw-resize',
      br: 'nwse-resize',
    };
    return {
      rotate: `rotate(${pose.thetaDegrees.toFixed(2)} ${cx.toFixed(1)} ${cy.toFixed(1)})`,
      cx,
      cy,
      x,
      y,
      w,
      h,
      // Above the link, which in this frame is further along +y.
      knobY: y + h + this.svgGrid.scaleWithZoom(34),
      corners: [
        { id: 'tl', x, y: y + h },
        { id: 'tr', x: x + w, y: y + h },
        { id: 'bl', x, y },
        { id: 'br', x: x + w, y },
      ].map((c) => ({ ...c, cursor: cursors[c.id], x: c.x - grip / 2, y: c.y - grip / 2 })),
    };
  }

  /**
   * The bar about to be dropped: same length, same reference point, turned the
   * way the wheel has turned it. A promise about what the click will make.
   */
  ghostBar(): { x1: number; y1: number; x2: number; y2: number } | undefined {
    if (!this.design.armed || !this.cursor || this.design.regionDraw) return undefined;
    if (this.design.getFirstUndefinedPose() === undefined) return undefined;
    const theta = (this.design.placeAngleDeg * Math.PI) / 180;
    const length = this.design.length;
    const dx = Math.cos(theta) * length;
    const dy = Math.sin(theta) * length;
    const anchor =
      this.design.COR === COR.BACK
        ? { x: this.cursor.x, y: this.cursor.y }
        : this.design.COR === COR.FRONT
          ? { x: this.cursor.x - dx, y: this.cursor.y - dy }
          : { x: this.cursor.x - dx / 2, y: this.cursor.y - dy / 2 };
    return { x1: anchor.x, y1: anchor.y, x2: anchor.x + dx, y2: anchor.y + dy };
  }

  /** The angle the ghost is turned to, for the hint beside the pointer. */
  ghostAngleLabel(): string {
    return Math.round(((this.design.placeAngleDeg % 360) + 360) % 360) + '°';
  }

  private linkWidth(): number {
    return 0.5 * this.settings.objectScale;
  }

  /**
   * Whether the proposal is still a proposal.
   *
   * Once it has been inserted the drawing holds the real thing, and drawing the
   * preview over it puts two linkages in the same place -- one of which cannot
   * be clicked, which is a worse way to learn that than being told.
   */
  private previewing(): boolean {
    return !this.solution.inserted;
  }

  /** The chosen candidate, drawn where the preview has been scrubbed to. */
  previewLinks(): PreviewLink[] {
    const solved = this.previewing() ? this.solution.previewPose() : null;
    if (!solved) return [];
    const w = this.linkWidth();
    const links: PreviewLink[] = [
      {
        x1: solved.A.x,
        y1: solved.A.y,
        x2: solved.B.x,
        y2: solved.B.y,
        color: LINK_PALE,
        width: w,
      },
      {
        x1: solved.B.x,
        y1: solved.B.y,
        x2: solved.C.x,
        y2: solved.C.y,
        color: LINK_DEEP,
        width: w,
      },
      {
        x1: solved.C.x,
        y1: solved.C.y,
        x2: solved.D.x,
        y2: solved.D.y,
        color: LINK_PALE,
        width: w,
      },
    ];
    const dyad = this.solution.dyad();
    if (dyad) {
      const elbow = meet(dyad.ground, dyad.crankLength, solved.B, dyad.couplerLength);
      if (elbow) {
        links.push({
          x1: dyad.ground.x,
          y1: dyad.ground.y,
          x2: elbow[0].x,
          y2: elbow[0].y,
          color: DRIVER_CRANK,
          width: w * 0.86,
        });
        links.push({
          x1: elbow[0].x,
          y1: elbow[0].y,
          x2: solved.B.x,
          y2: solved.B.y,
          color: DRIVER_COUPLER,
          width: w * 0.8,
        });
      }
    }
    return links;
  }

  previewJoints(): PreviewJoint[] {
    const solved = this.previewing() ? this.solution.previewPose() : null;
    if (!solved) return [];
    const out: PreviewJoint[] = [
      { id: 'A', x: solved.A.x, y: solved.A.y },
      { id: 'B', x: solved.B.x, y: solved.B.y },
      { id: 'C', x: solved.C.x, y: solved.C.y },
      { id: 'D', x: solved.D.x, y: solved.D.y },
    ];
    const dyad = this.solution.dyad();
    if (dyad) {
      const elbow = meet(dyad.ground, dyad.crankLength, solved.B, dyad.couplerLength);
      if (elbow) {
        out.push({ id: 'E', x: dyad.ground.x, y: dyad.ground.y });
        out.push({ id: 'F', x: elbow[0].x, y: elbow[0].y });
      }
    }
    return out;
  }

  /** Which of the preview's pins are bolted to the frame. */
  previewGrounds(): PreviewJoint[] {
    const solved = this.previewing() ? this.solution.previewPose() : null;
    if (!solved) return [];
    const out = [
      { id: 'A', x: solved.A.x, y: solved.A.y },
      { id: 'D', x: solved.D.x, y: solved.D.y },
    ];
    const dyad = this.solution.dyad();
    if (dyad) out.push({ id: 'E', x: dyad.ground.x, y: dyad.ground.y });
    return out;
  }

  /** Where the middle of the coupler goes over the whole of the travel. */
  couplerTrace(): string {
    const cand = this.previewing() ? this.solution.driven() : null;
    if (!cand) return '';
    const span = cand.range.to - cand.range.from;
    let d = '';
    for (let k = 0; k <= 60; k++) {
      const solved = solveFourBar(cand, cand.range.from + (span * k) / 60, cand.sign);
      if (!solved) continue;
      const midX = (solved.B.x + solved.C.x) / 2;
      const midY = (solved.B.y + solved.C.y) / 2;
      d += (d ? ' L ' : 'M ') + midX.toFixed(1) + ' ' + midY.toFixed(1);
    }
    return d;
  }

  /**
   * The candidate that is picked, faded, while another is being hovered.
   *
   * Without it, moving along the gallery replaces the linkage on the grid with
   * no way to see what it replaced -- which is the one comparison the gallery
   * exists to make.
   */
  hoverGhostLinks(): PreviewLink[] {
    if (!this.previewing()) return [];
    const hovering = this.solution.hoverKey;
    const picked = this.solution.picked();
    if (!hovering || !picked || picked.key === hovering) return [];
    const base = this.solution.driven(picked);
    if (!base) return [];
    const solved = solveFourBar(base, base.thetas[0], base.sign);
    if (!solved) return [];
    const w = this.linkWidth() * 0.8;
    return [
      {
        x1: solved.A.x,
        y1: solved.A.y,
        x2: solved.B.x,
        y2: solved.B.y,
        color: '#9aa0ac',
        width: w,
      },
      {
        x1: solved.B.x,
        y1: solved.B.y,
        x2: solved.C.x,
        y2: solved.C.y,
        color: '#9aa0ac',
        width: w,
      },
      {
        x1: solved.C.x,
        y1: solved.C.y,
        x2: solved.D.x,
        y2: solved.D.y,
        color: '#9aa0ac',
        width: w,
      },
    ];
  }

  /** The ground-pivot region, in model coordinates like everything else here. */
  regionBox(): { x: number; y: number; w: number; h: number; corners: Handle[] } | undefined {
    if (!this.design.constrain) return undefined;
    const r = this.design.region;
    const grip = this.svgGrid.scaleWithZoom(10);
    const cursors: Record<string, string> = {
      tl: 'nwse-resize',
      tr: 'nesw-resize',
      bl: 'nesw-resize',
      br: 'nwse-resize',
    };
    return {
      x: r.x,
      y: r.y,
      w: r.w,
      h: r.h,
      corners: [
        { id: 'tl', x: r.x, y: r.y + r.h },
        { id: 'tr', x: r.x + r.w, y: r.y + r.h },
        { id: 'bl', x: r.x, y: r.y },
        { id: 'br', x: r.x + r.w, y: r.y },
      ].map((c) => ({ ...c, cursor: cursors[c.id], x: c.x - grip / 2, y: c.y - grip / 2 })),
    };
  }

  // --- gestures ------------------------------------------------------------

  /** Take hold of a position, to slide it, turn it, or stretch the link. */
  grabPose(at: Coord, id: number, mode: 'move' | 'rotate' | 'length'): void {
    if (!this.design.isPoseDefined(id)) return;
    const pose = this.design.getPose(id);
    this.design.selectedPose = id;
    this.design.setArmed(false);
    this.drag = {
      kind: 'pose',
      id,
      mode,
      dx: at.x - pose.position.x,
      dy: at.y - pose.position.y,
      grabAngleOffset:
        (Math.atan2(at.y - pose.position.y, at.x - pose.position.x) * 180) / Math.PI -
        pose.thetaDegrees,
    };
  }

  grabRegion(at: Coord, mode: 'move' | 'corner' | 'draw', corner?: string): void {
    const r = this.design.region;
    this.drag = {
      kind: 'region',
      mode,
      corner,
      dx: at.x - r.x,
      dy: at.y - r.y,
      originX: at.x,
      originY: at.y,
    };
    if (mode === 'draw') this.design.region = { x: at.x, y: at.y, w: 0, h: 0 };
  }

  /** Follow the pointer. Returns whether a gesture consumed the move. */
  move(at: Coord): boolean {
    this.cursor = at;
    const drag = this.drag;
    if (!drag) return false;

    if (drag.kind === 'pose') {
      const pose = this.design.getPose(drag.id);
      if (drag.mode === 'rotate') {
        const angle =
          (Math.atan2(at.y - pose.position.y, at.x - pose.position.x) * 180) / Math.PI -
          drag.grabAngleOffset;
        pose.thetaDegrees = angle;
      } else if (drag.mode === 'length') {
        // A corner pulls along the link's own axis, not along the screen: the
        // one dimension a position has is how long the end-effector is.
        const theta = pose.thetaRadians;
        const along = Math.abs(
          (at.x - pose.position.x) * Math.cos(theta) + (at.y - pose.position.y) * Math.sin(theta)
        );
        const factor = this.design.COR === COR.CENTER ? 2 : 1;
        this.design.length = Math.max(this.settings.objectScale * 0.5, along * factor);
      } else {
        pose.position = new Coord(at.x - drag.dx, at.y - drag.dy);
      }
      this.design.valueChanges.next(true);
      return true;
    }

    if (drag.mode === 'move') {
      this.design.region = {
        ...this.design.region,
        x: at.x - drag.dx,
        y: at.y - drag.dy,
      };
    } else if (drag.mode === 'draw') {
      this.design.region = {
        x: Math.min(drag.originX, at.x),
        y: Math.min(drag.originY, at.y),
        w: Math.abs(at.x - drag.originX),
        h: Math.abs(at.y - drag.originY),
      };
    } else {
      const r = this.design.region;
      // The corner opposite the one being pulled is what stays put.
      const fixedX = drag.corner === 'tl' || drag.corner === 'bl' ? r.x + r.w : r.x;
      const fixedY = drag.corner === 'bl' || drag.corner === 'br' ? r.y + r.h : r.y;
      this.design.region = {
        x: Math.min(fixedX, at.x),
        y: Math.min(fixedY, at.y),
        w: Math.max(this.settings.objectScale, Math.abs(at.x - fixedX)),
        h: Math.max(this.settings.objectScale, Math.abs(at.y - fixedY)),
      };
    }
    this.design.valueChanges.next(true);
    return true;
  }

  /** Let go. Returns whether anything was in flight. */
  release(): boolean {
    const had = this.drag !== undefined;
    this.drag = undefined;
    if (this.design.regionDraw) this.design.regionDraw = false;
    return had;
  }

  /** Turn the position that has not been dropped yet. */
  turnGhost(deltaY: number): void {
    this.design.placeAngleDeg += deltaY > 0 ? -5 : 5;
  }
}
