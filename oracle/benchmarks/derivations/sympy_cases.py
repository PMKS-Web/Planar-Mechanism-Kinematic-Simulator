"""Closed-form benchmark cases for what no textbook example here covers, derived with SymPy.

Writes, for each case, the problem file the oracle solves and the expected
values it must reproduce. Every expected number is the closed form evaluated
here, by hand-written Newton-Euler or by differentiating an explicit position
law; nothing is taken from the oracle or from PMKS+.

    uv run python benchmarks/derivations/sympy_cases.py

Cases:
- scotch-yoke: a crank pin in a slot cut in a yoke (a floating slot), the yoke
  on a grounded guide it may not turn on (a Slide), masses and gravity.
- inverted-slider-crank: a crank pin riding a slot through a rotating link.
- redundant-parallelogram: a parallelogram with a third, redundant crank, where
  equilibrium fixes the driving torque and the coupler's total load but not
  how the three crank pins share it.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

import sympy as sp

CASES = Path(__file__).resolve().parent.parent / "cases"
t = sp.symbols("t", real=True)
G = 9.81


def write(case: str, problem: dict, checks: list[dict]) -> None:
    problem = {"schema": "pmks-oracle-problem/1", "id": case, **problem}
    (CASES / f"{case}.problem.json").write_text(json.dumps(problem, indent=2) + "\n")
    expected = {
        "sources": {"derived": "benchmarks/derivations/sympy_cases.py"},
        "at": {"k": 0},
        "checks": checks,
    }
    (CASES / f"{case}.expected.json").write_text(json.dumps(expected, indent=2) + "\n")


def derived(quantity: str, value, **selector) -> dict:
    return {"quantity": quantity, "value": float(value), "kind": "derived", **selector}


def scotch_yoke() -> None:
    r, w, m2, I2, m4, th0 = 0.05, 12.0, 0.4, 2e-4, 1.5, math.radians(35)
    th = th0 + w * t
    A = sp.Matrix([r * sp.cos(th), r * sp.sin(th)])
    yoke_x = r * sp.cos(th) + 0.1  # the yoke's center rides 0.1 m right of the pin's x
    yoke_y = 0.0
    ax = sp.diff(yoke_x, t, 2)
    # Yoke: the pin pushes it only along x (the slot is vertical); the guide
    # supplies the vertical force and the couple.
    fx = m4 * ax  # force of the pin on the yoke
    normal = m4 * G
    couple = (A[1] - yoke_y) * fx  # about the yoke's center, where its guide joint is
    # Crank, CoM at r/2, constant speed: moments about O2 sum to zero,
    # T + A x (-fx, 0) + (A/2) x (0, -m2 g) = 0.
    torque = -A[1] * fx + (r / 2) * sp.cos(th) * m2 * G
    a_g2 = sp.diff(A / 2, t, 2)
    f12 = m2 * a_g2 + sp.Matrix([fx, m2 * G])
    at0 = {t: 0}
    a0 = [float(v.subs(at0)) for v in A]
    yx0 = float(yoke_x.subs(at0))
    problem = {
        "title": "Scotch yoke: crank pin in a vertical slot on a yoke that slides without turning",
        "source": {"derived": "benchmarks/derivations/sympy_cases.py"},
        "gravity": G,
        "bodies": [
            {"id": "2", "mass": m2, "inertia": I2, "com": [a0[0] / 2, a0[1] / 2]},
            {"id": "4", "mass": m4, "inertia": 0.01, "com": [yx0, 0.0]},
        ],
        "joints": [
            {"id": "O2", "kind": "pin", "at": [0, 0], "bodies": ["2"], "grounded": True},
            {"id": "A", "kind": "slider", "at": a0, "guide": "4", "linePoint": [a0[0], 0.0], "axis": [0, 1], "riders": ["2"]},
            {"id": "S", "kind": "slider", "at": [yx0, 0.0], "guide": "ground", "linePoint": [0, 0], "axis": [1, 0], "riders": ["4"], "rotates": False},
        ],
        "driver": {"joint": "O2", "kind": "rotation", "bodies": ["ground", "2"], "speed": w},
        "points": [{"id": "A", "body": "2", "at": a0}, {"id": "S", "body": "4", "at": [yx0, 0.0]}],
        "sweep": {"step": math.radians(1)},
    }
    checks = [
        derived("point", ax.subs(at0), point="S", component="x", of="acc"),
        derived("reaction", fx.subs(at0), mode="dynamic", joint="A", body="4", component="x"),
        derived("reaction", 0.0, mode="dynamic", joint="A", body="4", component="y"),
        derived("reaction", -fx.subs(at0), mode="dynamic", joint="A", body="2", component="x"),
        derived("reaction", normal, mode="dynamic", joint="S", body="4", component="y"),
        derived("reaction", 0.0, mode="dynamic", joint="S", body="4", component="x"),
        derived("couple", couple.subs(at0), mode="dynamic", joint="S", body="4"),
        derived("reaction", f12[0].subs(at0), mode="dynamic", joint="O2", body="2", component="x"),
        derived("reaction", f12[1].subs(at0), mode="dynamic", joint="O2", body="2", component="y"),
        derived("effort", torque.subs(at0), mode="dynamic"),
        derived("identifiable", 1, mode="dynamic", joint="S", body="4"),
        derived("closesAfterTurns", 1),
    ]
    write("scotch-yoke", problem, checks)


def inverted_slider_crank() -> None:
    r, d, w, m2, I4, th0 = 0.04, 0.10, 8.0, 0.3, 3e-3, math.radians(60)
    th = th0 + w * t
    A = sp.Matrix([r * sp.cos(th), r * sp.sin(th)])
    O4 = sp.Matrix([d, 0])
    rel = A - O4
    th4 = sp.atan2(rel[1], rel[0])
    w4, al4 = sp.diff(th4, t), sp.diff(th4, t, 2)
    s_len = sp.sqrt(rel.dot(rel))
    s_dot, s_ddot = sp.diff(s_len, t), sp.diff(s_len, t, 2)
    # Link 4 has its CoM on its pivot: the slot's normal force N on it at A
    # balances I4 * alpha4 about O4. The pin is frictionless along the slot.
    n_hat = sp.Matrix([-sp.sin(th4), sp.cos(th4)])
    normal = I4 * al4 / s_len  # force of the pin on link 4, along n_hat
    # Crank at constant speed, CoM at r/2, no gravity: torque balances the pin's push.
    on_crank = -normal * n_hat
    torque = -(A[0] * on_crank[1] - A[1] * on_crank[0])
    at0 = {t: 0}
    a0 = [float(v.subs(at0)) for v in A]
    problem = {
        "title": "Inverted slider-crank: crank pin riding a slot through a rotating link",
        "source": {"derived": "benchmarks/derivations/sympy_cases.py"},
        "gravity": 0,
        "bodies": [
            {"id": "2", "mass": m2, "inertia": 1e-4, "com": [a0[0] / 2, a0[1] / 2]},
            {"id": "4", "mass": 0.8, "inertia": I4, "com": [d, 0.0]},
        ],
        "joints": [
            {"id": "O2", "kind": "pin", "at": [0, 0], "bodies": ["2"], "grounded": True},
            {"id": "O4", "kind": "pin", "at": [d, 0], "bodies": ["4"], "grounded": True},
            {"id": "A", "kind": "slider", "at": a0, "guide": "4", "linePoint": [d, 0.0], "axis": [a0[0] - d, a0[1]], "riders": ["2"]},
        ],
        "driver": {"joint": "O2", "kind": "rotation", "bodies": ["ground", "2"], "speed": w},
        "points": [{"id": "A", "body": "2", "at": a0}, {"id": "O4", "body": "ground", "at": [d, 0.0]}],
        "sweep": {"step": math.radians(1)},
    }
    rel_v = [sp.diff(c, t) for c in A]
    checks = [
        derived("omega", w4.subs(at0), body="4"),
        derived("alpha", al4.subs(at0), body="4"),
        derived("point", rel_v[0].subs(at0), point="A", component="x", of="vel"),
        derived("reaction", (normal * n_hat)[0].subs(at0), mode="dynamic", joint="A", body="4", component="x"),
        derived("reaction", (normal * n_hat)[1].subs(at0), mode="dynamic", joint="A", body="4", component="y"),
        derived("effort", torque.subs(at0), mode="dynamic"),
        derived("slideRate", s_dot.subs(at0)),
        derived("slideAcceleration", s_ddot.subs(at0)),
    ]
    write("inverted-slider-crank", problem, checks)


def redundant_parallelogram() -> None:
    r, L, w, m3, th0 = 0.03, 0.12, 6.0, 0.9, math.radians(70)
    th = th0 + w * t
    c, s = sp.cos(th), sp.sin(th)
    # The coupler translates: every point of it moves on a circle of radius r.
    a_coupler = sp.Matrix([sp.diff(r * c, t, 2), sp.diff(r * s, t, 2)])
    total_on_coupler = m3 * a_coupler + sp.Matrix([0, m3 * G])
    # The idle cranks are massless two-force members along (c, s); only the
    # driven crank can carry the weight's component across the cranks.
    torque = m3 * G * r * c
    at0 = {t: 0}
    quarter = {t: (math.pi / 2) / w}
    c0, s0 = math.cos(th0), math.sin(th0)
    A, B, C = [r * c0, r * s0], [L + r * c0, r * s0], [L / 2 + r * c0, r * s0]
    problem = {
        "title": "Parallelogram with a redundant third crank",
        "source": {"derived": "benchmarks/derivations/sympy_cases.py"},
        "gravity": G,
        "bodies": [
            {"id": "2", "mass": 0.0, "inertia": 0.0, "com": [A[0] / 2, A[1] / 2]},
            {"id": "3", "mass": m3, "inertia": 2e-3, "com": [(A[0] + B[0]) / 2, A[1]]},
            {"id": "4", "mass": 0.0, "inertia": 0.0, "com": [L + A[0] / 2, A[1] / 2]},
            {"id": "6", "mass": 0.0, "inertia": 0.0, "com": [L / 2 + A[0] / 2, A[1] / 2]},
        ],
        "joints": [
            {"id": "O2", "kind": "pin", "at": [0, 0], "bodies": ["2"], "grounded": True},
            {"id": "O4", "kind": "pin", "at": [L, 0], "bodies": ["4"], "grounded": True},
            {"id": "O6", "kind": "pin", "at": [L / 2, 0], "bodies": ["6"], "grounded": True},
            {"id": "A", "kind": "pin", "at": A, "bodies": ["2", "3"]},
            {"id": "B", "kind": "pin", "at": B, "bodies": ["3", "4"]},
            {"id": "C", "kind": "pin", "at": C, "bodies": ["3", "6"]},
        ],
        "driver": {"joint": "O2", "kind": "rotation", "bodies": ["ground", "2"], "speed": w},
        "points": [{"id": "A", "body": "2", "at": A}, {"id": "C", "body": "3", "at": C}],
        "sweep": {"step": math.radians(1)},
    }
    checks = [
        derived("redundant", 1),
        derived("freedoms", 1),
        derived("point", a_coupler[0].subs(at0), point="C", component="x", of="acc"),
        derived("bodyTotal", total_on_coupler[0].subs(at0), mode="dynamic", body="3", component="x"),
        derived("bodyTotal", total_on_coupler[1].subs(at0), mode="dynamic", body="3", component="y"),
        derived("effort", torque.subs(at0), mode="dynamic"),
        derived("identifiable", 0, mode="dynamic", joint="B", body="3"),
        derived("identifiable", 0, mode="dynamic", joint="C", body="3"),
        # A quarter turn on, and the closure: the redundant crank must not read as a singularity.
        derived("point", a_coupler[0].subs(quarter), point="C", component="x", of="acc", k=90),
        derived("effort", torque.subs(quarter), mode="dynamic", k=90),
        derived("closesAfterTurns", 1),
    ]
    write("redundant-parallelogram", problem, checks)


def non_grashof_rocker() -> None:
    """Input limits where coupler and rocker line up: |A - O4| = b + c gives cos(t2) = (a^2 + d^2 - (b + c)^2) / (2 a d)."""
    a, b, c, d, start = 0.07, 0.04, 0.06, 0.10, math.radians(20)
    limit = math.acos((a * a + d * d - (b + c) ** 2) / (2 * a * d))
    A = [a * math.cos(start), a * math.sin(start)]
    O4 = [d, 0.0]
    dist = math.dist(A, O4)
    # B on the side above the line from A to O4, which is the branch drawn.
    x = (b * b - c * c + dist * dist) / (2 * dist)
    h = math.sqrt(b * b - x * x)
    ux, uy = (O4[0] - A[0]) / dist, (O4[1] - A[1]) / dist
    B = [A[0] + ux * x - uy * h, A[1] + uy * x + ux * h]
    problem = {
        "title": "Non-Grashof four-bar: the input rocks between two toggles",
        "source": {"derived": "benchmarks/derivations/sympy_cases.py"},
        "gravity": 0,
        "bodies": [
            {"id": "2", "mass": 0.2, "inertia": 1e-4, "com": [A[0] / 2, A[1] / 2]},
            {"id": "3", "mass": 0.2, "inertia": 1e-4, "com": [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]},
            {"id": "4", "mass": 0.2, "inertia": 1e-4, "com": [(O4[0] + B[0]) / 2, B[1] / 2]},
        ],
        "joints": [
            {"id": "O2", "kind": "pin", "at": [0, 0], "bodies": ["2"], "grounded": True},
            {"id": "A", "kind": "pin", "at": A, "bodies": ["2", "3"]},
            {"id": "B", "kind": "pin", "at": B, "bodies": ["3", "4"]},
            {"id": "O4", "kind": "pin", "at": O4, "bodies": ["4"], "grounded": True},
        ],
        "driver": {"joint": "O2", "kind": "rotation", "bodies": ["ground", "2"], "speed": 3.0},
        "points": [{"id": "A", "body": "2", "at": A}, {"id": "B", "body": "3", "at": B}],
        "sweep": {"step": math.radians(1)},
    }
    checks = [
        derived("limit", limit - start, end="high"),
        derived("limit", -limit - start, end="low"),
        derived("lastSample", math.floor(math.degrees(limit - start)), end="high"),
        derived("lastSample", -math.floor(math.degrees(limit + start)), end="low"),
    ]
    write("non-grashof-rocker", problem, checks)


if __name__ == "__main__":
    scotch_yoke()
    inverted_slider_crank()
    redundant_parallelogram()
    non_grashof_rocker()
