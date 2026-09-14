import { Injectable, effect, inject } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NativeEditorService } from '../../native-editor.service';
import { SettingsService } from '../../settings.service';
import { AngleUnit, ForceUnit, GlobalUnit, LengthUnit } from '../../../model/unit-enums';
import type { ChromeSettings } from '../chrome-contracts';

/** Physical settings read the document; display toggles do not invalidate a gesture or its redo. */
@Injectable({ providedIn: 'root' })
export class NativeSettingsService implements ChromeSettings {
  private readonly editor = inject(NativeEditorService);
  private readonly preferences = inject(SettingsService);
  readonly lengthUnit = new BehaviorSubject(LengthUnit.CM);
  readonly angleUnit = new BehaviorSubject(AngleUnit.DEGREE);
  readonly forceUnit = new BehaviorSubject(ForceUnit.NEWTON);
  readonly globalUnit = new BehaviorSubject(GlobalUnit.METRIC);
  readonly isGravity = new BehaviorSubject(true);
  readonly isShowMajorGrid = new BehaviorSubject(true);
  readonly isShowMinorGrid = new BehaviorSubject(true);
  readonly isShowID = new BehaviorSubject(true);
  readonly animating = new BehaviorSubject(false);
  readonly isShowCOM = this.preferences.isShowCOM;
  readonly isShowTraces = this.preferences.isShowTraces;
  readonly isSnapToGrid = this.preferences.isSnapToGrid;
  readonly isSnapToAlignment = this.preferences.isSnapToAlignment;
  tempGridDisable = false;
  constructor() {
    const next = <T>(subject: BehaviorSubject<T>, value: T) => {
      if (subject.value !== value) subject.next(value);
    };
    const publish = (loaded = false) => {
      const d = this.editor.document(),
        s = d.settings;
      next(
        this.lengthUnit,
        d.units.length === 'cm'
          ? LengthUnit.CM
          : d.units.length === 'in'
            ? LengthUnit.INCH
            : LengthUnit.METER
      );
      next(
        this.globalUnit,
        d.units.length === 'cm'
          ? GlobalUnit.METRIC
          : d.units.length === 'in'
            ? GlobalUnit.ENGLISH
            : GlobalUnit.SI
      );
      next(this.angleUnit, s.angleUnit === 'deg' ? AngleUnit.DEGREE : AngleUnit.RADIAN);
      next(
        this.forceUnit,
        s.forceUnit === 'N'
          ? ForceUnit.NEWTON
          : s.forceUnit === 'kgf'
            ? ForceUnit.KGF
            : ForceUnit.LBF
      );
      next(this.isGravity, s.gravity);
      next(this.isShowMajorGrid, s.showMajorGrid);
      next(this.isShowMinorGrid, s.showMinorGrid);
      if (loaded) next(this.isShowID, s.showIds);
    };
    publish(true);
    this.editor.store.changes
      .pipe(takeUntilDestroyed())
      .subscribe((change) => publish(change.kind === 'load'));
    effect(() => this.animating.next(this.editor.playing()));
  }
}
