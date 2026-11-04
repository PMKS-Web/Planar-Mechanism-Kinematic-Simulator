"""Closed-form checks of the textbook and course benchmark cases, run 2026-11-03.

Each function re-derives a published answer from its givens, so a transcription
error in a benchmark case cannot pass as a reference. Run: python3 -I closed_form_kinematics.py
"""
import cmath
import math


def norton_fourbar(a=40, b=120, c=80, d=100, t2_deg=40, w2=25, al2=15):
    """Norton four-bar (Design of Machinery Ex. 4-1 givens), open and crossed circuits."""
    t2 = math.radians(t2_deg)
    A = cmath.rect(a, t2)
    O4 = complex(d, 0)
    D = abs(O4 - A)
    x = (b * b - c * c + D * D) / (2 * D)
    h = math.sqrt(b * b - x * x)
    u = (O4 - A) / D
    for branch in (1, -1):
        B = A + u * x + branch * 1j * u * h
        t3, t4 = cmath.phase(B - A), cmath.phase(B - O4)
        e2, e3, e4 = (cmath.exp(1j * t) for t in (t2, t3, t4))
        det = (-b * e3.imag) * (-c * e4.real) - (c * e4.imag) * (b * e3.real)

        def solve(r):
            # [-b s3, c s4; b c3, -c c4] [x3; x4] = [Re r; Im r]
            x3 = (r.real * (-c * e4.real) - (c * e4.imag) * r.imag) / det
            x4 = ((-b * e3.imag) * r.imag - (b * e3.real) * r.real) / det
            return x3, x4

        w3, w4 = solve(-1j * a * w2 * e2)
        al3, al4 = solve(-(a * (1j * al2 - w2**2) * e2 - b * w3**2 * e3 + c * w4**2 * e4))
        print(
            f"four-bar branch {branch:+d}: th3={math.degrees(t3):.3f} th4={math.degrees(t4):.3f} "
            f"w3={w3:.4f} w4={w4:.4f} al3={al3:.3f} al4={al4:.3f}"
        )


def norton_slider_crank(a=35, b=110, c=-15, t2_deg=50, w2=20, al2=12):
    """Offset slider-crank in Norton's convention: a sin t2 - b sin t3 - c = 0, d = a cos t2 - b cos t3."""
    t2 = math.radians(t2_deg)
    s3 = (a * math.sin(t2) - c) / b
    for t3 in (math.asin(s3), math.pi - math.asin(s3)):
        d = a * math.cos(t2) - b * math.cos(t3)
        w3 = a * math.cos(t2) / (b * math.cos(t3)) * w2
        dd = -a * w2 * math.sin(t2) + b * w3 * math.sin(t3)
        al3 = (a * al2 * math.cos(t2) - a * w2**2 * math.sin(t2) + b * w3**2 * math.sin(t3)) / (
            b * math.cos(t3)
        )
        ddd = (
            -a * al2 * math.sin(t2)
            - a * w2**2 * math.cos(t2)
            + b * al3 * math.sin(t3)
            + b * w3**2 * math.cos(t3)
        )
        print(
            f"slider-crank: th3={math.degrees(t3):.3f} d={d:.3f} w3={w3:.4f} "
            f"d_dot={dd:.3f} al3={al3:.3f} d_ddot={ddd:.3f}"
        )


def metu_double_slider(L=0.5, x=0.2, xd=2.0, m=5.0):
    """METU OCW ME 301 Sec. 6.4: rod AB on two perpendicular guides, A driven at constant 2 m/s."""
    I = m * L * L / 12
    y = math.sqrt(L * L - x * x)
    yd = -x * xd / y
    ydd = -(xd**2 + yd**2) / y

    def theta(t):
        xx = x + xd * t
        return math.atan2(math.sqrt(L * L - xx * xx), -xx)

    h = 1e-5
    om = (theta(h) - theta(-h)) / (2 * h)
    al = (theta(h) - 2 * theta(0) + theta(-h)) / h**2
    aGy = ydd / 2
    # Unknowns on the rod: A=(Ax, Ay) from slider 2, Bx from slider 4 (frictionless vertical guide).
    gx, gy = x / 2, y / 2
    Ay = m * aGy
    # Moment about G: (A-G) x F_A + (B-G) x F_B = I al, with A-G=(gx,-gy), B-G=(-gx,gy), Ax=-Bx
    # Solve the 3x3 directly to avoid sign slips.
    import numpy as np

    M = np.array([[1, 0, 1], [0, 1, 0], [gy, gx, -gy]])
    Ax, Ay, Bx = np.linalg.solve(M, [0.0, m * aGy, I * al])
    print(
        f"double slider: th={math.degrees(math.atan2(y, -x)):.4f} y={y*1e3:.3f}mm yd={yd*1e3:.3f}mm/s "
        f"omega={om:.4f} alpha={al:.4f} ydd={ydd:.4f} |F23|={math.hypot(Ax, Ay):.3f}N "
        f"F23 angle={math.degrees(math.atan2(Ay, Ax)):.3f} F43x={Bx:.3f}"
    )


if __name__ == "__main__":
    norton_fourbar()
    norton_slider_crank()
    metu_double_slider()
