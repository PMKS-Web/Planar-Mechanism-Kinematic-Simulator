"""Turns a solved walk into a reference file: schema pmks-oracle-reference/1.

Columnar and rounded to ten significant figures, so a reference stays small
enough to commit and every number is still far finer than any budget it is
compared against. States are stored at a stride of the grid, plus the two grid
points at each end of travel, where the toggle check looks.
"""

from __future__ import annotations

import math
from importlib import metadata

import numpy as np

from . import analysis
from .exudyn_model import ExudynModel, block_id
from .mobility import mobility
from .problem import GROUND, Problem
from .sweep import steps_per_turn, walk

SCHEMA = "pmks-oracle-reference/1"
STORED_PER_CYCLE = 36
DIGITS = 10


def _r(x: float) -> float:
    x = float(x)
    if not math.isfinite(x):
        raise ValueError(f"non-finite value {x!r} in a reference")
    return float(f"{x:.{DIGITS}g}") + 0.0  # + 0.0 turns -0.0 into 0.0


def _rv(v) -> list[float]:
    return [_r(x) for x in v]


def _rotate(t: float, v) -> np.ndarray:
    c, s = math.cos(t), math.sin(t)
    return np.array([c * v[0] - s * v[1], s * v[0] + c * v[1]])


def point_motion(model: ExudynModel, state: analysis.DrivenState, body_id: str, at):
    if body_id == GROUND:
        z = np.zeros(2)
        return np.array(at, dtype=float), z, z
    body = model.bodies[body_id]
    cx, cy, ct = body.columns
    com = np.array(body.com) + state.q[[cx, cy]]
    r = _rotate(state.q[ct], np.array(at) - np.array(body.com))
    w, a = state.qd[ct], state.qdd[ct]
    perp = np.array([-r[1], r[0]])
    return com + r, state.qd[[cx, cy]] + w * perp, state.qdd[[cx, cy]] + a * perp - w * w * r


def slider_travel(model: ExudynModel, state: analysis.DrivenState, slider) -> tuple[float, float, float]:
    """Travel of a slider's block along its slot from the slot's line point, with its rates."""
    p, v, a = point_motion(model, state, block_id(slider), slider.at)
    lp, lv, la = point_motion(model, state, slider.guide, slider.line_point)
    if slider.guide == GROUND:
        turn, w, al = 0.0, 0.0, 0.0
    else:
        ct = model.bodies[slider.guide].columns[2]
        turn, w, al = state.q[ct], state.qd[ct], state.qdd[ct]
    u = _rotate(turn, np.array(slider.axis) / np.linalg.norm(slider.axis))
    perp = np.array([-u[1], u[0]])
    du = w * perp
    ddu = al * perp - w * w * u
    rel, vrel, arel = p - lp, v - lv, a - la
    return float(rel @ u), float(vrel @ u + rel @ du), float(arel @ u + 2 * vrel @ du + rel @ ddu)


def stored_indices(ks: list[int], per_cycle: int) -> list[int]:
    stride = max(1, math.ceil(per_cycle / STORED_PER_CYCLE))
    lo, hi = min(ks), max(ks)
    keep = {k for k in ks if k % stride == 0} | {lo, lo + 1, hi - 1, hi}
    return sorted(k for k in keep if k in ks)


def _joint_groups(model: ExudynModel):
    groups: dict[str, list] = {}
    for c in model.constraints:
        if c.role != "driver":
            groups.setdefault(c.joint, []).append(c)
    return groups


def _forces(model: ExudynModel, problem: Problem, state, joint_at, inertial: bool):
    solution = analysis.inverse_dynamics(model, state, inertial)
    reactions, couples, identifiable = {}, {}, {}
    real = {b.id for b in problem.bodies}
    totals = {b: np.zeros(2) for b in real}
    for joint, constraints in _joint_groups(model).items():
        rows = [r for c in constraints for r in c.rows]
        carries_moment = any(c.role in ("weld", "slot") for c in constraints)
        for body_id in real:
            cols = model.bodies[body_id].columns
            if not np.any(state.jacobian[np.ix_(rows, cols)]):
                continue
            g = analysis.constraint_force_on_body(model, state, solution.lam, rows, body_id)
            reactions.setdefault(joint, {})[body_id] = g[:2]
            totals[body_id] += g[:2]
            identifiable.setdefault(joint, {})[body_id] = analysis.identifiable(model, state, solution, rows, body_id)
            if carries_moment:
                com = point_motion(model, state, body_id, model.bodies[body_id].com)[0]
                arm = joint_at[joint] - com
                couples.setdefault(joint, {})[body_id] = g[2] - (arm[0] * g[1] - arm[1] * g[0])
    effort = None
    driver = problem.driver
    if driver:
        rows = list(model.driver_rows)
        if driver.kind == "rotation":
            driven = driver.bodies[1]
            effort = analysis.constraint_force_on_body(model, state, solution.lam, rows, driven)[2]
        else:
            slider = next(s for s in problem.sliders if s.id == driver.joint)
            g = analysis.constraint_force_on_body(model, state, solution.lam, rows, block_id(slider))
            axis = np.array(slider.axis) / np.linalg.norm(slider.axis)
            guide_turn = 0.0 if slider.guide == GROUND else state.q[model.bodies[slider.guide].columns[2]]
            effort = g[:2] @ _rotate(guide_turn, axis)
    return reactions, couples, identifiable, totals, effort, solution.residual


