"""Phase 0 trial: Simbody (through OpenSim 4.5) on the Norton four-bar at theta2 = 40 deg, omega2 = 25, alpha2 = 0.

Run: micromamba run -n pmks-oracle-opensim python spike/simbody_fourbar.py
"""
import math, cmath
import opensim as osim

a, b, c, d = 0.040, 0.120, 0.080, 0.100
t2 = math.radians(40)
A = cmath.rect(a, t2); O4 = complex(d, 0); D = abs(O4 - A)
x = (b*b - c*c + D*D) / (2*D); h = math.sqrt(b*b - x*x); u = (O4 - A) / D
B = A + u*x + 1j*u*h
t3 = cmath.phase(B - A); t4 = cmath.phase(B - O4)

V = lambda *v: osim.Vec3(*v)
model = osim.Model(); model.setGravity(V(0, 0, 0))
ground = model.getGround()
def body(name, length):
    # Inertia about the CoM, as in the Exudyn problem.
    bd = osim.Body(name, 1.0, V(length / 2, 0, 0), osim.Inertia(1e-3, 1e-3, 1e-3)); model.addBody(bd); return bd
crank, coupler, rocker = body("crank", a), body("coupler", b), body("rocker", c)
# Pin joints rotate about Z; each body's frame lies along it from its first end.
j2 = osim.PinJoint("j2", ground, V(0, 0, 0), V(0, 0, 0), crank, V(0, 0, 0), V(0, 0, 0))
jA = osim.PinJoint("jA", crank, V(a, 0, 0), V(0, 0, 0), coupler, V(0, 0, 0), V(0, 0, 0))
j4 = osim.PinJoint("j4", ground, V(d, 0, 0), V(0, 0, 0), rocker, V(0, 0, 0), V(0, 0, 0))
for j in (j2, jA, j4): model.addJoint(j)
close = osim.PointConstraint(coupler, V(b, 0, 0), rocker, V(c, 0, 0)); model.addConstraint(close)
q2 = j2.upd_coordinates(0); q2.setDefaultValue(t2)
q2.setPrescribedFunction(osim.LinearFunction(25.0, t2)); q2.setDefaultIsPrescribed(True)
jA.upd_coordinates(0).setDefaultValue(t3 - t2); j4.upd_coordinates(0).setDefaultValue(t4)
state = model.initSystem()
model.assemble(state)
model.realizeAcceleration(state)
def ang(j): return j.getCoordinate().getValue(state)
w3 = j2.getCoordinate().getSpeedValue(state) + jA.getCoordinate().getSpeedValue(state)
w4 = j4.getCoordinate().getSpeedValue(state)
al3 = j2.getCoordinate().getAccelerationValue(state) + jA.getCoordinate().getAccelerationValue(state)
al4 = j4.getCoordinate().getAccelerationValue(state)
print("theta4 err", ang(j4) - t4)
print("omega3 err", w3 - (-4.1209144153477), "omega4 err", w4 - 6.997985242176772)
print("alpha3 err", al3 - 298.56174182351873, "alpha4 err", al4 - 465.93473911571635)
# Velocities: OpenSim does not bind System::project, so solve G u = 0 for the free speeds.
import numpy as np
matter = model.getMatterSubsystem()
model.realizePosition(state)
G = osim.Matrix(); matter.calcG(state, G)
g = np.array([[G.get(i, j) for j in range(G.ncol())] for i in range(G.nrow())])
coords = [j2.getCoordinate(), jA.getCoordinate(), j4.getCoordinate()]
# mobility order follows the joints as added
# Which U slot each coordinate owns: OpenSim's coordinate order is not the state's.
for i, cd in enumerate(coords): cd.setSpeedValue(state, 10.0 + i)
slot = {i: [round(state.getU().get(k)) for k in range(state.getNU())].index(10 + i) for i in range(3)}
g = g[:, [slot[0], slot[1], slot[2]]]
rows = g[1:3]  # row 0 is the prescribed motion, row 3 the closure's z equation (identically zero)
free = rows[:, 1:]; rhs = -rows[:, 0] * 25.0
u_free, *_ = np.linalg.lstsq(free, rhs, rcond=None)
coords[0].setSpeedValue(state, 25.0); coords[1].setSpeedValue(state, u_free[0]); coords[2].setSpeedValue(state, u_free[1])
model.realizeAcceleration(state)
w3 = coords[0].getSpeedValue(state) + coords[1].getSpeedValue(state); w4 = coords[2].getSpeedValue(state)
al3 = coords[0].getAccelerationValue(state) + coords[1].getAccelerationValue(state); al4 = coords[2].getAccelerationValue(state)
print("projected: omega3 err", w3 - (-4.1209144153477), "omega4 err", w4 - 6.997985242176772)
print("projected: alpha3 err", al3 - 298.56174182351873, "alpha4 err", al4 - 465.93473911571635, "G shape", g.shape)
print(np.round(g, 6)); print("mobilized body order", [model.getBodySet().get(i).getName() for i in range(model.getBodySet().getSize())])
print("slots", slot, "u solved", 25.0, u_free, "speeds read back", [cd.getSpeedValue(state) for cd in coords], "u vector", [state.getU().get(i) for i in range(state.getNU())])
# Driving torque: the prescribed motion's multiplier. Exudyn's oracle on the same mechanism
# (1 kg bars, 1e-3 kg m^2 about their middles, alpha2 = 0) is the comparison.
mm = osim.Vector(); mm = matter.getMotionMultipliers(state)
print("simbody motion multiplier", [mm.get(i) for i in range(mm.size())])
lam = matter.getConstraintMultipliers(state)
print("simbody constraint multipliers", [lam.get(i) for i in range(lam.size())], "-> driving torque (Simbody: M udot + G^T lambda = f)", -lam.get(0))
