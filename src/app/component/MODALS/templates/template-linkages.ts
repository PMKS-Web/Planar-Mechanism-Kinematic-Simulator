export const BUILT_IN_TEMPLATE_IDS = [
  '4-Bar',
  'Watt_I',
  'Watt_II',
  'Stephenson_III',
  'Slider_Crank',
] as const;

export type BuiltInTemplateID = (typeof BUILT_IN_TEMPLATE_IDS)[number];

/** Production URL payloads used by the template dialog and regression tests. */
export const TEMPLATE_LINKAGES: Record<BuiltInTemplateID, string> = {
  '4-Bar':
    '0P.TY.K,0.101.MA,A,0mv,0VU,0.GB,B,0e_,E6,0.GC,C,l1,WW,0.KD,D,qD,0Pk,0..YRAB,AB,Fe,Fe,0ix,08i,c5cae9,A,B,,.YRBC,BC,Fe,Fe,32,NJ,303e9f,B,C,,.YRCD,CD,Fe,Fe,nd,3P,0d125a,C,D,,...JBq',
  Watt_I:
    '0P.TY.K,0.101.MA,A,0Qh,0Kn,0.GB,B,0e1,9i,0.GC,C,bT,LF,0.GD,D,0G5,tZ,0.GE,E,V5,1_z,0.GF,F,1mM,1Gv,0.KG,G,1rt,0ey,0..YRAB,AB,Fe,Fe,0XM,05Z,c5cae9,A,B,,.YRBCD,BCD,Fe,Fe,06D,Sr,303e9f,B,C,D,,.YRDE,DE,Fe,Fe,7W,1RG,0d125a,D,E,,.YREF,EF,Fe,Fe,17j,1dx,B2DFDB,E,F,,.YRFCG,FCG,Fe,Fe,1PE,KQ,26A69A,F,C,G,,...JAp',
  Watt_II:
    '0P.TY.K,0.101.MA,A,0Vf,0Vd,0.GB,B,0mZ,08A,0.GC,C,06Y,LC,0.GD,D,1MR,J2,0.KE,E,rw,0j2,0.GF,F,2ic,ID,0.KG,G,2lk,0Zt,0..YRAB,AB,Fe,Fe,0e6,0Ju,c5cae9,A,B,,.YRBC,BC,Fe,Fe,0RY,6X,303e9f,B,C,,.YRCDE,CDE,Fe,Fe,ic,01d,0d125a,C,D,E,,.YRDF,DF,Fe,Fe,21X,Id,B2DFDB,D,F,,.YRFG,FG,Fe,Fe,2kA,08r,26A69A,F,G,,...JBm',
  Stephenson_III:
    '0P.TY.K,0.101.MA,A,0YP,0ce,0.GB,B,0cQ,0FI,0.GC,C,lC,1-,0.KD,D,ow,0U1,0.GE,E,033,D-,0.GF,F,Dc,nj,0.KG,G,1M0,GJ,0..YRAB,AB,Fe,Fe,0aP,0Qz,c5cae9,A,B,,.YRBCE,BCE,Fe,Fe,1w,E,303e9f,B,C,E,,.YRCD,CD,Fe,Fe,n3,0E1,0d125a,C,D,,.YREF,EF,Fe,Fe,5H,Vs,B2DFDB,E,F,,.YRFG,FG,Fe,Fe,np,X0,26A69A,F,G,,...JBe',
  Slider_Crank:
    '0P.TY.K,0.101.MA,A,0mA,0c,0.GB,B,0Yt,bK,0.GC,C,il,H-,0.LD,D,il,H-,0..YRAB,AB,Fe,Fe,0fW,IN,c5cae9,A,B,,.YRBC,BC,Fe,Fe,4y,Rf,303e9f,B,C,,.YPCD,CD,Fe,0,0,0,,C,D,,...JAe',
};
