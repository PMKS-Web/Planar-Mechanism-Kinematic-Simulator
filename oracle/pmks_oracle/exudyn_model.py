"""Builds a Problem as an Exudyn multibody system and evaluates it at any pose.

Exudyn supplies the physics: each body is a planar rigid body with its node at
its center of mass, each joint is one of Exudyn's own constraint objects, and
the mass matrix, the applied forces and the constraint equations with their
Jacobian all come from Exudyn. This module only asks Exudyn for them; the
kinematic analysis that combines them is `analysis.py`.

Exudyn's sign convention, established in spike/exudyn_lambda_sign.py:
M q'' = f + Phi_q^T lambda, so Phi_q^T lambda is the constraint force acting
on the bodies. Coordinates are displacements from the drawn pose.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import exudyn as exu
import numpy as np
from exudyn.itemInterface import (
    CoordinateConstraint,
    LoadForceVector,
    LoadMassProportional,
    MarkerBodiesRelativeTranslationCoordinate,
    MarkerBodyMass,
    MarkerBodyRigid,
    MarkerNodeCoordinate,
    NodePointGround,
    NodeRigidBody2D,
    ObjectGround,
    ObjectJointPrismatic2D,
    ObjectRigidBody2D,
    RevoluteJoint2D,
)

from .problem import GROUND, Problem, SliderJoint


def block_id(slider: SliderJoint) -> str:
    """The id of the body a slider's block becomes. Not a PMKS+ link: it is the slider itself."""
    return f"block:{slider.id}"


@dataclass(frozen=True)
class Constraint:
    """One Exudyn constraint object, and which PMKS+ joint it belongs to."""

    object_number: int
    joint: str
    role: str  # 'pin', 'weld', 'slot', 'driver'
    rows: tuple[int, ...]


@dataclass(frozen=True)
class BodyCoordinates:
    id: str
    columns: tuple[int, int, int]  # x, y, theta of the CoM node
    com: tuple[float, float]
    mass: float
    inertia: float


