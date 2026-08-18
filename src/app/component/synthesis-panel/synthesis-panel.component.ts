import { Component, OnInit, ChangeDetectionStrategy, inject } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { Coord } from '../../model/coord';
import { Joint, RevJoint } from '../../model/joint';
import { MechanismService } from '../../services/mechanism.service';
import { RealLink } from '../../model/link';
import { SynthesisBuilderService } from 'src/app/services/synthesis/synthesis-builder.service';
import { NumberUnitParserService } from 'src/app/services/number-unit-parser.service';
import { SettingsService } from 'src/app/services/settings.service';
import { SynthesisStatus } from 'src/app/services/synthesis/synthesis-constants';
import { driverDyadFor } from 'src/app/services/synthesis/driver-dyad';
import { MODEL_SCALE } from 'src/app/model/render-scale';
import { SvgGridService } from '../../services/svg-grid.service';
import { ColorService } from '../../services/color.service';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { CollapsibleSubsecitonComponent } from '../BLOCKS/collapsible-subseciton/collapsible-subseciton.component';
import { SubtitleComponent } from '../BLOCKS/subtitle/subtitle.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { RadioComponent } from '../BLOCKS/radio/radio.component';
import { MatDivider } from '@angular/material/divider';
import { DualInputComponent } from '../BLOCKS/dual-input/dual-input.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';

@Component({
  selector: 'app-synthesis-panel',
  templateUrl: './synthesis-panel.component.html',
  styleUrls: ['./synthesis-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    PanelSectionComponent,
    TitleBlock,
    CollapsibleSubsecitonComponent,
    SubtitleComponent,
    InputComponent,
    FormsModule,
    ReactiveFormsModule,
    RadioComponent,
    MatDivider,
    DualInputComponent,
    ButtonComponent,
  ],
})
export class SynthesisPanelComponent implements OnInit {
  private fb = inject(FormBuilder);
  mechanismSrv = inject(MechanismService);
  synthesisBuilder = inject(SynthesisBuilderService);
  private nup = inject(NumberUnitParserService);
  private settings = inject(SettingsService);
  svgGrid = inject(SvgGridService);
  private colorService = inject(ColorService);

  private _alreadyHandlingPoseChange: boolean = false;

  ngOnInit() {
    //Set initial values
    //(The default values are based on the image Pradeep provided but they can be easily changed below)
    this.synthesisForm.setValue({
      //a0x: '6',
      //a0y: '0',
      //b0x: '8.1213',
      //b0y: '-2.1213',
      //a1x: '8',
      //a1y: '-4',
      //b1x: '8',
      //b1y: '-7',
      //a2x: '1',
      //a2y: '2',
      //b2x: '4',
      //b2y: '2',

      //a0x: '-7.96',
      //a0y: '-1.34',
      //b0x: '-4.42',
      //b0y: '2.2',
      //a1x: '-0.37',
      //a1y: '4.06',
      //b1x: '4.63',
      //b1y: '4.06',
      //a2x: '7.68',
      //a2y: '2.30',
      //b2x: '11.22',
      //b2y: '-1.23',

      a0x: '0',
      a0y: '0',
      b0x: '12.5',
      b0y: '0',
      a1x: '20',
      a1y: '10',
      b1x: '28.8388',
      b1y: '18.8388',
      a2x: '20',
      a2y: '30',
      b2x: '26.25',
      b2y: '40.8253',

      quality: '0.05',

      position1Match: ' ',
      position2Match: ' ',
      position3Match: ' ',
    });

    // initialize form values from model
    this.updateFormFromModel();

    // when model updates, update form values as well
    this.synthesisBuilder.valueChanges.subscribe((value) => {
      this.updateFormFromModel();
      if (this.synthesisBuilder.isFullyDefined()) {
        this.synthesisFunction();
      }
    });

    // set up subscriptions to synthesis form changes to update model
    this.synthesisPoseForm.valueChanges.subscribe((value) => {
      // prevent infinite loop
      if (this._alreadyHandlingPoseChange) return;

      this._alreadyHandlingPoseChange = true;

      this.synthesisBuilder.updatePosesFromForm(value);
      this.updateFormFromModel();

      if (this.synthesisBuilder.isFullyDefined()) {
        this.synthesisFunction();
      }

      this._alreadyHandlingPoseChange = false;
    });

    SettingsService._objectScale.subscribe((val) => {
      this.synthesisBuilder.getAllPoses().forEach((pose) => {
        pose.recompute();
      });
    });
  }

