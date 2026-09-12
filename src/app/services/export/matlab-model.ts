import { Joint, PrisJoint, RealJoint } from '../../model/joint';
import { RealLink, SliderBlock } from '../../model/link';
import { Mechanism } from '../../model/mechanism/mechanism';
import { MODEL_SCALE } from '../../model/render-scale';
import { analysisConstraints, analysisLinear } from '../../model/analysis-equations';
import { siUnitFactors } from '../../model/unit-conversions';
import { AnalysisExportModel, AnalysisPoint, AnalysisVector } from '../../model/analysis-export';

/** Extract only the initial definition and prescribed drive; never solved joint histories. */
export function analysisExportModel(
  mechanism: Mechanism,
  forceMode: 'none' | 'static' | 'dynamic' = 'none',
  name = 'Mechanism'
): AnalysisExportModel {
  const refuse = (reason: string): never => {
    throw new Error(reason);
  };
  if (!mechanism?.isMechanismValid())
    refuse('Solve the mechanism before exporting MATLAB analysis.');
  const joints = mechanism.joints[0];
  const links = mechanism.links[0];
  const inputs = joints.filter((j) => j instanceof RealJoint && j.input);
  const input = inputs[0];
  if (
    inputs.length !== 1 ||
    !(input instanceof RealJoint) ||
    input instanceof PrisJoint ||
    !input.ground
  )
    refuse(
      'MATLAB analysis currently needs one grounded rotary driver. Linear and floating drivers are not supported.'
    );
  if (
    joints.some(
      (j) => j instanceof PrisJoint && (!j.ground || j.isFloating || j.isWelded || j.isSealed)
    )
  )
    refuse(
      'MATLAB analysis supports fixed guides with free-turning slider blocks. Floating slots, welded slides and cylinders are not supported.'
    );
  const units = siUnitFactors(mechanism.unit);
  const length = units.distanceToM / MODEL_SCALE;
  if (mechanism.framesRunBackwards) {
    const last = mechanism.joints.at(-1)!;
    if (
      mechanism.inputAngularVelocities.some(
        (speed) => speed !== mechanism.inputAngularVelocities[0]
      ) ||
      joints.some(
        (joint, i) => Math.hypot(joint.x - last[i].x, joint.y - last[i].y) * length > 1e-6
      )
    )
      refuse(
        'Reversed playback export requires a closed, constant-speed cycle. Rebuild this reversing or open motion before exporting.'
      );
  }
  const xy = (p: { x: number; y: number }): AnalysisVector => [p.x * length, p.y * length];
  const frame = new Set(
    links
      .filter((link) => {
        if (!(link instanceof RealLink)) return false;
        const pins = link.joints.filter(
          (j) => j instanceof RealJoint && j.ground && !(j instanceof PrisJoint)
        );
        return pins.some((a) => pins.some((b) => Math.hypot(a.x - b.x, a.y - b.y) >= 1e-6));
      })
      .map((link) => link.id)
  );
  const fixedJoints = new Set(
    links.filter((l) => frame.has(l.id)).flatMap((l) => l.joints.map((j) => j.id))
  );
  const moving = links.filter((l) => !frame.has(l.id));
  let offset = 0;
  const bodies = moving.map((body) => {
    const rigid = body instanceof RealLink;
    if (
      rigid &&
      (body.joints.length < 2 ||
        Math.hypot(body.joints[1].x - body.joints[0].x, body.joints[1].y - body.joints[0].y) < 1e-6)
    )
      refuse(`Body ${body.id} needs two distinct orientation anchors.`);
    if (!rigid && !(body instanceof SliderBlock)) refuse(`Body ${body.id} has no MATLAB model.`);
    const center = xy(rigid ? body.CoM : body.joints[0]);
    const dof: 2 | 3 = rigid ? 3 : 2;
    const result = {
      id: body.id,
      name: body.name,
      joints: body.joints.map((j) => j.id),
      offset,
      dof,
      initialCenter: center,
      initialAngle: rigid
        ? Math.atan2(body.joints[1].y - body.joints[0].y, body.joints[1].x - body.joints[0].x)
        : 0,
      mass: body.mass * units.massToKg,
      inertia: rigid ? body.massMoI * units.inertiaToKgM2 : 0,
    };
    offset += dof;
    return result;
  });
  const point = (body: number, joint: Joint): AnalysisPoint => ({
    body,
    xy:
      body < 0
        ? xy(joint)
        : [
            joint.x * length - bodies[body].initialCenter[0],
            joint.y * length - bodies[body].initialCenter[1],
          ],
  });
  const model: AnalysisExportModel = {
    name,
    bodies,
    joints: [],
    constraints: [],
    loads: [],
    initial: bodies.flatMap((b) => (b.dof === 3 ? [...b.initialCenter, 0] : b.initialCenter)),
    gravity: [0, mechanism.gravity ? -9.80665 : 0],
    driver: { joint: input.id, body: -1, segments: [] },
    settings: { duration: mechanism.timeNum.at(-1) ?? 0, step: 0, forceMode },
    channels: [],
  };
  joints.forEach((joint, index) => {
    // Preserve the backend's incident-body order so reaction signs agree at multi-body pins.
    const attached: number[] = [];
    const add = (i: number) => {
      if (i >= 0 && !attached.includes(i)) attached.push(i);
    };
    if (joint instanceof RealJoint)
      joint.links.forEach((l) => add(moving.findIndex((b) => b.id === l.id)));
    moving.forEach((b, i) => {
      if (b.joints.some((j) => j.id === joint.id)) add(i);
    });
    const first = attached[0] ?? -1;
    const ground = (joint instanceof RealJoint && joint.ground) || fixedJoints.has(joint.id);
    model.joints.push({
      id: joint.id,
      name: joint.name,
      initial: xy(joint),
      ground,
      kind: joint instanceof PrisJoint ? 'slider' : 'pin',
      tracer: !ground && attached.length === 1 && !(joint instanceof PrisJoint),
      point: point(first, joint),
    });
    const constraint = (a: number, b: number, normal: AnalysisVector) =>
      model.constraints.push({
        joint: index,
        positive: point(a, joint),
        negative: point(b, joint),
        normal,
      });
    if (joint instanceof PrisJoint) {
      if (first < 0 || bodies[first].dof !== 2)
        refuse(`Slider ${joint.id} needs an explicit slider block.`);
      constraint(first, -1, [-Math.sin(joint.slotAngle), Math.cos(joint.slotAngle)]);
    } else if (ground) {
      attached.forEach((a) => {
        constraint(a, -1, [1, 0]);
        constraint(a, -1, [0, 1]);
      });
    } else {
      attached.slice(1).forEach((other) => {
        constraint(first, other, [1, 0]);
        constraint(first, other, [0, 1]);
      });
    }
    if (joint.id === input.id) model.driver.body = attached.find((i) => bodies[i].dof === 3) ?? -1;
  });
  if (model.driver.body < 0) refuse('The rotary driver is not attached to a moving rigid body.');
  if (model.constraints.length + 1 !== offset)
    refuse(
      'This mechanism has redundant or missing constraints. MATLAB export currently requires a determinate constraint system.'
    );
  moving.forEach((body, i) => {
    if (!(body instanceof RealLink)) return;
    body.forces.forEach((load) =>
      model.loads.push({
        id: load.id,
        body: i,
        point: [
          load.startCoord.x * length - bodies[i].initialCenter[0],
          load.startCoord.y * length - bodies[i].initialCenter[1],
        ],
        force: [
          load.mag * Math.cos(load.angleRad) * units.forceToN,
          load.mag * Math.sin(load.angleRad) * units.forceToN,
        ],
        local: load.local,
      })
    );
  });
  const speeds = mechanism.inputAngularVelocities;
  const times = mechanism.timeNum;
  let angle = 0;
  model.driver.segments.push([0, 0, speeds[0]]);
  for (let i = 1; i < times.length; i++) {
    // PMKS records the speed of the interval arriving at each sample.
    if (speeds[i] !== speeds[i - 1]) model.driver.segments.push([times[i - 1], angle, speeds[i]]);
    angle += (times[i] - times[i - 1]) * speeds[i];
  }
  model.settings.step = Math.min(
    Math.PI / 180 / Math.abs(speeds[0]),
    model.settings.duration / 360
  );
  if (
    !(model.settings.duration > 0) ||
    !Number.isFinite(model.settings.step) ||
    !(model.settings.step > 0)
  )
    refuse('MATLAB analysis needs a nonzero finite rotary speed and motion duration.');
  if (model.driver.segments.some((s) => !s.every(Number.isFinite) || s[2] === 0))
    refuse('The drive profile contains an invalid speed.');
  if (
    bodies.some(
      (b) =>
        ![...b.initialCenter, b.initialAngle, b.mass, b.inertia].every(Number.isFinite) ||
        b.mass < 0 ||
        b.inertia < 0
    ) ||
    model.loads.some((l) => ![...l.point, ...l.force].every(Number.isFinite))
  )
    refuse('Mass, inertia, coordinates or applied loads contain invalid values.');
  try {
    const zero = model.initial.map(() => 0);
    const initial = analysisConstraints(model, model.initial, zero, 0);
    if (Math.max(...initial.c.map(Math.abs)) > 1e-9)
      refuse('The initial configuration does not satisfy its rigid-body constraints.');
    analysisLinear(initial.J, zero);
  } catch {
    refuse(
      'The initial configuration is singular or its constraints are inconsistent. Move away from the toggle before exporting.'
    );
  }
  return model;
}

export function analysisExportRefusal(
  mechanism: Mechanism,
  forceMode: 'none' | 'static' | 'dynamic'
): string {
  try {
    analysisExportModel(mechanism, forceMode);
    return '';
  } catch (error) {
    return error instanceof Error ? error.message : 'This mechanism cannot be exported.';
  }
}

/** Match optional reference samples to elapsed time in the exported drive direction. */
export function matlabReferenceFrames(mechanism: Mechanism): { time: number; index: number }[] {
  const times = mechanism.timeNum;
  if (!mechanism.framesRunBackwards) return times.map((time, index) => ({ time, index }));
  const duration = times.at(-1)!;
  // Closed constant-speed cycles are checked by the model adapter. Frame zero is the initial pose.
  return [
    { time: 0, index: 0 },
    ...times
      .slice(0, -1)
      .map((time, index) => ({ time: duration - time, index }))
      .reverse(),
  ];
}
