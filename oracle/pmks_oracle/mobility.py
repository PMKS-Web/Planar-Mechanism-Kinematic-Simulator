"""How free a mechanism is, from the rank of its constraint Jacobian at the drawn pose.

The columns are made commensurate first: a rotation column is multiplied by the
mechanism's size, so a singular value means a length whatever the coordinate.
Rank is counted against a threshold relative to the largest singular value,
and the singular values themselves are kept, so a rank decision near the
threshold can be seen rather than taken on trust.

Rank is first order, and a first-order freedom need not be a motion: two
parallel slots at one height let a jaw turn at first order and not at second.
So each count is also put to the second-order test (Haug 1989, sec. 3.6; the
theory of second-order rigidity): a first-order flex v extends to second order
exactly when Phi_qq[v, v] lies in the range of J, that is, when every left null
vector u of J has u . Phi_qq[v, v] = 0. Over a basis n_i of J's null space
those are quadratic forms A_u[i, j] = u . Phi_qq[n_i, n_j], and the freedoms
that survive are the directions on which every form vanishes with all its
cross terms: the common kernel of the A_u. Phi_qq is a second difference of
Exudyn's own constraints, Richardson-extrapolated. Without a redundant row
there is no form, and every first-order freedom survives.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .exudyn_model import ExudynModel

RANK_THRESHOLD = 1e-8
# The second difference steps the mechanism by this fraction of its size.
SECOND_ORDER_STEP = 1e-3
# A quadratic form entry below this, times 1/L, is zero. A genuine obstruction
# is a curvature, about 1/L; the extrapolated difference is good to about
# SECOND_ORDER_STEP^4 of that.
SECOND_ORDER_ZERO = 1e-6


@dataclass
class Mobility:
    coordinates: int
    constraints: int  # undriven rows
    rank: int
    freedoms: int  # coordinates - rank
    redundant: int  # constraints - rank
    driven_rank: int
    driven_freedoms: int
    smallest_singular_values: list[float]  # undriven, scaled by the largest
    exudyn_freedoms: int | None  # Exudyn's own count with the driver in place
    second_order_freedoms: int  # of `freedoms`, those that survive to second order
    second_order_driven_freedoms: int  # of `driven_freedoms`, likewise


def _scaled(model: ExudynModel, j: np.ndarray) -> np.ndarray:
    scale = np.ones(model.n)
    for body in model.bodies.values():
        scale[body.columns[2]] = model.length_scale
    return j / scale  # columns: d/d(theta * L)


def _rank(j: np.ndarray) -> tuple[int, np.ndarray]:
    if j.size == 0:
        return 0, np.array([])
    s = np.linalg.svd(j, compute_uv=False)
    if s[0] == 0:
        return 0, s
    return int(np.sum(s > RANK_THRESHOLD * s[0])), s / s[0]


def _column_scale(model: ExudynModel) -> np.ndarray:
    scale = np.ones(model.n)
    for body in model.bodies.values():
        scale[body.columns[2]] = model.length_scale
    return scale


def _second_order(model: ExudynModel, q, rows: list[int]) -> int:
    """How many of the first-order freedoms of constraint rows `rows` survive to second order."""
    return surviving_flexes(model, q, rows).shape[0]


def surviving_flexes(model: ExudynModel, q, rows: list[int]) -> np.ndarray:
    """A basis, as rows in q's own coordinates, of the first-order flexes that survive to second order."""
    scale = _column_scale(model)
    j = model.jacobian_at(q)[rows] / scale
    u, s, vt = np.linalg.svd(j)
    rank = int(np.sum(s > RANK_THRESHOLD * s[0])) if s.size and s[0] > 0 else 0
    null = vt[rank:]  # rows: unit flexes in scaled coordinates, lengths
    left = u[:, rank:]  # columns: the combinations of rows that say nothing new
    if null.shape[0] == 0 or left.shape[1] == 0:
        return null / scale
    length = model.length_scale
    base = model.constraints_at(q)[rows]

    def curvature(z: np.ndarray) -> np.ndarray:
        """Phi_qq[z, z] for a flex z in scaled coordinates, by an extrapolated second difference."""
        v = z / scale

        def at(h: float) -> np.ndarray:
            ahead = model.constraints_at(q + h * v)[rows]
            behind = model.constraints_at(q - h * v)[rows]
            return (ahead + behind - 2 * base) / (h * h)

        h = SECOND_ORDER_STEP * length
        return (4 * at(h / 2) - at(h)) / 3

    k = null.shape[0]
    single = [curvature(null[i]) for i in range(k)]
    forms = np.zeros((left.shape[1], k, k))
    for i in range(k):
        forms[:, i, i] = left.T @ single[i]
        for jj in range(i + 1, k):
            mixed = (curvature(null[i] + null[jj]) - single[i] - single[jj]) / 2
            forms[:, i, jj] = forms[:, jj, i] = left.T @ mixed
    stacked = forms.reshape(-1, k)
    _, t, wt = np.linalg.svd(stacked)
    obstructed = int(np.sum(t > SECOND_ORDER_ZERO / length))
    return (wt[obstructed:] @ null) / scale


def mobility(model: ExudynModel, q) -> Mobility:
    full = _scaled(model, model.jacobian_at(q))
    rows = list(model.driver_rows)
    undriven = np.delete(full, rows, axis=0)
    rank, s = _rank(undriven)
    driven_rank, _ = _rank(full)
    try:
        info = model.mbs.ComputeSystemDegreeOfFreedom(simulationSettings=model.settings)
        exudyn = int(info["degreeOfFreedom"])
    except Exception:  # noqa: BLE001 - a cross-check that is unavailable is recorded as such
        exudyn = None
    return Mobility(
        coordinates=model.n,
        constraints=undriven.shape[0],
        rank=rank,
        freedoms=model.n - rank,
        redundant=undriven.shape[0] - rank,
        driven_rank=driven_rank,
        driven_freedoms=model.n - driven_rank,
        smallest_singular_values=[float(x) for x in sorted(s)[:4]],
        exudyn_freedoms=exudyn,
        second_order_freedoms=_second_order(model, q, [r for r in range(full.shape[0]) if r not in rows]),
        second_order_driven_freedoms=_second_order(model, q, list(range(full.shape[0]))),
    )