  private convertL(value: number): string {
    // Pose coordinates and the end-effector length live in internal model
    // units; the form speaks the user's unit.
    return this.nup.formatModelLength(value, this.settings.lengthUnit.getValue());
  }

  private convertA(value: number): string {
    return this.nup.formatValueAndUnit(value, this.settings.angleUnit.getValue());
  }

  // given synthesis model, update form values to sync with model
  updateFormFromModel() {
    this._alreadyHandlingPoseChange = true;

    let poses = this.synthesisBuilder.poses;
    let controls = this.synthesisPoseForm.controls;

    controls.length.setValue(this.convertL(this.synthesisBuilder.length));

    if (this.synthesisBuilder.isPoseDefined(1)) {
      controls.p1x.setValue(this.convertL(poses[1].position.x));
      controls.p1y.setValue(this.convertL(poses[1].position.y));
      controls.p1theta.setValue(this.convertA(poses[1].thetaDegrees));
    }
    if (this.synthesisBuilder.isPoseDefined(2)) {
      controls.p2x.setValue(this.convertL(poses[2].position.x));
      controls.p2y.setValue(this.convertL(poses[2].position.y));
      controls.p2theta.setValue(this.convertA(poses[2].thetaDegrees));
    }
    if (this.synthesisBuilder.isPoseDefined(3)) {
      controls.p3x.setValue(this.convertL(poses[3].position.x));
      controls.p3y.setValue(this.convertL(poses[3].position.y));
      controls.p3theta.setValue(this.convertA(poses[3].thetaDegrees));
    }

    this._alreadyHandlingPoseChange = false;
  }

  synthesisPoseForm = this.fb.group(
    {
      cor: ['1'],
      length: [''],
      p1x: [''],
      p1y: [''],
      p1theta: [''],
      p2x: [''],
      p2y: [''],
      p2theta: [''],
      p3x: [''],
      p3y: [''],
      p3theta: [''],
    },
    {
      updateOn: 'blur',
    }
  );

  //Angular form stuff with 12 numbers, a0x, a0y, b0x, b0y, a1x, a1y, b1x, b1y, a2x, a2y, b2x, b2y
  synthesisForm = this.fb.group({
    a0x: [''],
    a0y: [''],
    b0x: [''],
    b0y: [''],
    a1x: [''],
    a1y: [''],
    b1x: [''],
    b1y: [''],
    a2x: [''],
    a2y: [''],
    b2x: [''],
    b2y: [''],
    quality: [''],
    position1Match: [''],
    position2Match: [''],
    position3Match: [''],
  });

  // for html to get current pose as a number
  getCurrentPose(): number {
    return this.synthesisBuilder.selectedPose;
  }

  setCurrentPose(pose: number) {
    this.synthesisBuilder.selectedPose = pose;
  }

  getFormIDPoseX(pose: number): string {
    if (pose == 1) return 'p1x';
    else if (pose == 2) return 'p2x';
    else return 'p3x';
  }

  getFormIDPoseY(pose: number): string {
    if (pose == 1) return 'p1y';
    else if (pose == 2) return 'p2y';
    else return 'p3y';
  }

  getFormIDPoseTheta(pose: number): string {
    if (pose == 1) return 'p1theta';
    else if (pose == 2) return 'p2theta';
    else return 'p3theta';
  }

