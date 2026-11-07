"""Every raw benchmark case against what its source published, or what a closed form derives.

Published numbers are compared at the precision they were printed to: half a
unit in the last printed place, plus 0.2% of the value for a source that
rounded its intermediate results. Derived numbers, which come from this
repository's own closed-form scripts, are compared to 1e-9 relative. The rule
is the same for every case.
"""

from __future__ import annotations

import json
import math
from decimal import Decimal
from pathlib import Path

import pytest

from pmks_oracle.problem import load_problem
from pmks_oracle.reference import solve

CASES = Path(__file__).resolve().parent.parent / "benchmarks" / "cases"
PUBLISHED_ROUNDING_ALLOWANCE = 2e-3
DERIVED_RELATIVE = 1e-9

_solved: dict[str, dict] = {}


def reference(case: str) -> dict:
    if case not in _solved:
        raw = json.loads((CASES / f"{case}.problem.json").read_text())
        _solved[case] = solve(load_problem(raw), {"oracle": "test"})
    return _solved[case]


def _value(check: dict, ref: dict, k: int) -> float:
    s = ref["sweep"]["samples"]
    i = s["k"].index(k)
    if check["quantity"] in ("limit", "lastSample", "closesAfterTurns"):
        i = None
    comp = {"x": 0, "y": 1}
    q = check["quantity"]
    if q == "point":
        v = s["points"][check["point"]][check["of"]][i][comp[check["component"]]]
        return v * 1000 if check.get("unit") == "mm" else v
    if q in ("omega", "alpha"):
        return s["bodies"][check["body"]][q][i]
    if q == "reaction":
        return s["forces"][check["mode"]]["reactions"][check["joint"]][check["body"]][i][comp[check["component"]]]
    if q == "effort":
        return s["forces"][check["mode"]]["effort"][i]
    if q == "couple":
        return s["forces"][check["mode"]]["couples"][check["joint"]][check["body"]][i]
    if q == "bodyTotal":
        return s["forces"][check["mode"]]["bodyTotals"][check["body"]][i][comp[check["component"]]]
    if q == "identifiable":
        return float(s["forces"][check["mode"]]["identifiable"][check["joint"]][check["body"]])
    if q == "limit":
        lim = ref["sweep"][check["end"]]
        assert lim["kind"] == "toggle", lim
        return lim["travel"]
    if q == "closesAfterTurns":
        return float(ref["sweep"]["closesAfterTurns"] or 0)
    if q == "lastSample":
        return float(ref["sweep"]["kMax" if check["end"] == "high" else "kMin"])
    if q in ("redundant", "freedoms"):
        return float(ref["mobility"][q])
    if q == "slideRate":
        return next(iter(s["sliders"].values()))["rate"][i]
    if q == "slideAcceleration":
        return next(iter(s["sliders"].values()))["acc"][i]
    raise ValueError(q)


def _cases():
    for path in sorted(CASES.glob("*.expected.json")):
        case = path.name.removesuffix(".expected.json")
        for n, check in enumerate(json.loads(path.read_text())["checks"]):
            yield pytest.param(case, check, id=f"{case}-{n}-{check['quantity']}")


def _angle(check, ref, k):
    s = ref["sweep"]["samples"]
    i = s["k"].index(k)
    pts = s["points"]
    if check["from"] in pts and check["to"] in pts:
        a, b = pts[check["from"]]["pos"][i], pts[check["to"]]["pos"][i]
    else:
        raise KeyError("lineAngle needs both ends reported as points")
    return math.degrees(math.atan2(b[1] - a[1], b[0] - a[0]))


@pytest.mark.parametrize("case,check", list(_cases()))
def test_benchmark(case, check):
    ref = reference(case)
    expected_file = json.loads((CASES / f"{case}.expected.json").read_text())
    k = check.get("k", expected_file["at"]["k"])
    if check["quantity"] == "lineAngle":
        actual = _angle(check, ref, k)
        target = float(check["value"])
        # Report the angle on the same turn as the source printed it.
        actual = target + math.remainder(actual - target, 360)
    else:
        actual = _value(check, ref, k)
        target = float(check["value"])
    if check["kind"] == "published":
        printed = Decimal(check["value"])
        half_unit = 0.5 * 10 ** printed.as_tuple().exponent
        tolerance = half_unit + PUBLISHED_ROUNDING_ALLOWANCE * abs(target)
    else:
        # A derived zero is compared against the scale of its neighbors: 1e-9 of a newton.
        tolerance = DERIVED_RELATIVE * max(abs(target), 1.0)
    assert abs(actual - target) <= tolerance, f"{case}: {check} gave {actual!r}, off by {actual - target:.3e} (allowed {tolerance:.1e})"



def _bounded(limits: dict[str, list[float]], step: float | None = None) -> dict:
    raw = json.loads((CASES / "metu-double-slider.problem.json").read_text())
    if step is not None:
        raw["sweep"]["step"] = step
    for joint in raw["joints"]:
        if joint["id"] in limits:
            joint["limits"] = limits[joint["id"]]
    return solve(load_problem(raw), {"oracle": "test"})["sweep"]


def test_a_driven_block_stops_at_the_ends_of_its_slot():
    # A starts at x = 0.2 m and runs along x; ends at 0.0995 and 0.3005 m are
    # off the 1 mm grid, so the last stored samples are k = +-100.
    sweep = _bounded({"A": [0.0995, 0.3005]})
    assert sweep["high"]["kind"] == sweep["low"]["kind"] == "slot-end"
    assert sweep["high"]["travel"] == pytest.approx(0.1005, abs=1e-9)
    assert sweep["low"]["travel"] == pytest.approx(-0.1005, abs=1e-9)
    assert (sweep["kMin"], sweep["kMax"]) == (-100, 100)


