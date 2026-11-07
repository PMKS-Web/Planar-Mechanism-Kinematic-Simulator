"""Walks a one-freedom mechanism's configuration curve and samples it on the driver's grid.

The undriven constraints Phi(q) = 0 leave a curve in configuration space. It is
traced by pseudo-arclength continuation (predict along the tangent, correct on
the plane normal to it), which passes the driver's limits as ordinary turning
points rather than as failures. The driver coordinate d(q) is read along the
curve: where it stops increasing is a limit of travel, refined to the turning
point itself. Grid samples are the poses where d = d0 + k * step, solved
exactly from the curve's neighboring points.

Starting from the drawn pose is what fixes the assembly branch: the authored
pose is the reader's input, not anything PMKS+ computed.

Every sample is stored once, for the driver moving toward increasing d. A
sample walked the other way has the same pose, the opposite velocities, and the
same accelerations and forces, because the driver's speed is constant.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field

import numpy as np

from . import analysis
from .exudyn_model import ExudynModel

MAX_REVOLUTIONS = 3
# A singular value this far below the largest is zero, for rank and for singularity alike.
SINGULAR_RATIO = 1e-10
# How far inside a toggle, in steps, a grid point must lie to be stored.
TOGGLE_CLEARANCE = 1e-9
# Where a grid sample sits on a singular pose, Newton stops at a residual near
# rounding, but along the direction the singularity frees it is held only to
# the square root of that residual over the constraints' curvature: about 1e-7
# of the machine's size. The singular value that should be zero is then of
# that order too, not of rounding, and which side of SINGULAR_RATIO it lands on
# differs from one platform's arithmetic to another's. A sample is called
# singular when that singular value is below this instead; any it catches that
# is not singular has a condition number above 1e6, far past the point where a
# rate is compared, so no comparable state is lost.
SINGULAR_POSE_RATIO = 1e-6


@dataclass
class Limit:
    kind: str  # 'toggle', 'singular', 'solver-failure', 'budget'
    travel: float  # driver travel from the start where the walk stopped, rad or m


@dataclass
class Walk:
    samples: dict[int, np.ndarray] = field(default_factory=dict)  # k -> q
    high: Limit | None = None
    low: Limit | None = None
    closes_after: int | None = None  # whole driver revolutions until the drawing is home
    initial_drift: float = 0.0  # largest coordinate change projecting the drawn pose onto its constraints


def _undriven(model: ExudynModel, q) -> tuple[np.ndarray, np.ndarray]:
    rows = list(model.driver_rows)
    return np.delete(model.constraints_at(q), rows), np.delete(model.jacobian_at(q), rows, axis=0)


def driver_coordinate(model: ExudynModel, q) -> float:
    return float(model.constraints_at(q)[model.driver_rows[0]])


def driver_gradient(model: ExudynModel, q) -> np.ndarray:
    return model.jacobian_at(q)[model.driver_rows[0]]


def tangent(model: ExudynModel, q, previous=None) -> np.ndarray:
    _, j = _undriven(model, q)
    _, _, vt = np.linalg.svd(j)
    t = vt[-1]
    if previous is not None:
        if t @ previous < 0:
            t = -t
    elif driver_gradient(model, q) @ t < 0:
        t = -t
    return t / np.linalg.norm(t)


def corrector(model: ExudynModel, predicted, t, max_iterations=30):
    q = np.array(predicted, dtype=float)
    scale = max(1.0, model.length_scale)
    for _ in range(max_iterations):
        r, j = _undriven(model, q)
        r = np.append(r, t @ (q - predicted))
        j = np.vstack([j, t])
        if np.max(np.abs(r)) < analysis.NEWTON_TOLERANCE * scale:
            return q
        step, *_ = np.linalg.lstsq(j, -r, rcond=None)
        q = q + step
    raise analysis.SolveFailed("corrector did not converge")


def _same_pose(model: ExudynModel, a, b) -> bool:
    """Whether two configurations are one drawing: positions equal, rotations equal modulo a turn."""
    tol = 1e-7 * model.length_scale
    for body in model.bodies.values():
        x, y, t = body.columns
        if abs(a[x] - b[x]) > tol or abs(a[y] - b[y]) > tol:
            return False
        if abs(math.remainder(a[t] - b[t], 2 * math.pi)) > 1e-7:
            return False
    return True


# Short steps the bracket around a turning point is walked again in, before the
# golden-section search: each is corrected from its own tangent, so no chord is
# long enough for Newton to wander off the curve where it bends.
REFINE_STEPS = 16


def _refine_turning_point(model, q_a, t_a, h, direction_sign):
    """The extremum of d along the curve within arclength h of q_a.

    The bracket is walked again in REFINE_STEPS short steps, and the search
    then runs over the two short steps around the largest d found. A chord
    from q_a across the whole bracket, along q_a's own tangent, can leave the
    corrector wandering for its whole iteration budget where the curve bends
    sharply, and whether it converges in time then differs between platforms.
    """
    small = h / REFINE_STEPS
    walked = [(direction_sign * driver_coordinate(model, q_a), q_a, t_a)]
    q, t = q_a, t_a
    for _ in range(REFINE_STEPS):
        q = corrector(model, q + small * t, t)
        t = tangent(model, q, t)
        walked.append((direction_sign * driver_coordinate(model, q), q, t))
    i = max(range(len(walked)), key=lambda n: walked[n][0])
    _, q_b, t_b = walked[max(i - 1, 0)]
    return direction_sign * _golden_section(model, q_b, t_b, 2 * small, direction_sign)


def _golden_section(model, q_a, t_a, h, direction_sign):
    """Golden-section search for the largest direction_sign * d between arclength 0 and h from q_a."""
    def at(s):
        q = corrector(model, q_a + s * t_a, t_a)
        return direction_sign * driver_coordinate(model, q), q

    lo, hi = 0.0, h
    g = (math.sqrt(5) - 1) / 2
    x1, x2 = hi - g * (hi - lo), lo + g * (hi - lo)
    f1, _ = at(x1)
    f2, _ = at(x2)
    for _ in range(80):
        if f1 > f2:
            hi, x2, f2 = x2, x1, f1
            x1 = hi - g * (hi - lo)
            f1, _ = at(x1)
        else:
            lo, x1, f1 = x1, x2, f2
            x2 = lo + g * (hi - lo)
            f2, _ = at(x2)
        if hi - lo < 1e-14 * max(1.0, model.length_scale):
            break
    best, _ = at((lo + hi) / 2)
    return best


def regular_rank(model: ExudynModel, q) -> int:
    """Rank of the undriven Jacobian, which a redundant support keeps below its row count."""
    _, j = _undriven(model, q)
    s = np.linalg.svd(j, compute_uv=False)
    return int(np.sum(s > SINGULAR_RATIO * s[0])) if s.size and s[0] > 0 else 0


def is_singular_pose(model: ExudynModel, q, rank: int) -> bool:
    """Whether the undriven Jacobian at q has lost rank below `rank`, to the pose's own accuracy."""
    _, j = _undriven(model, q)
    s = np.linalg.svd(j, compute_uv=False)
    if rank == 0 or not s.size or s[0] <= 0:
        return False
    return bool(s[rank - 1] < SINGULAR_POSE_RATIO * s[0])


