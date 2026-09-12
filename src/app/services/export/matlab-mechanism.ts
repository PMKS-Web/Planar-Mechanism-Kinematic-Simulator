import { PrisJoint, RealJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { Mechanism } from '../../model/mechanism/mechanism';
import { MODEL_SCALE } from '../../model/render-scale';
import { matlabMatrix, matlabString } from './matlab-writer';

/** Scope is stated before export; unsupported geometry still has a PMKS results script. */
export function matlabGeometryReason(mechanism: Mechanism | undefined): string {
  if (!mechanism?.isMechanismValid()) return 'Solve a mechanism before exporting its geometry.';
  const joints = mechanism.joints[0];
  const input = joints.find((joint) => joint instanceof RealJoint && joint.input);
  if (!(input instanceof RealJoint) || !input.ground || input instanceof PrisJoint) {
    return 'Independent kinematics needs a grounded revolute input. This script exports PMKS results and RMSE.';
  }
  if (
    joints.some(
      (joint) =>
        joint instanceof PrisJoint && (joint.isFloating || joint.isWelded || joint.isSealed)
    )
  ) {
    return 'Floating slots, welded sliders and cylinders currently export PMKS results and RMSE only.';
  }
  const speeds = mechanism.inputAngularVelocities;
  if (
    !Number.isFinite(speeds[0]) ||
    speeds[0] === 0 ||
    speeds.some((speed) => Math.abs(speed - speeds[0]) > 1e-9)
  ) {
    return 'Reversing or variable-speed inputs currently export PMKS results and RMSE only.';
  }
  return '';
}

/** Coordinates and constraints come from the design frame, never from the currently animated pose. */
export function matlabGeometry(mechanism: Mechanism): string {
  const reason = matlabGeometryReason(mechanism);
  if (reason) return `\n% Independent geometry solve unavailable: ${reason}\n`;
  const joints = mechanism.joints[0];
  const allBodies = mechanism.links[0].filter((link): link is RealLink => link instanceof RealLink);
  const fixed = (body: RealLink) =>
    body.joints.filter(
      (joint) => joint instanceof RealJoint && joint.ground && !(joint instanceof PrisJoint)
    ).length >= 2;
  const bodies = allBodies.filter((body) => !fixed(body));
  const frameJoints = new Set(
    allBodies.filter(fixed).flatMap((body) => body.joints.map((joint) => joint.id))
  );
  const point = (body: number, joint: { x: number; y: number }) => [
    body,
    (joint.x - (body ? bodies[body - 1].CoM.x : 0)) / MODEL_SCALE,
    (joint.y - (body ? bodies[body - 1].CoM.y : 0)) / MODEL_SCALE,
  ];
  const constraints: number[][] = [];
  const jointPoints: number[][] = [];
  let drivenBody = 0;
  for (const joint of joints) {
    const attached = bodies
      .map((body, i) => (body.joints.some((one) => one.id === joint.id) ? i + 1 : 0))
      .filter(Boolean);
    const first = attached[0] ?? 0;
    jointPoints.push(point(first, joint));
    if (!first) continue;
    for (const other of attached.slice(1)) {
      for (const normal of [
        [1, 0],
        [0, 1],
      ])
        constraints.push([...point(first, joint), ...point(other, joint), ...normal]);
    }
    if (joint instanceof PrisJoint) {
      constraints.push([
        ...point(first, joint),
        ...point(0, joint),
        -Math.sin(joint.slotAngle),
        Math.cos(joint.slotAngle),
      ]);
    } else if ((joint instanceof RealJoint && joint.ground) || frameJoints.has(joint.id)) {
      for (const normal of [
        [1, 0],
        [0, 1],
      ])
        constraints.push([...point(first, joint), ...point(0, joint), ...normal]);
    }
    if (joint instanceof RealJoint && joint.input) drivenBody = first;
  }
  const initial = bodies.flatMap((body) => [
    [body.CoM.x / MODEL_SCALE],
    [body.CoM.y / MODEL_SCALE],
    [0],
  ]);
  const angles = bodies.map((body) =>
    Math.atan2(body.joints[1].y - body.joints[0].y, body.joints[1].x - body.joints[0].x)
  );
  return `
%% Independently solve kinematics from the mechanism geometry
% Rigid body coordinates q = [CoM_x; CoM_y; rotation_from_start] for each body.
% Translational coordinates use the project's length unit; rotations use radians.
% Constraints enforce shared pins, grounded pins, fixed guides and the input angle.
% Newton iteration solves position; the constraint Jacobian solves velocity and acceleration.
% This section does not use PMKS position/velocity/acceleration results as solver inputs.
% Force results above remain PMKS reference results; this section solves kinematics only.
% Toggle or rank-deficient poses stop this solve with a warning rather than inventing a branch.
body_ids = {${bodies.map((body) => matlabString(body.id)).join(', ')}};
joint_ids = {${joints.map((joint) => matlabString(joint.id)).join(', ')}};
initial_q = ${matlabMatrix(initial)};
initial_link_angles = ${matlabMatrix([angles])};
% Each constraint: [body1 local_x1 local_y1 body2 local_x2 local_y2 normal_x normal_y].
% Body 0 means the ground frame, whose point coordinates are absolute.
point_constraints = ${matlabMatrix(constraints)};
joint_points = ${matlabMatrix(jointPoints)};
driven_body = ${drivenBody};
input_omega = ${mechanism.inputAngularVelocities[0]}; % rad/s; counterclockwise positive
geometry = pmks_kinematics(time, initial_q, point_constraints, joint_points, driven_body, input_omega);
geometry.body_ids = body_ids;
geometry.joint_ids = joint_ids;
geometry.link_angle = geometry.q(3:3:end, :) + initial_link_angles(:);
% geometry.qd and geometry.qdd contain CoM and angular rates (radians/s and radians/s^2).
% geometry.joint_position, joint_velocity and joint_acceleration are [joint, X/Y, time].
% Edit initial_q, point_constraints and input_omega to investigate a different design.
if geometry.solved_frames > 0
    figure('Name', 'Independent MATLAB joint paths'); hold on;
    for joint = 1:numel(joint_ids)
        plot(squeeze(geometry.joint_position(joint, 1, :)), ...
            squeeze(geometry.joint_position(joint, 2, :)), 'DisplayName', joint_ids{joint});
    end
    axis equal; grid on; xlabel('X (project length unit)'); ylabel('Y (project length unit)');
    title('Independent MATLAB kinematics'); legend('show', 'Interpreter', 'none');
end
`;
}

export const MATLAB_KINEMATICS_FUNCTIONS = `
function result = pmks_kinematics(time, q, constraints, joints, driven, omega)
    n = numel(q); count = numel(time);
    result.q = NaN(n, count); result.qd = NaN(n, count); result.qdd = NaN(n, count);
    result.joint_position = NaN(size(joints, 1), 2, count);
    result.joint_velocity = result.joint_position; result.joint_acceleration = result.joint_position;
    result.solved_frames = 0;
    qd = zeros(n, 1);
    tolerance = 1e-10 * max(1, norm(q, inf));
    for k = 1:count
        if k > 1, q = q + qd * (time(k)-time(k-1)); end
        for iteration = 1:40
            [c, J] = pmks_constraints(q, zeros(n, 1), constraints, driven, omega*(time(k)-time(1)));
            if rank(J) < n
                warning('PMKS:SingularGeometry', 'Independent solve stopped at t=%g s: singular geometry.', time(k));
                return;
            end
            if norm(c, inf) < tolerance, break; end
            q = q - J\\c;
        end
        [c, J] = pmks_constraints(q, zeros(n, 1), constraints, driven, omega*(time(k)-time(1)));
        if norm(c, inf) >= tolerance || rank(J) < n
            warning('PMKS:PositionFailure', 'Independent solve did not converge at t=%g s.', time(k));
            return;
        end
        rhs = zeros(size(J, 1), 1); rhs(end) = omega;
        qd = J\\rhs;
        [~, ~, curvature] = pmks_constraints(q, qd, constraints, driven, omega*(time(k)-time(1)));
        qdd = J\\(-curvature);
        if norm(J*qd-rhs, inf) > 1e-7 || norm(J*qdd+curvature, inf) > 1e-7
            warning('PMKS:RateFailure', 'Independent rate constraints failed at t=%g s.', time(k));
            return;
        end
        result.q(:, k) = q; result.qd(:, k) = qd; result.qdd(:, k) = qdd;
        for joint = 1:size(joints, 1)
            [p, D, curvature] = pmks_point(q, qd, joints(joint, :));
            result.joint_position(joint, :, k) = p';
            result.joint_velocity(joint, :, k) = (D*qd)';
            result.joint_acceleration(joint, :, k) = (D*qdd+curvature)';
        end
        result.solved_frames = k;
    end
end

function [c, J, curvature] = pmks_constraints(q, qd, constraints, driven, angle)
    count = size(constraints, 1);
    c = zeros(count+1, 1); J = zeros(count+1, numel(q)); curvature = c;
    for row = 1:count
        [p1, D1, a1] = pmks_point(q, qd, constraints(row, 1:3));
        [p2, D2, a2] = pmks_point(q, qd, constraints(row, 4:6));
        normal = constraints(row, 7:8);
        c(row) = normal*(p1-p2); J(row, :) = normal*(D1-D2);
        curvature(row) = normal*(a1-a2);
    end
    c(end) = q(3*driven)-angle; J(end, 3*driven) = 1;
end

function [p, D, curvature] = pmks_point(q, qd, point)
    D = zeros(2, numel(q)); curvature = zeros(2, 1);
    if point(1) == 0, p = point(2:3)'; return; end
    index = 3*point(1)-2;
    phi = q(index+2);
    r = [cos(phi) -sin(phi); sin(phi) cos(phi)]*point(2:3)';
    p = q(index:index+1)+r;
    D(:, index:index+2) = [1 0 -r(2); 0 1 r(1)];
    curvature = -qd(index+2)^2*r;
end
`;
