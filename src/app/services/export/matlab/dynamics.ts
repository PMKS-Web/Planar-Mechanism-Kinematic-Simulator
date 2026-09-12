export const FORCE_FILE = `function [lambda,reactions] = solve_forces(m,q,a,J)
% Per body: sum F = m*a_G and sum M_G = I_G*alpha (SI).
% J' maps constraint reactions to generalized forces. A shared pin acts with
% equal and opposite forces on its two bodies. Last unknown: CCW driver torque.
rhs = zeros(size(q)); dynamic = strcmp(m.settings.force_mode,'dynamic');
for b = m.bodies
    i = b.offset;
    rhs(i:i+1) = b.mass*(double(dynamic)*a(i:i+1)-m.gravity(:));
    if b.dof == 3, rhs(i+2) = double(dynamic)*b.inertia*a(i+2); end
end
for load = m.loads
    i = m.bodies(load.body).offset; phi = q(i+2);
    R = [cos(phi) -sin(phi);sin(phi) cos(phi)];
    r = R*load.point(:); f = load.force(:);
    if load.local, f = R*f; end
    rhs(i:i+1) = rhs(i:i+1)-f;
    rhs(i+2) = rhs(i+2)-(r(1)*f(2)-r(2)*f(1));
end
lambda = pmks.linear(J',rhs);
reactions = zeros(numel(m.joints),numel(m.bodies),2);
for k = 1:numel(m.constraints)
    r = m.constraints(k); f = lambda(k)*r.normal;
    reactions(r.joint,r.positive_body,:) = reactions(r.joint,r.positive_body,:)+reshape(f,1,1,2);
    if r.negative_body > 0
        reactions(r.joint,r.negative_body,:) = reactions(r.joint,r.negative_body,:)-reshape(f,1,1,2);
    end
end
end
`;
