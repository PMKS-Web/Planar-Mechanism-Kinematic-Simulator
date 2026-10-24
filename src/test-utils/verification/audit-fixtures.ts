/** Exact legacy payloads from the 2026-10-02 audit. Regenerating them would erase
 * the rounding and unit boundaries these regressions exercise. Published alongside
 * the declarative fixtures by fixture-gallery.ts. #50 was API-only and is excluded. */
export const AUDIT_FIXTURES: {
  id: number;
  name: string;
  joints: number;
  payload: string;
  sourcePayload?: string;
}[] = [
  {
    id: 1,
    name: 'Slotted lever with a rod that cannot tilt',
    payload:
      '2v.Ay,1E8.5,0.1011.6A,A,0,0,0.1B,B,0,Fe,0,CDE,D,E.4C,C,ku,0,0.0D,D,VG,Fe,0.0E,E,0VG,Fe,0.DF,F,1E8,Fe,0..YRAB,AB,Fe,Fe,0,7q,c5cae9,A,B,,.YRCDE,CDE,Fe,Fe,Fe,AR,303e9f,C,D,E,,.YRDF,DF,Fe,Fe,si,Fe,0d125a,D,F,,...N_O*2vcFt5',
    joints: 6,
  },
  {
    id: 2,
    name: 'Four-bar with four equal sides',
    payload:
      '2v.Ay,1E8.5,0.1011.6A,A,0,0,0.0B,B,0,VG,0.0G,G,VG,VG,0.4H,H,VG,0,0..YRAB,AB,Fe,Fe,0,Fe,c5cae9,A,B,,.YRBG,BG,Fe,Fe,Fe,VG,303e9f,B,G,,.YRGH,GH,Fe,Fe,VG,Fe,0d125a,G,H,,...N_k*1vedFB',
    joints: 4,
  },
  {
    id: 3,
    name: 'Parallelogram with a third parallel crank',
    payload:
      '2v.Ay,1E8.5,0.1011.4A,A,0,0,0.0B,B,0,VG,0.0E,E,_W,VG,0.4F,F,_W,0,0.0I,I,VG,VG,0.6J,J,VG,0,0..YRAB,AB,Fe,Fe,0,Fe,c5cae9,A,B,,.YREF,EF,Fe,Fe,_W,Fe,303e9f,E,F,,.YRBEI,BEI,Fe,Fe,VG,VG,0d125a,B,E,I,,.YRIJ,IJ,Fe,Fe,VG,Fe,B2DFDB,I,J,,...N_k*3kg22a',
    joints: 6,
  },
  {
    id: 4,
    name: 'Crank-rocker driven from the rocker at its limit',
    payload:
      '2v.Ay,1E8.5,0.1011.4A,A,0,0,0.0B,B,Dh,7a,0.0C,C,si,UG,0.6D,D,ku,0,0..YRAB,AB,Fe,Fe,6s,3o,c5cae9,A,B,,.YRBC,BC,Fe,Fe,YC,Iw,303e9f,B,C,,.YRCD,CD,Fe,Fe,oo,F8,0d125a,C,D,,...N_m*2OXiLv',
    joints: 4,
  },
  {
    id: 5,
    name: 'Single rotating bar: in-motion reaction',
    payload:
      '2v.Fe,Fe.5,0.1011.6A,A,0,0,0,,,,2SG.0B,B,0,VG,0..ARAB,AB,3q90,5D,0,Fe,303e9f,A,B,,...N_P*2QLllA',
    joints: 2,
  },
  {
    id: 6,
    name: 'Parallelogram with a third parallel crank rotated 25.714 degrees: save/reopen',
    payload:
      '2v.Ay,1E8.5,0.1011.4A,A,0,0,0.0B,B,0Da,SA,0.0E,E,gm,tH,0.4F,F,uK,R8,0.0I,I,Ec,fk,0.6J,J,SA,Da,0..YRAB,AB,Fe,Fe,06o,E5,c5cae9,A,B,,.YREF,EF,Fe,Fe,nY,fD,303e9f,E,F,,.YRBEI,BEI,Fe,Fe,Ec,fk,0d125a,B,E,I,,.YRIJ,IJ,Fe,Fe,LO,Rf,B2DFDB,I,J,,...N_q*35g2hQ',
    joints: 6,
  },
  {
    id: 7,
    name: 'Locomotive drive wheels rotated 25.714 degrees: save/reopen',
    payload:
      '2v.Ay,1E8.5,0.1011.4A,A,0,0,0.0B,B,04m,9t,0.0C,C,89,0Gv,0.6D,D,gF,KM,0,,,,2SG.0E,E,bV,UC,0.0F,F,oO,3S,0.4G,G,1KU,eh,0.0H,H,1Fk,oY,0.0I,I,1Sc,No,0..2RABC,Front driver,0,0,18,02M,c5cae9,A,B,C,,.2RDEF,Main driver,0,0,hN,H-,303e9f,D,E,F,,.2RGHI,Rear driver,0,0,1Lc,cL,0d125a,G,H,I,,.MRBEH,Coupling rod,0,0,bV,UC,B2DFDB,B,E,H,,...N_H*1i3Ryj',
    joints: 9,
  },
  {
    id: 8,
    name: 'Hydraulic crosshead',
    payload:
      '2v.Ay,Fe.5,0.1011.CA,A,0,0,0.0N,N,vD,0,0.hS,S,aZ,0,0,ANG,A,N.8B,B,1Tm,0,0.4G,G,0,0VG,0.0C,C,1Tm,S8,0.0D,D,1Tm,0S8,0..YRANG,Fixed frame,Fe,Fe,J4,0AR,0d125a,A,N,G,,AN,AG.YRSBCD,Press crosshead,Fe,Fe,1FT,0,00695C,S,B,C,D,,SB,BCD.NRAN,AN,Fe,Fe,Sd,0,c5cae9,A,N,,.NRAG,AG,Fe,Fe,0,0Fe,303e9f,A,G,,.NRSB,SB,Fe,Fe,119,0,B2DFDB,S,B,,.NRBCD,BCD,Fe,Fe,1Tm,0,26A69A,B,C,D,,...N_t*1Tb9pN',
    joints: 7,
  },
  {
    id: 9,
    name: 'Offset-mount hatch',
    payload:
      '2v.Ay,9O.5,0.1011.4G,G,0VG,0,0.8A,A,0,0,0.0N,N,tQ,0,0.hS,S,cM,0,0,GAN,A,N.8B,B,1Tm,0,0.0E,E,1jO,Fe,0.4O,O,1E8,0VG,0.GT,T,2Ce,_W,0..YRGAN,Offset barrel,Fe,Fe,83,0,0d125a,G,A,N,,GA,AN.YRSBE,Rod bracket,Fe,Fe,1GV,5D,00695C,S,B,E,,SB,BE.YROET,Hatch,Fe,Fe,1jO,Fe,c5cae9,O,E,T,,.NRGA,GA,Fe,Fe,0Fe,0,c5cae9,G,A,,.NRAN,AN,Fe,Fe,Rj,0,303e9f,A,N,,.NRSB,SB,Fe,Fe,123,0,B2DFDB,S,B,,.NRBE,BE,Fe,Fe,1ba,7q,26A69A,B,E,,...N_b*3ZZMMu',
    joints: 8,
  },
  {
    id: 10,
    name: 'Reciprocating saw',
    payload:
      '2v.Ay,1E8.A,0.1011.6A,A,0,0,0.1B,B,Fe,0,0,CDE,C,D.DC,C,Fe,0VG,0.0D,D,Fe,S8,0.0E,E,1E8,0VG,0..YRAB,Flywheel crank,Fe,Fe,7q,0,c5cae9,A,B,,.YRCDE,Saw carriage,Fe,Fe,aT,0BT,B2DFDB,C,D,E,,CD,CE.NRCD,CD,Fe,Fe,Fe,01a,303e9f,C,D,,.NRCE,CE,Fe,Fe,ku,0VG,0d125a,C,E,,..2F1,CDE,F1,1E8,0VG,_W,0VG,JY0.2F2,CDE,F2,ku,0VG,ku,0ku,4uW..N_A*3FX8op',
    joints: 5,
  },
  {
    id: 11,
    name: 'Gripper on rails',
    payload:
      '2v.Ay,6G.5,0.1011.CA,A,01E8,0,0.4Y,Y,01RQ,0,0.0B,B,0w9,0,0.hC,C,0vV,0,0,ABY,A,B.8D,D,0bW,0,0.0G,G,0Fe,Fe,0.0H,H,Fe,Fe,0.0I,I,0Fe,0Fe,0.0J,J,Fe,0Fe,0.4K,K,0T4,xO,0.4L,L,0T4,0xO,0.1M,M,0T4,XI,0,KL,K,L.0Q,Q,2C,XI,0.0S,S,11U,Dc,0.1T,T,0T4,0XI,0,KL,K,L.0V,V,2C,0XI,0.0X,X,11U,0Dc,0..YRABY,Frame,Fe,Fe,01Bv,0,0d125a,A,B,Y,,AB,AY.YRCDGHIJ,Carriage,Fe,Fe,0Fr,0,00695C,C,D,G,H,I,J,,CD,DGHIJ.YRKL,Rail,Fe,Fe,0T4,0,c5cae9,K,L,,.YRGM,GM,Fe,Fe,0MM,OT,303e9f,G,M,,.YRHQ,HQ,Fe,Fe,8w,OT,0d125a,H,Q,,.YRMQS,Jaw,Fe,Fe,Ct,Qk,B2DFDB,M,Q,S,,.YRIT,IT,Fe,Fe,0MM,0OT,26A69A,I,T,,.YRJV,JV,Fe,Fe,8w,0OT,00695C,J,V,,.YRTVX,Jaw,Fe,Fe,Ct,0Qk,c5cae9,T,V,X,,.NRAB,Barrel,Fe,Fe,0148,0,c5cae9,A,B,,.NRAY,AY,Fe,Fe,01Kn,0,303e9f,A,Y,,.NRCD,Rod,Fe,Fe,0lW,0,B2DFDB,C,D,,.NRDGHIJ,Carriage,Fe,Fe,07W,0,26A69A,D,G,H,I,J,,...N_g*3oLeWt',
    joints: 17,
  },
  {
    id: 12,
    name: 'Bell crank',
    payload:
      '2v.Ay,1E8.A,0.1011.6A,A,016K,0Fe,0.0B,B,01KV,093,0.0C,C,0R4,Fe,0.CD,D,0,0,0.0E,E,CW,Lg,0.0F,F,pS,Ok,0.4G,G,si,6G,0..YRAB,AB,0,0,01DQ,0CM,c5cae9,A,B,,.YRBC,BC,0,0,0to,3I,303e9f,B,C,,.YRCDE,CDE,0,0,04t,CR,26A69A,C,D,E,,CD,DE.YREF,EF,0,0,V_,NC,00695C,E,F,,.YRFG,FG,0,0,r4,FV,c5cae9,F,G,,.NRCD,CD,0,0,0DY,7q,0d125a,C,D,,.NRDE,DE,0,0,6G,Ar,B2DFDB,D,E,,...N_g*0v8xc4',
    joints: 7,
  },
  {
    id: 13,
    name: 'Loader bucket',
    payload:
      '2v.Ay,1E8.A,0.1011.6O,O,0,0,0,,,,2SG.0A,A,xS,JK,0.8M,M,1B4,GC,0.0B,B,1Na,Rw,0.8C,C,1GY,1M,0.0D,D,1be,01o,0.4P,P,o0,r8,0..YROA,Lift arm,0,0,Tk,9g,c5cae9,O,A,,.YRAMBCD,Bucket,0,0,1Gs,Cc,00695C,A,M,B,C,D,,AM,MB,MC,CD.YRBP,Tilt link,0,0,14o,eX,c5cae9,B,P,,.NRAM,AM,0,0,13G,Hm,303e9f,A,M,,.NRMB,MB,0,0,1HK,M3,0d125a,M,B,,.NRMC,MC,0,0,1Dp,8n,B2DFDB,M,C,,.NRCD,CD,0,0,1R5,0E,26A69A,C,D,,...N_D*2Ye6Vl',
    joints: 7,
  },
  {
    id: 14,
    name: 'Driven body with a frozen cylinder',
    payload:
      '2v.Ay,1E8.A,0.1011.8A,A,0,0,0.0N,N,tQ,0,0.fB,B,cM,0,0,ABCDEN,A,N.8C,C,1Tm,0,0.8D,D,ku,_W,0.6E,E,ku,0ku,0..YRABCDEN,ABCDEN,Fe,Fe,ku,2d,00695C,A,B,C,D,E,N,,AN,BC,AD,CD,DE.NRAN,AN,Fe,Fe,Rj,0,c5cae9,A,N,,.NRBC,BC,Fe,Fe,123,0,303e9f,B,C,,.NRAD,AD,Fe,Fe,NS,VG,0d125a,A,D,,.NRCD,CD,Fe,Fe,16K,VG,B2DFDB,C,D,,.NRDE,DE,Fe,Fe,ku,7q,26A69A,D,E,,...N_S*0NEyMO',
    joints: 6,
  },
  {
    id: 15,
    name: 'Four-bar on a frozen cylinder',
    payload:
      '2v.Ay,1E8.A,0.1011.6O,O,CW,Fe,0.0P,P,CW,YO,0.8A,A,0,0,0.0N,N,tQ,0,0.fS,S,cM,0,0,ACDNPQS,A,N.8C,C,1Tm,0,0.8D,D,ku,o0,0.0Q,Q,1HG,YO,0.4G,G,1HG,0CW,0..YROP,OP,Fe,Fe,CW,P0,c5cae9,O,P,,.YRACDNPQS,ACDNPQS,Fe,Fe,ku,G_,00695C,A,C,D,N,P,Q,S,,AN,CS,ADP,CDQ.YRGQ,GQ,Fe,Fe,1HG,Ay,c5cae9,G,Q,,.NRAN,AN,Fe,Fe,Rj,0,303e9f,A,N,,.NRCS,CS,Fe,Fe,123,0,0d125a,C,S,,.NRADP,ADP,Fe,Fe,Jp,S8,B2DFDB,A,D,P,,.NRCDQ,CDQ,Fe,Fe,19z,S8,26A69A,C,D,Q,,...N_r*1yReN9',
    joints: 9,
  },
  {
    id: 16,
    name: 'Cylinder riding a slot',
    payload:
      '2v.Ay,38.5,0.1011.4A,A,0JI,08-,0.0B,B,8V,JR,0.0C,C,0Pt,Pa,0.9D,D,041,6f,0,ABC,A,B.0N,N,TQ,62,0.8F,F,pQ,5f,0.hE,E,H-,6F,0,DN,D,N.4G,G,1WI,0KT,0.0H,H,1Vi,5M,0..YRABC,ABC,Fe,Fe,0CE,C0,c5cae9,A,B,C,,.YRDN,DN,Fe,Fe,Cj,6L,303e9f,D,N,,.YREFGH,EFGH,Fe,Fe,11M,0q,303e9f,E,F,G,H,,EF,FGH.NREF,EF,Fe,Fe,Yj,5y,303e9f,E,F,,.NRFGH,FGH,Fe,Fe,1H8,03A,00695C,F,G,H,,...N_h*3UpsMx',
    joints: 9,
  },
  {
    id: 17,
    name: 'Cylinder_Gripper',
    payload:
      '2v.Ay,7q.5,0.1011.CA,A,01E8,0,0.0B,B,0w9,0,0.8D,D,0jX,0,0.0G,G,0PU,Fe,0.0H,H,5o,Fe,0.0I,I,0PU,0Fe,0.0J,J,5o,0Fe,0.4K,K,0T4,xO,0.4L,L,0T4,0xO,0.0S,S,11U,Hr,0.0X,X,11U,0Hr,0.hC,C,011W,0,0,ABY,A,B.1M,M,0T4,bX,0,KL,K,L.0Q,Q,2C,bX,0.1T,T,0T4,0bX,0,KL,K,L.0V,V,2C,0bX,0.4Y,Y,01RS,0,0..MRKL,Rail,0,0,0T4,0,0d125a,K,L,,.MRGM,GM,0,0,0RH,Qb,B2DFDB,G,M,,.MRHQ,HQ,0,0,3-,Qb,B2DFDB,H,Q,,.MRMQS,Jaw,0,0,Ct,Uz,00695C,M,Q,S,,.MRIT,IT,0,0,0RH,0Qb,B2DFDB,I,T,,.MRJV,JV,0,0,3-,0Qb,B2DFDB,J,V,,.MRTVX,Jaw,0,0,Ct,0Uz,00695C,T,V,X,,.ARCDGHIJ,Carriage,0,0,0aM,c,26A69A,C,D,G,H,I,J,,CD,DGHIJ.ARABY,Frame,0,0,01CT,0,00695C,A,B,Y,,AB,AY.aRCD,Rod,0,0,0tW,0,26A69A,C,D,,.mRDGHIJ,Carriage,0,0,0HB,1C,c5cae9,D,G,H,I,J,,.aRAB,Barrel,0,0,0148,0,00695C,A,B,,.aRAY,AY,0,0,01Ko,0,B2DFDB,A,Y,,..2F1,MQS,F1,11U,Hr,11U,hA,Fe.2F2,TVX,F2,11U,0Hr,11m,0lL,Fe..N_.KFF1~303e9f,KFF2~303e9fc*4PAYAx',
    joints: 17,
  },
  {
    id: 18,
    name: 'Aircraft_Landing_Gear',
    payload:
      '2u.7S,38.5,0.1011.4A,A,1Lu,1Cf,0.OB,B,1N1,Kp,0.0E,E,10g,1F6,0.0G,G,19p,_1,0.0H,H,1MN,ug,0.4I,I,1MG,1Hx,0.0I1,I1,16T,1Ft,0.8I2,I2,1GT,1HA,0.ZI3,I3,1GT,1HA,0,II1,I,I1,38.CJ,J,rR,17h,0.8K,K,1BI,KU,0.0L,L,1BO,4E,0.0M,M,1Ih,4G,0.0N,N,1ID,Vb,0.0O,O,1BJ,VJ,0.0P,P,1F4,XA,0.0Q,Q,1Eg,2q,0..ARHG,HG,0,0,1G5,xM,26A69A,H,G,,.ARII1,II1,0,0,1EN,1Gv,00695C,I,I1,,.AREI2,,0,0,18Z,1G8,c5cae9,I2,E,,.YPI2I3,I2I3,0,0,0,0,,I2,I3,,.AREGJ,EGJ,0,0,zL,177,303e9f,E,J,G,,EJ,JG.ARABHKLMNOPQ,ABHKLMNOPQ,0,0,1IA,Tx,0d125a,A,B,H,K,L,M,N,O,P,Q,,ABH,BK,KLMNOPQ.aREJ,EJ,0,0,x3,1BP,B2DFDB,E,J,,.aRJG,JG,0,0,-d,12s,26A69A,J,G,,.aRABH,ABH,0,0,1MR,pN,0d125a,A,B,H,,.aRBK,BK,0,0,1HA,Kf,c5cae9,B,K,,.aRKLMNOPQ,KLMNOPQ,0,0,1EN,IH,303e9f,K,L,M,N,O,P,Q,,...N_a*2Y3xq5',
    joints: 16,
  },
  {
    id: 19,
    name: 'Hood_Hinge',
    payload:
      '2u.7q,1a.5,0.1011.4A,A,2C,o,0.0A1,A1,ZP,U,0.8A2,A2,Nc,b,0.0B,B,up,H,0.ZA3,A3,Nc,b,0,AA1,A,A1,1a.4E,E,Vf,8j,0.0F,F,2m,M-,0.GG,G,Zy,Im,0.0H,H,hm,6G,0.0I,I,1XI,Wy,0.KJ,J,q0,Cg,0.0K,K,vq,gB,0.8L,L,Ph,m_,0.8M,M,09E,pW,0.8N,N,0fg,nH,0.GO,O,0165,gD,0..ARAA1,AA1,0,0,Io,e,00695C,A,A1,,.ARA2B,,0,0,eD,R,303e9f,A2,B,,.YPA2A3,A2A3,0,0,0,0,,A2,A3,,.AREFG,EFG,0,0,NS,Gq,0d125a,E,F,G,,.ARGH,GH,0,0,ds,CW,26A69A,G,H,,.ARBHIJ,BHIJ,0,0,11i,Dp,303e9f,H,I,B,J,,.ARFK,FK,0,0,UI,Wb,303e9f,F,K,,.ARIKLMNO,Hood,0,0,03D,kx,0d125a,K,I,L,M,N,O,,KIL,LM,MN,NO.aRKIL,KIL,0,0,yG,fN,0d125a,K,I,L,,.aRLM,LM,0,0,8F,oF,c5cae9,L,M,,.aRMN,MN,0,0,0PS,oP,303e9f,M,N,,.aRNO,NO,0,0,0tt,jl,c5cae9,N,O,,...N_k*2zlhwI',
    joints: 15,
  },
  {
    id: 20,
    name: 'Excavator_Bucket',
    payload:
      '2v.4i,Fe.5,0.1011.4A,A,0Mi,Nd,0.0B,B,Gd,0FP,0.0C,C,o,d,0.0D,D,E5,5C,0.0A1,A1,1r,BL,0.8A2,A2,0AS,HU,0.ZA3,A3,0AS,HU,0,AA1,A,A1,0Fe.0E,E,NC,08I,0.KH,H,0Wk,RB,0.8I,I,VG,0NS,0.GJ,J,KK,0YO,0.8K,K,WM,0FQ,0.0L,L,6U,4m,0..ARABCH,ABCH,0,0,0CT,BQ,0d125a,A,B,C,H,,.ARCDL,CD,0,0,77,3X,c5cae9,C,D,L,,.ARAA1,AA1,0,0,0AS,HU,26A69A,A,A1,,.ARA2D,,0,0,1r,BL,00695C,A2,D,,.YPA2A3,A2A3,0,0,0,0,,A2,A3,,.ARDE,DE,0,0,If,01Z,0d125a,D,E,,.ARBEIJK,BEIJK,1w4W,28,RD,0KT,26A69A,I,J,B,E,K,,IJ,BEK,KI.aRIJ,IJ,eiB,0,Po,0Sw,00695C,I,J,,.aRBEK,BEK,eiB,0,O3,0D2,B2DFDB,B,E,K,,.aRKI,KI,eiB,0,Vp,0JR,c5cae9,K,I,,...N_O*3Ia4n7',
    joints: 12,
  },
  {
    id: 21,
    name: 'Car_Steering',
    payload:
      '2v.o,o.2,0.2012.6A,A,0,0,0,,,,0VG.GB,B,01N,4Q,0.0C,C,8f,1y,0.CD,D,BD,G,0.0E,E,0BV,3N,0.CF,F,0B7,G,0.8G,G,0Dj,0-,0.0H,H,0Fb,32,0.0I,I,0Dz,3o,0.0J,J,0Bv,04w,0.0K,K,0AG,04A,0.8L,L,DL,20,0.0M,M,Ap,5R,0.0N,N,9Z,4X,0.0O,O,En,02X,0.0P,P,G0,01d,0..ARAB,AB,0,0,0h,2D,0d125a,A,B,,.ARBC,BC,0,0,3f,3B,26A69A,B,C,,.ARBE,BE,0,0,06R,3u,B2DFDB,B,E,,.AREFGHIJK,EFGHIJK,0,0,0CD,J,0d125a,E,F,G,H,I,J,K,,EF,FG,GHIJK.ARCDLMNOP,CDLMNOP,0,0,Bg,1E,0d125a,C,D,L,M,N,O,P,,CD,DL,LMNOP.aREF,EF,0,0,0BJ,1p,0d125a,E,F,,.aRFG,FG,0,0,0CQ,0O,00695C,F,G,,.aRGHIJK,GHIJK,0,0,0D5,0f,c5cae9,G,H,I,J,K,,.aRCD,CD,0,0,9x,16,0d125a,C,D,,.aRDL,DL,0,0,CH,18,303e9f,D,L,,.aRLMNOP,LMNOP,0,0,Cv,1a,c5cae9,L,M,N,O,P,,...N_t*2O6jjZ',
    joints: 16,
  },
  {
    id: 22,
    name: 'Watt I / scale0.1',
    payload:
      '2v.16,1E8.5,0.1011.6A,A,05s,03n,0.0B,B,04G,1R,0.0C,C,2U,h,0.0D,D,0O,6H,0.0E,E,7y,8J,0.0F,F,Ck,5F,0.4G,G,BS,05V,0..YRAB,AB,1E8,1a,053,01B,c5cae9,A,B,,.YRBCD,BCD,2SG,38,0k,2o,303e9f,B,C,D,,.YRDE,DE,1E8,1a,3o,7I,0d125a,D,E,,.YREF,EF,2SG,38,AL,6n,B2DFDB,E,F,,.YRCFG,CFG,1E8,1a,8u,9,26A69A,C,F,G,,..2F1,CFG,F1,8u,9,Ms,78,DfU..N_D*0cmSES',
    joints: 7,
  },
  {
    id: 23,
    name: 'Four-bar with a motor between moving links',
    payload:
      '2v.Ay,1E8.A,0.1011.4O,O,0,0,0.0A,A,72,MM,0.2C,C,pa,bW,0.4D,D,_W,0,0.0T,T,Wq,pa,0..YROA,OA,0,0,3X,BB,c5cae9,O,A,,.YRACT,ACT,0,0,UU,b9,303e9f,A,C,T,,.YRCD,CD,0,0,v2,Im,0d125a,C,D,,..2F1,CD,F1,pa,bW,13C,bW,OQW..N_O*1iIL4U',
    joints: 5,
  },
  {
    id: 24,
    name: 'Independent machines: in-motion force analysis depends on graph read order',
    payload:
      '2v.Ay,1E8.A,0.1011.CA,A,0,0,0.0B,B,vD,0,0.hC,C,aZ,0,0,ABE,A,B,Fe.8D,D,1Tm,0,0.4E,E,0,0VG,0.0F,F,1Tm,S8,0.0G,G,1Tm,0S8,0.6H,H,7Km,2SG,0,,,,2SG.0I,I,7Km,2xW,0..YRABE,Fixed frame,3q90,0,J4,0AR,0d125a,A,B,E,,AB,AE.YRCDFG,Press crosshead,3q90,0,1FT,0,00695C,C,D,F,G,,CD,DFG.YRHI,HI,3q90,0,7Km,2hu,c5cae9,H,I,,.NRAB,AB,3q90,0,Sd,0,c5cae9,A,B,,.NRAE,AE,3q90,0,0,0Fe,303e9f,A,E,,.NRCD,CD,3q90,0,119,0,B2DFDB,C,D,,.NRDFG,DFG,3q90,0,1Tm,0,26A69A,D,F,G,,...N_E*0Bys3A',
    joints: 9,
  },
  {
    id: 25,
    name: 'Hydraulic cylinder: inconsistent velocities at the stop',
    payload:
      '2v.Ay,1E8.A,0.1011.4A,A,0_W,0,0.0B,B,07E,0,0.fC,C,0OE,0,0,AB,A,B.0D,D,V4,0,0.6E,E,V4,ku,0..YRAB,AB,Fe,Fe,0Yt,0,c5cae9,A,B,,.YRCD,CD,Fe,Fe,3R,0,303e9f,C,D,,.YRDE,DE,Fe,Fe,V4,NS,0d125a,D,E,,...N_7*1bwobD',
    joints: 5,
  },
  {
    id: 26,
    name: 'Four-bar: rotational inertia contributes too little torque',
    payload:
      '2v.Ay,1E8.A,0.1011.6O,O,0,0,0.0A,A,A-8,YwO,0.0C,C,1GaG,wc0,0.4D,D,1Xg0,0,0.0T,T,pHG,1GaG,0..MROA,OA,0,0,5Va,HTC,c5cae9,O,A,,.MRACT,ACT,0,0,lcu,w1Z,303e9f,A,C,T,,.YRCD,CD,3q90,c9Q0,1Xg0,0,0d125a,C,D,,...N_I*042A85',
    joints: 5,
  },
  {
    id: 27,
    name: 'Translating bracket: welded member angle',
    payload:
      '2v.Ay,Fe.5,0.1011.FW,W,0,VG,0.8O,O,0,0,0.0N,N,1X5,0,0.fP,P,xB,0,0,ONW,O,N.4R,R,2SG,0,0..YRONW,ONW,Fe,Fe,WN,AR,0d125a,O,N,W,,ON,WO.YRPR,PR,Fe,Fe,1hk,0,B2DFDB,P,R,,.NRON,ON,Fe,Fe,mY,0,c5cae9,O,N,,.NRWO,WO,Fe,Fe,0,Fe,303e9f,W,O,,...N_j*3eBTQ5',
    joints: 5,
  },
  {
    id: 28,
    name: 'Vertical translating bracket: save/reopen stops it',
    sourcePayload:
      '2v.Ay,Fe.5,0.1011.FW,W,0,VG,0.8O,O,0,0,0.0N,N,1X5,0,0.fP,P,xB,0,0,ONW,O,N.4R,R,2SG,0,0..YRONW,ONW,Fe,Fe,WN,AR,0d125a,O,N,W,,ON,WO.YRPR,PR,Fe,Fe,1hk,0,B2DFDB,P,R,,.NRON,ON,Fe,Fe,mY,0,c5cae9,O,N,,.NRWO,WO,Fe,Fe,0,Fe,303e9f,W,O,,...N_j*3eBTQ5',
    payload:
      '2v.Ay,Fe.5,2e.1011.FW,W,0VG,0,OZ.8O,O,0,0,0.0N,N,0,1X5,0.fP,P,0,xB,0,ONW,O,N.4R,R,0,2SG,0..YRONW,ONW,Fe,Fe,0AR,WN,0d125a,O,N,W,,ON,WO.ARPR,PR,Fe,3,0,1hk,B2DFDB,P,R,,.aRON,ON,Fe,Fe,mY,0,c5cae9,O,N,,.NRWO,WO,Fe,Fe,0,Fe,303e9f,W,O,,...N_m*43RRZL',
    joints: 5,
  },
  {
    id: 29,
    name: 'Eleven parallel cranks on one coupler',
    payload:
      '2v.Ay,1E8.A,0.1011.6A,A,0,0,0,,,,02SG.0B,B,0,VG,0.4C,C,VG,0,0.0D,D,VG,VG,0.4E,E,_W,0,0.0F,F,_W,VG,0.4G,G,1Tm,0,0.0H,H,1Tm,VG,0.4I,I,1z0,0,0.0J,J,1z0,VG,0.4K,K,2SG,0,0.0L,L,2SG,VG,0.4M,M,2xW,0,0.0N,N,2xW,VG,0.4O,O,3Qm,0,0.0P,P,3Qm,VG,0.4Q,Q,3w0,0,0.0R,R,3w0,VG,0.4S,S,4PG,0,0.0T,T,4PG,VG,0.4U,U,4uW,0,0.0V,V,4uW,VG,0..YRAB,AB,Fe,Fe,0,Fe,c5cae9,A,B,,.YRCD,CD,Fe,Fe,VG,Fe,303e9f,C,D,,.YREF,EF,Fe,Fe,_W,Fe,0d125a,E,F,,.YRGH,GH,Fe,Fe,1Tm,Fe,B2DFDB,G,H,,.YRIJ,IJ,Fe,Fe,1z0,Fe,26A69A,I,J,,.YRKL,KL,Fe,Fe,2SG,Fe,00695C,K,L,,.YRMN,MN,Fe,Fe,2xW,Fe,c5cae9,M,N,,.YROP,OP,Fe,Fe,3Qm,Fe,303e9f,O,P,,.YRQR,QR,Fe,Fe,3w0,Fe,0d125a,Q,R,,.YRST,ST,Fe,Fe,4PG,Fe,B2DFDB,S,T,,.YRUV,UV,Fe,Fe,4uW,Fe,26A69A,U,V,,.YRBDFHJLNPRTV,BDFHJLNPRTV,Fe,Fe,2SG,VG,00695C,B,D,F,H,J,L,N,P,R,T,V,,...N_H*2pLx23',
    joints: 22,
  },
  {
    id: 30,
    name: 'Rod bracket carried at its far pin',
    payload:
      '2v.Ay,Fe.5,0.1011.4O,O,0,0,0.8C,C,0,_W,0.0W,W,0VG,1E8,0.4G,G,ku,0,0.0N,N,Ju,Z-,0.hP,P,R0,QX,0,GN,G,N..YROW,OW,Fe,Fe,0Fe,d4,c5cae9,O,W,,.YRGN,GN,Fe,Fe,XO,I0,303e9f,G,N,,.YRPCW,PCW,Fe,Fe,01R,tk,26A69A,P,C,W,,PC,CW.NRPC,PC,Fe,Fe,DW,iW,0d125a,P,C,,.NRCW,CW,Fe,Fe,0Fe,16K,B2DFDB,C,W,,...N_a*143tVR',
    joints: 6,
  },
  {
    id: 31,
    sourcePayload:
      '2v.Ay,3w.5,0.1011.4A,A,019C,Bh,0.0B,B,01H,Bg,0.hC,C,0Qb,Bg,0,AB,A,B.0D,D,jM,Bf,0.0G,G,13N,ky,0.0H,H,20s,ky,0.0I,I,13N,0Fp,0.0J,J,20s,0Fp,0.4K,K,0,2NW,0.4L,L,1Q,01pB,0.1M,M,K,1SF,0,KL,K,L.4O,O,1bt,2Q6,0.4P,P,1eQ,02Tv,0.1Q,Q,1cO,1QQ,0,OP,O,P.0S,S,3e3,13W,0.1T,T,16,0tr,0,KL,K,L.1V,V,1dc,0w4,0,OP,O,P.0X,X,3e3,0Yl,0..YRAB,AB,Fe,Fe,0bE,Bg,c5cae9,A,B,,.YRCD,CD,Fe,Fe,9O,Bg,303e9f,C,D,,.YRDGHIJ,DGHIJ,Fe,Fe,1NZ,Eo,0d125a,D,G,H,I,J,,.YRKL,KL,Fe,Fe,j,IA,B2DFDB,K,L,,.YRGM,GM,Fe,Fe,Xr,15c,26A69A,G,M,,.YROP,OP,Fe,Fe,1d9,01w,00695C,O,P,,.YRHQ,HQ,Fe,Fe,1pd,14h,c5cae9,H,Q,,.YRMQS,MQS,Fe,Fe,1lb,1JO,303e9f,M,Q,S,,.YRIT,IT,Fe,Fe,YF,0Zq,0d125a,I,T,,.YRJV,JV,Fe,Fe,1qE,0ax,B2DFDB,J,V,,.YRTVX,TVX,Fe,Fe,1mG,0nZ,26A69A,T,V,X,,...N_W*2McZpd',
    name: 'Cylinder-driven gripper: meters save/reopen',
    payload:
      '2v.7,3.5,0.2012.4A,A,0l,7,0.0B,B,01,5,0.hC,C,0H,6,0,AB,A,B.0D,D,T,4,0.0G,G,h,R,0.0H,H,1I,R,0.0I,I,i,0D,0.0J,J,1J,0D,0.4K,K,0,1X,0.4L,L,1,01A,0.1M,M,0,u,0,KL,K,L.4O,O,11,1Z,0.4P,P,13,01b,0.1Q,Q,12,t,0,OP,O,P.0S,S,2L,f,0.1T,T,1,0c,0,KL,K,L.1V,V,12,0d,0,OP,O,P.0X,X,2K,0O,0..ARAB,AB,1,0,0O,6,c5cae9,A,B,,.ARCD,CD,1,0,6,5,303e9f,C,D,,.YRDGHIJ,DGHIJ,1,0,u,9,0d125a,D,G,H,I,J,,.YRKL,KL,1,0,0,C,B2DFDB,K,L,,.YRGM,GM,1,0,M,j,26A69A,G,M,,.YROP,OP,1,0,12,01,00695C,O,P,,.YRHQ,HQ,1,0,1A,i,c5cae9,H,Q,,.YRMQS,MQS,1,0,17,r,303e9f,M,Q,S,,.YRIT,IT,1,0,M,0N,0d125a,I,T,,.YRJV,JV,1,0,1A,0O,B2DFDB,J,V,,.YRTVX,TVX,1,0,18,0W,26A69A,T,V,X,,...N_5*33T8rs',
    joints: 18,
  },
  {
    id: 32,
    sourcePayload:
      '2v.Ay,1E8.5,0.1011.7A,A,0,0,0.4B,B,bW,ee,0.4C,C,11e,ee,0.0D,D,mS,Li,0.0E,E,1Ca,Li,0.0F,F,1rC,Li,0.4G,G,bW,0ee,0.4H,H,11e,0ee,0.0I,I,mS,0Li,0.0J,J,1Ca,0Li,0.0K,K,1rC,0Li,0..YRBD,Hanger,Fe,Fe,g_,VA,c5cae9,B,D,,.YRCE,Hanger,Fe,Fe,176,VA,303e9f,C,E,,.YRDEF,Jaw,Fe,Fe,1Gl,Li,0d125a,D,E,F,,.YRAD,AD,Fe,Fe,OE,As,B2DFDB,A,D,,.YRGI,Hanger,Fe,Fe,g_,0VA,26A69A,G,I,,.YRHJ,Hanger,Fe,Fe,176,0VA,00695C,H,J,,.YRIJK,Jaw,Fe,Fe,1Gl,0Li,c5cae9,I,J,K,,.YRAI,AI,Fe,Fe,OE,0As,303e9f,A,I,,...N_c*2J7Paw',
    name: 'Parallel gripper in m',
    payload:
      '2v.7,o.5,0.2012.7A,A,0,0,0.4B,B,O,Q,0.4C,C,g,Q,0.0D,D,V,E,0.0E,E,n,E,0.0F,F,1B,E,0.4G,G,O,0Q,0.4H,H,g,0Q,0.0I,I,V,0E,0.0J,J,n,0E,0.0K,K,1B,0E,0..YRBD,Hanger,1,0,S,K,c5cae9,B,D,,.YRCE,Hanger,1,0,k,K,303e9f,C,E,,.YRDEF,Jaw,1,0,q,E,0d125a,D,E,F,,.YRAD,AD,1,0,G,7,B2DFDB,A,D,,.YRGI,Hanger,1,0,S,0K,26A69A,G,I,,.YRHJ,Hanger,1,0,k,0K,00695C,H,J,,.YRIJK,Jaw,1,0,q,0E,c5cae9,I,J,K,,.YRAI,AI,1,0,G,07,303e9f,A,I,,...N_b*0VEh7B',
    joints: 11,
  },
  {
    id: 33,
    sourcePayload:
      '2v.Ay,1E8.5,0.1011.7A,A,0U5,01,0.0B,B,0Hj,Fj,0.0C,C,0Hj,0FZ,0.0D,D,DZ,Fj,0.0E,E,DZ,0FZ,0.5F,F,0V6,X9,OZ.5G,G,A,X9,OZ.5H,H,0V6,0X0,OZ.5I,I,A,0X0,OZ.0J,J,_d,0Bn,0.0K,K,_o,GS,0..YRABCDE,ABCDE,Fe,Fe,07i,4,c5cae9,A,B,C,D,E,,.YRBF,BF,Fe,Fe,0OQ,OR,303e9f,B,F,,.YRDG,DG,Fe,Fe,6s,OR,0d125a,D,G,,.YRCH,CH,Fe,Fe,0OQ,0OH,B2DFDB,C,H,,.YREI,EI,Fe,Fe,6s,0OH,26A69A,E,I,,.YRHIJ,HIJ,Fe,Fe,Aa,0Px,00695C,H,I,J,,.YRFGK,FGK,Fe,Fe,Ae,Rb,c5cae9,F,G,K,,...N_1*3o1TlA',
    name: 'MotionGen gripper in m',
    payload:
      '2v.7,o.5,0.2012.7A,A,0J,0,0.0B,B,0B,A,0.0C,C,0B,0A,0.0D,D,9,A,0.0E,E,9,0A,0.5F,F,0K,L,OZ.5G,G,0,L,OZ.5H,H,0K,0L,OZ.5I,I,0,0L,OZ.0J,J,e,08,0.0K,K,e,B,0..YRABCDE,ABCDE,1,0,05,0,c5cae9,A,B,C,D,E,,.YRBF,BF,1,0,0G,G,303e9f,B,F,,.YRDG,DG,1,0,4,G,0d125a,D,G,,.YRCH,CH,1,0,0G,0G,B2DFDB,C,H,,.YREI,EI,1,0,4,0G,26A69A,E,I,,.YRHIJ,HIJ,1,0,7,0H,00695C,H,I,J,,.YRFGK,FGK,1,0,7,I,c5cae9,F,G,K,,...N_D*2Q7fAG',
    joints: 11,
  },
  {
    id: 34,
    sourcePayload:
      '2v.Ay,1E8.5,0.1011.7A,A,0U5,0,0.5M,M,DZ,0,0.0B,B,0Hj,Fj,0.0C,C,0Hj,0FZ,0.4F,F,0V6,X9,0.0G,G,A,X9,0.0K,K,_o,GS,0.4H,H,0V6,0X0,0.0I,I,A,0X0,0.0J,J,_d,0Bn,0..YRAMBC,AMBC,Fe,Fe,0C-,2,c5cae9,A,M,B,C,,.YRBG,BG,Fe,Fe,08o,OR,303e9f,B,G,,.YRCI,CI,Fe,Fe,08o,0OH,0d125a,C,I,,.YRFGK,FGK,Fe,Fe,Ae,Rb,B2DFDB,F,G,K,,.YRHIJ,HIJ,Fe,Fe,Aa,0Px,26A69A,H,I,J,,...N_Y*1V6Lg4',
    name: 'Gripper with the redundancy removed in m',
    payload:
      '2v.7,o.5,0.2012.7A,A,0J,0,0.5M,M,9,0,0.0B,B,0B,A,0.0C,C,0B,0A,0.4F,F,0K,L,0.0G,G,0,L,0.0K,K,e,B,0.4H,H,0K,0L,0.0I,I,0,0L,0.0J,J,e,08,0..YRAMBC,AMBC,1,0,08,0,c5cae9,A,M,B,C,,.YRBG,BG,1,0,06,G,303e9f,B,G,,.YRCI,CI,1,0,06,0G,0d125a,C,I,,.YRFGK,FGK,1,0,7,I,B2DFDB,F,G,K,,.YRHIJ,HIJ,1,0,7,0H,26A69A,H,I,J,,...N_w*48oLkm',
    joints: 10,
  },
  {
    id: 35,
    sourcePayload:
      '2v.Ay,Im.5,0.1011.7A,A,Fe,0,0.5B,B,0,Fe,OZ.0T,T,AR,5D,0..YRABT,ABT,Fe,Fe,8i,6y,c5cae9,A,B,T,,...N_a*07ROxi',
    name: 'Elliptical trammel, driven in m',
    payload:
      '2v.7,C.5,0.2012.7A,A,A,0,0.5B,B,0,A,OZ.0T,T,7,3,0..YRABT,ABT,1,0,6,4,c5cae9,A,B,T,,...N_Q*2D9JTV',
    joints: 3,
  },
  {
    id: 36,
    sourcePayload:
      '2v.Ay,YO.5,0.1011.7A,A,0ID,0,0.0B,B,G4,FE,0.4C,C,0,YO,0..YRAB,AB,0,0,014,7d,c5cae9,A,B,,.YRBC,BC,0,0,82,Op,303e9f,B,C,,...N_0*2zpmqv',
    name: 'Screw jack in m',
    payload:
      '2v.7,M.5,0.2012.7A,A,0C,0,0.0B,B,A,A,0.4C,C,0,M,0..MRAB,AB,0,0,01,5,c5cae9,A,B,,.MRBC,BC,0,0,5,G,303e9f,B,C,,...N_q*0lhqoa',
    joints: 3,
  },
  {
    id: 37,
    sourcePayload:
      '2u.7q,1a.5,0.1011.4A,A,2C,o,0.0A1,A1,ZP,U,0.8A2,A2,Nc,b,0.0B,B,up,H,0.ZA3,A3,Nc,b,0,AA1,A,A1,1a.4E,E,Vf,8j,0.0F,F,2m,M-,0.GG,G,Zy,Im,0.0H,H,hm,6G,0.0I,I,1XI,Wy,0.KJ,J,q0,Cg,0.0K,K,vq,gB,0.8L,L,Ph,m_,0.8M,M,09E,pW,0.8N,N,0fg,nH,0.GO,O,0165,gD,0..ARAA1,AA1,0,0,Io,e,00695C,A,A1,,.ARA2B,,0,0,eD,R,303e9f,A2,B,,.YPA2A3,A2A3,0,0,0,0,,A2,A3,,.AREFG,EFG,0,0,NS,Gq,0d125a,E,F,G,,.ARGH,GH,0,0,ds,CW,26A69A,G,H,,.ARBHIJ,BHIJ,0,0,11i,Dp,303e9f,H,I,B,J,,.ARFK,FK,0,0,UI,Wb,303e9f,F,K,,.ARIKLMNO,Hood,0,0,03D,kx,0d125a,K,I,L,M,N,O,,KIL,LM,MN,NO.aRKIL,KIL,0,0,yG,fN,0d125a,K,I,L,,.aRLM,LM,0,0,8F,oF,c5cae9,L,M,,.aRMN,MN,0,0,0PS,oP,303e9f,M,N,,.aRNO,NO,0,0,0tt,jl,c5cae9,N,O,,...N_k*2zlhwI',
    name: 'Hood_Hinge in in',
    payload:
      '2u.35,d.5,0.0000.4A,A,t,K,0.0A1,A1,Dy,C,0.0B,B,MN,7,0.hP,P,9I,F,0,AA1,A,A1,d.4E,E,CT,3R,0.0F,F,15,93,0.GG,G,EA,7O,0.0H,H,HE,2T,0.0I,I,cJ,C_,0.KJ,J,KU,4-,0.0K,K,Mn,Gd,0.8L,L,A7,JI,0.8M,M,03e,KI,0.8N,N,0GQ,JP,0.GO,O,0Rc,Gd,0..ARAA1,AA1,0,0,7P,G,00695C,A,A1,,.ARBP,BP,0,0,Fr,B,303e9f,P,B,,.AREFG,EFG,0,0,9F,6e,0d125a,E,F,G,,.ARGH,GH,0,0,Fi,4x,26A69A,G,H,,.ARBHIJ,BHIJ,0,0,Pt,5S,303e9f,H,I,B,J,,.ARFK,FK,0,0,Bx,Cr,303e9f,F,K,,.ARIKLMNO,Hood,0,0,01H,IU,0d125a,K,I,L,M,N,O,,KIL,LM,MN,NO.aRKIL,KIL,0,0,Nk,GI,0d125a,K,I,L,,.aRLM,LM,0,0,3F,Jo,c5cae9,L,M,,.aRMN,MN,0,0,0A1,Js,303e9f,M,N,,.aRNO,NO,0,0,0L-,I0,c5cae9,N,O,,...N_v*0W6P8f',
    joints: 15,
  },
  {
    id: 38,
    sourcePayload:
      '2v.Fe,Fe.5,0.1011.6A,A,0,0,0,,,,2SG.0B,B,VG,0,0..ARAB,AB,NS,1,Fe,0,303e9f,A,B,,...N_M*0BE9dX',
    name: '1.5 gram crank saved in meters',
    payload:
      '2v.A,A.5,0.2012.6A,A,0,0,0,,,,2SG.0B,B,K,0,0..ARAB,AB,2,0,A,0,303e9f,A,B,,...N_H*2h71dM',
    joints: 2,
  },
  {
    id: 39,
    sourcePayload:
      '2v.Ay,1E8.A,0.1011.6O,O,0,0,0.0A,A,6G,Lu,0.0C,C,pa,bW,0.4D,D,_W,0,0.0T,T,Wq,pa,0..MROA,OA,0,0,38,Ay,c5cae9,O,A,,.MRACT,ACT,0,0,UD,a-,303e9f,A,C,T,,.YRCD,CD,3q90,Fe,_W,0,0d125a,C,D,,...N_0*3y3nmK',
    name: 'Custom rocker inertia saved in meters',
    payload:
      '2v.7,o.A,0.2012.6O,O,0,0,0.0A,A,4,E,0.0C,C,X,O,0.4D,D,e,0,0.0T,T,L,X,0..MROA,OA,0,0,2,7,c5cae9,O,A,,.MRACT,ACT,0,0,J,O,303e9f,A,C,T,,.YRCD,CD,Fe,0,e,0,0d125a,C,D,,...N_i*0PP5Zp',
    joints: 5,
  },
  {
    id: 40,
    sourcePayload:
      '2u.Ay,A.5,0.1011.CA,A,0,0,0.0N,N,uG,0,0.hS,S,bW,0,0,ANG,A,N,A.8B,B,1Tm,0,0.4G,G,0,0VG,0.0C,C,1Tm,S8,0.0D,D,1Tm,0S8,0..YRANG,Fixed frame,Fe,Fe,Im,0AR,0d125a,A,N,G,,AN,AG.YRSBCD,Press crosshead,Fe,Fe,1Fn,2,00695C,S,B,C,D,,SB,BCD.aRAN,AN,Fe,Fe,Sd,0,c5cae9,A,N,,.NRAG,AG,Fe,Fe,0,0Fe,303e9f,A,G,,.aRSB,SB,Fe,Fe,119,0,B2DFDB,S,B,,.NRBCD,BCD,Fe,Fe,1Tm,0,26A69A,B,C,D,,...N_u*0Wm3So',
    name: 'Hydraulic crosshead: slow drive lost on meter save',
    payload:
      '2u.7,0.5,0.2012.CA,A,0,0,0.0N,N,a,0,0.hS,S,O,0,0,ANG,A,N,0.8B,B,y,0,0.4G,G,0,0K,0.0C,C,y,I,0.0D,D,y,0I,0..YRANG,Fixed frame,1,0,C,07,0d125a,A,N,G,,AN,AG.YRSBCD,Press crosshead,1,0,p,0,00695C,S,B,C,D,,SB,BCD.aRAN,AN,1,0,I,0,c5cae9,A,N,,.NRAG,AG,1,0,0,0A,303e9f,A,G,,.aRSB,SB,1,0,g,0,B2DFDB,S,B,,.NRBCD,BCD,1,0,y,0,26A69A,B,C,D,,...N_M*0lznYi',
    joints: 7,
  },
  {
    id: 41,
    sourcePayload:
      '2u.Ay,A.5,0.1011.4O,O,0,0,0.0C,C,0,_W,0.4G,G,ku,0,0.0N,N,Ju,Z-,0.hP,P,R0,QX,0,GN,G,N,A..YROC,OC,Fe,Fe,0,VG,c5cae9,O,C,,.ARGN,GN,Fe,1,XO,I0,303e9f,G,N,,.ARPC,PC,Fe,1,DW,iW,0d125a,P,C,,...N_2*2T1fpu',
    name: 'Cylinder-driven boom: slow drive lost on meter save',
    payload:
      '2u.7,0.5,0.2012.4O,O,0,0,0.0C,C,0,e,0.4G,G,U,0,0.0N,N,D,N,0.hP,P,H,H,0,GN,G,N,0..YROC,OC,1,0,0,K,c5cae9,O,C,,.ARGN,GN,1,0,L,C,303e9f,G,N,,.ARPC,PC,1,0,9,S,0d125a,P,C,,...N_m*3MG5hc',
    joints: 5,
  },
  {
    id: 42,
    sourcePayload:
      '2u.Ay,A.5,0.1011.4G,G,0VG,0,0.8A,A,0,0,0.0N,N,tQ,0,0.hS,S,cM,0,0,GAN,A,N,A.8B,B,1Tm,0,0.0E,E,1jO,Fe,0.4O,O,1E8,0VG,0.GT,T,2Ce,_W,0..YRGAN,Offset barrel,Fe,Fe,83,0,0d125a,G,A,N,,GA,AN.YRSBE,Rod bracket,Fe,Fe,1GV,5D,00695C,S,B,E,,SB,BE.YROET,Hatch,Fe,Fe,1jO,Fe,c5cae9,O,E,T,,.NRGA,GA,Fe,Fe,0Fe,0,c5cae9,G,A,,.aRAN,AN,Fe,Fe,Rj,0,303e9f,A,N,,.aRSB,SB,Fe,Fe,123,0,B2DFDB,S,B,,.NRBE,BE,Fe,Fe,1ba,7q,26A69A,B,E,,...N_c*1fG7u0',
    name: 'Offset-mount hatch: slow drive lost on meter save',
    payload:
      '2u.7,0.5,0.2012.4G,G,0K,0,0.8A,A,0,0,0.0N,N,Z,0,0.hS,S,P,0,0,GAN,A,N,0.8B,B,y,0,0.0E,E,16,A,0.4O,O,o,0K,0.GT,T,1Q,e,0..YRGAN,Offset barrel,1,0,5,0,0d125a,G,A,N,,GA,AN.YRSBE,Rod bracket,1,0,q,3,00695C,S,B,E,,SB,BE.YROET,Hatch,1,0,16,A,c5cae9,O,E,T,,.NRGA,GA,1,0,0A,0,c5cae9,G,A,,.aRAN,AN,1,0,I,0,303e9f,A,N,,.aRSB,SB,1,0,g,0,B2DFDB,S,B,,.NRBE,BE,1,0,11,5,26A69A,B,E,,...N_z*1GNg3h',
    joints: 8,
  },
  {
    id: 43,
    sourcePayload:
      '2u.Fe,1E8.0,0.1011.6A,A,0mv,0VU,0,,,,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0..MRAB,AB,0,0,0ix,08i,303e9f,A,B,,.MRBC,BC,0,0,32,NJ,26A69A,B,C,,.MRCD,CD,0,0,nd,3P,0d125a,C,D,,...N_u*1K9IuC',
    name: 'Four-bar: slow pin drive rounds to zero',
    payload:
      '2u.Fe,1E8.0,0.1011.6A,A,0mv,0VU,0,,,,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0..MRAB,AB,0,0,0ix,08i,303e9f,A,B,,.MRBC,BC,0,0,32,NJ,26A69A,B,C,,.MRCD,CD,0,0,nd,3P,0d125a,C,D,,...N_u*1K9IuC',
    joints: 4,
  },
  {
    id: 44,
    sourcePayload:
      '2v.Ay,1E8.4,0.1011.4B,B,0,0,0.GP,P,Qa,0,0.4H,H,0NS,1Qe,0.2K,K,c5,13o,0..YRHK,HK,Fe,Fe,7L,1FD,c5cae9,H,K,,.YRKP,KP,Fe,Fe,WL,Xv,303e9f,K,P,,.YRBP,BP,Fe,Fe,DI,0,0d125a,B,P,,...N_p*3gclXt',
    name: 'Leg on a bicycle crank: floating motor under load',
    payload:
      '2v.Ay,1E8.4,0.1011.4B,B,0,0,0.GP,P,Qa,0,0.4H,H,0NS,1Qe,0.2K,K,c5,13o,0..MRHK,HK,0,0,7L,1FD,c5cae9,H,K,,.MRKP,KP,0,0,WL,Xv,303e9f,K,P,,.MRBP,BP,0,0,DI,0,0d125a,B,P,,..2F1,KP,F1,WL,Xv,lz,Xv,OQW..N_.KFF1~26A69AL*2sDqrR',
    joints: 4,
  },
  {
    id: 45,
    sourcePayload:
      '2v.Ay,1E8.A,0.1011.4A,A,0,0,0.2C,C,s8,0VG,0.0D,D,k_,0j9,0.4B,B,0GY,0In,0.0N,N,1NW,0,0..YRACN,ACN,Fe,Fe,lD,0AR,c5cae9,A,C,N,,.YRCD,CD,Fe,Fe,oZ,0cC,303e9f,C,D,,.YRDB,DB,Fe,Fe,FE,0Vz,0d125a,D,B,,...N_B*4TSki0',
    name: 'Oscillating fan: floating motor under load',
    payload:
      '2v.Ay,1E8.A,0.1011.4A,A,0,0,0.2C,C,s8,0VG,0.0D,D,k_,0j9,0.4B,B,0GY,0In,0.0N,N,1NW,0,0..MRACN,ACN,0,0,lD,0AR,c5cae9,A,C,N,,.MRCD,CD,0,0,oZ,0cC,303e9f,C,D,,.MRDB,DB,0,0,FE,0Vz,0d125a,D,B,,..2F1,CD,F1,oZ,0cC,12B,0cC,OQW..N_.KFF1~26A69Ak*4PUd9I',
    joints: 5,
  },
  {
    id: 46,
    sourcePayload:
      '2v.Ay,1E8.3,0.1011.4A,A,0gB,0oI,0.0M,M,0QZ,0o1,0.2P,P,0d4,0,0.4S,S,0,0,0.0H,H,o0,0,0.5R,R,r8,0eW,OZ..YRAM,AM,Fe,Fe,0YN,0oA,c5cae9,A,M,,.YRMP,MP,Fe,Fe,0Wq,0P1,303e9f,M,P,,.YRPSH,PSH,Fe,Fe,3f,0,0d125a,P,S,H,,.YRHR,HR,Fe,Fe,pa,0KG,B2DFDB,H,R,,...N_x*47FyUe',
    name: 'Walking-beam pumping unit: floating motor under load',
    payload:
      '2v.Ay,1E8.3,0.1011.4A,A,0gB,0oI,0.0M,M,0QZ,0o1,0.2P,P,0d4,0,0.4S,S,0,0,0.0H,H,o0,0,0.5R,R,r8,0eW,OZ..MRAM,AM,0,0,0YN,0oA,c5cae9,A,M,,.MRMP,MP,0,0,0Wq,0P1,303e9f,M,P,,.MRPSH,PSH,0,0,3f,0,0d125a,P,S,H,,.MRHR,HR,0,0,pa,0KG,B2DFDB,H,R,,..2F1,HR,F1,pa,0KG,13C,0KG,OQW..N_I*2aRLsg',
    joints: 6,
  },
  {
    id: 47,
    name: 'Single scissor: spurious sideways acceleration',
    payload:
      '2v.Ay,1E8.A,0.1011.6A,A,0,0,0,,,,02SG.5B,B,_W,0,0.0C,C,VG,NS,0.0D,D,0,ku,0.0E,E,_W,ku,0..YRACE,ACE,0,0,VG,NS,c5cae9,A,C,E,,.YRBCD,BCD,0,0,VG,NS,303e9f,B,C,D,,...N_d*10w8Vn',
    joints: 5,
  },
  {
    id: 48,
    name: 'Seven-stage scissor: top acceleration spike',
    payload:
      '2v.Ay,1E8.A,0.1011.6A,A,0,0,0,,,,02SG.5B,B,_W,0,0.0C,C,VG,NS,0.0D,D,0,ku,0.0E,E,_W,ku,0.0F,F,VG,16K,0.0G,G,0,1Tm,0.0H,H,_W,1Tm,0.0I,I,VG,1rC,0.0J,J,0,2Ce,0.0K,K,_W,2Ce,0.0L,L,VG,2a4,0.0M,M,0,2xW,0.0N,N,_W,2xW,0.0O,O,VG,3Iy,0.0P,P,0,3gO,0.0Q,Q,_W,3gO,0.0R,R,VG,41q,0.0S,S,0,4PG,0.0T,T,_W,4PG,0.0U,U,VG,4mi,0.0V,V,0,588,0.0W,W,_W,588,0..YRACE,ACE,0,0,VG,NS,c5cae9,A,C,E,,.YRBCD,BCD,0,0,VG,NS,303e9f,B,C,D,,.YRDFH,DFH,0,0,VG,16K,0d125a,D,F,H,,.YREFG,EFG,0,0,VG,16K,B2DFDB,E,F,G,,.YRGIK,GIK,0,0,VG,1rC,26A69A,G,I,K,,.YRHIJ,HIJ,0,0,VG,1rC,00695C,H,I,J,,.YRJLN,JLN,0,0,VG,2a4,c5cae9,J,L,N,,.YRKLM,KLM,0,0,VG,2a4,303e9f,K,L,M,,.YRMOQ,MOQ,0,0,VG,3Iy,0d125a,M,O,Q,,.YRNOP,NOP,0,0,VG,3Iy,B2DFDB,N,O,P,,.YRPRT,PRT,0,0,VG,41q,26A69A,P,R,T,,.YRQRS,QRS,0,0,VG,41q,00695C,Q,R,S,,.YRSUW,SUW,0,0,VG,4mi,c5cae9,S,U,W,,.YRTUV,TUV,0,0,VG,4mi,303e9f,T,U,V,,...N_Z*4XTZOP',
    joints: 23,
  },
  {
    id: 49,
    name: 'Drive reversal: frozen and welded-member velocities keep their old signs',
    payload:
      '2v.Ay,1E8.A,0.1011.8A,A,0,0,0.0N,N,tQ,0,0.fB,B,cM,0,0,ABCDEN,A,N.8C,C,1Tm,0,0.8D,D,ku,_W,0.6E,E,ku,0ku,0..YRABCDEN,ABCDEN,Fe,Fe,ku,2d,00695C,A,B,C,D,E,N,,AN,BC,AD,CD,DE.NRAN,AN,Fe,Fe,Rj,0,c5cae9,A,N,,.NRBC,BC,Fe,Fe,123,0,303e9f,B,C,,.NRAD,AD,Fe,Fe,NS,VG,0d125a,A,D,,.NRCD,CD,Fe,Fe,16K,VG,B2DFDB,C,D,,.NRDE,DE,Fe,Fe,ku,7q,26A69A,D,E,,...N_S*0NEyMO',
    joints: 6,
  },
  {
    id: 51,
    name: 'Bent welded coupler: primitive CoM acceleration error',
    payload:
      '2v.Ay,1E8.A,0.1011.6A,A,0,0,0,,,,02SG.0B,B,0EF,C9,0.8C,C,Ex,Tf,0.4D,D,rN,0,0.0E,E,mx,Ub,0..YRAB,AB,0,0,077,65,c5cae9,A,B,,.YRBCE,BCE,0,0,GY,O8,B2DFDB,B,C,E,,BC,CE.YRDE,DE,0,0,p9,FJ,26A69A,D,E,,.NRBC,BC,0,0,M,Kv,303e9f,B,C,,.NRCE,CE,0,0,Vx,U7,0d125a,C,E,,...N_B*28jGew',
    joints: 5,
  },
  {
    id: 52,
    sourcePayload:
      '2v.Ay,1E8.A,0.1011.4A,A,0,0,0.2B,B,05v,7v,0,,,,2SG.5C,C,pq,30,0..YRAB,AB,0,0,02y,3z,c5cae9,A,B,,.YRBC,BC,0,0,Mz,5T,303e9f,B,C,,...N_8*4VHKRB',
    name: 'Slider-crank: floating input B under load',
    payload:
      '2v.Ay,1E8.A,0.1011.4A,A,0,0,0.2B,B,05v,7v,0,,,,2SG.5C,C,pq,30,0..MRAB,AB,0,0,02y,3z,c5cae9,A,B,,.MRBC,BC,0,0,Mz,5T,303e9f,B,C,,..2F1,BC,F1,EK,6B,Qq,FZ,OQW..N_.KFF1~26A69Ak*3fLVTp',
    joints: 3,
  },
  {
    id: 53,
    sourcePayload:
      '2v.Ay,1E8.A,0.1011.4A,A,0,0,0.0B,B,CR,BN,0.0C,C,12b,fo,0.4D,D,12J,0,0.0E,E,Ya,ZO,0.2F,F,18o,Qe,0,,,,2SG.4G,G,1Uv,0,0..YRAB,AB,0,0,6E,5i,c5cae9,A,B,,.YRBCE,BCE,0,0,bt,TW,303e9f,B,C,E,,.YRCD,CD,0,0,12S,Kv,0d125a,C,D,,.YREF,EF,0,0,rh,V0,B2DFDB,E,F,,.YRFG,FG,0,0,1Js,DK,26A69A,F,G,,...N_Z*2JT1XM',
    name: 'Stephenson six-bar: floating input F under load',
    payload:
      '2v.Ay,1E8.A,0.1011.4A,A,0,0,0.0B,B,CR,BN,0.0C,C,12b,fo,0.4D,D,12J,0,0.0E,E,Ya,ZO,0.2F,F,18o,Qe,0,,,,2SG.4G,G,1Uv,0,0..MRAB,AB,0,0,6E,5i,c5cae9,A,B,,.MRBCE,BCE,0,0,bt,TW,303e9f,B,C,E,,.MRCD,CD,0,0,12S,Kv,0d125a,C,D,,.MREF,EF,0,0,rh,V0,B2DFDB,E,F,,.MRFG,FG,0,0,1Js,DK,26A69A,F,G,,..2F1,EF,F1,ly,WK,yS,fi,OQW..N_z*4XvVdq',
    joints: 7,
  },
  {
    id: 54,
    sourcePayload:
      '2v.Ay,1E8.A,0.1011.4A,A,0,0,0.2B,B,CM,6G,0,,,,2SG.0C,C,eJ,ZQ,0.4D,D,gr,0,0.0E,E,iA,hE,0.0F,F,1CY,SY,0.4G,G,1HB,0,0..YRAB,AB,0,0,6B,38,c5cae9,A,B,,.YRBC,BC,0,0,QL,Kr,303e9f,B,C,,.YRCDE,CDE,0,0,gR,QD,0d125a,C,D,E,,.YREF,EF,0,0,yM,Zu,B2DFDB,E,F,,.YRFG,FG,0,0,1Et,EH,26A69A,F,G,,...N_W*2x5i0M',
    name: 'Watt six-bar: floating input B under load',
    payload:
      '2v.Ay,1E8.A,0.1011.4A,A,0,0,0.2B,B,CM,6G,0,,,,2SG.0C,C,eJ,ZQ,0.4D,D,gr,0,0.0E,E,iA,hE,0.0F,F,1CY,SY,0.4G,G,1HB,0,0..MRAB,AB,0,0,6B,38,c5cae9,A,B,,.MRBC,BC,0,0,QL,Kr,303e9f,B,C,,.MRCDE,CDE,0,0,gR,QD,0d125a,C,D,E,,.MREF,EF,0,0,yM,Zu,B2DFDB,E,F,,.MRFG,FG,0,0,1Et,EH,26A69A,F,G,,..2F1,EF,F1,tV,c5,13-,lT,OQW..N_x*46nCuu',
    joints: 7,
  },
  {
    id: 55,
    name: 'Narrow-stroke double butterfly: declared dead at a nonsingular pose',
    payload:
      '2v.Ay,1E8.A,0.1011.6A,A,0,0,0,,,,2SG.4B,B,1Sl,0M,0.0C,C,04j,P_,0.0D,D,Qj,1i,0.0E,E,ng,iL,0.0F,F,1XD,mB,0.0G,G,1Bg,bT,0.0H,H,jL,8l,0.0I,I,1AD,0MG,0.0J,J,157,TH,0..YRACD,ACD,0,0,7M,9E,c5cae9,A,C,D,,.YRCE,CE,0,0,MV,Z9,303e9f,C,E,,.YREFG,EFG,0,0,1AB,hK,0d125a,E,F,G,,.YRBFJ,BFJ,0,0,1MM,Pj,B2DFDB,B,F,J,,.YRDHI,DHI,0,0,mm,03y,26A69A,D,H,I,,.YRGH,GH,0,0,yV,N6,00695C,G,H,,.YRIJ,IJ,0,0,17g,3X,c5cae9,I,J,,...N_V*1Id2cG',
    joints: 10,
  },
  {
    id: 56,
    name: 'Narrow driven-rocker four-bar: valid motion refused at startup',
    payload:
      '2v.Ay,1E8.0,0.1011.4A,A,0,0,0.0B,B,01N,o,0.0C,C,CDG,L9B,0.6D,D,OQW,0,0,,,,A..YRAB,AB,0,0,0h,P,c5cae9,A,B,,.YRBC,BC,0,0,65z,Aa_,303e9f,B,C,,.YRCD,CD,0,0,IJu,Aab,0d125a,C,D,,...N_r*0QvvkF',
    joints: 4,
  },
  {
    id: 57,
    name: 'Short-stroke slider-driven crank: valid motion refused at startup',
    payload:
      '2v.Ay,A.5,0.1011.4A,A,0,0,0.0B,B,0,K,0.7C,C,VG,0,0,,,,A..YRAB,AB,0,0,0,A,c5cae9,A,B,,.YRBC,BC,0,0,Fe,A,303e9f,B,C,,...N_w*3CbRSp',
    joints: 3,
  },
  {
    id: 58,
    name: 'Slow slider-crank: degree acceleration graph erases the entire curve',
    payload:
      '2u.Ay,1E8.0,0.1011.6A,A,3NU,2SQ,0,,,,A.0B,B,3NU,3Ny,0.5C,C,0FA,2SQ,0,,,,,Kc..YRAB,AB,Gz,0,0,1a,c5cae9,A,B,,.YRBC,BC,7r,3,7q,Ay,303e9f,B,C,,...N_K*1fFTyV',
    joints: 3,
  },
  {
    id: 59,
    sourcePayload:
      '2v.Ay,1E8.A,0.1011.6A,A,016K,0Fe,0.0B,B,01KV,093,0.0C,C,0R4,Fe,0.CD,D,0,0,0.0E,E,CW,Lg,0.0F,F,pS,Ok,0.4G,G,si,6G,0..YRAB,AB,0,0,01DQ,0CM,c5cae9,A,B,,.YRBC,BC,0,0,0to,3I,303e9f,B,C,,.YRCDE,CDE,0,0,04t,CR,26A69A,C,D,E,,CD,DE.YREF,EF,0,0,V_,NC,00695C,E,F,,.YRFG,FG,0,0,r4,FV,c5cae9,F,G,,.NRCD,CD,0,0,0DY,7q,0d125a,C,D,,.NRDE,DE,0,0,6G,Ar,B2DFDB,D,E,,...N_g*0v8xc4',
    name: 'Welded bell crank: a newly added member load is omitted',
    payload:
      '6v.Ay,1E8.A,0.1011.6A,A,016K,0Fe,0.0B,B,01KV,093,0.0C,C,0R4,Fe,0.CD,D,0,0,0.0E,E,CW,Lg,0.0F,F,pS,Ok,0.4G,G,si,6G,0..MRAB,AB,0,0,01DQ,0CM,c5cae9,A,B,,.MRBC,BC,0,0,0to,3I,303e9f,B,C,,.MRCDE,CDE,3q90,6Q,04t,CR,26A69A,C,D,E,,CD,DE.MREF,EF,0,0,V_,NC,00695C,E,F,,.MRFG,FG,0,0,r4,FV,c5cae9,F,G,,.NRCD,CD,1w4W,0,0DY,7q,0d125a,C,D,,.NRDE,DE,1w4W,0,6G,Ar,B2DFDB,D,E,,...N_q*2ua9C4',
    joints: 7,
  },
  {
    id: 60,
    sourcePayload:
      '2v.Ay,1E8.A,0.1011.6A,A,016K,0Fe,0.0B,B,01KV,093,0.0C,C,0R4,Fe,0.CD,D,0,0,0.0E,E,CW,Lg,0.0F,F,pS,Ok,0.4G,G,si,6G,0..YRAB,AB,0,0,01DQ,0CM,c5cae9,A,B,,.YRBC,BC,0,0,0to,3I,303e9f,B,C,,.YRCDE,CDE,0,0,04t,CR,26A69A,C,D,E,,CD,DE.YREF,EF,0,0,V_,NC,00695C,E,F,,.YRFG,FG,0,0,r4,FV,c5cae9,F,G,,.NRCD,CD,0,0,0DY,7q,0d125a,C,D,,.NRDE,DE,0,0,6G,Ar,B2DFDB,D,E,,...N_g*0v8xc4',
    name: 'Bell crank: a paused member tracer lands away from the requested point',
    payload:
      '2v.Ay,1E8.A,0.1011.6A,A,016K,0Fe,0.0B,B,01KV,093,0.0C,C,0R4,Fe,0.CD,D,0,0,0.0E,E,CW,Lg,0.0F,F,pS,Ok,0.4G,G,si,6G,0..YRAB,AB,0,0,01DQ,0CM,c5cae9,A,B,,.YRBC,BC,0,0,0to,3I,303e9f,B,C,,.YRCDE,CDE,0,0,04t,CR,26A69A,C,D,E,,CD,DE.YREF,EF,0,0,V_,NC,00695C,E,F,,.YRFG,FG,0,0,r4,FV,c5cae9,F,G,,.NRCD,CD,0,0,0DY,7q,0d125a,C,D,,.NRDE,DE,0,0,6G,Ar,B2DFDB,D,E,,...N_g*0v8xc4',
    joints: 7,
  },
  {
    id: 61,
    name: 'Drive reversal: graph and exported timestamps retain the old cycle direction',
    payload:
      '2v.Fe,1E8.A,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0..YRAB,AB,0,0,0ix,08i,303e9f,A,B,,.YRBC,BC,0,0,32,NJ,26A69A,B,C,,.YRCD,CD,0,0,nd,3P,0d125a,C,D,,...N_p*1HFIjn',
    joints: 4,
  },
  {
    id: 62,
    name: 'Narrow Peaucellier cell: a movable exact-line linkage refuses to start',
    payload:
      '2v.Ay,1E8.A,0.1011.4O,O,0,0,0.6C,C,7q,0,0,,,,0A.0P,P,Fe,0,0.0A,A,ku,5,0.0B,B,ku,05,0.GQ,Q,1E8,0,0..MRCP,CP,0,0,Bk,0,c5cae9,C,P,,.MROA,OA,0,0,NS,3,303e9f,O,A,,.MROB,OB,0,0,NS,02,0d125a,O,B,,.MRAP,AP,0,0,VG,3,B2DFDB,A,P,,.MRBP,BP,0,0,VG,02,26A69A,B,P,,.MRAQ,AQ,0,0,_W,3,00695C,A,Q,,.MRBQ,BQ,0,0,_W,02,c5cae9,B,Q,,...N_6*39jKI3',
    joints: 6,
  },
  {
    id: 63,
    name: 'Peaucellier straight-line output: rounded poses produce wrong acceleration',
    payload:
      '2v.Ay,1E8.A,0.1011.4O,O,0,0,0.6C,C,1E8,0,0,,,,02SG.0P,P,2SG,0,0.0A,A,7Km,7q,0.0B,B,7Km,07q,0.GQ,Q,CDG,0,0..MRCP,CP,0,0,1rC,0,c5cae9,C,P,,.MROA,OA,0,0,3gO,3w,303e9f,O,A,,.MROB,OB,0,0,3gO,03w,0d125a,O,B,,.MRAP,AP,0,0,4uW,3w,B2DFDB,A,P,,.MRBP,BP,0,0,4uW,03w,26A69A,B,P,,.MRAQ,AQ,0,0,9n0,3w,00695C,A,Q,,.MRBQ,BQ,0,0,9n0,03w,c5cae9,B,Q,,...N_R*3JDdTH',
    joints: 6,
  },
  {
    id: 64,
    name: 'Equal-arm guided slider-crank: clockwise cycle never closes',
    payload:
      '2v.16,1E8.A,0.1011.6A,A,0,0,0,,,,02SG.0B,B,01N,o,0.5C,C,0,0,8C.0T,T,0t,W,0..YRAB,AB,0,0,0h,P,c5cae9,A,B,,.YRBCT,BCT,0,0,0l,R,303e9f,B,C,T,,...N_K*1xKsKV',
    joints: 4,
  },
  {
    id: 65,
    name: 'Passive cylinder array: acceleration corrupted by rounded poses',
    payload:
      '2v.16,1E8.A,0.1011.6A,A,0,0,0,,,,02SG.0B,B,0o,1N,0.4C,C,DY,7q,0.0D,D,6T,4d,0.fE,E,6J,4Z,0,CD,C,D.4F,F,0DY,07q,0.0G,G,07E,03I,0.fH,H,076,03C,0,FG,F,G..YRAB,AB,0,0,0P,h,c5cae9,A,B,,.YRCD,CD,0,0,9-,6E,303e9f,C,D,,.YRBE,BE,0,0,2n,2z,0d125a,B,E,,.YRFG,FG,0,0,0AO,05Z,B2DFDB,F,G,,.YRBH,BH,0,0,03y,0x,26A69A,B,H,,...N_1*2qKFP0',
    joints: 8,
  },
  {
    id: 66,
    name: 'Frozen cylinder: overview invents a cylinder-driven lever',
    payload:
      '2v.Ay,1E8.A,0.1011.8A,A,0,0,0.0N,N,tQ,0,0.fB,B,cM,0,0,ABCDEN,A,N.8C,C,1Tm,0,0.8D,D,ku,_W,0.6E,E,ku,0ku,0..YRABCDEN,ABCDEN,Fe,Fe,ku,2d,00695C,A,B,C,D,E,N,,AN,BC,AD,CD,DE.NRAN,AN,Fe,Fe,Rj,0,c5cae9,A,N,,.NRBC,BC,Fe,Fe,123,0,303e9f,B,C,,.NRAD,AD,Fe,Fe,NS,VG,0d125a,A,D,,.NRCD,CD,Fe,Fe,16K,VG,B2DFDB,C,D,,.NRDE,DE,Fe,Fe,ku,7q,26A69A,D,E,,...N_S*0NEyMO',
    joints: 6,
  },
  {
    id: 67,
    name: 'Ten-output four-bar bank: angular acceleration loses half its value',
    payload:
      '2v.Z,1E8.A,0.1011.6A,A,0,0,0,,,,2SG.0B,B,0,o,0.0C,C,1K,05,0.4D,D,0c,01S,0.0E,E,01X,A,0.4F,F,5,01f,0.0G,G,1k,l,0.4H,H,p,01Y,0.0I,I,012,0i,0.4J,J,1R,016,0.0K,K,1N,25,0.4L,L,1r,0Q,0.0M,M,08,01B,0.4N,N,1w,R,0.0O,O,0Z,2l,0.4P,P,1d,1F,0.0Q,Q,1S,0n,0.4R,R,_,1u,0.0S,S,02C,j,0.4T,T,6,2C,0.0U,U,1v,21,0.4V,V,0t,26,0..YRAB,AB,0,0,0,P,c5cae9,A,B,,.YRBC,BC,0,0,g,N,303e9f,B,C,,.YRCD,CD,0,0,N,0n,0d125a,C,D,,.YRBE,BE,0,0,0m,U,B2DFDB,B,E,,.YREF,EF,0,0,0k,0m,26A69A,E,F,,.YRBG,BG,0,0,t,m,00695C,B,G,,.YRGH,GH,0,0,1G,0P,c5cae9,G,H,,.YRBI,BI,0,0,0X,3,303e9f,B,I,,.YRIJ,IJ,0,0,D,0v,0d125a,I,J,,.YRBK,BK,0,0,h,1S,B2DFDB,B,K,,.YRKL,KL,0,0,1c,s,26A69A,K,L,,.YRBM,BM,0,0,04,0C,00695C,B,M,,.YRMN,MN,0,0,v,0O,c5cae9,M,N,,.YRBO,BO,0,0,0H,1n,303e9f,B,O,,.YROP,OP,0,0,Y,1-,0d125a,O,P,,.YRBQ,BQ,0,0,k,1,B2DFDB,B,Q,,.YRQR,QR,0,0,1D,a,26A69A,Q,R,,.YRBS,BS,0,0,016,m,00695C,B,S,,.YRST,ST,0,0,013,1T,c5cae9,S,T,,.YRBU,BU,0,0,z,1Q,303e9f,B,U,,.YRUV,UV,0,0,X,24,0d125a,U,V,,...N_F*0J2yXu',
    joints: 22,
  },
  {
    id: 68,
    name: 'Independent four-bar bank is labeled a Jansen walking leg',
    payload:
      '2v.Z,1E8.A,0.1011.6A,A,0,0,0,,,,2SG.0B,B,0,o,0.0C,C,1K,05,0.4D,D,0c,01S,0.0E,E,01X,A,0.4F,F,5,01f,0.0G,G,1k,l,0.4H,H,p,01Y,0.0I,I,012,0i,0.4J,J,1R,016,0.0K,K,1N,25,0.4L,L,1r,0Q,0.0M,M,08,01B,0.4N,N,1w,R,0.0O,O,0Z,2l,0.4P,P,1d,1F,0.0Q,Q,1S,0n,0.4R,R,_,1u,0.0S,S,02C,j,0.4T,T,6,2C,0.0U,U,1v,21,0.4V,V,0t,26,0..YRAB,AB,0,0,0,P,c5cae9,A,B,,.YRBC,BC,0,0,g,N,303e9f,B,C,,.YRCD,CD,0,0,N,0n,0d125a,C,D,,.YRBE,BE,0,0,0m,U,B2DFDB,B,E,,.YREF,EF,0,0,0k,0m,26A69A,E,F,,.YRBG,BG,0,0,t,m,00695C,B,G,,.YRGH,GH,0,0,1G,0P,c5cae9,G,H,,.YRBI,BI,0,0,0X,3,303e9f,B,I,,.YRIJ,IJ,0,0,D,0v,0d125a,I,J,,.YRBK,BK,0,0,h,1S,B2DFDB,B,K,,.YRKL,KL,0,0,1c,s,26A69A,K,L,,.YRBM,BM,0,0,04,0C,00695C,B,M,,.YRMN,MN,0,0,v,0O,c5cae9,M,N,,.YRBO,BO,0,0,0H,1n,303e9f,B,O,,.YROP,OP,0,0,Y,1-,0d125a,O,P,,.YRBQ,BQ,0,0,k,1,B2DFDB,B,Q,,.YRQR,QR,0,0,1D,a,26A69A,Q,R,,.YRBS,BS,0,0,016,m,00695C,B,S,,.YRST,ST,0,0,013,1T,c5cae9,S,T,,.YRBU,BU,0,0,z,1Q,303e9f,B,U,,.YRUV,UV,0,0,X,24,0d125a,U,V,,...N_F*0J2yXu',
    joints: 22,
  },
  {
    id: 69,
    name: 'Near-equal radial rod: spurious angular acceleration',
    payload:
      '2v.E,1E8.A,0.1011.6A,A,0,0,0,,,,2SG.0B,B,J,7,0.5C,C,Y,K,8C.0D,D,b,O,0.5E,E,B,P,I0.0F,F,8,T,0.5G,G,01,6,Rq.0H,H,06,3,0.5I,I,0,0,bf.0J,J,04,04,0.5K,K,0,0,lT.0L,L,04,04,0.5M,M,0,0,vH.0N,N,04,04,0.5O,O,0,0,136.0P,P,04,04,0.5Q,Q,0,0,1Cw.0R,R,04,04,0.5S,S,E,0D,1Mk.0T,T,F,0I,0.5U,U,a,04,1WY.0V,V,f,05,0..YRAB,AB,0,0,9,3,c5cae9,A,B,,.YRBCD,BCD,0,0,U,H,303e9f,B,C,D,,.YRBEF,BEF,0,0,D,L,0d125a,B,E,F,,.YRBGH,BGH,0,0,4,5,B2DFDB,B,G,H,,.YRBIJ,BIJ,0,0,5,1,26A69A,B,I,J,,.YRBKL,BKL,0,0,5,1,00695C,B,K,L,,.YRBMN,BMN,0,0,5,1,c5cae9,B,M,N,,.YRBOP,BOP,0,0,5,1,303e9f,B,O,P,,.YRBQR,BQR,0,0,5,1,0d125a,B,Q,R,,.YRBST,BST,0,0,G,08,B2DFDB,B,S,T,,.YRBUV,BUV,0,0,W,01,26A69A,B,U,V,,...N_h*3AV0WJ',
    joints: 22,
  },
];
