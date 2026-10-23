import { Injectable, inject } from '@angular/core';
import { PrisJoint, RealJoint } from '../model/joint';
import { Link } from '../model/link';
import { MARK, R_PER_SCALE } from '../model/joint-marks';
import {
  SplitJointChoice,
  SplitJointResult,
  splitJoint,
  splitJointChoice,
} from '../model/split-joint';
import { ActiveObjService } from './active-obj.service';
import { EditPermissionService } from './edit-permission.service';
import { MechanismService } from './mechanism.service';
import { NotificationService } from './notification.service';
import { GridUtilsService } from './grid-utils.service';
import { Coord } from '../model/coord';
import { SettingsService } from './settings.service';

/** Each unconstrained pin moves this far from the former shared center. */
const SPLIT_SEPARATION_FACTOR = 0.2;
/**
 * Three or more pins share one circle, so neighbors sit closer than an
 * opposite pair does. At the two-pin distance a four-way split leaves pins
 * whose hit targets overlap, and grabbing one can take its neighbor.
 */
const CROWDED_SPLIT_SEPARATION_FACTOR = 0.6;
/** Two pins this far apart can each be grabbed: the gap a two-link split leaves. */
const PAIR_GAP_FACTOR = 2 * SPLIT_SEPARATION_FACTOR;

@Injectable({ providedIn: 'root' })
export class SplitJointService {
  private mechanism = inject(MechanismService);
  private active = inject(ActiveObjService);
  private permission = inject(EditPermissionService);
  private notify = inject(NotificationService);
  private grid = inject(GridUtilsService);
  private settings = inject(SettingsService);

  choiceFor(joint: RealJoint): SplitJointChoice {
    const live = this.live(joint.id) ?? joint;
    return splitJointChoice(live, this.mechanism.links, this.mechanism.sealedStructures());
  }

  split(joint: RealJoint): boolean {
    const live = this.live(joint.id);
    const permission = this.permission.refusal('structure');
    if (permission) {
      this.notify.refusal(permission.short, permission.long);
      return false;
    }
    if (!live) return false;
    const choice = this.choiceFor(live);
    if (choice.refusal) {
      this.notify.refusal(choice.short!, choice.long!);
      return false;
    }
    let result: SplitJointResult | undefined;
    const wasSlider = live instanceof PrisJoint;
    // A block left with no riders has nothing to drive; a pin keeps its drive
    // only while it is still grounded, the frame end of the link it turns.
    const removesInput = live.input && (wasSlider || !live.ground);
    const from = new Coord(live.x, live.y);
    this.mechanism.capturingPose(live, () => {
      result = splitJoint(
        live,
        this.mechanism.joints as RealJoint[],
        this.mechanism.links,
        this.mechanism.forces,
        this.mechanism.sealedStructures()
      );
      if (result) {
        if (removesInput) result.original.input = false;
        this.active.selectedJoint = result.original;
        // Connectivity and cylinder roles must name the new pins before the
        // ordinary constrained drag path is asked to move them.
        this.mechanism.finishStructuralEdit(false);
        const moves = this.placements(from, result);
        moves.forEach(([pin, to]) => this.grid.dragJoint(pin, to, false));
        // Only when a slot's end really moved -- two carriers met at the pin
        // and both had to go. The drags skip the rebuild that would put a
        // slider back on its slot, and reseating when no slot moved would
        // tidy sliders this split never touched.
        if (moves.some(([pin]) => this.endsASlot(pin))) this.mechanism.reseatFloatingSliders();
        this.mechanism.finishStructuralEdit(true);
      }
    });
    if (result && removesInput) {
      this.notify.news(
        'split-removed-input',
        wasSlider
          ? 'The slider input was removed because no links ride its block now.'
          : 'The input was removed because its two links are now separate.'
      );
    }
    return result !== undefined;
  }

