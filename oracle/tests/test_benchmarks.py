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


def test_a_bounded_slot_is_refused_until_its_limits_are_walked():
    raw = json.loads((CASES / "metu-double-slider.problem.json").read_text())
    slider = next(joint for joint in raw["joints"] if joint["kind"] == "slider")
    slider["limits"] = [0.1, 0.3]
    with pytest.raises(NotImplementedError, match="slot limits"):
        solve(load_problem(raw), {"oracle": "test"})
