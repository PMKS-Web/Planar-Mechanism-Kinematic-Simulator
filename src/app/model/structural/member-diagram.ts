import {
  ComponentExtrema,
  InternalLoads,
  InternalLoadSegment,
  MemberEvent,
  MemberLoadsSuccess,
  MemberFailure,
  memberFailure,
  StationReference,
} from './member-results';

/** Equivalent force/couple transferred to the axis at one station. */
export interface MemberPointAction {
  readonly xM: number;
  readonly axialN: number;
  readonly transverseN: number;
  readonly coupleNm: number;
  readonly source: string;
}
export interface MemberLineLoad {
  /** Effective applied-minus-inertial line load q(s)=constant+s*slope, N/m. */
  readonly axial: readonly [number, number];
  readonly transverse: readonly [number, number];
}
export function polynomialValue(coefficients: readonly number[], x: number): number {
  return coefficients.reduceRight((value, coefficient) => value * x + coefficient, 0);
}
function segmentValue(segment: InternalLoadSegment, xM: number): InternalLoads {
  const u = xM - segment.startM;
  return {
    axialN: polynomialValue(segment.axialN, u),
    shearN: polynomialValue(segment.shearN, u),
    momentNm: polynomialValue(segment.momentNm, u),
  };
}

/** Roots of a degree-at-most-two derivative, scaled to avoid discriminant overflow. */
function stationaryPoints(coefficients: readonly number[]): number[] {
  let c = coefficients[1] ?? 0,
    b = coefficients[2] ?? 0,
    a = coefficients[3] ?? 0;
  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
  if (scale === 0) return [];
  a = (a / scale) * 3;
  b = (b / scale) * 2;
  c /= scale;
  if (a === 0) return b === 0 ? [] : [-c / b];
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return [];
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(discriminant));
  return q === 0 ? [-b / (2 * a)] : [q / a, c / q];
}
function componentExtrema(
  events: readonly MemberEvent[],
  segments: readonly InternalLoadSegment[],
  key: keyof InternalLoads
): ComponentExtrema {
  const candidates: { value: number; at: StationReference }[] = events.flatMap((event) => [
    { value: event.leftLimit[key], at: { xM: event.xM, side: 'left' as const } },
    { value: event.rightLimit[key], at: { xM: event.xM, side: 'right' as const } },
  ]);
  for (const segment of segments) {
    for (const u of stationaryPoints(segment[key])) {
      if (u > 0 && u < segment.endM - segment.startM)
        candidates.push({
          value: polynomialValue(segment[key], u),
          at: { xM: segment.startM + u, side: 'right' },
        });
    }
  }
  const extremum = (kind: 'minimum' | 'maximum' | 'absoluteMaximum') => {
    const valueOf = (value: number) => (kind === 'absoluteMaximum' ? Math.abs(value) : value);
    const values = candidates.map((candidate) => valueOf(candidate.value));
    const value = kind === 'minimum' ? Math.min(...values) : Math.max(...values);
    const matches = (candidate: number) =>
      Math.abs(valueOf(candidate) - value) <= 1e-10 * Math.max(1, Math.abs(value));
    return {
      value,
      at: candidates
        .filter((candidate) => matches(candidate.value))
        .map((candidate) => candidate.at),
      intervals: segments
        .filter(
          (segment) => segment[key].slice(1).every((c) => c === 0) && matches(segment[key][0])
        )
        .map(({ startM, endM }) => ({ startM, endM })),
    };
  };
  return {
    minimum: extremum('minimum'),
    maximum: extremum('maximum'),
    absoluteMaximum: extremum('absoluteMaximum'),
  };
}

export function buildMemberDiagram(
  lengthM: number,
  points: readonly MemberPointAction[],
  line: MemberLineLoad
) {
  const positions = [...new Set([0, lengthM, ...points.map((point) => point.xM)])].sort(
    (a, b) => a - b
  );
  const events: MemberEvent[] = [],
    segments: InternalLoadSegment[] = [];
  let left: InternalLoads = { axialN: 0, shearN: 0, momentNm: 0 };
  for (let i = 0; i < positions.length; i++) {
    const xM = positions[i];
    const actions = points.filter((point) => point.xM === xM);
    const right = actions.reduce(
      (loads, point) => ({
        axialN: loads.axialN - point.axialN,
        shearN: loads.shearN + point.transverseN,
        momentNm: loads.momentNm - point.coupleNm,
      }),
      { ...left }
    );
    events.push({
      xM,
      sources: actions.map((point) => point.source),
      leftLimit: left,
      rightLimit: right,
    });
    if (i + 1 === positions.length) break;
    const qx = line.axial[0] + line.axial[1] * xM;
    const qy = line.transverse[0] + line.transverse[1] * xM;
    const segment: InternalLoadSegment = {
      startM: xM,
      endM: positions[i + 1],
      axialN: [right.axialN, -qx, -line.axial[1] / 2],
      shearN: [right.shearN, qy, line.transverse[1] / 2],
      momentNm: [right.momentNm, right.shearN, qy / 2, line.transverse[1] / 6],
    };
    segments.push(segment);
    left = segmentValue(segment, segment.endM);
  }
  const closure = events[events.length - 1].rightLimit;
  const scale = Math.max(
    1,
    points.reduce(
      (sum, point) =>
        sum +
        Math.abs(point.axialN) +
        Math.abs(point.transverseN) +
        Math.abs(point.coupleNm) / lengthM,
      0
    ),
    lengthM * (Math.abs(line.axial[0]) + Math.abs(line.transverse[0])) +
      lengthM ** 2 * (Math.abs(line.axial[1]) + Math.abs(line.transverse[1]))
  );
  const normalizedClosureResidual =
    Math.max(
      Math.abs(closure.axialN),
      Math.abs(closure.shearN),
      Math.abs(closure.momentNm) / lengthM
    ) / (Number.isFinite(scale) ? scale : NaN);
  const extrema = {
    axialN: componentExtrema(events, segments, 'axialN'),
    shearN: componentExtrema(events, segments, 'shearN'),
    momentNm: componentExtrema(events, segments, 'momentNm'),
  };
  return { events, segments, extrema, diagnostics: { normalizedClosureResidual } };
}

/** At an event, side is mandatory: left excludes it, right includes it, also at 0 and L. */
export function evaluateMemberLoads(
  result: MemberLoadsSuccess,
  station: StationReference
): { status: 'ok'; loads: InternalLoads } | MemberFailure {
  if (!station)
    return memberFailure('invalid-station', 'Supply a station and a left or right limit.');
  const { xM, side } = station;
  if (
    !Number.isFinite(xM) ||
    xM < 0 ||
    xM > result.member.lengthM ||
    !['left', 'right'].includes(side)
  )
    return memberFailure(
      'invalid-station',
      'Choose a finite station within the member and a left or right limit.'
    );
  const event = result.events.find((event) => event.xM === xM);
  if (event)
    return { status: 'ok', loads: { ...(side === 'left' ? event.leftLimit : event.rightLimit) } };
  const segment = result.segments.find((segment) => xM > segment.startM && xM < segment.endM)!;
  const loads = segmentValue(segment, xM);
  if (!Object.values(loads).every(Number.isFinite))
    return memberFailure('numerical-failure', 'The section evaluation overflowed.');
  return { status: 'ok', loads };
}