  /**
   * Take back the linkage this visit to Synthesis last produced.
   *
   * By id, and only the ids this visit recorded: anything else on the grid was
   * drawn by hand or left by an earlier visit and is not this one's to remove.
   * Forces attached to a removed link go with it -- a force on a link that no
   * longer exists belongs to no mechanism and would sit in the drawing
   * unreachable.
   */
  private removePreviousSynthesis(): void {
    const { joints, links } = this.synthesisBuilder.synthesisedIds;
    if (joints.length === 0 && links.length === 0) return;

    const goneLinks = new Set(links);
    const goneJoints = new Set(joints);
    this.mechanismSrv.forces = this.mechanismSrv.forces.filter(
      (force) => !goneLinks.has(force.link?.id ?? '')
    );
    this.mechanismSrv.links = this.mechanismSrv.links.filter((link) => !goneLinks.has(link.id));
    this.mechanismSrv.joints = this.mechanismSrv.joints.filter(
      (joint) => !goneJoints.has(joint.id)
    );
    this.synthesisBuilder.synthesisedIds = { joints: [], links: [] };
  }

  /** As many ids as asked for, none of which anything on the grid is using. */
  private nextLetters(count: number): string[] {
    const taken: string[] = [];
    for (let i = 0; i < count; i++) {
      taken.push(this.mechanismSrv.determineNextLetter(taken));
    }
    return taken;
  }

  /** Whether there is a linkage on the grid for the driver controls to act on. */
  hasLinkage(): boolean {
    return this.synthesisBuilder.isFullyDefined();
  }

  /**
   * Add a driver to the four-bar, or take it off again.
   *
   * Both go through a full re-synthesis rather than editing what is on the
   * grid, because the drive pin and the driver change how the four-bar itself
   * is built -- which of its pins is the input -- and re-running is the only
   * path that cannot leave the two disagreeing.
   */
  toggleDriver(): void {
    this.synthesisBuilder.driverWanted = !this.synthesisBuilder.driverWanted;
    if (this.hasLinkage()) this.synthesisFunction();
  }

  /** Drive the linkage from its other ground pin. */
  swapDrivePin(): void {
    this.synthesisBuilder.driveOnFarPin = !this.synthesisBuilder.driveOnFarPin;
    if (this.hasLinkage()) this.synthesisFunction();
  }

  /**
   * Score the poses against the linkage as it now stands.
   *
   * Synthesis scores its own answer as it builds it, so this says nothing new
   * about an untouched linkage -- it is for after the drawing has been edited
   * by hand, when the marks on the poses are describing a linkage that no
   * longer exists.
   */
  evaluatePoses(): void {
    const built = this.mechanismSrv.joints.find(
      (joint) => joint.id === this.synthesisBuilder.synthesisedIds.joints[0]
    );
    const solved = built ? this.mechanismSrv.mechanismContaining(built) : undefined;
    const poseCoords = [1, 2, 3].flatMap((i) => [
      this.synthesisBuilder.poses[i].posBack,
      this.synthesisBuilder.poses[i].posFront,
    ]);
    this.checkQuality(
      solved
        ? this.compareTheQualityofSynthesis(
            solved.joints,
            poseCoords,
            Number(this.synthesisForm.value.quality)
          )
        : [999, 999, 999, 999, 999, 999, 999, 999, 999]
    );
  }

