"""Every stored reference balances its power, worked out from the reference alone.

The forces in a reference come out of one linear solve, so they agree with the
equations they were solved from by construction. This test does not use those
equations. It re-reads each published problem and its reference as plain
numbers and checks the energy rate a mechanics textbook would write down:

    driver effort x driver rate + loads . their points' velocities
        + gravity . the centers of mass' velocities  =  d(kinetic energy)/dt

and, in the static mode, with the right-hand side zero (virtual power). An
effort with the wrong sign, a local load not turned with its body, a load
applied at the wrong point or a missing block mass would each break the
balance. Constraint forces do no work and are absent from both sides.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import pytest

ORACLE_DATA = Path(__file__).resolve().parents[2] / "src" / "test-data" / "oracle"
# The stored numbers carry ten significant digits, so a balance of terms that
# cancel can only be checked to about that, relative to the largest term.
RELATIVE = 1e-7
# Above this the inverse dynamics are ill-conditioned and the forces are not
# compared to PMKS+ (CONDITIONING_LIMIT in compare-oracle.ts); they are still
# balanced, but only to the conditioning times the rounding.
CONDITIONING_LIMIT = 1e3
# A machine with no mass and no load still stores rounding noise for its
# powers, around 1e-18 W; nothing below a picowatt is a power to balance.
NO_WORK = 1e-12


def _pairs() -> list[tuple[Path, Path]]:
    pairs = []
    for folder in ("problems", "matlab"):
        for problem in sorted((ORACLE_DATA / folder).glob("*.problem.json")):
            references = ORACLE_DATA / ("references" if folder == "problems" else "matlab")
            pairs.append((problem, references / problem.name.replace(".problem.", ".reference.")))
    return pairs


def _rotate(angle: float, v) -> tuple[float, float]:
    c, s = math.cos(angle), math.sin(angle)
    return (c * v[0] - s * v[1], s * v[0] + c * v[1])


def _dot(a, b) -> float:
    return a[0] * b[0] + a[1] * b[1]


def _balance(problem: dict, reference: dict, mode: str, i: int) -> tuple[float, float]:
    """The power residual at stored state i, and the largest term it is a sum of."""
    s = reference["sweep"]["samples"]
    forces = s["forces"][mode]
    terms: list[float] = []
    bodies = {b["id"]: b for b in problem["bodies"]}

    driver = problem["driver"]
    effort = forces["effort"][i]
    if driver["kind"] == "rotation":
        base, driven = driver["bodies"]
        rate = s["bodies"][driven]["omega"][i] - (0.0 if base == "ground" else s["bodies"][base]["omega"][i])
    else:
        rate = s["sliders"][driver["joint"]]["rate"][i]
    terms.append(effort * rate)

    for load in problem["loads"]:
        body = s["bodies"][load["body"]]
        angle, omega = body["angle"][i], body["omega"][i]
        com_now, com_vel = body["com"][i], body["comVel"][i]
        arm = _rotate(angle, [load["at"][0] - bodies[load["body"]]["com"][0], load["at"][1] - bodies[load["body"]]["com"][1]])
        velocity = (com_vel[0] - omega * arm[1], com_vel[1] + omega * arm[0])
        vector = _rotate(angle, load["vector"]) if load["frame"] == "local" else load["vector"]
        terms.append(_dot(vector, velocity))

    g = problem["gravity"]
    kinetic = 0.0
    for body_id, body in bodies.items():
        motion = s["bodies"][body_id]
        v, a = motion["comVel"][i], motion["comAcc"][i]
        terms.append(-body["mass"] * g * v[1])
        kinetic += body["mass"] * _dot(a, v) + body["inertia"] * motion["alpha"][i] * motion["omega"][i]
    for joint in problem["joints"]:
        if joint["kind"] != "slider" or not joint.get("blockMass"):
            continue
        point = s["points"][joint["id"]]
        v, a = point["vel"][i], point["acc"][i]
        terms.append(-joint["blockMass"] * g * v[1])
        kinetic += joint["blockMass"] * _dot(a, v)

    if mode == "dynamic":
        terms.append(-kinetic)
    return sum(terms), max(abs(t) for t in terms)


@pytest.mark.parametrize("problem_path, reference_path", _pairs(), ids=lambda p: p.name.split(".problem")[0].split(".reference")[0])
def test_power_balances(problem_path: Path, reference_path: Path):
    problem = json.loads(problem_path.read_text())
    reference = json.loads(reference_path.read_text())
    if reference["sweep"] is None:
        pytest.skip("the oracle does not run it")
    s = reference["sweep"]["samples"]
    # Every residual is measured against the largest power anywhere in the
    # machine's cycle: a term near zero at one pose is not a scale.
    balances = []
    for mode in ("static", "dynamic"):
        for i, condition in enumerate(s["condition"]):
            if condition > CONDITIONING_LIMIT or s["forces"][mode]["effort"][i] is None:
                continue
            balances.append((mode, s["k"][i], *_balance(problem, reference, mode, i)))
    scale = max((term for *_, term in balances), default=0.0)
    if scale < NO_WORK:
        pytest.skip("no force does work on it")
    for mode, k, residual, _ in balances:
        assert abs(residual) <= RELATIVE * scale, f"{mode} k={k}: residual {residual:.3e} of {scale:.3e}"
