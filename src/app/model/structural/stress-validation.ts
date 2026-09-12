import { sectionProperties, CrossSection, SectionProperties } from './cross-section';
import type { MemberInternalLoadResult, MemberLoadsSuccess } from './member-results';
import { polynomialValue } from './member-diagram';
import { stressFailure, StressFailure } from './stress-results';

export interface StressContext {
  readonly status: 'ok';
  readonly loads: MemberLoadsSuccess;
  readonly section: CrossSection;
  readonly properties: SectionProperties;
  readonly shearFactor: number;
}

/** Checks the downstream contract, not kinematics, reactions, or S3 mass consistency again. */
export function prepareStress(
  loads: MemberInternalLoadResult,
  section?: CrossSection
): StressContext | StressFailure {
  if (!loads || typeof loads !== 'object')
    return stressFailure('invalid-member-load-result', 'Supply an S3 member-load result.');
  if (loads.status !== 'ok')
    return stressFailure('upstream-analysis-failed', 'S3 refused recovery: ' + loads.status);
  if (!section) return stressFailure('missing-cross-section', 'Supply an explicit cross section.');
  if (!['rectangle', 'circle'].includes(section.kind))
    return stressFailure(
      'unsupported-cross-section',
      'Stress supports rectangles and solid circles only.'
    );
  let properties: SectionProperties;
  try {
    properties = sectionProperties(section);
  } catch (error) {
    return stressFailure('invalid-section-properties', (error as Error).message);
  }
  if (!validDiagram(loads))
    return stressFailure(
      'invalid-member-load-result',
      'Supply a finite, complete, consistent S3 polynomial/event result.'
    );
  return {
    status: 'ok',
    loads,
    section: { ...section },
    properties,
    shearFactor: section.kind === 'rectangle' ? 1.5 : 4 / 3,
  };
}

function validDiagram(result: MemberLoadsSuccess): boolean {
  const { member, events, segments } = result;
  if (
    !member ||
    !member.id ||
    !member.bodyId ||
    member.kind !== 'straight-prismatic' ||
    !Number.isFinite(member.lengthM) ||
    member.lengthM <= 0 ||
    !['static', 'dynamic'].includes(result.mode) ||
    !['none', 'lumped-at-com', 'uniform-line'].includes(result.gravityModel) ||
    !['none', 'uniform-line'].includes(result.massModel) ||
    (result.mode === 'dynamic' && result.massModel !== 'uniform-line') ||
    (result.gravityModel === 'uniform-line' && result.massModel !== 'uniform-line') ||
    (result.motionSource !== undefined &&
      !['pmks-analytical', 'prescribed', 'unspecified'].includes(result.motionSource)) ||
    !Number.isFinite(result.diagnostics?.normalizedClosureResidual) ||
    result.diagnostics.normalizedClosureResidual < 0 ||
    result.diagnostics.normalizedClosureResidual > 1e-8 ||
    !Array.isArray(events) ||
    !Array.isArray(segments) ||
    events.length < 2 ||
    segments.length !== events.length - 1 ||
    events[0]?.xM !== 0 ||
    events[events.length - 1]?.xM !== member.lengthM
  )
    return false;
  const keys = ['axialN', 'shearN', 'momentNm'] as const;
  for (const event of events) {
    if (
      !event ||
      !Number.isFinite(event.xM) ||
      !event.leftLimit ||
      !event.rightLimit ||
      keys.some(
        (key) => !Number.isFinite(event.leftLimit[key]) || !Number.isFinite(event.rightLimit[key])
      )
    )
      return false;
  }
  return segments.every((segment, i) => {
    if (
      !segment ||
      segment.startM !== events[i].xM ||
      segment.endM !== events[i + 1].xM ||
      segment.endM <= segment.startM
    )
      return false;
    return keys.every((key) => {
      const p = segment[key];
      if (
        !Array.isArray(p) ||
        p.length < 1 ||
        p.length > (key === 'momentNm' ? 4 : 3) ||
        !p.every(Number.isFinite)
      )
        return false;
      const end = polynomialValue(p, segment.endM - segment.startM);
      const close = (a: number, b: number) =>
        Number.isFinite(a) && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
      return close(p[0], events[i].rightLimit[key]) && close(end, events[i + 1].leftLimit[key]);
    });
  });
}
