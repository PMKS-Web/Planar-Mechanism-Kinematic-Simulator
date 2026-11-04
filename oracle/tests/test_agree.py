"""The reproduction check passes rounding and catches a real change."""

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

from pmks_oracle import agree

DATA = Path(__file__).resolve().parents[2] / "src" / "test-data" / "oracle"
CASE = "template.slider-crank.m1"


@pytest.fixture(scope="module")
def case() -> tuple[dict, dict]:
    problem = json.loads((DATA / "problems" / f"{CASE}.problem.json").read_text())
    reference = json.loads((DATA / "references" / f"{CASE}.reference.json").read_text())
    return problem, reference


def test_a_reference_reproduces_itself(case):
    problem, reference = case
    agree.check(problem, reference, copy.deepcopy(reference))


def test_rounding_in_the_last_stored_digit_passes(case):
    problem, reference = case
    other = copy.deepcopy(reference)
    acc = other["sweep"]["samples"]["points"]["B"]["acc"]
    acc[3][0] *= 1 + 5e-10
    other["sweep"]["samples"]["forces"]["dynamic"]["residual"][0] = 1e-3
    agree.check(problem, reference, other)


def test_a_moved_pose_is_a_change(case):
    problem, reference = case
    other = copy.deepcopy(reference)
    other["sweep"]["samples"]["points"]["B"]["pos"][3][0] += 1e-6
    with pytest.raises(agree.Disagreement, match="points B pos"):
        agree.check(problem, reference, other)


def test_a_changed_grid_or_generator_is_a_change(case):
    problem, reference = case
    other = copy.deepcopy(reference)
    other["sweep"]["kMin"] -= 1
    with pytest.raises(agree.Disagreement, match="kMin"):
        agree.check(problem, reference, other)
    other = copy.deepcopy(reference)
    other["generator"]["sourceSha256"] = "0" * 64
    with pytest.raises(agree.Disagreement, match="generator"):
        agree.check(problem, reference, other)
