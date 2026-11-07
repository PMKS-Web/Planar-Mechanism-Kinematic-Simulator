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


def test_a_changed_condition_cannot_excuse_the_rates_it_hides(case):
    # Raising a sample's condition past the comparison limit would stop its
    # rates being compared, so a corrupted rate must not ride in on it.
    problem, reference = case
    other = copy.deepcopy(reference)
    other["sweep"]["samples"]["condition"][0] = 1e15
    other["sweep"]["samples"]["points"]["B"]["vel"][0] = [1e6, 1e6]
    with pytest.raises(agree.Disagreement, match="condition"):
        agree.check(problem, reference, other)


def test_a_condition_may_not_cross_the_comparison_limit(case):
    problem, reference = case
    other = copy.deepcopy(reference)
    condition = other["sweep"]["samples"]["condition"]
    condition[0] = agree.CONDITIONING_LIMIT * (1 - 1e-12)
    near = copy.deepcopy(other)
    near["sweep"]["samples"]["condition"][0] = agree.CONDITIONING_LIMIT * (1 + 1e-12)
    with pytest.raises(agree.Disagreement, match="either side"):
        agree.check(problem, other, near)


def test_two_singular_poses_agree_however_singular(case):
    problem, reference = case
    a, b = copy.deepcopy(reference), copy.deepcopy(reference)
    a["sweep"]["samples"]["condition"][0] = 1e12
    b["sweep"]["samples"]["condition"][0] = 1e16
    agree.check(problem, a, b)


def test_a_newer_generator_reproduces_when_only_its_numbers_are_asked(case):
    problem, reference = case
    other = copy.deepcopy(reference)
    other["generator"]["exudyn"] = "1.13.99"
    with pytest.raises(agree.Disagreement, match="generator"):
        agree.check(problem, reference, other)
    agree.check(problem, reference, other, same_generator=False)


@pytest.mark.parametrize("which", ["first", "second"])
def test_a_column_or_force_mode_left_out_is_a_change(case, which):
    # Either argument may be the incomplete one: a regeneration that drops a
    # column must not be kept as reproduced, nor one that adds it back.
    problem, reference = case

    def cut(edit):
        other = copy.deepcopy(reference)
        edit(other["sweep"]["samples"])
        return (other, reference) if which == "first" else (reference, other)

    with pytest.raises(agree.Disagreement, match="points B columns"):
        agree.check(problem, *cut(lambda s: s["points"]["B"].pop("vel")))
    with pytest.raises(agree.Disagreement, match="force modes"):
        agree.check(problem, *cut(lambda s: s["forces"].pop("dynamic")))
