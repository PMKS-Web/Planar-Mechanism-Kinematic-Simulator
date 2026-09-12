export const FORCE_FILE = `function [lambda,reactions] = solve_forces(m,q,a,J)
% Per body: sum F = m*a_G and sum M_G = I_G*alpha (SI).
% J' maps constraint reactions to generalized forces. A shared pin acts with
% equal and opposite forces on its two bodies. Last unknown: CCW driver torque.
[A_force,b_force] = force_equations(m,q,a,J);
lambda = pmks.linear(A_force,b_force);
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
