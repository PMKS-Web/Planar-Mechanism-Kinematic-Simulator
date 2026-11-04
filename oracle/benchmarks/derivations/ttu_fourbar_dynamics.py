# Independent re-derivation of the TTU Dynamics of Machinery II four-bar force example
# (http://ttu-dom.wikidot.com/example-item-1), checked 2026-11-03.
# The page does not say so, but its numbers include gravity at 9.81 m/s^2 (-y);
# with g = 9.81 and the 5 N*m load torque on link 4, every force and Ts match to 3 decimals
# on both circuits. Convention: Fij is the force of link i on link j; T12 drives link 2.
import numpy as np, math, cmath, sys
def kin(a,b,c,d,t2,w2,al2,branch):
    A=cmath.rect(a,t2); O4=complex(d,0); D=abs(O4-A)
    x=(b*b-c*c+D*D)/(2*D); h=math.sqrt(b*b-x*x); u=(O4-A)/D
    B=A+u*x+branch*1j*u*h
    t3=cmath.phase(B-A); t4=cmath.phase(B-O4)
    e2,e3,e4=[cmath.exp(1j*t) for t in (t2,t3,t4)]
    M=np.array([[-b*e3.imag, c*e4.imag],[b*e3.real,-c*e4.real]])
    v=-1j*a*w2*e2; w3,w4=np.linalg.solve(M,[v.real,v.imag])
    r=-(a*(1j*al2-w2**2)*e2 - b*w3**2*e3 + c*w4**2*e4)
    al3,al4=np.linalg.solve(M,[r.real,r.imag])
    return t3,t4,w3,w4,al3,al4
def run(r1,r2,r3,r4,m,I,rg,t2,w2,al2,TL,branch,g=0.0):
    t3,t4,w3,w4,al3,al4=kin(r2,r3,r4,r1,t2,w2,al2,branch)
    th={2:t2,3:t3,4:t4}; w={2:w2,3:w3,4:w4}; al={2:al2,3:al3,4:al4}
    # CG along each link from its first pin (O2 for 2, A for 3, O4 for 4), delta=0
    O2=0; A=cmath.rect(r2,t2); O4=complex(r1,0); B=O4+cmath.rect(r4,t4)
    base={2:O2,3:A,4:O4}
    aP={2:0,3:(1j*al2-w2**2)*cmath.rect(r2,t2),4:0}
    G={k:base[k]+cmath.rect(rg[k],th[k]) for k in (2,3,4)}
    aG={k:aP[k]+(1j*al[k]-w[k]**2)*cmath.rect(rg[k],th[k]) for k in (2,3,4)}
    # unknowns: F12x F12y F32x F32y F43x F43y F14x F14y T12 ; F23=-F32, F34=-F43
    cr=lambda p,fx,fy:(p.real*fy-p.imag*fx)
    rows=[];rhs=[]
    # link2: F12 + F32 = m a ; moments about G2
    p12=O2-G[2]; p32=A-G[2]
    rows.append([1,0,1,0,0,0,0,0,0]); rhs.append(m[2]*aG[2].real)
    rows.append([0,1,0,1,0,0,0,0,0]); rhs.append(m[2]*aG[2].imag+m[2]*g)
    rows.append([-p12.imag,p12.real,-p32.imag,p32.real,0,0,0,0,1]); rhs.append(I[2]*al2)
    # link3: F23=-F32, F43
    p23=A-G[3]; p43=B-G[3]
    rows.append([0,0,-1,0,1,0,0,0,0]); rhs.append(m[3]*aG[3].real)
    rows.append([0,0,0,-1,0,1,0,0,0]); rhs.append(m[3]*aG[3].imag+m[3]*g)
    rows.append([0,0,p23.imag,-p23.real,-p43.imag,p43.real,0,0,0]); rhs.append(I[3]*al3)
    # link4: F34=-F43, F14, load torque TL
    p34=B-G[4]; p14=O4-G[4]
    rows.append([0,0,0,0,-1,0,1,0,0]); rhs.append(m[4]*aG[4].real)
    rows.append([0,0,0,0,0,-1,0,1,0]); rhs.append(m[4]*aG[4].imag+m[4]*g)
    rows.append([0,0,0,0,p34.imag,-p34.real,-p14.imag,p14.real,0]); rhs.append(I[4]*al4-TL)
    s=np.linalg.solve(np.array(rows),np.array(rhs))
    print(f"branch {branch}: th3={math.degrees(t3):.3f} th4={math.degrees(t4):.3f} w3={w3:.4f} w4={w4:.4f} al3={al3:.4f} al4={al4:.4f}")
    print("  F12=(%.3f,%.3f) F32=(%.3f,%.3f) F43=(%.3f,%.3f) F14=(%.3f,%.3f) T12=%.3f"%tuple(s))
for br in (1,-1):
    run(0.50,0.15,0.5,0.1778,{2:0.36,3:1.0,4:0.64},{2:0.00136,3:0.01345,4:0.00429},{2:0.0508,3:0.1524,4:0.0889},math.radians(150),5,-5,5.0,br,g=9.81)
