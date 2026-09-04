import { EditPermissionService } from '../../services/edit-permission.service';
import { NotificationService } from '../../services/notification.service';
import { SelectedTabService, TabID } from '../../selected-tab.service';
import { environment } from '../../../environments/environment';
import { Component, ChangeDetectionStrategy, OnDestroy, inject } from '@angular/core';
import { SettingsService, writeStoredFlag } from 'src/app/services/settings.service';
import { LengthUnit, AngleUnit, ForceUnit, GlobalUnit } from 'src/app/model/utils';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MechanismService } from '../../services/mechanism.service';
import { SvgGridService } from '../../services/svg-grid.service';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { Coord } from '../../model/coord';
import { combineLatest, skip, Subscription } from 'rxjs';
import { MODEL_SCALE } from '../../model/render-scale';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { CollapsibleSubsecitonComponent } from '../BLOCKS/collapsible-subseciton/collapsible-subseciton.component';
import { RadioComponent } from '../BLOCKS/radio/radio.component';
import { ToggleComponent } from '../BLOCKS/toggle/toggle.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';

/**
 * The scale as the field shows it.
 *
 * Two decimals, like every other number in the app. It arrives here as a ratio
 * of two lengths -- the drawing's object scale over the internal one -- so
 * without this the field read "2.2327500" wherever a URL had set a scale of its
 * own, which is every shared mechanism.
 */
function scaleText(scale: number): string {
  return scale.toFixed(2);
}

/**
 * How small and how large a drawn joint may be, as a multiple of the internal
 * scale.
 *
 * The floor is the field's own resolution: it shows two decimals, so anything
 * under a hundredth reads back as "0.00" and stops being a number this panel
 * can restore. The ceiling is generous -- fifty times is already a drawing made
 * entirely of one joint -- and exists so a mistyped row of digits is refused
 * rather than spending a second re-deriving every outline.
 */
const MIN_SCALE = 0.01;
const MAX_SCALE = 50;

@Component({
  selector: 'app-settings-panel',
  templateUrl: './settings-panel.component.html',
  styleUrls: ['./settings-panel.component.scss'],
  changeDetection: ChangeDetectionStrategy.Eager,
  imports: [
    PanelSectionComponent,
    TitleBlock,
    CollapsibleSubsecitonComponent,
    RadioComponent,
    FormsModule,
    ReactiveFormsModule,
    ToggleComponent,
    InputComponent,
    ButtonComponent,
  ],
})
export class SettingsPanelComponent implements OnDestroy {
  settingsService = inject(SettingsService);
  private fb = inject(FormBuilder);
  mechanismSrv = inject(MechanismService);
  private svgGrid = inject(SvgGridService);
  private nup = inject(NumberUnitParserService);
  private tabs = inject(SelectedTabService);
  private permission = inject(EditPermissionService);
  private notify = inject(NotificationService);

  readonly appVersion = environment.appVersion;

  currentLengthUnit!: LengthUnit;
  currentForceUnit!: ForceUnit;
  currentAngleUnit!: AngleUnit;
  // currentTorqueUnit!: TorqueUnit;
  currentGlobalUnit!: GlobalUnit;
  currentObjectScaleSetting!: number;
  private readonly settingsSubscriptions = new Subscription();

