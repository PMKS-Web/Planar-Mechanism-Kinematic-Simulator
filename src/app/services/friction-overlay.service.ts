import { Injectable, inject, signal } from '@angular/core';
import { RealJoint } from '../model/joint';
import { hasFriction } from '../model/joint-friction';
import { frictionGlyph } from '../model/friction-visualization';
import { frictionContactName } from '../model/friction-contacts';
import { ForceAnalysisFrame } from '../model/mechanism/force-solver';
import { MODEL_SCALE } from '../model/render-scale';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { FrictionService } from './friction.service';
import { NumberUnitParserService } from './number-unit-parser.service';

/** Current contact loads only. This view preference never changes the saved mechanism. */
@Injectable({ providedIn: 'root' })
export class FrictionOverlayService {
  readonly visible = signal(true);
  private mechanism = inject(MechanismService);
  private settings = inject(SettingsService);
  private friction = inject(FrictionService);
  private units = inject(NumberUnitParserService);
  private scales = new WeakMap<
    ForceAnalysisFrame[],
    { span: number; peaks: Map<string, number> }
  >();

  overlays() {
    if (!this.visible()) return [];
    return this.mechanism.mechanisms.flatMap((solved, machine) => {
      if (
        !solved.isMechanismValid() ||
        !solved.joints[0]?.some(
          (joint) => joint instanceof RealJoint && hasFriction(joint.friction)
        )
      )
        return [];
      const mode = this.settings.forceAnalysisMode.value;
      const frames = solved.getForceAnalysis(mode).frames;
      const index = this.mechanism.currentSampleOf(machine);
      const frame = frames[index];
      if (frame?.status !== 'ok' || !frame.friction?.size) return [];
      let scale = this.scales.get(frames);
      if (!scale) {
        const points = solved.joints.flat();
        let minX = Infinity,
          minY = Infinity,
          maxX = -Infinity,
          maxY = -Infinity;
        for (const point of points) {
          minX = Math.min(minX, point.x);
          minY = Math.min(minY, point.y);
          maxX = Math.max(maxX, point.x);
          maxY = Math.max(maxY, point.y);
        }
        const peaks = new Map<string, number>();
        for (const sample of frames) {
          if (sample.status !== 'ok') continue;
          for (const result of sample.friction?.values() ?? []) {
            peaks.set(
              result.jointId,
              Math.max(peaks.get(result.jointId) ?? 0, Math.abs(result.effort))
            );
          }
        }
        scale = { span: Math.hypot(maxX - minX, maxY - minY) || MODEL_SCALE, peaks };
        this.scales.set(frames, scale);
      }
      return [...frame.friction.values()].flatMap((result) => {
        const joint = solved.joints[index].find((one) => one.id === result.jointId);
        const editable = this.mechanism.joints.find((one) => one.id === result.jointId);
        if (
          !(joint instanceof RealJoint) ||
          !(editable instanceof RealJoint) ||
          !hasFriction(editable.friction)
        )
          return [];
        const glyph = frictionGlyph(joint, result, scale.span, scale.peaks.get(joint.id) ?? 0);
        const reading = this.friction.reading(editable);
        if (!glyph || !reading.values?.every(Number.isFinite)) return [];
        const unit =
          result.kind === 'force'
            ? this.units.unitLabel(this.settings.forceUnit.value)
            : this.units.torqueLabel(this.settings.forceUnit.value, this.settings.lengthUnit.value);
        const value = Number(reading.values[1].toPrecision(5));
        const label = `Friction at ${frictionContactName(joint)}: ${value} ${unit}`;
        return [
          {
            ...glyph,
            key: `${machine}:${joint.id}`,
            jointId: joint.id,
            kind: result.kind,
            bodyId: result.positiveBodyId,
            effort: result.effort,
            labelText: label,
            detail: `${label}. Calculated contact ${result.kind}. ${reading.sign} Opposes relative ${result.kind === 'force' ? 'sliding' : 'rotation'}.`,
          },
        ];
      });
    });
  }
}
