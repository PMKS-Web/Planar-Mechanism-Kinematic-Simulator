"""The neutral problem a reference is solved from: schema pmks-oracle-problem/1.

Everything is in SI (metres, kilograms, newtons, radians, seconds) and in the
pose the mechanism is drawn in. Nothing here describes how PMKS+ solves a
mechanism; it describes the mechanism, the way a textbook problem statement
does, so a hand-written benchmark and an exported fixture read the same.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from typing import Literal

SCHEMA = "pmks-oracle-problem/1"
GROUND = "ground"

Vec = tuple[float, float]


@dataclass(frozen=True)
class Body:
    id: str
    mass: float
    inertia: float  # about the center of mass, kg*m^2
    com: Vec  # in the drawn pose


@dataclass(frozen=True)
class PinJoint:
    """Bodies sharing one point. `welded` fuses them; `grounded` pins the point to the frame.

    A grounded welded joint fuses its bodies to one another and pins the fused
    body to the frame: welding never fixes anything to ground.
    """

    id: str
    at: Vec
    bodies: tuple[str, ...]
    grounded: bool = False
    welded: bool = False


@dataclass(frozen=True)
class SliderJoint:
    """A block on a straight slot, carrying riders.

    The slot is the line through `line_point` along `axis` on the guide (the
    frame, or a body for a floating slot). The block is at `at`. `rotates`
    false makes a Slide: the riders keep the slot's angle. `limits` are the
    slot's ends as travel along `axis` from `line_point`, if it has any.
    """

    id: str
    at: Vec
    guide: str
    line_point: Vec
    axis: Vec
    riders: tuple[str, ...]
    rotates: bool = True
    block_mass: float = 0.0
    limits: tuple[float, float] | None = None


@dataclass(frozen=True)
class Driver:
    """What moves the mechanism, at a constant rate.

    `rotation`: the relative angle of `bodies[1]` against `bodies[0]` at pin
    `joint`, rad/s, counterclockwise positive. `translation`: the block of
    slider `joint` along its axis, m/s.
    """

    joint: str
    kind: Literal["rotation", "translation"]
    speed: float
    bodies: tuple[str, str] | None = None
    # Benchmarks only: PMKS+ always drives at constant speed, but a textbook
    # problem may not, and its accelerations are only checkable with it.
    acceleration: float = 0.0


@dataclass(frozen=True)
class Load:
    id: str
    body: str
    at: Vec
    vector: Vec  # newtons, in the drawn pose
    frame: Literal["global", "local"] = "global"


@dataclass(frozen=True)
class Point:
    """A point to report the motion of: a joint, a tracer, a load's point."""

    id: str
    body: str
    at: Vec


@dataclass(frozen=True)
class Sweep:
    step: float  # driver travel between samples: rad or m
    max_samples: int = 2000


@dataclass(frozen=True)
class Problem:
    id: str
    gravity: float  # m/s^2 along -y; 0 for none
    bodies: tuple[Body, ...]
    pins: tuple[PinJoint, ...]
    sliders: tuple[SliderJoint, ...]
    driver: Driver | None
    loads: tuple[Load, ...]
    points: tuple[Point, ...]
    sweep: Sweep
    raw: dict = field(repr=False, compare=False, hash=False, default_factory=dict)

    def body(self, body_id: str) -> Body:
        return next(b for b in self.bodies if b.id == body_id)

    @property
    def sha256(self) -> str:
        return problem_sha256(self.raw)


def problem_sha256(raw: dict) -> str:
    """Hash of the canonical problem: sorted keys, no whitespace, shortest float repr."""
    canonical = json.dumps(raw, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _vec(value) -> Vec:
    if not (isinstance(value, list) and len(value) == 2):
        raise ValueError(f"expected [x, y], got {value!r}")
    return (float(value[0]), float(value[1]))


def load_problem(raw: dict) -> Problem:
    if raw.get("schema") != SCHEMA:
        raise ValueError(f"unknown problem schema {raw.get('schema')!r}; this reader speaks {SCHEMA}")
    bodies = tuple(
        Body(b["id"], float(b["mass"]), float(b["inertia"]), _vec(b["com"])) for b in raw["bodies"]
    )
    ids = {b.id for b in bodies}
    if GROUND in ids:
        raise ValueError("no body may be called 'ground'")

    def known(body_id: str, where: str) -> str:
        if body_id != GROUND and body_id not in ids:
            raise ValueError(f"{where} names unknown body {body_id!r}")
        return body_id

    pins = []
    sliders = []
    for joint in raw["joints"]:
        kind = joint["kind"]
        if kind == "pin":
            pins.append(
                PinJoint(
                    joint["id"],
                    _vec(joint["at"]),
                    tuple(known(b, joint["id"]) for b in joint["bodies"]),
                    bool(joint.get("grounded", False)),
                    bool(joint.get("welded", False)),
                )
            )
        elif kind == "slider":
            limits = joint.get("limits")
            sliders.append(
                SliderJoint(
                    joint["id"],
                    _vec(joint["at"]),
                    known(joint["guide"], joint["id"]),
                    _vec(joint["linePoint"]),
                    _vec(joint["axis"]),
                    tuple(known(b, joint["id"]) for b in joint["riders"]),
                    bool(joint.get("rotates", True)),
                    float(joint.get("blockMass", 0.0)),
                    (float(limits[0]), float(limits[1])) if limits else None,
                )
            )
        else:
            raise ValueError(f"unknown joint kind {kind!r}")
    driver = None
    if raw.get("driver"):
        d = raw["driver"]
        driver = Driver(
            d["joint"],
            d["kind"],
            float(d["speed"]),
            tuple(known(b, "driver") for b in d["bodies"]) if d.get("bodies") else None,
            float(d.get("acceleration", 0.0)),
        )
    loads = tuple(
        Load(f["id"], known(f["body"], f["id"]), _vec(f["at"]), _vec(f["vector"]), f.get("frame", "global"))
        for f in raw.get("loads", [])
    )
    points = tuple(Point(p["id"], known(p["body"], p["id"]), _vec(p["at"])) for p in raw.get("points", []))
    sweep = Sweep(float(raw["sweep"]["step"]), int(raw["sweep"].get("maxSamples", 2000)))
    return Problem(
        raw["id"], float(raw.get("gravity", 0.0)), bodies, tuple(pins), tuple(sliders), driver, loads, points, sweep, raw
    )
