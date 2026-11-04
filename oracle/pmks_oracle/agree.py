"""Whether two references for one problem say the same thing.

The oracle is deterministic on one platform, to the byte. Across platforms it is
not: BLAS and LAPACK round differently on macOS and Linux, so a number that is
physically zero comes out as 1e-17 on one and -1e-17 on the other, and the
tenth digit of an ordinary one can move. A reference is therefore checked for
reproduction by its numbers, each measured against the machine's own scale the
way the PMKS+ comparison measures errors (`compare-oracle.ts`): lengths against
the machine's size L, speeds against L*Omega, accelerations against L*Omega^2,
forces against the largest force in the machine, moments against that times L.

Everything that is not a measured number must be equal: the sample grid, the
kinds of limit, which reactions are identifiable, the mobility counts. Two
columns are not compared at all, `gammaError` and `residual`: they measure the
oracle's own rounding, and rounding is exactly what differs.
"""

from __future__ import annotations

import math

# Ten stored significant digits: the last one may round either way.
LAST_DIGIT = 1e-9
# What each kind of number must reproduce to, as a fraction of its scale: one
# hundredth of the budget PMKS+ is held to for it (BUDGETS in compare-oracle.ts,
# FORCE_BUDGETS in compare-oracle-forces.ts), so that rounding on one platform
# can never turn a pass into a fail on another.
REPRODUCE = {"position": 1e-9, "velocity": 1e-9, "acceleration": 1e-7, "force": 1e-10}
# Above this condition number PMKS+ is compared in its poses only
# (CONDITIONING_LIMIT in compare-oracle.ts), so only poses need to reproduce.
CONDITIONING_LIMIT = 1e3
# A force scale below this is rounding in a machine nothing loads.
FORCE_FLOOR = 1e-6
# A condition number this large is a singular pose on either platform, and how
# large is rounding (SINGULAR_RATIO in sweep.py).
SINGULAR_CONDITION = 1e10
# However near a toggle, a condition number must reproduce to this fraction of
# itself, so that a changed one cannot excuse the rates it stops comparing.
CONDITION_AT_MOST = 1e-3

# The scale each stored column is measured against, and its order.
_COLUMN = {
    ("points", "pos"): ("length", "position"),
    ("points", "vel"): ("speed", "velocity"),
    ("points", "acc"): ("acceleration", "acceleration"),
    ("bodies", "angle"): ("angle", "position"),
    ("bodies", "omega"): ("omega", "velocity"),
    ("bodies", "alpha"): ("alpha", "acceleration"),
    ("bodies", "com"): ("length", "position"),
    ("bodies", "comVel"): ("speed", "velocity"),
    ("bodies", "comAcc"): ("acceleration", "acceleration"),
    ("sliders", "travel"): ("length", "position"),
    ("sliders", "rate"): ("speed", "velocity"),
    ("sliders", "acc"): ("acceleration", "acceleration"),
}


class Disagreement(Exception):
    pass


def _length(problem: dict) -> float:
    points = [p["at"] for p in problem["points"]] + [b["com"] for b in problem["bodies"]]
    longest = max((math.dist(a, b) for a in points for b in points), default=0.0)
    return longest or 1.0


def _largest_force(sweep: dict) -> float:
    largest = 0.0
    for forces in sweep["samples"]["forces"].values():
        for series in forces["bodyTotals"].values():
            largest = max(largest, *(math.hypot(*v) for v in series))
        for by_body in forces["reactions"].values():
            for series in by_body.values():
                largest = max(largest, *(math.hypot(*v) for v in series))
    return largest


def _scales(problem: dict, a: dict, b: dict) -> dict[str, float]:
    length = _length(problem)
    driver = a["sweep"]["driver"]
    speed = abs(driver["speed"])
    rate = (speed / length if driver["kind"] == "translation" else speed) or 1.0
    force = max(_largest_force(a["sweep"]), _largest_force(b["sweep"]), FORCE_FLOOR)
    return {
        "length": length,
        "speed": length * rate,
        "acceleration": length * rate * rate,
        "angle": 1.0,
        "omega": rate,
        "alpha": rate * rate,
        "force": force,
        "moment": force * length,
        "effort": force * length if driver["kind"] == "rotation" else force,
        "travel": length if driver["kind"] == "translation" else 1.0,
    }


def _same(where: str, x, y) -> None:
    if x != y:
        raise Disagreement(f"{where}: {x!r} against {y!r}")


def _close(where: str, x, y, tolerance: float) -> None:
    if x is None or y is None:
        _same(where, x, y)
        return
    if isinstance(x, list):
        _same(f"{where} length", len(x), len(y))
        for i, (u, v) in enumerate(zip(x, y)):
            _close(f"{where}[{i}]", u, v, tolerance)
        return
    if abs(x - y) > tolerance + LAST_DIGIT * max(abs(x), abs(y)):
        raise Disagreement(f"{where}: {x!r} against {y!r}, more than {tolerance:.1e} apart")


