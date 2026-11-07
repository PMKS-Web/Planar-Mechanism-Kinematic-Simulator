"""The oracle's second-order mobility test, on the cases that tell it apart from rank."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from pmks_oracle import analysis
from pmks_oracle.exudyn_model import ExudynModel
from pmks_oracle.mobility import mobility
from pmks_oracle.problem import load_problem
from pmks_oracle.reference import solve

ROOT = Path(__file__).resolve().parents[2]
CASES = ROOT / "oracle" / "benchmarks" / "cases"
PROBLEMS = ROOT / "src" / "test-data" / "oracle" / "problems"


def _mobility(path: Path):
    model = ExudynModel(load_problem(json.loads(path.read_text())))
    return mobility(model, analysis.newton(model, np.zeros(model.n), None))


def test_a_redundant_support_that_holds_along_the_motion_survives():
    # The third crank repeats what the other two say, at every pose.
    mob = _mobility(CASES / "redundant-parallelogram.problem.json")
    assert (mob.redundant, mob.freedoms, mob.second_order_freedoms) == (1, 1, 1)
    assert mob.second_order_driven_freedoms == 0
    assert mob.second_order_settled


@pytest.mark.parametrize(
    "case, first, second",
    [
        # Each jaw rides two parallel slots at one height: it may turn at first
        # order, and not at second.
        ("gallery.motiongen-gripper.m1", 2, 1),
        # The rod is welded to the block that rides the lever's slanted slot
        # (offsetPivotLeverWeldedRodFixture): rank leaves one freedom, which
        # the second order removes, and PMKS+ reports nothing can move.
        ("gallery.slotted-lever-with-a-rod-that-cannot-tilt.m1", 1, 0),
    ],
)
def test_a_first_order_freedom_that_dies_at_second_order_is_not_counted(case, first, second):
    mob = _mobility(PROBLEMS / f"{case}.problem.json")
    assert (mob.freedoms, mob.second_order_freedoms) == (first, second)
    assert mob.second_order_settled
    # Neither is walked: the slotted lever does not move, and the gripper's
    # dead freedom would leave its poses held too weakly to reproduce.
    raw = json.loads((PROBLEMS / f"{case}.problem.json").read_text())
    assert solve(load_problem(raw), {"oracle": "test"})["sweep"] is None


def test_a_mechanism_without_a_redundant_row_keeps_every_freedom():
    mob = _mobility(CASES / "norton-fourbar.problem.json")
    assert mob.redundant == 0
    assert mob.second_order_freedoms == mob.freedoms == 1


def _flat_parallelogram() -> dict:
    """A parallelogram drawn flat: pivots at x = 0 and 2, moving pins at 1 and 3, all on one line."""
    body = lambda i, com: {"id": i, "mass": 1.0, "inertia": 0.1, "com": com}
    pin = lambda i, at, bodies, grounded=False: {
        "id": i, "kind": "pin", "at": at, "bodies": bodies, "grounded": grounded
    }
    return {
        "schema": "pmks-oracle-problem/1",
        "id": "flat-parallelogram",
        "title": "Parallelogram drawn flat",
        "gravity": 0.0,
        "bodies": [body("2", [0.5, 0]), body("3", [2, 0]), body("4", [2.5, 0])],
        "joints": [
            pin("O2", [0, 0], ["2"], True),
            pin("O4", [2, 0], ["4"], True),
            pin("A", [1, 0], ["2", "3"]),
            pin("B", [3, 0], ["3", "4"]),
        ],
        "driver": {"joint": "O2", "kind": "rotation", "bodies": ["ground", "2"], "speed": 1.0},
        "points": [],
        "sweep": {"step": 0.017453292519943295},
    }


def test_a_bifurcation_is_not_settled_and_is_not_walked():
    # Drawn flat, the parallelogram sits where its two branches cross: the
    # parallelogram motion and the crossed one each survive to second order,
    # two lines rather than a subspace, so no form is definite and the common
    # kernel (empty here) is only a lower bound.
    model = ExudynModel(load_problem(_flat_parallelogram()))
    mob = mobility(model, analysis.newton(model, np.zeros(model.n), None))
    assert mob.freedoms == 2
    assert not mob.second_order_settled
    assert solve(load_problem(_flat_parallelogram()), {"oracle": "test"})["sweep"] is None
