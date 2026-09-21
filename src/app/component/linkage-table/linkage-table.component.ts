import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { Force } from '../../model/force';
import { Link, RealLink } from '../../model/link';
import { Joint, PrisJoint, RealJoint, RevJoint } from '../../model/joint';
import { Coord } from '../../model/coord';
import { isCylinderInner } from '../../model/cylinder';
import { roundNumber } from '../../model/utils';
import { MechanismService } from '../../services/mechanism.service';
import { MODEL_SCALE } from '../../model/render-scale';
import { NOT_A } from '../../ui-text';
import { NotificationService } from '../../services/notification.service';
import { SegmentedComponent } from '../BLOCKS/segmented/segmented.component';
import { StandardFieldDirective } from '../BLOCKS/standard-field/standard-field.directive';

@Component({
  selector: 'app-linkage-table',
  templateUrl: './linkage-table.component.html',
  styleUrls: ['./linkage-table.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [SegmentedComponent, StandardFieldDirective],
})
export class LinkageTableComponent implements OnInit {
  private mechanismService = inject(MechanismService);
  private notify = inject(NotificationService);

  /** Which table is showing. The CSS-radio strip this replaced kept it nowhere. */
  tab = 0;

  private static linkageTable: SVGElement;
  private static showLinkageTableButton: SVGElement;

  // The table's cells speak the user's units; the model is MODEL_SCALE times
  // larger (render-scale.ts), so every length converts at this boundary.
  toUserUnits(modelValue: number): number {
    return roundNumber(modelValue / MODEL_SCALE, 4);
  }

  ngOnInit(): void {}

  ngAfterViewInit() {
    LinkageTableComponent.linkageTable = document.getElementById(
      'linkageTable'
    ) as unknown as SVGElement;
    LinkageTableComponent.showLinkageTableButton = document.getElementById(
      'showTable'
    ) as unknown as SVGElement;
  }

  distFromJoint(joint1: Joint, joint2: Joint) {
    return roundNumber(
      Math.sqrt(Math.pow(joint1.x - joint2.x, 2) + Math.pow(joint1.y - joint2.y, 2)) / MODEL_SCALE,
      3
    );
  }

  changeJointProp($event: Event, joint: Joint, jointProp: string) {
    if (!(joint instanceof RealJoint)) {
      return;
    }
    // A cylinder mount edited by number still moves parametrically: the whole
    // assembly re-poses about the other mount, exactly as the drag does.
    const sealed = this.mechanismService.cylinderAt(joint);
    if (sealed && (jointProp === 'x' || jointProp === 'y')) {
      if (isNaN(Number(($event.target as HTMLInputElement).value))) {
        return this.notify.refusal('value.length', NOT_A.length);
      }
      const value = Number(($event.target as HTMLInputElement).value) * MODEL_SCALE;
      const wanted = new Coord(
        jointProp === 'x' ? value : joint.x,
        jointProp === 'y' ? value : joint.y
      );
      // Through dragJoint, so a mount two rams share is agreed between them --
      // and saved, so one edit here is one undo step, as it is in the panel.
      this.mechanismService.gridUtils.dragJoint(joint, wanted);
      this.mechanismService.save();
      return;
    }
    switch (jointProp) {
      // TODO: When changing the joint positions, be sure to also change the ('d') path of the link
      case 'x':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.length', NOT_A.length);
        }
        joint.x = Number(($event.target as HTMLInputElement).value) * MODEL_SCALE;
        joint.links.forEach((l) => {
          if (!(l instanceof RealLink)) {
            return;
          }
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex((jt) => jt.id === joint.id);
          l.joints[jointIndex].x = roundNumber(joint.x, 3);
          l.joints[jointIndex].y = roundNumber(joint.y, 3);
          if (!l.comIsCustom) {
            l.CoM = RealLink.determineCenterOfMass(l.joints);
          }
          // l.bound = RealLink.getBounds(new Coord(l.joints[0].x, l.joints[0].y), new Coord(l.joints[1].x, l.joints[1].y), Shape.line);
          // l.d = RealLink.getPointsFromBounds(l.bound, l.shape);
          l.d = l.getPathString();
          l.forces.forEach((f) => {
            // TODO: adjust the location of force endpoints and update the line and arrow
          });
        });
        break;
      case 'y':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.length', NOT_A.length);
        }
        joint.y = Number(($event.target as HTMLInputElement).value) * MODEL_SCALE;
        joint.links.forEach((l) => {
          if (!(l instanceof RealLink)) {
            return;
          }
          // TODO: delete this if this is not needed (verify this)
          const jointIndex = l.joints.findIndex((jt) => jt.id === joint.id);
          l.joints[jointIndex].x = roundNumber(joint.x, 3);
          l.joints[jointIndex].y = roundNumber(joint.y, 3);
          l.CoM = RealLink.determineCenterOfMass(l.joints);
          l.d = l.getPathString();
          l.forces.forEach((f) => {
            // TODO: adjust the location of force endpoints and update the line and arrow
          });
        });
        break;
      case 'id':
        if (!(typeof ($event.target as HTMLInputElement).value === 'string')) {
          return this.notify.refusal('value.name', NOT_A.name);
        }
        joint.links.forEach((l) => {
          l.id = l.id.replace(joint.id, ($event.target as HTMLInputElement).value);
        });
        joint.id = ($event.target as HTMLInputElement).value;
        break;
      case 'angle':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.angle', NOT_A.angle);
        }
        if (!(joint instanceof PrisJoint)) {
          return;
        }
        joint.angle_rad = (Number(($event.target as HTMLInputElement).value) * Math.PI) / 180;
    }
    // `true`, because a value typed into a cell is a discrete edit and should
    // be one undo step -- the same rule the panel follows. Without it, Undo
    // after a table edit took back whichever gesture came before it.
    this.mechanismService.updateMechanism(true);
  }

  changeLinkProp($event: Event, link: Link, linkProp: string) {
    if (!(link instanceof RealLink)) {
      return;
    }
    switch (linkProp) {
      case 'mass': {
        // Two refusals, not one: a reader who typed "-5" typed a number, and
        // this cell used to take it and store the mass as written.
        const typed = Number(($event.target as HTMLInputElement).value);
        if (isNaN(typed)) {
          return this.notify.refusal('value.mass', NOT_A.mass);
        }
        if (typed < 0) {
          return this.notify.refusal('value.mass', NOT_A.nonNegativeMass);
        }
        link.mass = typed;
        break;
      }
      case 'massMoI':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.momentOfInertia', NOT_A.momentOfInertia);
        }
        // A cylinder member's inertia and center follow its own shape
        // (decision S14) — the debug table gets no back door to freeze either,
        // and it asks the same predicate the panels ask.
        if (this.mechanismService.memberInertiaIsDerived(link)) break;
        link.massMoI = Number(($event.target as HTMLInputElement).value);
        link.moiIsCustom = true;
        break;
      case 'CoMX':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.length', NOT_A.length);
        }
        if (this.mechanismService.memberInertiaIsDerived(link)) break;
        link.placeCustomCoM({
          x: Number(($event.target as HTMLInputElement).value) * MODEL_SCALE,
          y: link.CoM.y,
        });
        break;
      case 'CoMY':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.length', NOT_A.length);
        }
        if (this.mechanismService.memberInertiaIsDerived(link)) break;
        link.placeCustomCoM({
          x: link.CoM.x,
          y: Number(($event.target as HTMLInputElement).value) * MODEL_SCALE,
        });
        break;
    }
    this.mechanismService.updateMechanism(true);
  }

  showForceAngle(force: Force) {
    return force.angleRad * (180 / Math.PI);
  }

  changeForceProp($event: Event, force: Force, forceProp: string) {
    switch (forceProp) {
      case 'id':
        if (!(typeof ($event.target as HTMLInputElement).value === 'string')) {
          return this.notify.refusal('value.name', NOT_A.name);
        }
        force.id = ($event.target as HTMLInputElement).value;
        break;
      case 'xPos':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.length', NOT_A.length);
        }
        force.moveAnchor(
          new Coord(
            Number(($event.target as HTMLInputElement).value) * MODEL_SCALE,
            force.startCoord.y
          )
        );
        break;
      case 'yPos':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.length', NOT_A.length);
        }
        force.moveAnchor(
          new Coord(
            force.startCoord.x,
            Number(($event.target as HTMLInputElement).value) * MODEL_SCALE
          )
        );
        break;
      case 'mag':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.force', NOT_A.force);
        }
        force.setMagnitude(Number(($event.target as HTMLInputElement).value));
        break;
      case 'angle':
        if (isNaN(Number(($event.target as HTMLInputElement).value))) {
          return this.notify.refusal('value.angle', NOT_A.angle);
        }
        force.setDirectionRadians(
          Number(($event.target as HTMLInputElement).value) * (Math.PI / 180)
        );
        break;
    }
    this.mechanismService.updateMechanism(true);
  }

  static linkageVisibility() {
    if (LinkageTableComponent.linkageTable.style.visibility === 'visible') {
      LinkageTableComponent.linkageTable.style.visibility = 'hidden';
      LinkageTableComponent.showLinkageTableButton.textContent = 'Show Table';
    } else {
      LinkageTableComponent.linkageTable.style.visibility = 'visible';
      LinkageTableComponent.showLinkageTableButton.textContent = 'Hide Table';
    }
  }

  getLinkageVisibility() {
    return LinkageTableComponent.linkageVisibility();
  }

  typeOfJoint(joint: Joint) {
    switch (joint.constructor) {
      case Joint:
        return '?';
      case RealJoint:
        return '?';
      case RevJoint:
        return 'R';
      case PrisJoint:
        return 'P';
    }
    return '?';
  }

  typeofLink(link: Link) {
    switch (link.constructor) {
      case RealLink:
        return 'R';
    }
    return '?';
  }

  getJointAngle(joint: Joint) {
    if (!(joint instanceof PrisJoint)) {
      return;
    }
    return (joint.angle_rad * 180) / Math.PI;
  }

  getLinkProp(link: Link, propType: string) {
    if (!(link instanceof RealLink)) {
      return;
    }
    switch (propType) {
      case 'mass':
        return link.mass;
      case 'massMoI':
        return link.massMoI;
      case 'CoMX':
        return this.toUserUnits(link.CoM.x);
      case 'CoMY':
        return this.toUserUnits(link.CoM.y);
      default:
        return '?';
    }
  }

  /**
   * The joints this one meets, filtered the way the table's own rows are.
   *
   * A cylinder's buried barrel end is a joint of the barrel like any other, so
   * a mount's "Connected joints" cell listed it — `C1`, in a table whose own
   * rows deliberately leave it out (`getJoints`). A reader could read the name
   * of a joint here and then fail to find it anywhere else in the app.
   */
  connectedJoints(joint: Joint) {
    if (!(joint instanceof PrisJoint || joint instanceof RevJoint)) {
      return;
    }
    const shown = new Set(this.getJoints().map((one) => one.id));
    return joint.connectedJoints.filter((one) => shown.has(one.id));
  }

  getJoints() {
    // Every joint the canvas draws a marker for. A cylinder's buried barrel end
    // is the one that is left out: nothing shows it and editing it by number
    // would bend a part that cannot bend. Its seal is listed like any other
    // slider — typing an X or a Y there goes through `dragJoint`, which slides
    // the seal along its own axis (decision S7).
    return this.mechanismService.joints.filter((joint) => {
      const sealed = this.mechanismService.cylinderAt(joint);
      return !sealed || !isCylinderInner(sealed, joint);
    });
  }

  getLinks() {
    return this.mechanismService.links;
  }

  /** What this body is called on screen, which is the one name the app shows. */
  nameOf(link: Link): string {
    return this.mechanismService.visibleBodyName(link);
  }

  getForces() {
    return this.mechanismService.forces;
  }

  getUnit() {
    // TODO: Should return this.settingService.globalUnit.value
    return 'cm'; // :P
  }
}