  /**
   * Where each pin goes. Whatever other parts depend on stays where it is -- a
   * slider block, or the pin of a link whose slot or cylinder would otherwise
   * move under someone else -- and plain links step off it along themselves,
   * which reshapes nothing but that link. With nothing to keep still, or more
   * than one thing, every pin spreads evenly around the former point.
   */
  private placements(at: Coord, result: SplitJointResult): [RealJoint, Coord][] {
    const scale = this.settings.objectScale;
    const pins = [...new Set(result.pinOf.values())];
    const block = result.original instanceof PrisJoint ? result.original : undefined;
    const anchored = block ? [] : pins.filter((pin) => this.othersDependOn(pin, result.pinOf));
    if (!block && anchored.length !== 1) {
      const radius =
        (pins.length > 2 ? CROWDED_SPLIT_SEPARATION_FACTOR : SPLIT_SEPARATION_FACTOR) * scale;
      return pins.map((pin, index) => [
        pin,
        this.around(at, (2 * Math.PI * index) / pins.length + Math.PI, radius),
      ]);
    }
    const movers = pins.filter((pin) => !anchored.includes(pin));
    const clearance = (angle: number): number =>
      block ? this.clearOfBlock(block, angle) : PAIR_GAP_FACTOR * scale;
    const along = movers.map((pin) => this.alongOwnLink(pin, result.pinOf));
    let targets = movers.map((pin, index) => {
      const angle = along[index];
      if (angle === undefined) return undefined;
      const target = this.around(at, angle, clearance(angle));
      // A link shorter than the step would fold back over its own far end.
      const lands = this.crowded([target, ...this.restOfOwnLink(pin, result.pinOf)]);
      return lands ? undefined : target;
    });
    if (targets.some((target) => target === undefined) || this.crowded(targets as Coord[])) {
      targets = movers.map((_, index) => {
        const angle = (2 * Math.PI * index) / movers.length + Math.PI / 2;
        return this.around(
          at,
          angle,
          Math.max(clearance(angle), CROWDED_SPLIT_SEPARATION_FACTOR * scale)
        );
      });
    }
    return movers.map((pin, index) => [pin, targets[index]!]);
  }

  /** Moving this pin would carry a slot or a cylinder that another part relies on. */
  private othersDependOn(pin: RealJoint, pinOf: Map<Link, RealJoint>): boolean {
    const bodies = [...pinOf].filter(([, held]) => held === pin).map(([body]) => body);
    const cylinderPart = this.mechanism
      .sealedStructures()
      .some((cylinder) =>
        [cylinder.barrel, cylinder.rod, cylinder.barrelRoot, cylinder.rodRoot].some((part) =>
          bodies.includes(part)
        )
      );
    return this.endsASlot(pin) || cylinderPart;
  }

  private endsASlot(pin: RealJoint): boolean {
    return this.mechanism.joints.some(
      (slider) =>
        slider instanceof PrisJoint &&
        slider.isFloating &&
        (slider.slotJointA === pin || slider.slotJointB === pin)
    );
  }

  private restOfOwnLink(pin: RealJoint, pinOf: Map<Link, RealJoint>): Coord[] {
    const body = [...pinOf].find(([, held]) => held === pin)?.[0];
    return (body?.joints ?? [])
      .filter((joint) => joint !== pin)
      .map((joint) => new Coord(joint.x, joint.y));
  }

  /** The direction from the pin toward the rest of its own link. */
  private alongOwnLink(pin: RealJoint, pinOf: Map<Link, RealJoint>): number | undefined {
    const others = this.restOfOwnLink(pin, pinOf);
    if (others.length === 0) return undefined;
    const dx = others.reduce((sum, joint) => sum + joint.x, 0) / others.length - pin.x;
    const dy = others.reduce((sum, joint) => sum + joint.y, 0) / others.length - pin.y;
    return Math.hypot(dx, dy) > 1e-9 ? Math.atan2(dy, dx) : undefined;
  }

  /**
   * How far a pin has to go in this direction to land clear of the block: out
   * of its outline, and then the gap two pins keep. Half of that left the pin
   * touching the block's edge, which reads as still riding it.
   */
  private clearOfBlock(block: PrisJoint, angle: number): number {
    const r = R_PER_SCALE * this.settings.objectScale;
    const relative = angle - block.slotAngle;
    const along = Math.abs(Math.cos(relative));
    const across = Math.abs(Math.sin(relative));
    const exit = Math.min(
      along > 1e-9 ? (MARK.blockAlongHalf * r) / along : Infinity,
      across > 1e-9 ? (MARK.blockAcrossHalf * r) / across : Infinity
    );
    return exit + PAIR_GAP_FACTOR * this.settings.objectScale;
  }

  private crowded(targets: Coord[]): boolean {
    const gap = PAIR_GAP_FACTOR * this.settings.objectScale;
    return targets.some((one, index) =>
      targets.slice(index + 1).some((other) => Math.hypot(one.x - other.x, one.y - other.y) < gap)
    );
  }

  private around(at: Coord, angle: number, radius: number): Coord {
    return new Coord(at.x + radius * Math.cos(angle), at.y + radius * Math.sin(angle));
  }

  private live(id: string): RealJoint | undefined {
    const found = this.mechanism.joints.find((candidate) => candidate.id === id);
    return found instanceof RealJoint ? found : undefined;
  }
}
