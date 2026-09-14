import { Injectable, inject } from '@angular/core';
import { map } from 'rxjs';
import { SettingsService } from '../settings.service';
import { MechanismService } from '../mechanism.service';
import { SvgGridService } from '../svg-grid.service';
import { NumberUnitParserService } from '../number-unit-parser.service';
import { Coord } from '../../model/coord';
import { MODEL_SCALE } from '../../model/render-scale';
import { AngleUnit, ForceUnit, GlobalUnit, LengthUnit } from '../../model/unit-enums';
import type { SettingsCommands } from './settings-commands';

@Injectable({ providedIn: 'root' })
export class LegacySettingsCommandsService implements SettingsCommands {
  private settingsService = inject(SettingsService);
  private mechanismSrv = inject(MechanismService);
  private svgGrid = inject(SvgGridService);
  private nup = inject(NumberUnitParserService);
  readonly objectScaleChanges = SettingsService._objectScale.pipe(
    map((value) => value / MODEL_SCALE)
  );
  get objectScale() {
    return SettingsService.objectScale / MODEL_SCALE;
  }
  setObjectScale(value: number) {
    SettingsService._objectScale.next(value * MODEL_SCALE);
    this.mechanismSrv.applyObjectScaleChange();
    this.mechanismSrv.updateMechanism();
  }
  autoSize() {
    this.svgGrid.updateObjectScale(true);
  }
  setAngleUnit(unit: AngleUnit) {
    this.settingsService.angleUnit.next(unit);
    this.mechanismSrv.updateMechanism();
  }
  setForceUnit(unit: ForceUnit) {
    if (unit === this.settingsService.forceUnit.value) return;
    this.settingsService.forceUnit.next(unit);
    this.mechanismSrv.updateMechanism();
    this.mechanismSrv.onMechUpdateState.next(2);
  }
  setGlobalUnit(unit: GlobalUnit) {
    this.settingsService.globalUnit.next(unit);
    const previous = this.settingsService.forceUnit.value;
    this.settingsService.forceUnit.next(
      unit === GlobalUnit.ENGLISH
        ? ForceUnit.LBF
        : previous === ForceUnit.KGF
          ? ForceUnit.KGF
          : ForceUnit.NEWTON
    );
    this.setLengthUnit(
      unit === GlobalUnit.ENGLISH
        ? LengthUnit.INCH
        : unit === GlobalUnit.SI
          ? LengthUnit.METER
          : LengthUnit.CM
    );
  }
  setGrid(which: 'major' | 'minor', on: boolean) {
    (which === 'major'
      ? this.settingsService.isShowMajorGrid
      : this.settingsService.isShowMinorGrid
    ).next(on);
    this.mechanismSrv.updateMechanism();
  }
  setGravity(on: boolean) {
    if (on === this.settingsService.isGravity.value) return;
    this.settingsService.isGravity.next(on);
    this.mechanismSrv.updateMechanism(true);
    this.mechanismSrv.onMechUpdateState.next(2);
  }
  setLengthUnit(toUnit: LengthUnit): void {
    const fromUnit = this.settingsService.lengthUnit.value;
    this.settingsService.lengthUnit.next(toUnit);
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
      this.mechanismSrv.applyObjectScaleChange();
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

    this.mechanismSrv.applyObjectScaleChange();

    // Update graphs with the new units.
    this.mechanismSrv.onMechUpdateState.next(2);
  }
}