def solve(problem: Problem, generator: dict, problem_sha256: str | None = None) -> dict:
    """Solve one problem. `problem_sha256` is the hash of the problem file's bytes, when there is one."""
    model = ExudynModel(problem)
    q_start = analysis.newton(model, np.zeros(model.n), None)
    mob = mobility(model, q_start)
    out = {
        "schema": SCHEMA,
        "problem": problem.id,
        "problemSha256": problem_sha256 or problem.sha256,
        "generator": generator,
        "mobility": mob.__dict__,
    }
    # A drawn pose at the driver's dead point (driven_freedoms 1) is not walked:
    # both ways along the curve move the driver the same way, and which branch
    # the reader meant is not the oracle's to choose.
    if problem.driver is None or mob.freedoms != 1 or mob.driven_freedoms != 0:
        out["sweep"] = None
        return out
    w = walk(model)
    ks = sorted(w.samples)
    per_turn = steps_per_turn(problem.sweep.step) if problem.driver.kind == "rotation" else None
    per_cycle = (per_turn * (w.closes_after or 1)) if w.closes_after else len(ks)
    keep = stored_indices(ks, per_cycle)
    speed = abs(problem.driver.speed)
    accel = problem.driver.acceleration

    columns = {
        "k": [],
        "driverTravel": [],
        "condition": [],
        "gammaError": [],
        "points": {p.id: {"pos": [], "vel": [], "acc": []} for p in problem.points},
        "bodies": {b.id: {"angle": [], "omega": [], "alpha": [], "com": [], "comVel": [], "comAcc": []} for b in problem.bodies},
        "sliders": {sl.id: {"travel": [], "rate": [], "acc": []} for sl in problem.sliders},
        "forces": {},
    }
    modes = {"static": False, "dynamic": True}
    for mode in modes:
        columns["forces"][mode] = {"reactions": {}, "couples": {}, "bodyTotals": {}, "effort": [], "residual": []}
    identifiable_everywhere: dict[str, dict] = {m: {} for m in modes}
    d0 = model.constraints_at(w.samples[0])[model.driver_rows[0]]
    for k in keep:
        state = analysis.driven_state(model, w.samples[k], speed, accel)
        columns["k"].append(k)
        columns["driverTravel"].append(_r(model.constraints_at(state.q)[model.driver_rows[0]] - d0))
        columns["condition"].append(_r(state.condition))
        columns["gammaError"].append(_r(state.gamma_error))
        joint_at = {}
        for p in problem.points:
            pos, vel, acc = point_motion(model, state, p.body, p.at)
            joint_at[p.id] = pos
            entry = columns["points"][p.id]
            entry["pos"].append(_rv(pos))
            entry["vel"].append(_rv(vel))
            entry["acc"].append(_rv(acc))
        for pin in problem.pins:
            if pin.id not in joint_at:
                joint_at[pin.id] = point_motion(model, state, pin.bodies[0] if pin.bodies else GROUND, pin.at)[0]
        for slider in problem.sliders:
            joint_at[slider.id] = point_motion(model, state, block_id(slider), slider.at)[0]
        for b in problem.bodies:
            cx, cy, ct = model.bodies[b.id].columns
            entry = columns["bodies"][b.id]
            entry["angle"].append(_r(state.q[ct]))
            entry["omega"].append(_r(state.qd[ct]))
            entry["alpha"].append(_r(state.qdd[ct]))
            entry["com"].append(_rv(np.array(b.com) + state.q[[cx, cy]]))
            entry["comVel"].append(_rv(state.qd[[cx, cy]]))
            entry["comAcc"].append(_rv(state.qdd[[cx, cy]]))
        for slider in problem.sliders:
            travel, rate, acc = slider_travel(model, state, slider)
            entry = columns["sliders"][slider.id]
            entry["travel"].append(_r(travel))
            entry["rate"].append(_r(rate))
            entry["acc"].append(_r(acc))
        for mode, inertial in modes.items():
            reactions, couples, ident, totals, effort, residual = _forces(model, problem, state, joint_at, inertial)
            f = columns["forces"][mode]
            for joint, by_body in reactions.items():
                for body_id, v in by_body.items():
                    f["reactions"].setdefault(joint, {}).setdefault(body_id, []).append(_rv(v))
                    seen = identifiable_everywhere[mode].setdefault(joint, {})
                    seen[body_id] = seen.get(body_id, True) and ident[joint][body_id]
            for joint, by_body in couples.items():
                for body_id, v in by_body.items():
                    f["couples"].setdefault(joint, {}).setdefault(body_id, []).append(_r(v))
            for body_id, v in totals.items():
                f["bodyTotals"].setdefault(body_id, []).append(_rv(v))
            f["effort"].append(None if effort is None else _r(effort))
            f["residual"].append(_r(residual))
    for mode in modes:
        columns["forces"][mode]["identifiable"] = identifiable_everywhere[mode]

    def limit(lim):
        return None if lim is None else {"kind": lim.kind, "travel": _r(lim.travel)}

    out["sweep"] = {
        "driver": {"kind": problem.driver.kind, "joint": problem.driver.joint, "speed": _r(speed), "acceleration": _r(accel)},
        "step": _r(problem.sweep.step),
        "kMin": ks[0],
        "kMax": ks[-1],
        "closesAfterTurns": w.closes_after,
        "high": limit(w.high),
        "low": limit(w.low),
        "initialDrift": _r(w.initial_drift),
        "samples": columns,
    }
    return out


def generator_info(source_sha256: str) -> dict:
    return {
        "oracle": "pmks_oracle",
        "sourceSha256": source_sha256,
        "exudyn": metadata.version("exudyn"),
        "numpy": metadata.version("numpy"),
    }