def test_a_passive_block_stops_the_driver_where_it_reaches_its_end():
    # The 0.5 m bar keeps B at y = sqrt(0.25 - x^2): B reaches y = 0.3 m at
    # x = 0.4 m, and y = 0.49 m at x = sqrt(0.0099) m, short of the toggles
    # at x = 0 and x = 0.5 m that would end the travel without the slot.
    sweep = _bounded({"B": [0.3, 0.49]})
    assert sweep["high"]["kind"] == sweep["low"]["kind"] == "slot-end"
    assert sweep["high"]["travel"] == pytest.approx(0.4 - 0.2, abs=1e-9)
    assert sweep["low"]["travel"] == pytest.approx(math.sqrt(0.0099) - 0.2, abs=1e-9)
    assert sweep["kMax"] == 199
    assert sweep["kMin"] == math.ceil((math.sqrt(0.0099) - 0.2) / 0.001)


def test_a_slot_end_in_the_same_step_as_a_toggle_is_the_limit():
    # On a 50 mm grid, B reaches y = 0.01 m at x = sqrt(0.25 - 0.0001) m in
    # the same step as the toggle at x = 0.5 m. The slot ends first, so the
    # travel stops there and not at the toggle.
    sweep = _bounded({"B": [0.01, 0.49]}, step=0.05)
    assert sweep["high"]["kind"] == "slot-end"
    assert sweep["high"]["travel"] == pytest.approx(math.sqrt(0.25 - 0.01**2) - 0.2, abs=1e-9)


def test_a_slot_end_just_past_a_toggle_in_the_same_step_is_never_reached():
    # The opposite order: B's end at y = -0.001 m lies just past the toggle at
    # x = 0.5 m, where y = 0, within the same 50 mm step. The driver turns
    # before B gets there, so the toggle is the limit.
    sweep = _bounded({"B": [-0.001, 0.49]}, step=0.05)
    assert sweep["high"]["kind"] == "toggle"
    assert sweep["high"]["travel"] == pytest.approx(0.3, abs=1e-9)


def test_a_singular_pose_on_the_grid_stores_no_state():
    # The parallelogram's three cranks lie along the frame at k = 110 and 290:
    # the pose is fine, but its rates are not unique there.
    ref = reference("redundant-parallelogram")
    sweep = ref["sweep"]
    assert sweep["singularPoses"] == [110, 290]
    assert sweep["closesAfterTurns"] == 1
    stored = sweep["samples"]["k"]
    assert not set(stored) & {110, 290}
    for k in stored:
        assert sweep["samples"]["condition"][stored.index(k)] < 1e10, k


def _scaled(raw: dict, factor: float) -> dict:
    """The same machine drawn `factor` times larger: every length scaled, nothing else."""
    out = json.loads(json.dumps(raw))
    for body in out["bodies"]:
        body["com"] = [c * factor for c in body["com"]]
        body["inertia"] *= factor * factor
    for part in out["joints"] + out["points"]:
        part["at"] = [c * factor for c in part["at"]]
    return out


def test_a_singular_pose_is_found_on_a_finer_grid_too():
    # At half a degree a step the cranks lie along the frame at k = 220 and
    # 580. Newton leaves the pose there 2e-8 m off along the direction the
    # singularity frees, so its Jacobian keeps full rank to rounding; judged to
    # the pose's accuracy it does not, and neither state is stored.
    raw = json.loads((CASES / "redundant-parallelogram.problem.json").read_text())
    raw["sweep"]["step"] = math.pi / 360
    sweep = solve(load_problem(raw), {"oracle": "test"})["sweep"]
    assert sweep["singularPoses"] == [220, 580]
    assert not set(sweep["samples"]["k"]) & {220, 580}


def test_a_regular_pose_near_a_singular_one_keeps_its_state_at_any_size():
    # The same half-degree grid on a parallelogram a thousand times smaller.
    # `singularPoses` lists every singular sample on the grid, stored or not,
    # so only the two true singular poses may be in it: k = 210 and 230, five
    # degrees away, are regular and keep their state, positions and all.
    raw = json.loads((CASES / "redundant-parallelogram.problem.json").read_text())
    raw["sweep"]["step"] = math.pi / 360
    for body in raw["bodies"]:
        body["com"] = [c * 1e-3 for c in body["com"]]
        body["inertia"] *= 1e-6
    for item in raw["joints"] + raw["points"]:
        item["at"] = [c * 1e-3 for c in item["at"]]
    sweep = solve(load_problem(raw), {"oracle": "test"})["sweep"]
    assert sweep["singularPoses"] == [220, 580]


def test_angular_accelerations_do_not_depend_on_the_unit_of_length():
    raw = json.loads((CASES / "norton-fourbar.problem.json").read_text())
    small = solve(load_problem(raw), {"oracle": "test"})["sweep"]["samples"]
    large = solve(load_problem(_scaled(raw, 100.0)), {"oracle": "test"})["sweep"]["samples"]
    assert small["k"] == large["k"]
    for body, motion in small["bodies"].items():
        for a, b in zip(motion["alpha"], large["bodies"][body]["alpha"]):
            # Two units in the twelfth stored digit. Before the step was made
            # unit-free, a hundredfold scale moved alpha by 1e-8 relative.
            assert abs(a - b) <= 1e-11 * max(abs(a), 1.0), (body, a, b)
