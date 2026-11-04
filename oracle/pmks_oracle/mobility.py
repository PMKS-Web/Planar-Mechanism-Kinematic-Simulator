"""How free a mechanism is, from the rank of its constraint Jacobian at the drawn pose.

The columns are made commensurate first: a rotation column is multiplied by the
mechanism's size, so a singular value means a length whatever the coordinate.
Rank is counted against a threshold relative to the largest singular value,
and the singular values themselves are kept, so a rank decision near the
threshold can be seen rather than taken on trust.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .exudyn_model import ExudynModel

RANK_THRESHOLD = 1e-8


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
    )
