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


def test_a_mechanism_without_a_redundant_row_keeps_every_freedom():
    mob = _mobility(CASES / "norton-fourbar.problem.json")
    assert mob.redundant == 0
    assert mob.second_order_freedoms == mob.freedoms == 1
