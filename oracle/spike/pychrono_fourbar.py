"""Phase 0 trial: PyChrono on the Norton four-bar (theta2 = 40 deg, omega2 = 25, alpha2 = 15).

Run: micromamba run -n pmks-oracle-pychrono python spike/pychrono_fourbar.py
"""
import math, cmath
import pychrono as chrono
AL3, AL4 = 298.56174182351873, 465.93473911571635  # closed form at alpha2 = 0

a, b, c, d = 0.040, 0.120, 0.080, 0.100
t2 = math.radians(40)
A = cmath.rect(a, t2); O4 = complex(d, 0); D = abs(O4 - A)
x = (b*b - c*c + D*D) / (2*D); h = math.sqrt(b*b - x*x); u = (O4 - A) / D
B = A + u*x + 1j*u*h

sys = chrono.ChSystemNSC()
ground = chrono.ChBody(); ground.SetFixed(True); sys.Add(ground)
def bar(p, q):
    body = chrono.ChBody(); body.SetMass(1.0); body.SetInertiaXX(chrono.ChVector3d(1e-3, 1e-3, 1e-3))
    mid = (p + q) / 2
    body.SetPos(chrono.ChVector3d(mid.real, mid.imag, 0)); sys.Add(body); return body
crank, coupler, rocker = bar(0j, A), bar(A, B), bar(O4, B)
def rev(b1, b2, p, cls=chrono.ChLinkLockRevolute):
    j = cls(); j.Initialize(b1, b2, chrono.ChFramed(chrono.ChVector3d(p.real, p.imag, 0), chrono.QUNIT)); sys.Add(j); return j
jA = rev(crank, coupler, A); jB = rev(coupler, rocker, B); jO4 = rev(rocker, ground, O4)
motor = chrono.ChLinkMotorRotationAngle()
motor.Initialize(crank, ground, chrono.ChFramed(chrono.ChVector3d(0, 0, 0), chrono.QUNIT))
f = chrono.ChFunctionRamp(0.0, 25.0); motor.SetAngleFunction(f)  # constant speed: ChFunctionPoly's coefficient vector did not bind
sys.Add(motor)
# the rocker and coupler would be free to swing out of plane with spherical joints; hold every body in the plane
# Variant 2: four revolutes about Z, the usual Chrono four-bar; spatially redundant (3 rows)
sys.SetChTime(0.0)
flag = sys.DoAssembly(0xFFFF, 50, 1e-14, 1e-14, 1e-14)  # AssemblyAnalysis::Level::FULL; the enum is not bound
w3 = coupler.GetAngVelParent().z; w4 = rocker.GetAngVelParent().z
al3 = coupler.GetAngAccParent().z; al4 = rocker.GetAngAccParent().z
print("omega3 err", w3 - (-4.1209144153477), "omega4 err", w4 - 6.997985242176772)
print("alpha3 err", al3 - AL3, "alpha4 err", al4 - AL4, "(alpha2 = 0)")
print("exit flag", flag)
# Variant 3: integrate kinematics with a tiny step instead of assembling at one instant
for dt in (1e-3, 1e-4, 1e-5):
    sys.SetChTime(0.0)
    for body, (p, q) in ((crank, (0j, A)), (coupler, (A, B)), (rocker, (O4, B))):
        mid = (p + q) / 2; body.SetPos(chrono.ChVector3d(mid.real, mid.imag, 0)); body.SetRot(chrono.QUNIT)
        body.SetPosDt(chrono.ChVector3d(0, 0, 0)); body.SetAngVelParent(chrono.ChVector3d(0, 0, 0))
    sys.DoAssembly(0xFFFF, 50, 1e-14, 1e-14, 1e-14)
    sys.DoStepKinematics(dt); sys.DoStepKinematics(-dt) if False else None
    print("dt", dt, "omega3 err", coupler.GetAngVelParent().z - (-4.1209144153477))