  ngOnInit(): void {
    this.currentLengthUnit = this.settingsService.lengthUnit.value;
    this.currentForceUnit = this.settingsService.forceUnit.value;
    this.currentAngleUnit = this.settingsService.angleUnit.value;
    this.currentGlobalUnit = this.settingsService.globalUnit.value;
    // The form shows the scale in the user's frame; internally it is
    // MODEL_SCALE times larger (render-scale.ts), like every other length.
    this.currentObjectScaleSetting = SettingsService.objectScale / MODEL_SCALE;

    this.settingsForm.patchValue({
      objectScale: scaleText(this.currentObjectScaleSetting),
      lengthunit: this.currentLengthUnit.toString(),
      angleunit: (this.currentAngleUnit - 10).toString(),
      forceunit: forceUnitIndex(this.currentForceUnit),
      // torqueunit: (this.currentTorqueUnit - 20).toString(),
      globalunit: (this.currentGlobalUnit - 30).toString(),
      showMajorGrid: this.settingsService.isShowMajorGrid.value,
      showMinorGrid: this.settingsService.isShowMinorGrid.value,
      snapToGrid: this.settingsService.isSnapToGrid.value,
      snapToAlignment: this.settingsService.isSnapToAlignment.value,
      gravity: this.settingsService.isGravity.value,
    });

    this.settingsSubscriptions.add(
      // `skip(1)`, because this is a BehaviorSubject: subscribing to it hands
      // back the value the drawing is *already* drawn at, and acting on that
      // re-derived every link's outline and re-solved every mechanism from
      // scratch. On a forty-five joint linkage that is seven seconds of work to
      // arrive at the picture already on screen -- which is why opening
      // Settings, which changes nothing, was the slowest thing in the app.
      SettingsService._objectScale.pipe(skip(1)).subscribe((val) => {
        this.currentObjectScaleSetting = val / MODEL_SCALE;
        this.settingsForm.patchValue(
          { objectScale: scaleText(this.currentObjectScaleSetting) },
          { emitEvent: false }
        );

        // This used to cast every Link to RealLink and call reComputeDPath,
        // which throws on the first SliderBlock and abandons every link after
        // it -- so any mechanism with a slider logged a TypeError the moment
        // Settings opened. The service does it now, guarded by type.
        this.mechanismSrv.applyObjectScaleChange();
      })
    );

    this.onChanges();
    this.bindSerializedSettings();
  }

  /** Keep an already-open settings panel synchronized after URL restore/undo. */
  private bindSerializedSettings(): void {
    this.settingsSubscriptions.add(
      combineLatest([
        this.settingsService.lengthUnit,
        this.settingsService.angleUnit,
        this.settingsService.forceUnit,
        this.settingsService.globalUnit,
        this.settingsService.isShowMajorGrid,
        this.settingsService.isShowMinorGrid,
        this.settingsService.isGravity,
      ]).subscribe(([length, angle, force, global, showMajorGrid, showMinorGrid, gravity]) => {
        this.currentLengthUnit = length;
        this.currentAngleUnit = angle;
        this.currentForceUnit = force;
        this.currentGlobalUnit = global;
        this.settingsForm.patchValue(
          {
            lengthunit: length.toString(),
            angleunit: (angle - 10).toString(),
            forceunit: forceUnitIndex(force),
            globalunit: (global - 30).toString(),
            showMajorGrid,
            showMinorGrid,
            gravity,
          },
          { emitEvent: false }
        );
      })
    );
  }

  ngOnDestroy(): void {
    this.settingsSubscriptions.unsubscribe();
  }