def _walk_one_way(model, q0, d0, step, direction, walk: Walk, revolute: bool, budget: int, rank: int):
    """Trace from q0 toward increasing (direction=+1) or decreasing d, collecting grid samples.

    `rank` is the undriven Jacobian's rank at the drawn pose. A singularity is
    where it drops: a redundant support's zero singular value is there from the
    start and is not one.
    """
    q = q0.copy()
    t = direction * tangent(model, q0)
    d = d0
    k_next = direction
    rate = abs(driver_gradient(model, q) @ t) or 1.0
    h = 0.5 * step / rate
    h_max = 4 * h
    # The accepted point before this one: a step can carry the walk past the
    # turning point while d is still above where it was, so the extremum is
    # only known to lie within the last two steps.
    previous = (q, t, 0.0)
    while True:
        if len(walk.samples) > budget:
            return Limit("budget", d - d0)
        try:
            predicted = q + h * t
            q_new = corrector(model, predicted, t)
        except analysis.SolveFailed:
            h /= 2
            if h < 1e-12 * model.length_scale:
                return Limit("solver-failure", d - d0)
            continue
        d_new = driver_coordinate(model, q_new)
        if (d_new - d) * direction <= 0:
            # d turned round within the last two steps: a limit of travel.
            q_back, t_back, h_back = previous
            try:
                extremum = _refine_turning_point(model, q_back, t_back, h_back + 2 * h, direction)
                # A grid point on the toggle itself is the dead point, where no
                # rate is defined, and whether rounding puts the refined toggle
                # a hair before or after it differs between platforms.
                while (d0 + k_next * step - extremum) * direction < -TOGGLE_CLEARANCE * step:
                    walk.samples[k_next] = analysis.newton(model, q_back, d0 + k_next * step)
                    k_next += direction
            except analysis.SolveFailed:
                # A turn the corrector cannot follow is not a toggle anyone has measured.
                return Limit("solver-failure", d - d0)
            return Limit("toggle", extremum - d0)
        _, jc = _undriven(model, q_new)
        s = np.linalg.svd(jc, compute_uv=False)
        if s[rank - 1] < SINGULAR_RATIO * s[0]:
            return Limit("singular", d_new - d0)
        while (d0 + k_next * step - d_new) * direction <= 0:
            target = d0 + k_next * step
            frac = (target - d) / (d_new - d)
            try:
                walk.samples[k_next] = analysis.newton(model, q + frac * (q_new - q), target)
            except analysis.SolveFailed:
                return Limit("solver-failure", d - d0)
            per_turn = steps_per_turn(step) if revolute else None
            if per_turn and k_next % per_turn == 0:
                turns = abs(k_next) // per_turn
                if _same_pose(model, walk.samples[k_next], q0):
                    walk.closes_after = turns
                    del walk.samples[k_next]  # the start pose again, already sample 0
                    return None
                if turns >= MAX_REVOLUTIONS:
                    return Limit("budget", d_new - d0)
            k_next += direction
        t_new = tangent(model, q_new, t)
        previous = (q, t, h)
        q, d, t = q_new, d_new, t_new
        h = min(h * 1.5, h_max)


def steps_per_turn(step: float) -> int | None:
    """Grid steps in one revolution, when a whole number of them makes one exactly."""
    n = round(2 * math.pi / step)
    return n if abs(n * step - 2 * math.pi) < 1e-9 else None


def walk(model: ExudynModel) -> Walk:
    problem = model.problem
    result = Walk()
    q0 = analysis.newton(model, np.zeros(model.n), None)
    result.initial_drift = float(np.max(np.abs(q0), initial=0.0))
    d0 = driver_coordinate(model, q0)
    result.samples[0] = q0
    step = problem.sweep.step
    revolute = problem.driver.kind == "rotation"
    budget = problem.sweep.max_samples
    rank = regular_rank(model, q0)
    high = _walk_one_way(model, q0, d0, step, +1, result, revolute, budget, rank)
    if high is None:
        return result
    result.high = high
    result.low = _walk_one_way(model, q0, d0, step, -1, result, revolute, budget, rank)
    return result