class ExudynModel:
    def __init__(self, problem: Problem):
        self.problem = problem
        self.system_container = exu.SystemContainer()
        mbs = self.mbs = self.system_container.AddSystem()
        self._ground = mbs.AddObject(ObjectGround())
        ground_node = mbs.AddNode(NodePointGround())
        self._ground_coordinate = mbs.AddMarker(MarkerNodeCoordinate(nodeNumber=ground_node, coordinate=0))
        self._objects: dict[str, int] = {}
        self._nodes: dict[str, int] = {}
        self._com: dict[str, tuple[float, float]] = {}
        self._mass: dict[str, tuple[float, float]] = {}
        self._pending: list[tuple[int, str, str]] = []
        self.driver_object: int | None = None

        for body in problem.bodies:
            self._add_body(body.id, body.com, body.mass, body.inertia)
        for slider in problem.sliders:
            self._add_body(block_id(slider), slider.at, slider.block_mass, 0.0)

        for pin in problem.pins:
            self._add_pin(pin)
        for slider in problem.sliders:
            self._add_slider(slider)
        if problem.driver:
            self._add_driver()
        for load in problem.loads:
            marker = self._point_marker(load.body, load.at)
            mbs.AddLoad(
                LoadForceVector(
                    markerNumber=marker,
                    loadVector=[load.vector[0], load.vector[1], 0.0],
                    bodyFixed=load.frame == "local",
                )
            )
        if problem.gravity:
            for body_id, number in self._objects.items():
                if self._mass[body_id][0] > 0:
                    marker = mbs.AddMarker(MarkerBodyMass(bodyNumber=number))
                    mbs.AddLoad(LoadMassProportional(markerNumber=marker, loadVector=[0.0, -problem.gravity, 0.0]))

        mbs.Assemble()
        self.settings = exu.SimulationSettings()
        self.settings.linearSolver.solverType = exu.LinearSolverType.EXUdense
        # InitializeSolver otherwise writes solution/coordinatesSolution.txt into the working directory.
        self.settings.solution.file.write = False
        self.settings.solution.file.writeInitialValues = False
        self.solver = exu.MainSolverStatic()
        self.solver.InitializeSolver(mbs, self.settings)
        self.n = self.solver.GetODE2size()
        self.m = self.solver.GetAEsize()

        self.bodies: dict[str, BodyCoordinates] = {}
        for body_id, node in self._nodes.items():
            columns = tuple(mbs.systemData.GetNodeLTGODE2(node))
            self.bodies[body_id] = BodyCoordinates(body_id, columns, self._com[body_id], *self._mass[body_id])
        self.constraints = tuple(
            Constraint(number, joint, role, tuple(mbs.systemData.GetObjectLTGAE(number)))
            for number, joint, role in self._pending
        )
        points = [b.com for b in problem.bodies] + [p.at for p in problem.pins] + [s.at for s in problem.sliders]
        xs = [p[0] for p in points] or [0.0]
        ys = [p[1] for p in points] or [0.0]
        self.length_scale = max(max(xs) - min(xs), max(ys) - min(ys), 1e-12)
        self.driver_rows = (
            next(c.rows for c in self.constraints if c.role == "driver") if problem.driver else ()
        )

    # --- construction -------------------------------------------------------

    def _add_body(self, body_id: str, com, mass: float, inertia: float) -> None:
        node = self.mbs.AddNode(NodeRigidBody2D(referenceCoordinates=[com[0], com[1], 0.0]))
        number = self.mbs.AddObject(ObjectRigidBody2D(mass=mass, inertia=inertia, nodeNumber=node))
        self._nodes[body_id] = node
        self._objects[body_id] = number
        self._com[body_id] = (float(com[0]), float(com[1]))
        self._mass[body_id] = (float(mass), float(inertia))

    def _point_marker(self, body_id: str, at) -> int:
        if body_id == GROUND:
            return self.mbs.AddMarker(MarkerBodyRigid(bodyNumber=self._ground, localPosition=[at[0], at[1], 0.0]))
        cx, cy = self._com[body_id]
        return self.mbs.AddMarker(
            MarkerBodyRigid(bodyNumber=self._objects[body_id], localPosition=[at[0] - cx, at[1] - cy, 0.0])
        )

    def _rotation_marker(self, body_id: str) -> int:
        if body_id == GROUND:
            return self._ground_coordinate
        return self.mbs.AddMarker(MarkerNodeCoordinate(nodeNumber=self._nodes[body_id], coordinate=2))

    def _revolute(self, joint: str, a: str, b: str, at) -> None:
        number = self.mbs.AddObject(RevoluteJoint2D(markerNumbers=[self._point_marker(a, at), self._point_marker(b, at)]))
        self._pending.append((number, joint, "pin"))

    def _rotation_lock(self, joint: str, a: str, b: str) -> None:
        # Every body starts at rotation 0, so a weld holds the difference at 0.
        number = self.mbs.AddObject(
            CoordinateConstraint(markerNumbers=[self._rotation_marker(a), self._rotation_marker(b)])
        )
        self._pending.append((number, joint, "weld"))

    def _add_pin(self, pin) -> None:
        bodies = list(pin.bodies)
        if pin.grounded:
            if not bodies:
                return
            self._revolute(pin.id, GROUND, bodies[0], pin.at)
        first = bodies[0] if bodies else None
        for other in bodies[1:]:
            self._revolute(pin.id, first, other, pin.at)
            if pin.welded:
                self._rotation_lock(pin.id, first, other)

    def _add_slider(self, slider: SliderJoint) -> None:
        block = block_id(slider)
        ux, uy = slider.axis
        norm = math.hypot(ux, uy)
        ux, uy = ux / norm, uy / norm
        guide_marker = self._point_marker(slider.guide, slider.line_point)
        block_marker = self._point_marker(block, slider.at)
        # The guide holds the block's rotation, so the normal carried on the
        # block is the guide's normal at every pose.
        number = self.mbs.AddObject(
            ObjectJointPrismatic2D(
                markerNumbers=[guide_marker, block_marker],
                axisMarker0=[ux, uy, 0.0],
                normalMarker1=[-uy, ux, 0.0],
                constrainRotation=True,
            )
        )
        self._pending.append((number, slider.id, "slot"))
        for rider in slider.riders:
            self._revolute(slider.id, block, rider, slider.at)
            if not slider.rotates:
                self._rotation_lock(slider.id, block, rider)

    def _add_driver(self) -> None:
        driver = self.problem.driver
        if driver.kind == "rotation":
            a, b = driver.bodies
            marker0, marker1 = self._rotation_marker(a), self._rotation_marker(b)
        else:
            slider = next(s for s in self.problem.sliders if s.id == driver.joint)
            ux, uy = slider.axis
            norm = math.hypot(ux, uy)
            guide = slider.guide
            lx, ly = slider.line_point
            cx, cy = (0.0, 0.0) if guide == GROUND else self._com[guide]
            guide_number = self._ground if guide == GROUND else self._objects[guide]
            marker1 = self.mbs.AddMarker(
                MarkerBodiesRelativeTranslationCoordinate(
                    bodyNumbers=[guide_number, self._objects[block_id(slider)]],
                    localPosition0=[lx - cx, ly - cy, 0.0],
                    localPosition1=[0.0, 0.0, 0.0],
                    axis0=[ux / norm, uy / norm, 0.0],
                )
            )
            marker0 = self._ground_coordinate
        self.driver_object = self.mbs.AddObject(CoordinateConstraint(markerNumbers=[marker0, marker1]))
        self._pending.append((self.driver_object, driver.joint, "driver"))

    # --- evaluation ---------------------------------------------------------

    def _set(self, q, qd=None) -> None:
        data = self.mbs.systemData
        data.SetODE2Coordinates(list(map(float, q)), configuration=exu.ConfigurationType.Current)
        data.SetODE2Coordinates_t(
            list(map(float, qd if qd is not None else np.zeros(self.n))), configuration=exu.ConfigurationType.Current
        )

    def constraints_at(self, q) -> np.ndarray:
        """Every constraint residual; the driver's row is the driver coordinate itself."""
        self._set(q)
        self.solver.ComputeAlgebraicEquations(self.mbs)
        return np.array(self.solver.GetSystemResidual()[self.n :], dtype=float)

    def jacobian_at(self, q) -> np.ndarray:
        self._set(q)
        # Exudyn adds into the stored matrix rather than overwriting it.
        self.solver.SetSystemJacobian(np.zeros((self.n + self.m, self.n + self.m)))
        self.solver.ComputeJacobianAE(self.mbs)
        return np.array(self.solver.GetSystemJacobian()[self.n :, : self.n], dtype=float)

    def mass_matrix_at(self, q) -> np.ndarray:
        self._set(q)
        self.solver.SetSystemMassMatrix(np.zeros((self.n + self.m, self.n + self.m)))
        self.solver.ComputeMassMatrix(self.mbs)
        return np.array(self.solver.GetSystemMassMatrix(), dtype=float)[: self.n, : self.n]

    def applied_forces_at(self, q, qd) -> np.ndarray:
        self._set(q, qd)
        self.solver.ComputeODE2RHS(self.mbs)
        return np.array(self.solver.GetSystemResidual()[: self.n], dtype=float)

    def pose(self, q, body_id: str) -> tuple[float, float, float]:
        """Centre of mass and rotation from the drawn pose of one body."""
        if body_id == GROUND:
            return (0.0, 0.0, 0.0)
        body = self.bodies[body_id]
        x, y, t = (q[i] for i in body.columns)
        return (body.com[0] + x, body.com[1] + y, t)
