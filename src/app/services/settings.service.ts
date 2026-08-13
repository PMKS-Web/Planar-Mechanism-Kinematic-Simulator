import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import {
  LengthUnit,
  AngleUnit,
  GlobalUnit,
  ForceUnit,
  AngularVelocityUnit,
} from '../model/unit-enums';
import type { ForceAnalysisMode } from '../model/mechanism/force-solver';
import { MODEL_SCALE } from '../model/render-scale';
import { local_storage_available } from '../model/utils';

/**
 * A preference remembered on this machine.
 *
 * Storage can be missing or refused -- private windows, an embedded frame --
 * and a setting that cannot be remembered is not worth failing over.
 */
function readStoredFlag(key: string, fallback: boolean): boolean {
  if (!local_storage_available()) return fallback;
  const stored = localStorage.getItem(key);
  return stored === null ? fallback : stored === 'true';
}

export function writeStoredFlag(key: string, value: boolean): void {
  if (local_storage_available()) localStorage.setItem(key, String(value));
}

@Injectable({
  providedIn: 'root',
})
export class SettingsService {
  lengthUnit = new BehaviorSubject(LengthUnit.CM);
  angleUnit = new BehaviorSubject(AngleUnit.DEGREE);
  forceUnit = new BehaviorSubject(ForceUnit.NEWTON);
  // inputTorque = new BehaviorSubject(TorqueUnit.CM_N);
  globalUnit = new BehaviorSubject(GlobalUnit.METRIC);
  isInputCW = new BehaviorSubject(true);
  /**
   * Always RPM. The input panel converts for display via inputSpeedUnit.
   *
   * Slow on purpose: the point of the animation is to be watched, and 20 RPM
   * is three seconds a turn, which is faster than a reader can follow a coupler
   * point round.
   */
  inputSpeed = new BehaviorSubject(5);
  /**
   * Display unit for the input joint's speed. Chosen from the Input Settings
   * section rather than typed, so it is a view preference only — inputSpeed
   * stays in RPM and the URL format is unchanged.
   */
  inputSpeedUnit = new BehaviorSubject(AngularVelocityUnit.RPM);
  /**
   * How fast a driven prismatic joint travels, in user length units per second.
   *
   * Its own setting, not a second reading of `inputSpeed`, because the two are
   * different physical quantities: every rebuild turns `inputSpeed` into rad/s
   * by multiplying by π/30, and a translation put through that conversion moves
   * at 0.105 of the speed the panel says. There is no unit *picker* to go with
   * it — length per second has one honest spelling, and which one it is follows
   * `lengthUnit` (cm/s, m/s, in/s).
   */
  linearInputSpeed = new BehaviorSubject(5);
  // One mechanism-wide choice, shown by every force-analysis panel.
  forceAnalysisMode = new BehaviorSubject<ForceAnalysisMode>('static');
  animating = new BehaviorSubject(false);
  isShowMajorGrid = new BehaviorSubject(true);
  isShowMinorGrid = new BehaviorSubject(true);
  /**
   * Whether dragging lands on the grid.
   *
   * The reader's own editing preference, kept on their machine rather than in
   * the URL: a shared link says what the mechanism is, and how someone else's
   * cursor behaves while they edit their copy of it is not part of that.
   *
   * Off until asked for. Dragging has always put a joint exactly where the
   * cursor let go, and a drawing where a joint cannot sit at 3.7 unless it is
   * told otherwise is a different app from the one everyone already has.
   */
  isSnapToGrid = new BehaviorSubject(readStoredFlag('snapToGrid', false));

  /**
   * Whether a drag squares itself up with its neighbours.
   *
   * On, because it always has been: a joint dragged nearly level with another
   * one has been pulled level, with a guide line to say so, for as long as
   * there have been guide lines. The toggle is for turning it off.
   */
  isSnapToAlignment = new BehaviorSubject(readStoredFlag('snapToAlignment', true));

  isShowID = new BehaviorSubject(false);
  isShowCOM = new BehaviorSubject(false);
  /**
   * Whether the traced paths are drawn at all.
   *
   * Which joints trace their path is a property of the drawing, kept per joint
   * and shared in its URL. This is the view's own switch over the lot of them:
   * a drawing with several machines tracing at once is mostly ink, and reading
   * it means putting the ink away for a moment -- not editing every joint that
   * was asked to trace and then having to ask again.
   */
  isShowTraces = new BehaviorSubject(true);
  /**
   * A link whose centre of mass to draw while the reader is asking about it.
   *
   * Hovering the analysis panel's centre-of-mass heading points at the thing on
   * the grid the numbers under it describe, without turning the setting on
   * behind the reader's back.
   */
  previewCoMLinkId: string | null = null;
  tempGridDisable: boolean = false; //This is to hide the grid lines to fit only to the linkage when doing a svg fit

  isGridDebugOn: boolean = false;
  // In user units; the internal world is MODEL_SCALE times larger, and every
  // visual size in the mark system is a multiple of this number.
  //
  // 0.7 rather than 1: joints, blocks and cylinder heads at full size crowd a
  // linkage of ordinary proportions, and the first thing most people did was
  // turn it down. A mechanism arriving from a URL carries its own scale, so
  // this is what a new project starts at and what an older URL without the
  // setting falls back to.
  static _objectScale = new BehaviorSubject(0.7 * MODEL_SCALE);

  static get objectScale(): number {
    return SettingsService._objectScale.value;
  }

  get objectScale(): number {
    return SettingsService._objectScale.value;
  }

  constructor() {}
}
