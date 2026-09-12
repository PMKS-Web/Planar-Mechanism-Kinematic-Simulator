/** Base MATLAB numeric solver kernels. Coordinate conventions are the AnalysisExportModel contract. */
export const KINEMATIC_FILES: Record<string, string> = {
  '+pmks/point.m': `function [p, D, curvature] = point(m, q, v, body, local)
% Point location, Jacobian, and centripetal acceleration in SI.
D = zeros(2,numel(q)); curvature = zeros(2,1);
if body == 0, p = local(:); return; end
b = m.bodies(body); i = b.offset;
phi = 0; w = 0;
if b.dof == 3, phi = q(i+2); w = v(i+2); end
r = [cos(phi) -sin(phi); sin(phi) cos(phi)]*local(:);
p = q(i:i+1)+r; D(:,i:i+1) = eye(2);
if b.dof == 3, D(:,i+2) = [-r(2);r(1)]; end
curvature = -w*w*r;
end
`,
  '+pmks/constraints.m': `function [c,J,curvature] = constraints(m,q,v,angle)
% Every row is one pin/guide scalar constraint; the last row prescribes rotation.
n = numel(q); count = numel(m.constraints);
c = zeros(count+1,1); J = zeros(count+1,n); curvature = c;
for k = 1:count
    r = m.constraints(k);
    [p1,D1,a1] = pmks.point(m,q,v,r.positive_body,r.positive_local);
    [p2,D2,a2] = pmks.point(m,q,v,r.negative_body,r.negative_local);
    c(k) = r.normal*(p1-p2);
    J(k,:) = r.normal*(D1-D2);
    curvature(k) = r.normal*(a1-a2);
end
i = m.bodies(m.driver.body).offset+2;
c(end) = q(i)-angle; J(end,i) = 1;
end
`,
  '+pmks/linear.m': `function x = linear(A,b)
% Row-scaled base MATLAB backslash. Refuse singular/ambiguous equations.
scale = max(abs(A),[],2);
if size(A,1) ~= size(A,2) || any(scale == 0) || any(~isfinite(A(:))) || any(~isfinite(b))
    error('PMKS:ConstraintSystem','Invalid or non-square equation system.');
end
S = bsxfun(@rdivide,A,scale); rhs = b./scale;
if rcond(S) < 1e-12, error('PMKS:Singular','Singular mechanism or indeterminate reactions.'); end
x = S\\rhs;
if norm(S*x-rhs,inf) > 1e-8*max(1,norm(rhs,inf))
    error('PMKS:Residual','Equation residual exceeds tolerance.');
end
end
`,
  '+pmks/driver.m': `function [angle,omega,alpha] = driver(m,t)
% Compact prescribed drive profile, independent of reference results.
% Reversals are ideal velocity jumps. Values at the event are right-sided;
% impulse loads at an instantaneous reversal are outside rigid-body analysis.
s = m.driver.segments;
k = find(s(:,1) <= t+1e-12,1,'last');
angle = s(k,2)+s(k,3)*(t-s(k,1)); omega = s(k,3); alpha = 0;
end
`,
  'solve_position.m': `function q = solve_position(m,previous,angle)
% Newton-Raphson with backtracking, initialized by the previous configuration.
% The caller subdivides motion steps; a failed solve never supplies a new pose.
q = previous; zero = zeros(size(q));
for iteration = 1:50
    [c,J] = position_equations(m,q,zero,angle);
    delta = pmks.linear(J,c);
    if norm(c,inf) < 1e-11, return; end
    fraction = 1;
    while fraction > 1/128
        candidate = q-fraction*delta;
        next = position_equations(m,candidate,zero,angle);
        if norm(next,inf) < norm(c,inf), break; end
        fraction = fraction/2;
    end
    q = q-fraction*delta;
end
error('PMKS:Position','Position did not converge; reduce the range or step.');
end
`,
  'solve_velocity.m': `function [v,J] = solve_velocity(m,q,angle,omega)
% q = [CoM x, CoM y, rotation] per rigid body; sliders have only x,y.
% Differentiate constraints: J(q)*q_dot = driver velocity RHS.
[J,rhs] = velocity_equations(m,q,angle,omega);
v = pmks.linear(J,rhs);
end
`,
  'solve_acceleration.m': `function a = solve_acceleration(m,q,v,angle,alpha)
% Differentiate once more: J*q_ddot = -J_dot*q_dot + driver acceleration.
[J,rhs] = acceleration_equations(m,q,v,angle,alpha);
a = pmks.linear(J,rhs);
end
`,
  '+pmks/advance.m': `function q = advance(m,q,t0,t1,depth)
% Bound local travel and bisect failures, preserving the previous assembly.
[angle,~,~] = pmks.driver(m,t1);
try
    next = solve_position(m,q,angle);
    for b = m.bodies
        i = b.offset;
        if b.dof == 3 && abs(next(i+2)-q(i+2)) > pi/8
            error('PMKS:Branch','Step changes assembly too far.');
        end
    end
    q = next;
catch failure
    if depth >= 12 || t1-t0 < 1e-10, rethrow(failure); end
    middle = (t0+t1)/2;
    q = pmks.advance(m,q,t0,middle,depth+1);
    q = pmks.advance(m,q,middle,t1,depth+1);
end
end
`,
};
