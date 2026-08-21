import { Injectable, inject } from '@angular/core';
import { Subject } from 'rxjs';
import { COR, SynthesisPose } from './synthesis-util';
import { Coord } from 'src/app/model/coord';
import { NumberUnitParserService } from '../number-unit-parser.service';
import { SettingsService } from '../settings.service';
import { MODEL_SCALE } from 'src/app/model/render-scale';
import { CandidateSearch, PosePoint } from './synthesis-candidates';

/*
Service responsible for storing end effector poses to be synthesized
into fourbars. Relevant to the Synthesis tab of the app.
*/

@Injectable({
  providedIn: 'root',
})
export class SynthesisBuilderService {
  private nup = inject(NumberUnitParserService);
  private settings = inject(SettingsService);

  public valueChanges: Subject<boolean>;

  // whether the mechanism has been modified since last synthesis
  // if so, when switching back to edit mode, save state
  public modifiedMechanism: boolean = false;

  /**
   * Which screen of Synthesis the reader is on.
   *
   * 'chooser' asks what kind of synthesis this is; 'working' is the one kind
   * that exists. It is a screen rather than a setting because the answer
   * decides what every control below it means, and because the second kind --
   * fitting a linkage to a path -- is coming and has to have somewhere to go.
   */
  public stage: 'chooser' | 'working' = 'chooser';

  /**
   * Whether the next click on the grid drops a position.
   *
   * Placing is opt-in. Synthesis shares the canvas with the drawing, and a
   * mode where every click makes something is a mode where every click a
   * reader meant as "look at this" makes something instead.
   */
  public armed = false;

  /** Which way the position about to be dropped is turned, in degrees. */
  public placeAngleDeg = 8;

  /** Whether the grid is waiting for the ground-pivot region to be drawn. */
  public regionDraw = false;

  // --- what a solution has to satisfy to be listed ------------------------

  /**
   * Whether the coupler must be pinned to the end-effector link's own ends.
   *
   * On, the coupler is exactly the length that was typed. Off, the pins may
   * slide along the link or past it, which moves both ground pivots and gives
   * genuinely different machines through the same three positions -- far more
   * of them, and often better ones.
   */
  public endsOnly = true;

  /** Whether linkages that need reassembling between positions are listed. */
  public allowDefect = false;

  /** Whether both ground pivots must land inside the region below. */
  public constrain = false;

  /** The region, in model units, as a box with its origin at bottom-left. */
  public region = {
    x: -6 * MODEL_SCALE,
    y: -14 * MODEL_SCALE,
    w: 26 * MODEL_SCALE,
    h: 12 * MODEL_SCALE,
  };

  _COR: COR;
  _length: number; // length of the end-effector link
  _selectedPose: number; // currently selected pose (1-3)

  poses: { [key: number]: SynthesisPose }; // a dictionary of poses, but including each pose is optional

  constructor() {
    this.valueChanges = new Subject<boolean>();

    // start with a length of 5 user units, held in model units
    this._COR = COR.CENTER;
    this._length = 5 * MODEL_SCALE;
    this._selectedPose = 1;

    // start with no defined poses
    this.poses = {};
  }

  get COR(): COR {
    return this._COR;
  }

  get length(): number {
    return this._length;
  }

  set length(length: number) {
    this._length = length;
    for (let pose of this.getAllPoses()) {
      pose.recompute();
    }
  }

  get selectedPose(): number {
    return this._selectedPose;
  }

  set selectedPose(selectedPose: number) {
    this._selectedPose = selectedPose;
  }

  isPoseDefined(id: number): boolean {
    return this.poses[id] !== undefined;
  }

  // create a new pose. put it in some preset default position
  createPose(id: number): void {
    let defaultPosition = new Coord(0, 0);
    let defaultThetaRadians = 0;

    // create pose with a callback to always get current length
    this.poses[id] = new SynthesisPose(
      id,
      defaultPosition,
      defaultThetaRadians,
      () => this.COR,
      () => this.length
    );
    this.valueChanges.next(true);
  }

  getPose(id: number): SynthesisPose {
    if (!this.isPoseDefined(id)) {
      throw new Error(`Pose ${id} is not defined`);
    }

    return this.poses[id]!;
  }

