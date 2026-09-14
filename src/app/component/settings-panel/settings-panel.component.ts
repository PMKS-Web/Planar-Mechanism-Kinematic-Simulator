import { SETTINGS_COMMANDS } from '../../services/chrome/settings-commands';
import { CHROME_SETTINGS, CHROME_PERMISSION } from '../../services/chrome/chrome-tokens';
import { EditBannerComponent } from '../BLOCKS/banner/edit-banner.component';
import { EditRefusal, SETTINGS_AT_START_ONLY } from '../../model/edit-permission';
import { NotificationService } from '../../services/notification.service';
import { environment } from '../../../environments/environment';
import { Component, ChangeDetectionStrategy, OnDestroy, inject } from '@angular/core';
import { writeStoredFlag } from 'src/app/services/settings.service';
import { LengthUnit, AngleUnit, ForceUnit, GlobalUnit } from 'src/app/model/utils';
import { FormBuilder, Validators, FormsModule, ReactiveFormsModule } from '@angular/forms';
import { NumberUnitParserService } from '../../services/number-unit-parser.service';
import { combineLatest, skip, Subscription } from 'rxjs';
import { PanelSectionComponent } from '../BLOCKS/panel-section/panel-section.component';
import { TitleBlock } from '../BLOCKS/title/title.component';
import { CollapsibleSubsectionComponent } from '../BLOCKS/collapsible-subsection/collapsible-subsection.component';
import { RadioComponent } from '../BLOCKS/radio/radio.component';
import { ToggleComponent } from '../BLOCKS/toggle/toggle.component';
import { InputComponent } from '../BLOCKS/input/input.component';
import { ButtonComponent } from '../BLOCKS/button/button.component';

/** Unit conversion can produce a valid size smaller than the usual two-decimal display. */
function scaleText(scale: number): string {
  return scale > 0 && scale < 0.01 ? Number(scale.toPrecision(3)).toString() : scale.toFixed(2);
}

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
    CollapsibleSubsectionComponent,
    RadioComponent,
    FormsModule,
    ReactiveFormsModule,
    ToggleComponent,
    InputComponent,
    ButtonComponent,
    EditBannerComponent,
  ],
})
export class SettingsPanelComponent implements OnDestroy {
  settingsService = inject(CHROME_SETTINGS);
  private fb = inject(FormBuilder);
  private commands = inject(SETTINGS_COMMANDS);
  private permission = inject(CHROME_PERMISSION);
  private nup = inject(NumberUnitParserService);
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
    this.currentObjectScaleSetting = this.commands.objectScale;

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
      this.commands.objectScaleChanges.pipe(skip(1)).subscribe((val) => {
        this.currentObjectScaleSetting = val;
        this.settingsForm.patchValue(
          { objectScale: scaleText(this.currentObjectScaleSetting) },
          { emitEvent: false }
        );
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
      // Bound the physical size, so changing units does not invalidate the same drawing.
      const unitFactor =
        this.currentLengthUnit === LengthUnit.METER
          ? 0.01
          : this.currentLengthUnit === LengthUnit.INCH
            ? 1 / 2.54
            : 1;
      const minimum = MIN_SCALE * unitFactor,
        maximum = MAX_SCALE * unitFactor;
      const outOfRange = !Number.isFinite(parsed) || parsed < minimum || parsed > maximum;
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
          `Object scale has to be a number from ${scaleText(minimum)} to ${scaleText(maximum)}.`
        );
        return;
      }
      this.currentObjectScaleSetting = parsed;
      this.commands.setObjectScale(parsed);
    });
    this.settingsForm.controls['angleunit'].valueChanges.subscribe((val) =>
      this.commands.setAngleUnit(ParseAngleUnit(val))
    );
    this.settingsForm.controls['forceunit'].valueChanges.subscribe((val) => {
      if (this.showsForceUnit())
        this.commands.setForceUnit(val === '1' ? ForceUnit.KGF : ForceUnit.NEWTON);
    });
    this.settingsForm.controls['globalunit'].valueChanges.subscribe((val) =>
      this.commands.setGlobalUnit(ParseGlobalUnit(val))
    );
    this.settingsForm.controls['lengthunit'].valueChanges.subscribe((val) =>
      this.commands.setLengthUnit(ParseLengthUnit(val))
    );
    this.settingsForm.controls['showMajorGrid'].valueChanges.subscribe((val) =>
      this.commands.setGrid('major', Boolean(val))
    );
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

    this.settingsForm.controls['showMinorGrid'].valueChanges.subscribe((val) =>
      this.commands.setGrid('minor', Boolean(val))
    );
    this.settingsForm.controls['gravity'].valueChanges.subscribe((val) =>
      this.commands.setGravity(val === true)
    );
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
    return this.permission.refusal('properties') === null;
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
  /**
   * Why the settings cannot be changed, as the strip the Edit panel uses.
   *
   * Two answers, not three. Being in an analysis mode is its own condition and
   * keeps its own sentence; playing and standing away from the start are one
   * condition as far as a reader is concerned -- the same press fixes either,
   * and the strip used to rewrite itself under their eyes as the animation ran
   * on and stopped.
   */
  lockedRefusal(): EditRefusal | null {
    const why = this.permission.refusal('properties');
    if (!why) return null;
    return why.actionKind === 'toEdit' ? why : SETTINGS_AT_START_ONLY;
  }

  /**
   * The way out, as a clause on the tooltip of each row it grays.
   *
   * Deliberately not the refusal's own `long`. The strip above says the whole
   * thing; a tooltip has already opened with a sentence about what the control
   * is for, and pasting the model's full refusal after it restates that before
   * getting to the point. What a grayed switch owes a reader is the way out,
   * in the fewest words that name it.
   */
  lockedNote(): string {
    const why = this.lockedRefusal();
    if (!why) return '';
    return why.actionKind === 'toEdit'
      ? ' Switch to Edit mode to change.'
      : ' Reset to the starting pose to change.';
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

  /**
   * The single length-unit switch. Both the Global Units radio and the internal
   * length control funnel here so a unit change always rescales the mechanism's
   * stored geometry, mass, inertia, and forces — never just relabels them.
   */

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
    this.commands.autoSize();
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