def _series(where: str, x: list, y: list, scale: float, order: str, conditions: list[float]) -> None:
    _same(f"{where} samples", len(x), len(y))
    for i, (u, v) in enumerate(zip(x, y)):
        if order != "position" and conditions[i] > CONDITIONING_LIMIT:
            continue
        _close(f"{where}[{i}]", u, v, REPRODUCE[order] * scale)


def _condition(where: str, u: float, v: float) -> None:
    """Two condition numbers for one pose, which decide which of its numbers are compared."""
    if min(u, v) > SINGULAR_CONDITION:
        return
    # A condition number is a ratio of singular values; near a toggle the
    # small one is itself rounding-sized, so the ratio is known only to about
    # its own size times the rounding, and never looser than CONDITION_AT_MOST.
    tolerance = min(max(u, v) ** 2 * 1e-14, CONDITION_AT_MOST * min(u, v))
    if abs(u - v) > tolerance:
        raise Disagreement(f"{where}: {u!r} against {v!r}, more than {tolerance:.1e} apart")
    if (u > CONDITIONING_LIMIT) != (v > CONDITIONING_LIMIT):
        raise Disagreement(f"{where}: {u!r} against {v!r}, either side of {CONDITIONING_LIMIT:.0e}")


def check(problem: dict, a: dict, b: dict, same_generator: bool = True) -> None:
    """Raise Disagreement unless reference `b` reproduces reference `a` for `problem`.

    With `same_generator` false the generator may differ, as it does when the
    upstream nightly solves with a newer Exudyn: only the numbers are compared.
    """
    for key in ("schema", "problem", "problemSha256") + (("generator",) if same_generator else ()):
        _same(key, a[key], b[key])
    ma, mb = a["mobility"], b["mobility"]
    _same("mobility keys", sorted(ma), sorted(mb))
    for key in ma:
        if key == "smallest_singular_values":
            _close("mobility smallest singular values", ma[key], mb[key], REPRODUCE["position"])
        else:
            _same(f"mobility {key}", ma[key], mb[key])
    _same("whether it runs", a["sweep"] is None, b["sweep"] is None)
    if a["sweep"] is None:
        return
    sa, sb = a["sweep"], b["sweep"]
    scales = _scales(problem, a, b)
    for key in ("driver", "step", "kMin", "kMax", "closesAfterTurns", "singularPoses"):
        _same(key, sa[key], sb[key])
    for end in ("high", "low"):
        _same(f"{end} limit", sa[end] is None, sb[end] is None)
        if sa[end] is not None:
            _same(f"{end} limit kind", sa[end]["kind"], sb[end]["kind"])
            travel = REPRODUCE["position"] * scales["travel"]
            _close(f"{end} limit travel", sa[end]["travel"], sb[end]["travel"], travel)
    drift = REPRODUCE["position"] * scales["length"]
    _close("initial drift", sa["initialDrift"], sb["initialDrift"], drift)

    xa, xb = sa["samples"], sb["samples"]
    _same("columns", sorted(xa), sorted(xb))
    _same("grid", xa["k"], xb["k"])
    _same("gammaError samples", len(xa["gammaError"]), len(xb["gammaError"]))
    conditions = [max(u, v) for u, v in zip(xa["condition"], xb["condition"])]
    for i, (u, v) in enumerate(zip(xa["condition"], xb["condition"])):
        _condition(f"condition[{i}]", u, v)
    _series("driverTravel", xa["driverTravel"], xb["driverTravel"], scales["travel"], "position", conditions)
    for group in ("points", "bodies", "sliders"):
        _same(f"{group} ids", sorted(xa[group]), sorted(xb[group]))
        for part, columns in xa[group].items():
            for column, series in columns.items():
                scale, order = _COLUMN[(group, column)]
                _series(f"{group} {part} {column}", series, xb[group][part][column], scales[scale], order, conditions)
    for mode, fa in xa["forces"].items():
        fb = xb["forces"][mode]
        _same(f"{mode} force columns", sorted(fa), sorted(fb))
        _same(f"{mode} identifiable", fa["identifiable"], fb["identifiable"])
        _same(f"{mode} residual samples", len(fa["residual"]), len(fb["residual"]))
        for column, scale in (("reactions", "force"), ("couples", "moment")):
            _same(f"{mode} {column} joints", sorted(fa[column]), sorted(fb[column]))
            for joint, by_body in fa[column].items():
                _same(f"{mode} {column} {joint} bodies", sorted(by_body), sorted(fb[column][joint]))
                for body, series in by_body.items():
                    other = fb[column][joint][body]
                    _series(f"{mode} {column} {joint}/{body}", series, other, scales[scale], "force", conditions)
        _same(f"{mode} body ids", sorted(fa["bodyTotals"]), sorted(fb["bodyTotals"]))
        for body, series in fa["bodyTotals"].items():
            other = fb["bodyTotals"][body]
            _series(f"{mode} total on {body}", series, other, scales["force"], "force", conditions)
        _series(f"{mode} effort", fa["effort"], fb["effort"], scales["effort"], "force", conditions)
