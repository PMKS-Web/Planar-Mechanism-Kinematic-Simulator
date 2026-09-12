import { AnalysisChannel, AnalysisExportModel } from '../../model/analysis-export';
import { ExportColumn, ExportPart, ExportSeries } from './export-model';
import { siUnitFactors } from '../../model/unit-conversions';

const QUANTITIES: Record<string, [AnalysisChannel['quantity'], string]> = {
  'Linear Joint Pos': ['jointPosition', 'm'],
  'Linear Joint Vel': ['jointVelocity', 'm/s'],
  'Linear Joint Acc': ['jointAcceleration', 'm/s^2'],
  "Linear Link's CoM Pos": ['bodyPosition', 'm'],
  "Linear Link's CoM Vel": ['bodyVelocity', 'm/s'],
  "Linear Link's CoM Acc": ['bodyAcceleration', 'm/s^2'],
  'Angular Link Pos': ['angle', 'rad'],
  'Angular Link Vel': ['omega', 'rad/s'],
  'Angular Link Acc': ['alpha', 'rad/s^2'],
  'Joint Forces': ['reaction', 'N'],
  'Input Torque': ['torque', 'N*m'],
  'Input Effort': ['torque', 'N*m'],
};
export interface MatlabChannelSource {
  series: ExportSeries;
  part: string;
  component: number;
  scale: number;
}

/** The same selected descriptors drive MATLAB plots and optional PMKS reference sampling. */
export function matlabChannels(
  m: AnalysisExportModel,
  parts: ExportPart[],
  columns: ExportColumn[],
  magnitude: boolean,
  lengthUnit: string,
  forceToN: number
): MatlabChannelSource[] {
  const sources: MatlabChannelSource[] = [];
  const units = siUnitFactors(lengthUnit);
  for (const column of columns)
    for (const part of parts.filter((p) => column.appliesTo.includes(p.key)))
      for (const series of column.series) {
        const mapped = QUANTITIES[series.mechProp];
        if (!mapped) throw new Error(`MATLAB does not support ${series.label}.`);
        const [quantity, unit] = mapped,
          id = series.mechPart || part.id;
        const index =
          quantity.startsWith('joint') || quantity === 'reaction'
            ? m.joints.findIndex((j) => j.id === id)
            : m.bodies.findIndex((b) => b.id === id);
        const body =
          quantity === 'reaction' ? m.bodies.findIndex((b) => b.id === series.reactionLinkId) : -1;
        if (quantity !== 'torque' && (index < 0 || (quantity === 'reaction' && body < 0)))
          throw new Error(`MATLAB cannot map ${series.label} on ${id} to a moving body.`);
        const count = series.components === 3 && !magnitude ? 2 : series.components;
        for (let component = 0; component < count; component++) {
          const label = `${series.head || series.label + ' ' + part.label}${count > 1 ? ' ' + ['X', 'Y', 'Magnitude'][component] : ''}`;
          m.channels.push({
            label,
            quantity,
            index,
            body,
            component,
            unit,
            period: quantity === 'angle' ? 2 * Math.PI : 0,
          });
          const scale = unit.startsWith('m')
            ? units.distanceToM
            : unit === 'N'
              ? forceToN
              : unit === 'N*m'
                ? forceToN * units.distanceToM
                : 1;
          sources.push({ series, part: id, component, scale });
        }
      }
  return sources;
}