  onChanges(): void {
    this.settingsForm.controls['objectScale'].valueChanges.subscribe((val) => {
      const parsed = Number(val);
      // The pattern is the gate the user sees; this is the one that protects the
      // canvas. Every dimension in the mark system is a multiple of this number,
      // so a NaN or a zero does not degrade the drawing -- it erases it, behind
      // dozens of invalid-SVG errors.
      //
      // The bounds are a range and not just a sign. A scale of 0.0001 passed
      // the old "greater than zero" test, drew the mechanism as bare hairlines
      // with no joints or ground marks, and -- because the field shows two
      // decimals -- came *back* as the text "0.00". The next refusal then
      // restored "0.00" into the field, which failed the test, which restored
      // it again: a recursion that ended in "Maximum call stack size exceeded"
      // and a settings panel that had stopped working.
      const outOfRange = !Number.isFinite(parsed) || parsed < MIN_SCALE || parsed > MAX_SCALE;
      if (this.settingsForm.controls['objectScale'].invalid || outOfRange) {
        // Restore the last good scale into its own field, not the speed field
        // -- and quietly, because a restore that emits runs this handler over
        // its own answer.
        this.settingsForm.patchValue(
          { objectScale: scaleText(this.currentObjectScaleSetting) },
          { emitEvent: false }
        );
        // Said, not swallowed. This was the one field in the app that refused
        // an entry and gave the reader nothing to read.
        this.notify.refusal(
          'value.object-scale',
          `Object scale has to be a number from ${MIN_SCALE} to ${MAX_SCALE}.`
        );
        return;
      }
      this.currentObjectScaleSetting = parsed;
      SettingsService._objectScale.next(this.currentObjectScaleSetting * MODEL_SCALE);
      this.mechanismSrv.updateMechanism();
    });
    this.settingsForm.controls['angleunit'].valueChanges.subscribe((val) => {
      this.currentAngleUnit = ParseAngleUnit(String(val));
      this.settingsService.angleUnit.next(this.currentAngleUnit);
      this.mechanismSrv.updateMechanism();
    });
    this.settingsForm.controls['forceunit'].valueChanges.subscribe((val) => {
      // A display unit, not a stored one: force magnitudes stay in newtons and
      // the fields and axes convert on the way out. So this rebuilds nothing
      // and redraws everything, exactly as the angle switch above does.
      if (!this.showsForceUnit()) return;
      const chosen = val === '1' ? ForceUnit.KGF : ForceUnit.NEWTON;
      // Opening the panel patches every control, which fires this with the
      // value it already had. Republishing that redraws every open graph for
      // a change nobody made -- the cost this file's `skip(1)` above exists to
      // refuse.
      if (chosen === this.settingsService.forceUnit.value) return;
      this.currentForceUnit = chosen;
      this.settingsService.forceUnit.next(chosen);
      this.mechanismSrv.updateMechanism();
      this.mechanismSrv.onMechUpdateState.next(2);
    });
    this.settingsForm.controls['globalunit'].valueChanges.subscribe((val) => {
      this.currentGlobalUnit = ParseGlobalUnit(val);
      this.settingsService.globalUnit.next(this.currentGlobalUnit);
      this.settleForceUnit();
      // A global-unit change is, for the geometry, a length-unit change. Route
      // it through the one method that rescales the mechanism so this path and
      // the length control can never diverge.
      this.changeLengthUnit(ParseLengthUnit(val));
    });
    this.settingsForm.controls['lengthunit'].valueChanges.subscribe((val) => {
      let length: LengthUnit;
      if (val === '0') length = LengthUnit.INCH;
      else if (val === '1') length = LengthUnit.CM;
      else length = LengthUnit.METER;
      this.changeLengthUnit(length);
    });
    this.settingsForm.controls['showMajorGrid'].valueChanges.subscribe((val) => {
      this.settingsService.isShowMajorGrid.next(Boolean(val));
      this.mechanismSrv.updateMechanism();
    });
    // Remembered on this machine rather than written to the URL: see
    // SettingsService.isSnapToGrid.
    this.settingsForm.controls['snapToGrid'].valueChanges.subscribe((val) => {
      const on = val === true;
      this.settingsService.isSnapToGrid.next(on);
      writeStoredFlag('snapToGrid', on);
    });

    this.settingsForm.controls['snapToAlignment'].valueChanges.subscribe((val) => {
      const on = val === true;
      this.settingsService.isSnapToAlignment.next(on);
      writeStoredFlag('snapToAlignment', on);
    });

    this.settingsForm.controls['showMinorGrid'].valueChanges.subscribe((val) => {
      this.settingsService.isShowMinorGrid.next(Boolean(val));
      this.mechanismSrv.updateMechanism();
    });
    // Gravity changes what the force analysis means, so it is an edit: the
    // mechanisms are rebuilt with the new flag and the change is undoable.
    this.settingsForm.controls['gravity'].valueChanges.subscribe((val) => {
      const on = val === true;
      if (on === this.settingsService.isGravity.value) return;
      this.settingsService.isGravity.next(on);
      this.mechanismSrv.updateMechanism(true);
      // An open force graph is plotting the old gravity; ask for a redraw the
      // same way a unit change does.
      this.mechanismSrv.onMechUpdateState.next(2);
    });
  }