  // whether all poses are defined to be synthesized
  isFullyDefined(): boolean {
    return this.getAllPoses().length === 3;
  }

  // return all existing poses
  getAllPoses(): SynthesisPose[] {
    let poses: SynthesisPose[] = [];
    for (let i = 1; i <= 3; i++) {
      if (this.isPoseDefined(i)) {
        poses.push(this.getPose(i));
      }
    }
    return poses;
  }

  // get the first pose that needs to be created
  getFirstUndefinedPose(): number | undefined {
    for (let i = 1; i <= 3; i++) {
      if (!this.isPoseDefined(i)) {
        return i;
      }
    }
    return undefined;
  }

  deleteAllPoses(): void {
    this.poses = {};
    this.valueChanges.next(true);
  }

  // given form, update poses
  // if form is invalid, return false to revert form
  updatePosesFromForm(form: { [key: string]: string | null | undefined }): boolean {
    if (form['cor'] === '0') this._COR = COR.BACK;
    else if (form['cor'] === '1') this._COR = COR.CENTER;
    else this._COR = COR.FRONT;

    // if length is a number and positive, update length
    const [success, maybeLength] = this.nup.parseModelLengthString(
      form['length']!,
      this.settings.lengthUnit.getValue()
    );
    if (!success) {
      console.log('invalid length');
      return false;
    }
    this.length = maybeLength;

    for (let i = 1; i <= 3; i++) {
      if (!this.isPoseDefined(i)) continue;

      // if x and y are numbers, update position
      const [successX, maybeX] = this.nup.parseModelLengthString(
        form[`p${i}x`]!,
        this.settings.lengthUnit.getValue()
      );
      const [successY, maybeY] = this.nup.parseModelLengthString(
        form[`p${i}y`]!,
        this.settings.lengthUnit.getValue()
      );
      if (!successX || !successY) {
        console.log('invalid coord');
        return false;
      }
      this.poses[i].position = new Coord(maybeX, maybeY);

      // if theta is a number, update theta
      const [successTheta, maybeTheta] = this.nup.parseAngleString(
        form[`p${i}theta`]!,
        this.settings.angleUnit.getValue()
      );
      if (!successTheta) {
        console.log('invalid theta');
        return false;
      }
      this.poses[i].thetaDegrees = maybeTheta;
    }

    // if we get here, form is valid
    return true;
  }

  /** The three positions as pin-carrying bars, for the candidate search. */
  posePoints(): PosePoint[] {
    return this.getAllPoses().map((pose) => ({ back: pose.posBack, front: pose.posFront }));
  }

  /** Everything the enumeration needs, and nothing it does not. */
  search(): CandidateSearch {
    return {
      poses: this.posePoints(),
      length: this.length,
      endsOnly: this.endsOnly,
      region: this.constrain ? { ...this.region } : undefined,
    };
  }

  /**
   * What the candidate list was computed for.
   *
   * `allowDefect` is deliberately absent: it filters a list rather than
   * changing what is in it, so switching it does not have to pay for a
   * re-enumeration.
   */
  searchKey(): string {
    const poses = this.getAllPoses().map((p) => [
      Math.round(p.position.x),
      Math.round(p.position.y),
      Math.round(p.thetaDegrees * 100),
    ]);
    return JSON.stringify([
      poses,
      Math.round(this.length),
      this._COR,
      this.endsOnly,
      this.constrain ? this.region : null,
    ]);
  }

  /**
   * Drop a position where the reader clicked, turned the way the ghost was.
   *
   * Positions fill 1, 2, 3 in the order they are placed, and placing stays
   * armed until the third: three clicks is the whole gesture, and disarming
   * between them would put a button press between every one.
   */
  placePose(at: Coord): void {
    const next = this.getFirstUndefinedPose();
    if (next === undefined) return;
    this.poses[next] = new SynthesisPose(
      next,
      at,
      (this.placeAngleDeg * Math.PI) / 180,
      () => this.COR,
      () => this.length
    );
    const more = this.getFirstUndefinedPose() !== undefined;
    this.armed = more;
    this.selectedPose = more ? next + 1 : next;
    this.placeAngleDeg -= 22;
    this.valueChanges.next(true);
  }