  synthesisFunction() {
    //call synthesis functions

    //populate pose information

    let pose1_coord1 = this.synthesisBuilder.poses[1].posBack;
    let pose1_coord2 = this.synthesisBuilder.poses[1].posFront;
    let pose2_coord1 = this.synthesisBuilder.poses[2].posBack;
    let pose2_coord2 = this.synthesisBuilder.poses[2].posFront;
    let pose3_coord1 = this.synthesisBuilder.poses[3].posBack;
    let pose3_coord2 = this.synthesisBuilder.poses[3].posFront;

    let qualityfromUser = Number(this.synthesisForm.value.quality);

    //find first itnersection point

    let firstPoint = this.findIntersectionPoint(pose1_coord1, pose2_coord1, pose3_coord1);
    let secondPoint = pose1_coord1;
    let thirdPoint = pose1_coord2;
    let fourthPoint = this.findIntersectionPoint2(pose1_coord2, pose2_coord2, pose3_coord2);

    // Take back what this visit put on the grid last time it ran -- it runs
    // again on every change to a pose -- and leave everything else alone. It
    // used to empty the whole drawing, which is the wrong answer now that a
    // drawing can hold more than one machine.
    this.removePreviousSynthesis();

    //now create joints, links, etc. from the above four coordinates

    // Not A, B, C, D: those letters are taken as soon as there is anything else
    // on the grid, and two joints with one id is not a mechanism, it is a bug
    // waiting for the codec to find it.
    const [idA, idB, idC, idD, idE, idF] = this.nextLetters(6);

    // Which pin the motor sits on is decided here rather than moved afterwards:
    // with a driver on the linkage neither ground pin is the input at all, and
    // without one it is whichever the drive-pin choice names.
    const far = this.synthesisBuilder.driveOnFarPin;
    const drivenDirectly = !this.synthesisBuilder.driverWanted;

    let joint1 = new RevJoint(idA, firstPoint.x, firstPoint.y, drivenDirectly && !far, true);
    let joint2 = new RevJoint(idB, secondPoint.x, secondPoint.y, false, false);
    let joint3 = new RevJoint(idC, thirdPoint.x, thirdPoint.y, false, false);
    let joint4 = new RevJoint(idD, fourthPoint.x, fourthPoint.y, drivenDirectly && far, true);

    joint1.connectedJoints.push(joint2);
    joint2.connectedJoints.push(joint1, joint3);
    joint3.connectedJoints.push(joint2, joint4);
    joint4.connectedJoints.push(joint3);

    let link1 = new RealLink(idA + idB, [joint1, joint2]);
    link1.fill = this.colorService.getLinkColorFromIndex(0);
    let link2 = new RealLink(idB + idC, [joint2, joint3]);
    link2.fill = this.colorService.getLinkColorFromIndex(1);
    let link3 = new RealLink(idC + idD, [joint3, joint4]);
    link3.fill = this.colorService.getLinkColorFromIndex(0);

    joint1.links.push(link1);
    joint2.links.push(link1, link2);
    joint3.links.push(link2, link3);
    joint4.links.push(link3);

    const madeJoints = [joint1, joint2, joint3, joint4];
    const madeLinks = [link1, link2, link3];

    // Built into the linkage, not added to it afterwards, so that one solve
    // sees the finished six-bar and the driver survives the next pose change.
    this.synthesisBuilder.driverRefusal = undefined;
    if (this.synthesisBuilder.driverWanted) {
      const pivot = far ? fourthPoint : firstPoint;
      const drivenPin = far ? joint3 : joint2;
      const drivenAt = far
        ? [pose1_coord2, pose2_coord2, pose3_coord2]
        : [pose1_coord1, pose2_coord1, pose3_coord1];

      const sized = driverDyadFor(pivot, drivenAt);
      if ('refusal' in sized) {
        // The four-bar still stands, and still passes through the poses — it
        // is only the motor that could not be fitted. Left drivable by hand so
        // the drawing is not made useless by the refusal.
        this.synthesisBuilder.driverRefusal = sized.refusal;
        (far ? joint4 : joint1).input = true;
      } else {
        // The two lengths the sizing solved for are the distances between these
        // three points, so placing the pins is all it takes to realise them.
        const { ground, elbow } = sized.dyad;
        const motor = new RevJoint(idE, ground.x, ground.y, true, true);
        const knee = new RevJoint(idF, elbow.x, elbow.y, false, false);

        motor.connectedJoints.push(knee);
        knee.connectedJoints.push(motor, drivenPin);
        drivenPin.connectedJoints.push(knee);

        const driverCrank = new RealLink(idE + idF, [motor, knee]);
        driverCrank.fill = this.colorService.getLinkColorFromIndex(2);
        const driverCoupler = new RealLink(idF + drivenPin.id, [knee, drivenPin]);
        driverCoupler.fill = this.colorService.getLinkColorFromIndex(3);

        motor.links.push(driverCrank);
        knee.links.push(driverCrank, driverCoupler);
        drivenPin.links.push(driverCoupler);

        madeJoints.push(motor, knee);
        madeLinks.push(driverCrank, driverCoupler);
      }
    }

    this.mechanismSrv.mergeToJoints(madeJoints);
    this.mechanismSrv.mergeToLinks(madeLinks);
    this.synthesisBuilder.synthesisedIds = {
      joints: madeJoints.map((joint) => joint.id),
      links: madeLinks.map((link) => link.id),
    };

    this.mechanismSrv.mechanismTimeStep = 0;
    this.mechanismSrv.updateMechanism();

    // update flag to indicate that mechanism has been modified since last synthesis
    this.synthesisBuilder.modifiedMechanism = true;

    let posCoords = [
      pose1_coord1,
      pose1_coord2,
      pose2_coord1,
      pose2_coord2,
      pose3_coord1,
      pose3_coord2,
    ];

    // The machine this synthesis just made, not whichever one sorts first: a
    // drawing can hold several now, and the quality being reported is this
    // one's.
    const solved = this.mechanismSrv.mechanismContaining(joint1);
    // Nothing to score if it did not solve. 999 is what the scorer itself uses
    // for a pose it could not reach, and every reader here compares against a
    // threshold, so this reads as three misses -- which is what happened.
    let quality = solved
      ? this.compareTheQualityofSynthesis(solved.joints, posCoords, qualityfromUser)
      : [999, 999, 999, 999, 999, 999, 999, 999, 999];

    //  let trialCoord = new Coord(this.mechanismSrv.mechanisms[0].joints[0][0].x, this.mechanismSrv.mechanisms[0].joints[0][0].y);

    //now check if there is 999 in the quality. Count 999 and say which position matches

    this.checkQuality(quality);

    //   'Position Matches:' +
    //     whichPositionMatches[0] +
    //     ',' +
    //     whichPositionMatches[1] +
    //     ',' +
    //     whichPositionMatches[2]
    // );
  }