  /**
   * A unit change rescales the drawing's stored geometry, so it is an edit.
   *
   * The analysis modes lock the geometry, and Synthesis is writing its own --
   * changing what a number means underneath either of them is the same class
   * of surprise the lock exists to prevent.
   */
  /**
   * Whether the document itself may be changed right now.
   *
   * Units and gravity are both inputs to the solve rather than views of it, so
   * both are settled in Edit and read-only once an analysis is on screen --
   * changing either would leave the graphs and the vectors describing a
   * mechanism that no longer exists, without redrawing them.
   *
   * Named for the document rather than for the units it was written for: it now
   * gates the gravity switch too, and a predicate called `unitsEditable`
   * guarding gravity is the kind of thing that gets un-guarded by someone
   * tidying up.
   */
  documentEditable(): boolean {
    // The permission model, not `settings.animating`. That flag is pushed by
    // the transport's master controls and says nothing about a *row* being
    // played: with one machine of several visibly running, it read false, and
    // Global Units, Angle Units and Gravity stayed live while every other
    // surface in the app said the drawing was read-only.
    //
    // `properties` rather than `structure`: a unit change rescales every length
    // in the drawing, which is exactly the class of thing whose transform back
    // to t = 0 the plan has not written yet.
    return this.permission.may('properties');
  }

  /**
   * The way back to a switch that is grayed out — and nothing at all when it is
   * not. Told every time, "switch to Edit mode" is read most often by the reader
   * already standing in Edit mode, where it is the one sentence in the tooltip
   * that cannot help them.
   *
   * A clause, not a sentence. The tooltip's own line already says what the
   * control does; what the refusal owes it is the *way out*, and the model's
   * full wording spent two lines restating the refusal before naming one --
   * on a tooltip whose first line the reader has already read.
   */
  lockedNote(): string {
    const refusal = this.permission.refusal('properties');
    if (!refusal) return '';
    // Which way out, asked of the model rather than guessed from the mode, so a
    // machine running or parked in any mode is sent to the control that
    // actually clears it.
    if (refusal.actionKind === 'toEdit') return ' Switch to Edit mode to change.';
    if (refusal.actionKind === 'backToStart') return ' Return to the start pose to change.';
    // Playing. The model offers no word to press here: the transport is the
    // way out, and it is on screen.
    return ' Pause the animation to change.';
  }

  /**
   * Whether there is a force unit to pick.
   *
   * English has one — pounds-force — so the row would be a control with a
   * single option, which is furniture rather than a choice. Metric and SI
   * share newtons and kilograms-force.
   */
  showsForceUnit(): boolean {
    return this.currentGlobalUnit !== GlobalUnit.ENGLISH;
  }

  /**
   * The force unit that goes with the length system just chosen.
   *
   * Kilograms-force survives a move between centimeters and meters — both are
   * metric, and re-picking it after every length change is a chore the switch
   * can spare the reader. English has no kgf, so it lands on lbf whatever was
   * chosen before, and picks up newtons on the way back.
   */
  private settleForceUnit(): void {
    this.currentForceUnit = !this.showsForceUnit()
      ? ForceUnit.LBF
      : this.currentForceUnit === ForceUnit.KGF
        ? ForceUnit.KGF
        : ForceUnit.NEWTON;
    this.settingsService.forceUnit.next(this.currentForceUnit);
    this.settingsForm.patchValue(
      { forceunit: forceUnitIndex(this.currentForceUnit) },
      { emitEvent: false }
    );
  }