  /** Arm or disarm placing, and select the row that is about to be filled. */
  setArmed(armed: boolean): void {
    const next = this.getFirstUndefinedPose();
    if (armed && next === undefined) return;
    this.armed = armed;
    // Only arming cancels a region being drawn: the two gestures both own the
    // canvas, so one has to give way -- but disarming is also how *starting* to
    // draw a region reports itself, and clearing it here unconditionally meant
    // the Redraw button switched the mode off in the same breath it asked for
    // it.
    if (armed) this.regionDraw = false;
    if (armed) {
      this.selectedPose = next!;
      const placed = this.getAllPoses();
      if (placed.length) this.placeAngleDeg = placed[placed.length - 1].thetaDegrees - 22;
    }
    this.valueChanges.next(false);
  }

  /**
   * Copy the last position and offset it slightly.
   *
   * A quick start for three similar positions, which is what most designs
   * actually are -- and it saves a reader from discovering that three
   * positions in a straight line have no solutions at all.
   */
  duplicateLastPose(): void {
    const placed = this.getAllPoses();
    const next = this.getFirstUndefinedPose();
    if (!placed.length || next === undefined) return;
    const last = placed[placed.length - 1];
    this.poses[next] = new SynthesisPose(
      next,
      new Coord(last.position.x + 6 * MODEL_SCALE, last.position.y + 5 * MODEL_SCALE),
      ((last.thetaDegrees - 22) * Math.PI) / 180,
      () => this.COR,
      () => this.length
    );
    this.armed = false;
    this.selectedPose = next;
    this.valueChanges.next(true);
  }

  /**
   * Remove one position, and close the gap it leaves.
   *
   * The panel shows three numbered rows and fills them in order, so a hole in
   * the middle would leave "Position 2" blank under a filled "Position 3" --
   * a state the placing gesture cannot produce and has no way to repair.
   */
  removePose(id: number): void {
    const kept = this.getAllPoses().filter((pose) => pose.id !== id);
    this.poses = {};
    kept.forEach((pose, index) => {
      this.poses[index + 1] = new SynthesisPose(
        index + 1,
        pose.position,
        pose.thetaRadians,
        () => this.COR,
        () => this.length
      );
    });
    this.armed = false;
    this.selectedPose = Math.min(this.selectedPose, Math.max(1, kept.length));
    this.valueChanges.next(true);
  }

  /** Nothing designed, nothing asked for -- what a fresh visit looks like. */
  clearDesign(): void {
    this.poses = {};
    this._COR = COR.CENTER;
    this._length = 5 * MODEL_SCALE;
    this._selectedPose = 1;
    this.stage = 'chooser';
    this.armed = false;
    this.regionDraw = false;
    this.endsOnly = true;
    this.allowDefect = false;
    this.constrain = false;
    this.valueChanges.next(true);
  }

  /**
   * Replace the whole design with one that came out of a URL.
   *
   * One notification at the end rather than one per field: a decode is a
   * single event -- a link opened, or a step through history -- and reporting
   * it as eleven would have the panel re-read a half-applied design ten times.
   */
  applyDecoded(decoded: {
    length: number;
    reference: COR;
    endsOnly: boolean;
    allowDefect: boolean;
    constrain: boolean;
    stage: 'chooser' | 'working';
    poses: { at: Coord; thetaDegrees: number }[];
    region?: { x: number; y: number; w: number; h: number };
  }): void {
    this._COR = decoded.reference;
    this._length = decoded.length > 0 ? decoded.length : 5 * MODEL_SCALE;
    this.endsOnly = decoded.endsOnly;
    this.allowDefect = decoded.allowDefect;
    this.constrain = decoded.constrain;
    this.stage = decoded.stage;
    this.armed = false;
    this.regionDraw = false;
    if (decoded.region) this.region = decoded.region;

    this.poses = {};
    decoded.poses.slice(0, 3).forEach((pose, index) => {
      this.poses[index + 1] = new SynthesisPose(
        index + 1,
        pose.at,
        (pose.thetaDegrees * Math.PI) / 180,
        () => this.COR,
        () => this.length
      );
    });
    this._selectedPose = Math.min(this._selectedPose, Math.max(1, decoded.poses.length));
    this.valueChanges.next(true);
  }
}