  checkQuality(quality: number[]) {
    // In model units, like the distances it is comparing against.
    const POSE_REACHED = 0.09 * MODEL_SCALE;
    let positionMatches: string[] = ['Position 1', 'Position 2', 'Position 3'];
    if (quality[0] >= POSE_REACHED || quality[1] >= POSE_REACHED) {
      positionMatches[0] = 'No Match';
      this.synthesisBuilder.poses[1].status = SynthesisStatus.INVALID;
    } else {
      this.synthesisBuilder.poses[1].status = SynthesisStatus.VALID;
    }
    if (quality[3] >= POSE_REACHED || quality[4] >= POSE_REACHED) {
      positionMatches[1] = 'No Match';
      this.synthesisBuilder.poses[2].status = SynthesisStatus.INVALID;
    } else {
      this.synthesisBuilder.poses[2].status = SynthesisStatus.VALID;
    }
    if (quality[6] >= POSE_REACHED || quality[7] >= POSE_REACHED) {
      positionMatches[2] = 'No Match';
      this.synthesisBuilder.poses[3].status = SynthesisStatus.INVALID;
    } else {
      this.synthesisBuilder.poses[3].status = SynthesisStatus.VALID;
    }

    return positionMatches;
  }

  compareTheQualityofSynthesis(jointValues: Joint[][], posCoords: Coord[], qualityOfSyn: number) {
    //get position analysis data
    //joint B, Joint C,
    //compare that with poses

    // Both tolerances a person deals with -- the one typed into the panel and
    // the 0.09 below -- are lengths in the units the grid is labelled in. Every
    // distance measured here is between model coordinates, which are those
    // units times MODEL_SCALE. Comparing the two directly meant a pose counted
    // as reached only when it was hit to the last decimal place, so all three
    // marks read "no match" on linkages that pass straight through the poses.
    const tolerance = qualityOfSyn * MODEL_SCALE;

    let quality1_b: number = 999;
    let quality2_b: number = 999;
    let quality3_b: number = 999;

    let quality1_c: number = 999;
    let quality2_c: number = 999;
    let quality3_c: number = 999;

    let pos1TimeStep: number = 999;
    let pos2TimeStep: number = 999;
    let pos3TimeStep: number = 999;

    //compare Joint B with pose 1, pose2, and pose3;

    let index: number = 1;

    for (let val in jointValues) {
      let pos1Value_b = Math.sqrt(
        Math.pow(jointValues[val][1].x - posCoords[0].x, 2) +
          Math.pow(jointValues[val][1].y - posCoords[0].y, 2)
      );
      let pos2Value_b = Math.sqrt(
        Math.pow(jointValues[val][1].x - posCoords[2].x, 2) +
          Math.pow(jointValues[val][1].y - posCoords[2].y, 2)
      );
      let pos3Value_b = Math.sqrt(
        Math.pow(jointValues[val][1].x - posCoords[4].x, 2) +
          Math.pow(jointValues[val][1].y - posCoords[4].y, 2)
      );

      let pos1Value_c = Math.sqrt(
        Math.pow(jointValues[val][2].x - posCoords[1].x, 2) +
          Math.pow(jointValues[val][2].y - posCoords[1].y, 2)
      );
      let pos2Value_c = Math.sqrt(
        Math.pow(jointValues[val][2].x - posCoords[3].x, 2) +
          Math.pow(jointValues[val][2].y - posCoords[3].y, 2)
      );
      let pos3Value_c = Math.sqrt(
        Math.pow(jointValues[val][2].x - posCoords[5].x, 2) +
          Math.pow(jointValues[val][2].y - posCoords[5].y, 2)
      );

      //need to compare if less than 0.09
      //need to store in quality
      //need to check if exact match
      //need to extract time step.

      if (pos1Value_b < tolerance && pos1Value_c < tolerance && index == 1) {
        quality1_b = pos1Value_b;
        quality1_c = pos1Value_c;
        pos1TimeStep = index;
      } else if (pos1Value_b < tolerance && pos1Value_c < tolerance && index > 1) {
        quality1_b = pos1Value_b;
        quality1_c = pos1Value_c;
        pos1TimeStep = index;
      } else if (pos2Value_b < tolerance && pos2Value_c < tolerance && index == 1) {
        quality2_b = pos2Value_b;
        quality2_c = pos2Value_c;
        pos2TimeStep = index;
      } else if (pos2Value_b < tolerance && pos2Value_c < tolerance && index > 1) {
        quality2_b = pos2Value_b;
        quality2_c = pos2Value_c;
        pos2TimeStep = index;
      } else if (pos3Value_b < tolerance && pos3Value_c < tolerance && index == 1) {
        quality3_b = pos3Value_b;
        quality3_c = pos3Value_c;
        pos3TimeStep = index;
      } else if (pos3Value_b < tolerance && pos3Value_c < tolerance && index > 1) {
        quality3_b = pos3Value_b;
        quality3_c = pos3Value_c;
        pos3TimeStep = index;
      } else {
        //if there is no match, then use the prev index and then with the current and prev, find the midpoint and then evaluate the same

        if (index > 1) {
          let jointB_x = (jointValues[val][1].x + jointValues[index - 2][1].x) / 2;
          let jointB_y = (jointValues[val][1].y + jointValues[index - 2][1].y) / 2;
          let jointC_x = (jointValues[val][2].x + jointValues[index - 2][2].x) / 2;
          let jointC_y = (jointValues[val][2].y + jointValues[index - 2][2].y) / 2;

          let pos1Value_b = Math.sqrt(
            Math.pow(jointB_x - posCoords[0].x, 2) + Math.pow(jointB_y - posCoords[0].y, 2)
          );
          let pos2Value_b = Math.sqrt(
            Math.pow(jointB_x - posCoords[2].x, 2) + Math.pow(jointB_y - posCoords[2].y, 2)
          );
          let pos3Value_b = Math.sqrt(
            Math.pow(jointB_x - posCoords[4].x, 2) + Math.pow(jointB_y - posCoords[4].y, 2)
          );

          let pos1Value_c = Math.sqrt(
            Math.pow(jointC_x - posCoords[1].x, 2) + Math.pow(jointC_y - posCoords[1].y, 2)
          );
          let pos2Value_c = Math.sqrt(
            Math.pow(jointC_x - posCoords[3].x, 2) + Math.pow(jointC_y - posCoords[3].y, 2)
          );
          let pos3Value_c = Math.sqrt(
            Math.pow(jointC_x - posCoords[5].x, 2) + Math.pow(jointC_y - posCoords[5].y, 2)
          );

          if (pos1Value_b < tolerance && pos1Value_c < tolerance) {
            quality1_b = pos1Value_b;
            quality1_c = pos1Value_c;
            pos1TimeStep = index - 0.5;
          } else if (pos2Value_b < tolerance && pos2Value_c < tolerance) {
            quality2_b = pos2Value_b;
            quality2_c = pos2Value_c;
            pos2TimeStep = index - 0.5;
          } else if (pos3Value_b < tolerance && pos3Value_c < tolerance) {
            quality3_b = pos3Value_b;
            quality3_c = pos3Value_c;
            pos3TimeStep = index - 0.5;
          }
        }
      }

      index = index + 1;
    }

    //now compile quality array and then pass it back

    let qualityCompilation: number[];

    qualityCompilation = [
      quality1_b,
      quality1_c,
      pos1TimeStep,
      quality2_b,
      quality2_c,
      pos2TimeStep,
      quality3_b,
      quality3_c,
      pos3TimeStep,
    ];

    return qualityCompilation;
  }