  /**
   * The single length-unit switch. Both the Global Units radio and the internal
   * length control funnel here so a unit change always rescales the mechanism's
   * stored geometry, mass, inertia, and forces — never just relabels them.
   */
  private changeLengthUnit(toUnit: LengthUnit): void {
    const fromUnit = this.settingsService.lengthUnit.value;
    this.currentLengthUnit = toUnit;
    this.settingsService.lengthUnit.next(toUnit);
    this.settingsForm.controls['lengthunit'].patchValue(String(toUnit), { emitEvent: false });
    if (fromUnit === toUnit) return;

    this.mechanismSrv.updateLinkageUnits(fromUnit, toUnit);

    // Nothing drawn, nothing to hold still: the compensation below exists to
    // keep a mechanism at its apparent size, and applied to an empty grid it
    // zoomed the view a hundredfold and raised the far-too-large warning over
    // a drawing that did not exist. The view starts over instead.
    if (this.mechanismSrv.joints.length === 0 && this.mechanismSrv.links.length === 0) {
      SettingsService._objectScale.next(
        this.nup.convertLength(SettingsService.objectScale, fromUnit, toUnit)
      );
      this.svgGrid.scaleToFitLinkage();
      this.mechanismSrv.onMechUpdateState.next(2);
      return;
    }

    // Compensate the viewport zoom so the mechanism keeps its apparent size,
    // then scale visual affordances to match.
    const tempOriginInScreen = this.svgGrid.modelToScreen(new Coord(0, 0));
    // Through `ourOwnMove`: holding the drawing still across a change of units
    // is the app compensating, not the reader choosing a zoom, and the canvas
    // tells the two apart by which of them made the move.
    this.svgGrid.ourOwnMove(() =>
      this.svgGrid.panZoomObject.zoomAtPointBy(this.nup.convertLength(1, toUnit, fromUnit), {
        x: tempOriginInScreen.x,
        y: tempOriginInScreen.y,
      })
    );
    SettingsService._objectScale.next(
      this.nup.convertLength(SettingsService.objectScale, fromUnit, toUnit)
    );

    // Update graphs with the new units.
    this.mechanismSrv.onMechUpdateState.next(2);
  }

  /** The unit's suffix, spelled by the one service that knows them all. */
  getUnitStr(unit: LengthUnit): string {
    return this.nup.unitLabel(unit);
  }

  // The dot is escaped, and the scale has to be positive. Unescaped, `.` matched
  // any character, so "1x2" validated, Number() turned it into NaN, and the NaN
  // reached every mark on the canvas -- the mechanism vanished behind dozens of
  // invalid-SVG errors. A zero or negative scale is just as unusable: every
  // dimension in the mark system is a multiple of it.
  numRegex = '^[0-9]*\\.?[0-9]+$';
  settingsForm = this.fb.group(
    {
      objectScale: ['', [Validators.required, Validators.pattern(this.numRegex)]],
      lengthunit: ['', { updateOn: 'change' }],
      angleunit: ['', { updateOn: 'change' }],
      forceunit: ['', { updateOn: 'change' }],
      torqueunit: ['', { updateOn: 'change' }],
      globalunit: ['', { updateOn: 'change' }],
      showMinorGrid: [true, { updateOn: 'change' }],
      showMajorGrid: [true, { updateOn: 'change' }],
      snapToGrid: [false, { updateOn: 'change' }],
      snapToAlignment: [true, { updateOn: 'change' }],
      gravity: [true, { updateOn: 'change' }],
    },
    { updateOn: 'blur' }
  );

  updateObjectScale() {
    // Pressed: this is the button, so it is the one caller that owes the reader
    // an answer when there turns out to be nothing to change.
    this.svgGrid.updateObjectScale(true);
  }
}

/** Which option of the Force Units pill stands for this unit. */
function forceUnitIndex(unit: ForceUnit): string {
  return unit === ForceUnit.KGF ? '1' : '0';
}

function ParseLengthUnit(val: string | null): LengthUnit {
  switch (val) {
    case '0':
      return LengthUnit.INCH;
    case '1':
      return LengthUnit.CM;
    case '2':
      return LengthUnit.METER;
    default:
      return LengthUnit.CM;
  }
}

function ParseAngleUnit(val: string | null): AngleUnit {
  switch (val) {
    case '0':
      return AngleUnit.DEGREE;
    case '1':
      return AngleUnit.RADIAN;
    default:
      return AngleUnit.DEGREE;
  }
}

function ParseGlobalUnit(val: string | null): GlobalUnit {
  switch (val) {
    case '0':
      return GlobalUnit.ENGLISH;
    case '1':
      return GlobalUnit.METRIC;
    case '2':
      return GlobalUnit.SI;
    default:
      return GlobalUnit.METRIC;
  }
}

// function ParseTorqueUnit(val: string | null): TorqueUnit {
//   switch (val) {
//     case '0':
//       return TorqueUnit.INCH_LB;
//     case '1':
//       return TorqueUnit.CM_N;
//     case '2':
//       return TorqueUnit.METER_N;
//     default:
//       return TorqueUnit.CM_N;
//   }
// }
