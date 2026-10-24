import { Injectable, inject } from '@angular/core';
import { Coord } from '../model/coord';
import { PrisJoint, RealJoint } from '../model/joint';
import { Link } from '../model/link';
import {
  SplitJointChoice,
  SplitJointResult,
  splitJoint,
  splitJointChoice,
} from '../model/split-joint';
import { placeSplitPins } from '../model/split-placement';
import { ActiveObjService } from './active-obj.service';
import { EditPermissionService } from './edit-permission.service';
import { MechanismService } from './mechanism.service';
import { NotificationService } from './notification.service';
import { GridUtilsService } from './grid-utils.service';
import { SettingsService } from './settings.service';

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
    const id = live.id;
    const wasSlider = live instanceof PrisJoint;
    const prismatic = live instanceof PrisJoint && !live.rotates;
    // A block left with no riders has nothing to drive; a pin keeps its drive
    // only while it is still grounded, the frame end of the link it turns.
    const removesInput = live.input && (wasSlider || !live.ground);
    const from = new Coord(live.x, live.y);
    // Batched as well: at the start pose a posed edit holds no saves, and the
    // unweld would otherwise write an undo entry of its own.
    this.mechanism.capturingPose(live, () =>
      this.mechanism.batched(() => {
        // A weld comes off through the ordinary unweld path, so the compound's
        // other welds, its names and its forces come through it intact; the
        // choice above already counted the bodies it leaves.
        if (live.isWelded) this.mechanism.unWeldJoint(live);
        const target = this.live(id)!;
        result = splitJoint(
          target,
          this.mechanism.joints as RealJoint[],
          this.mechanism.links,
          this.mechanism.forces,
          this.mechanism.sealedStructures()
        );
        if (result) {
          // Unwelding a Prismatic block lets its riders turn; with none left
          // on it, it goes back to what it was.
          if (prismatic && result.original instanceof PrisJoint) result.original.rotates = false;
          if (removesInput) result.original.input = false;
          this.active.selectedJoint = result.original;
          // Connectivity and cylinder roles must name the new pins before the
          // ordinary constrained drag path is asked to move them.
          this.mechanism.finishStructuralEdit(false);
          let moves = this.placements(from, result);
          moves.forEach(([pin, to]) => this.grid.dragJoint(pin, to, false));
          // A lock or a hold can keep the pin chosen to move exactly where it
          // was, on top of the one chosen to stay. Then it is the one that
          // stays, and the others are placed around it instead.
          const stuck = moves.find(([pin]) => pin.x === from.x && pin.y === from.y);
          if (stuck) {
            moves = this.placements(from, result, stuck[0]);
            moves.forEach(([pin, to]) => this.grid.dragJoint(pin, to, false));
          }
          // Only when a slot's end really moved -- two carriers met at the pin
          // and one had to go. The drags skip the rebuild that would put a
          // slider back on its slot, and reseating when no slot moved would
          // tidy sliders this split never touched.
          if (moves.some(([pin]) => this.endsASlot(pin))) this.mechanism.reseatFloatingSliders();
          this.mechanism.finishStructuralEdit(true);
        }
      })
    );
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
   * Where each pin goes. A slider block stays where it is and every rider
   * steps off it. At a pin, one body keeps the point -- the one whose slot or
   * cylinder would otherwise move under another part, or else the one that
   * kept the joint's letter -- and the rest take the smallest moves that
   * clear each other's bars (`placeSplitPins`).
   */
  private placements(at: Coord, result: SplitJointResult, held?: RealJoint): [RealJoint, Coord][] {
    const pins = [...new Set(result.pinOf.values())];
    const block = result.original instanceof PrisJoint ? result.original : undefined;
    const moving = block ? pins.filter((pin) => pin !== block) : pins;
    const anchored = moving.findIndex((pin) => this.othersDependOn(pin, result.pinOf));
    const stays = held ? moving.indexOf(held) : block ? undefined : anchored >= 0 ? anchored : 0;
    const targets = placeSplitPins(
      at,
      moving.map((pin) => ({ ends: this.restOfOwnLink(pin, result.pinOf) })),
      this.settings.objectScale,
      stays,
      block ? { angle: block.slotAngle } : undefined
    );
    return moving
      .map((pin, index): [RealJoint, Coord] => [pin, targets[index]])
      .filter((_, index) => index !== stays);
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

  private live(id: string): RealJoint | undefined {
    const found = this.mechanism.joints.find((candidate) => candidate.id === id);
    return found instanceof RealJoint ? found : undefined;
  }
}