  findIntersectionPoint(pose1_coord1: Coord, pose2_coord1: Coord, pose3_coord1: Coord) {
    //slope of Line 1
    let slope1 = 1 / ((pose2_coord1.y - pose1_coord1.y) / (pose2_coord1.x - pose1_coord1.x));
    //slope of line 2
    let slope2 = 1 / ((pose3_coord1.y - pose2_coord1.y) / (pose3_coord1.x - pose2_coord1.x));

    //midpoints of the above two lines
    let midpoint_line1 = new Coord(
      (pose1_coord1.x + pose2_coord1.x) / 2,
      (pose1_coord1.y + pose2_coord1.y) / 2
    );
    let midpoint_line2 = new Coord(
      (pose3_coord1.x + pose2_coord1.x) / 2,
      (pose3_coord1.y + pose2_coord1.y) / 2
    );

    //intercept
    let c1 = midpoint_line1.y + slope1 * midpoint_line1.x;
    let c2 = midpoint_line2.y + slope2 * midpoint_line2.x;

    //intersection point
    let x1 = (c1 - c2) / (-slope2 + slope1);
    let y1 = -slope1 * x1 + c1;

    return new Coord(x1, y1);
  }

  findIntersectionPoint2(pose1_coord2: Coord, pose2_coord2: Coord, pose3_coord2: Coord) {
    let slope1 = 1 / ((pose2_coord2.y - pose1_coord2.y) / (pose2_coord2.x - pose1_coord2.x));
    //slope of line 2
    let slope2 = 1 / ((pose3_coord2.y - pose2_coord2.y) / (pose3_coord2.x - pose2_coord2.x));

    //midpoints of the above two lines
    let midpoint_line1 = new Coord(
      (pose1_coord2.x + pose2_coord2.x) / 2,
      (pose1_coord2.y + pose2_coord2.y) / 2
    );
    let midpoint_line2 = new Coord(
      (pose3_coord2.x + pose2_coord2.x) / 2,
      (pose3_coord2.y + pose2_coord2.y) / 2
    );

    //intercept
    let c1 = midpoint_line1.y + slope1 * midpoint_line1.x;
    let c2 = midpoint_line2.y + slope2 * midpoint_line2.x;

    //intersection point
    let x1 = (c1 - c2) / (-slope2 + slope1);
    let y1 = -slope1 * x1 + c1;

    return new Coord(x1, y1);
  }
}
