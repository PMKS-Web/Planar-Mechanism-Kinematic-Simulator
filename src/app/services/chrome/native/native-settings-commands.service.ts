import { convertBodyUnits } from '../../../model/body-system/body-unit-edit';
import { Injectable, inject } from '@angular/core';
import { map, startWith } from 'rxjs';
import { NativeEditorService } from '../../native-editor.service';
import { SvgGridService } from '../../svg-grid.service';
import { AngleUnit, ForceUnit, GlobalUnit, LengthUnit } from '../../../model/unit-enums';
import type { SettingsCommands } from '../settings-commands';
import type { BodyProjectSettings } from '../../../model/body-system/body-project';
import { BodyUnits } from '../../../model/body-system/body-units';

@Injectable({ providedIn: 'root' })
export class NativeSettingsCommandsService implements SettingsCommands {
  private readonly editor = inject(NativeEditorService);
  private readonly grid = inject(SvgGridService);
  readonly objectScaleChanges = this.editor.store.changes.pipe(
    startWith(undefined),
    map(() => this.objectScale)
  );
  get objectScale() {
    return this.editor.document().settings.objectScale;
  }
  private change(change: Partial<BodyProjectSettings>) {
    this.editor.apply({
      kind: 'project',
      settings: { ...this.editor.document().settings, ...change },
    });
  }
  setObjectScale(objectScale: number) {
    this.change({ objectScale });
  }
  autoSize() {
    this.grid.updateObjectScale(true);
  }
  setAngleUnit(unit: AngleUnit) {
    this.change({ angleUnit: unit === AngleUnit.DEGREE ? 'deg' : 'rad' });
  }
  setForceUnit(unit: ForceUnit) {
    this.change({
      forceUnit: unit === ForceUnit.NEWTON ? 'N' : unit === ForceUnit.KGF ? 'kgf' : 'lbf',
    });
  }
  setGlobalUnit(unit: GlobalUnit) {
    this.setLengthUnit(
      unit === GlobalUnit.ENGLISH
        ? LengthUnit.INCH
        : unit === GlobalUnit.SI
          ? LengthUnit.METER
          : LengthUnit.CM
    );
  }
  setLengthUnit(unit: LengthUnit) {
    const units: BodyUnits =
      unit === LengthUnit.INCH
        ? { length: 'in', mass: 'lb', inertia: 'lb*in2', force: 'lbf' }
        : unit === LengthUnit.METER
          ? { length: 'm', mass: 'kg', inertia: 'kg*m2', force: 'N' }
          : { length: 'cm', mass: 'g', inertia: 'kg*cm2', force: 'N' };
    const from = this.editor.document().units;
    if (from.length === units.length) return;
    const converted = convertBodyUnits(this.editor.document(), units);
    if (!converted.ok) {
      this.editor.report(converted.message);
      return;
    }
    const previous = this.editor.document().settings.forceUnit;
    const forceUnit = units.length === 'in' ? 'lbf' : previous === 'kgf' ? 'kgf' : 'N';
    if (
      !this.editor.apply(
        { kind: 'convert-units', units },
        { kind: 'project', settings: { ...converted.document.settings, forceUnit } }
      )
    )
      return;
  }
  setGrid(which: 'major' | 'minor', on: boolean) {
    this.change(which === 'major' ? { showMajorGrid: on } : { showMinorGrid: on });
  }
  setGravity(gravity: boolean) {
    this.change({ gravity });
  }
}
