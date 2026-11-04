"""Kinematic analysis and inverse dynamics of a driven mechanism, after Haug (1989), ch. 3 and 6.

With Phi(q) the constraints and d(q) the driver coordinate, a driven pose solves
    Phi(q) = 0,  d(q) = d*.
Differentiating along the motion, with J = [Phi_q; d_q]:
    J q'  = [0; d']                      (velocity)
    J q'' = -gamma,  gamma = q'^T C_qq q' (acceleration; the driver rate is constant)
and the constraint forces follow from M q'' = f + J^T lambda.

gamma is the derivative of Exudyn's velocity-level constraints Phi_q q' along
q', taken by a central difference and refined by Richardson extrapolation.
Exudyn gives the constraints and their Jacobian exactly; gamma is the only
number here obtained by differencing, and each sample reports its error.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .exudyn_model import ExudynModel

NEWTON_TOLERANCE = 1e-13


class SolveFailed(RuntimeError):
    pass


def driven_residual(model: ExudynModel, q, target: float) -> np.ndarray:
    r = model.constraints_at(q)
    for row in model.driver_rows:
        r[row] -= target
    return r


def newton(model: ExudynModel, q0, target: float | None, max_iterations: int = 30) -> np.ndarray:
    """Solve the constraints (and the driver at `target`, if given) from q0, minimum-norm steps."""
    q = np.array(q0, dtype=float)
    scale = max(1.0, model.length_scale)
    for _ in range(max_iterations):
        if target is None:
            r = np.delete(model.constraints_at(q), list(model.driver_rows))
            j = np.delete(model.jacobian_at(q), list(model.driver_rows), axis=0)
        else:
            r = driven_residual(model, q, target)
            j = model.jacobian_at(q)
        if np.max(np.abs(r), initial=0.0) < NEWTON_TOLERANCE * scale:
            return q
        step, *_ = np.linalg.lstsq(j, -r, rcond=None)
        q = q + step
    r = driven_residual(model, q, target) if target is not None else model.constraints_at(q)
    raise SolveFailed(f"Newton did not converge: residual {np.max(np.abs(r)):.3e}")


def velocity_constraints_at(model: ExudynModel, q, qd) -> np.ndarray:
    """Exudyn's velocity-level constraints, Phi_q q' (the driver row is d_q q')."""
    model._set(q, qd)
    model.solver.ComputeAlgebraicEquations(model.mbs, velocityLevel=True)
    return np.array(model.solver.GetSystemResidual()[model.n :], dtype=float)


def _central(model: ExudynModel, q, qd, h: float) -> np.ndarray:
    return (velocity_constraints_at(model, q + h * qd, qd) - velocity_constraints_at(model, q - h * qd, qd)) / (2 * h)


def gamma(model: ExudynModel, q, qd) -> tuple[np.ndarray, float]:
    """(Phi_q q')_q q' for every row, and an estimate of its error.

    The derivative of Exudyn's velocity-level constraints along q', by a central
    difference Richardson-extrapolated twice (error O(h^6)). The step moves the
    mechanism a tenth of its size along q': at that step the Norton four-bar's
    accelerations agree with the closed form to 1e-14 relative, where smaller
    steps lose digits to rounding (spike/gamma_step.md).
    """
    speed = np.linalg.norm(qd)
    if speed == 0:
        return np.zeros(model.m), 0.0
    h = 0.1 * model.length_scale / speed
    d1, d2, d4 = _central(model, q, qd, h), _central(model, q, qd, h / 2), _central(model, q, qd, h / 4)
    r1 = (4 * d2 - d1) / 3
    r2 = (4 * d4 - d2) / 3
    best = (16 * r2 - r1) / 15
    return best, float(np.max(np.abs(best - r2), initial=0.0))


@dataclass
class DrivenState:
    q: np.ndarray
    qd: np.ndarray
    qdd: np.ndarray
    jacobian: np.ndarray
    condition: float
    gamma_error: float
    velocity_consistency: float  # |velocity-level constraints - J q'|, should be rounding


def driven_state(model: ExudynModel, q, driver_rate: float, driver_acceleration: float = 0.0) -> DrivenState:
    """Velocities and accelerations at a solved pose, with the driver moving at `driver_rate`."""
    j = model.jacobian_at(q)
    rhs = np.zeros(model.m)
    for row in model.driver_rows:
        rhs[row] = driver_rate
    qd, *_ = np.linalg.lstsq(j, rhs, rcond=None)
    g, gamma_error = gamma(model, q, qd)
    consistency = float(np.max(np.abs(velocity_constraints_at(model, q, qd) - j @ qd), initial=0.0))
    rhs = -g
    for row in model.driver_rows:
        rhs[row] += driver_acceleration
    qdd, *_ = np.linalg.lstsq(j, rhs, rcond=None)
    s = np.linalg.svd(j, compute_uv=False)
    condition = float(s[0] / s[-1]) if s[-1] > 0 else float("inf")
    return DrivenState(q, qd, qdd, j, condition, gamma_error, consistency)


@dataclass
class ForceSolution:
    generalized: np.ndarray  # Phi_q^T lambda split per constraint, see below
    lam: np.ndarray
    nullspace: np.ndarray  # columns: lambda directions equilibrium cannot see
    residual: float


def inverse_dynamics(model: ExudynModel, state: DrivenState, inertial: bool) -> ForceSolution:
    """lambda with J^T lambda = M q'' - f (inertial) or -f (static: loads and weight only)."""
    f = model.applied_forces_at(state.q, state.qd)
    rhs = -f
    if inertial:
        rhs = rhs + model.mass_matrix_at(state.q) @ state.qdd
    jt = state.jacobian.T
    lam, *_ = np.linalg.lstsq(jt, rhs, rcond=None)
    u, s, vt = np.linalg.svd(jt)
    tol = max(jt.shape) * np.finfo(float).eps * (s[0] if s.size else 0.0) * 1e3
    rank = int(np.sum(s > tol))
    nullspace = vt[rank:].T
    residual = float(np.linalg.norm(jt @ lam - rhs))
    return ForceSolution(jt * lam, lam, nullspace, residual)


def constraint_force_on_body(model: ExudynModel, state: DrivenState, lam: np.ndarray, rows, body_id: str):
    """Force (x, y) and moment about the CoM that constraint rows apply to one body."""
    cols = model.bodies[body_id].columns
    g = state.jacobian[np.ix_(rows, cols)].T @ lam[list(rows)]
    return g  # (Fx, Fy, M_about_com)


def identifiable(model: ExudynModel, state: DrivenState, solution: ForceSolution, rows, body_id: str) -> bool:
    """Whether the force these rows put on this body is fixed by equilibrium alone."""
    if solution.nullspace.size == 0:
        return True
    cols = model.bodies[body_id].columns
    a = np.zeros((3, model.m))
    a[:, list(rows)] = state.jacobian[np.ix_(rows, cols)].T
    seen = a @ solution.nullspace
    return bool(np.max(np.abs(seen)) < 1e-9 * max(1.0, np.max(np.abs(a))))
