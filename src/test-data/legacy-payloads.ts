/**
 * The seventeen library payloads as the last release before Stage 1 emitted them.
 *
 * These are the only checked-in bytes anyone's browser has actually been handed:
 * every one of them spells a slider the old way -- a prismatic joint, a
 * coincident pin, and a zero-length piston record joining them -- and a URL is a
 * compatibility surface, so they have to go on opening as the mechanism they
 * were.
 *
 * Kept as strings rather than rebuilt from fixtures on purpose.
 * `transcoding/url-slider-fold.spec.ts` builds its legacy trio and encodes it,
 * which is the right way to test the fold in the abstract and cannot catch a
 * byte the old *writer* produced that the new reader mis-parses. Nothing else
 * in the suite decodes a payload a shipped release emitted.
 *
 * Copied out of `template-linkages.ts` at commit `af69ff98^`, the commit before
 * the regeneration. They are frozen: regenerating the templates must never
 * rewrite this file, because the whole point of it is that these are what was
 * shipped.
 */
export const LEGACY_TEMPLATE_PAYLOADS: Readonly<Record<string, string>> = {
  Backhoe_Bucket:
    '2v.Ay,Im.5,0.1011.4A,A,01jO,0,0.0B,B,0sb,Py,0.8C,C,018N,HX,0.0D,D,0Ha,hT,0.4G,G,0,0,0.0H,H,VG,Im,0.4J,J,o0,0P0,0.0K,K,1BI,2i,0.0T,T,1NW,0ee,0.ZE,E,018N,HX,0,AB,A,B..YRAB,AB,0,0,01H-,C_,303e9f,A,B,,.YRCD,CD,0,0,0iz,UV,26A69A,C,D,,.YRDGH,DGH,0,0,4a,Kl,0d125a,D,G,H,,.YRHK,HK,0,0,rH,Ak,00695C,H,K,,.YRJKT,JKT,0,0,16x,0K-,303e9f,J,K,T,,.YPCE,CE,0,0,0,0,,C,E,,...N_o*3LwfvO',
  Cylinder_Boom:
    '2v.Ay,Fe.5,0.1011.4O,O,0,0,0.0C,C,0,_W,0.4G,G,ku,0,0.0N,N,Ju,Z-,0.8P,P,R0,QX,0.ZS,S,R0,QX,0,GN,G,N..YROC,OC,0,0,0,VG,303e9f,O,C,,.YRGN,GN,0,0,XO,I0,0d125a,G,N,,.YRPC,PC,0,0,DW,iW,26A69A,P,C,,.YPPS,PS,0,0,0,0,,P,S,,...N_X*2LpxmY',
  Elliptical_Crank:
    '2v.Ay,1E8.A,0.1011.6A,A,0ix,X,0.0B,B,0zu,7O,0.GC,C,0qC,Lr,0.0D,D,085,Av,0.0E,E,aY,v,0.4F,F,0,0,0.5P,P,aY,v,03..YRAB,AB,0,0,0rQ,3y,303e9f,A,B,,.YRBC,BC,0,0,0v2,Ed,26A69A,B,C,,.YRCDE,CDE,0,0,07x,BD,00695C,C,D,E,,.YRDF,DF,0,0,043,5S,0d125a,D,F,,.YPEP,EP,0,0,0,0,,E,P,,...N_M*4J2cwL',
  Elliptical_Trammel:
    '2v.Ay,Im.5,0.1011.0A,A,Fe,0,0.0B,B,0,Fe,0.0T,T,AR,5D,0.7C,C,Fe,0,0.5D,D,0,Fe,OZ..YRABT,ABT,0,0,8i,6y,26A69A,A,B,T,,.YPAC,AC,0,0,0,0,,A,C,,.YPBD,BD,0,0,0,0,,B,D,,...N_g*4Zk8JZ',
  Flywheel_Engine:
    '2v.Ay,1E8.5,0.1011.6A,A,0,0,0,,,,2SG.0B,B,Fe,0,0.0R,R,0Lu,0,0.0C,C,17u,0,0.5P,P,17u,0,0..0RABR,Flywheel,0,0,025,0,303e9f,A,B,R,,.YRBC,Connecting rod,0,0,hm,0,26A69A,B,C,,.YPCP,CP,0,0,0,0,,C,P,,...N_C*2dIrbX',
  Landing_Gear:
    '2v.Ay,5U.5,0.1011.4A,A,Zy,38,0.0B,B,bm,03h,0.GC,C,iS,0Sa,0.4D,D,Cw,JG,0.0E,E,NL,9f,0.8F,F,RL,5z,0.4G,G,0Zy,38,0.0H,H,0bm,03h,0.GI,I,0iS,0Sa,0.4J,J,0Cw,JG,0.0K,K,0NL,9f,0.8L,L,0RL,5z,0.ZM,M,RL,5z,0,DE,D,E.ZN,N,0RL,5z,0,JK,J,K..YRABC,Starboard leg,0,0,dO,09j,303e9f,A,B,C,,.YRDE,DE,0,0,I7,ET,0d125a,D,E,,.YRBF,BF,0,0,WZ,19,26A69A,B,F,,.YRGHI,Port leg,0,0,0dO,09j,303e9f,G,H,I,,.YRJK,JK,0,0,0I7,ET,0d125a,J,K,,.YRHL,HL,0,0,0WZ,19,00695C,H,L,,.YPFM,FM,0,0,0,0,,F,M,,.YPLN,LN,0,0,0,0,,L,N,,...N_u*2o19ZN',
  Pumping_Field:
    '2v.Ay,1E8.5,0.1011.4A,A,0gB,0oI,0.0B,B,0QZ,0o1,0.2C,C,0d4,0,0,,,,2SG.4D,D,0,0,0.0E,E,o0,0,0.0F,F,r8,0eW,0.4H,H,2Wz,0oI,0.0I,I,2mb,0o1,0.2J,J,2a4,0,0,,,,1z0.4K,K,3B8,0,0.0L,L,3z8,0,0.0M,M,40G,0eW,0.4O,O,5i5,0oI,0.0P,P,5xj,0o1,0.2Q,Q,5lC,0,0,,,,2xW.4R,R,6MG,0,0.0S,S,78G,0,0.0T,T,7BO,0eW,0.5G,G,r8,0eW,OZ.5N,N,40G,0eW,OZ.5U,U,7BO,0eW,OZ..YRAB,AB,0,0,0YN,0oA,303e9f,A,B,,.YRBC,BC,0,0,0Wq,0P1,26A69A,B,C,,.YRCDE,CDE,0,0,3f,0,0d125a,C,D,E,,.YREF,EF,0,0,pa,0KG,00695C,E,F,,.YRHI,HI,0,0,2en,0oA,303e9f,H,I,,.YRIJ,IJ,0,0,2gK,0P1,26A69A,I,J,,.YRJKL,JKL,0,0,3En,0,0d125a,J,K,L,,.YRLM,LM,0,0,3_i,0KG,00695C,L,M,,.YROP,OP,0,0,5pv,0oA,303e9f,O,P,,.YRPQ,PQ,0,0,5rS,0P1,26A69A,P,Q,,.YRQRS,QRS,0,0,6Pv,0,0d125a,Q,R,S,,.YRST,ST,0,0,79q,0KG,00695C,S,T,,.YPFG,FG,0,0,0,0,,F,G,,.YPMN,MN,0,0,0,0,,M,N,,.YPTU,TU,0,0,0,0,,T,U,,...N_3*3iX8eu',
  Pumpjack:
    '2v.Ay,1E8.3,0.1011.4A,A,0gB,0oI,0.0M,M,0QZ,0o1,0.2P,P,0d4,0,0.4S,S,0,0,0.0H,H,o0,0,0.0R,R,r8,0eW,0.5W,W,r8,0eW,OZ..YRAM,AM,0,0,0YN,0oA,303e9f,A,M,,.YRMP,MP,0,0,0Wq,0P1,26A69A,M,P,,.YRPSH,PSH,0,0,3f,0,0d125a,P,S,H,,.YRHR,HR,0,0,pa,0KG,00695C,H,R,,.YPRW,RW,0,0,0,0,,R,W,,...N_Q*2pNupl',
  Punch_Press:
    '2v.Ay,1E8.A,0.1011.6A,A,0,0,0.0B,B,0,Im,0.0C,C,0,0r8,0.5P,P,0,0r8,OZ..ARAB,Crank,mr0,1E8,0,9O,303e9f,A,B,,.MRBC,Connecting rod,19FW,9n0,0,06Q,26A69A,B,C,,.YPCP,CP,2IV0,0,0,0,,C,P,,..2F1,BC,F1,0,0r8,0,0bW,_W..N_O*0omWHr',
  Radial_Engine:
    '2v.Ay,1E8.8,0.1011.6O,O,0,0,0.0A,A,Fe,0,0.0B,B,0,iC,0.0C,C,0UD,9q,0.0D,D,0L9,0T6,0.0E,E,Vy,0hz,0.0F,F,wV,J0,0.5P,P,0,iC,OZ.5Q,Q,0UD,9q,iB.5R,R,0L9,0T6,-q.5S,S,Vy,0hz,1JT.5T,T,wV,J0,1d5..YROA,OA,0,0,7q,0,303e9f,O,A,,.YRAB,AB,0,0,7q,M6,26A69A,A,B,,.YRAC,AC,0,0,07J,4w,26A69A,A,C,,.YRAD,AD,0,0,02m,0EZ,26A69A,A,D,,.YRAE,AE,0,0,No,0L_,26A69A,A,E,,.YRAF,AF,0,0,b3,9W,26A69A,A,F,,.YPBP,BP,0,0,0,0,,B,P,,.YPCQ,CQ,0,0,0,0,,C,Q,,.YPDR,DR,0,0,0,0,,D,R,,.YPES,ES,0,0,0,0,,E,S,,.YPFT,FT,0,0,0,0,,F,T,,...N_y*2cq2dK',
  Scissor_Lift:
    '2v.Ay,Fe.5,0.1011.4A,A,2SG,0,0.0B,B,1fl,a3,0.8C,C,1wL,OD,0.0D,D,17q,yH,0.4G,G,0,0,0.0M,M,1Vm,1GM,0.0K,K,2-X,2Wj,0.0S,S,2-X,0,0.0T,T,0,2Wj,0.0U,U,3_1,2Wj,0.ZE,E,1wL,OD,0,AB,A,B.5N,N,2-X,0,0.1P,P,2-X,2Wj,0,TU,T,U..YRAB,AB,0,0,230,I2,303e9f,A,B,,.YRCD,CD,0,0,1X5,gF,26A69A,C,D,,.YRGDMK,GDMK,0,0,1Pn,1BL,0d125a,G,D,M,K,,.YRSMT,SMT,0,0,1Vm,1GM,00695C,S,M,T,,.YRTU,TU,0,0,1-0,2Wj,26A69A,T,U,,.YPCE,CE,0,0,0,0,,C,E,,.YPSN,SN,0,0,0,0,,S,N,,.YPKP,KP,0,0,0,0,,K,P,,...N_Q*1DseJS',
  Scotch_Yoke:
    '2v.Ay,1E8.A,0.1011.6A,A,0,0,0.0B,B,Fe,0,0.8C,C,Fe,0VG,0.0D,D,Fe,S8,0.1E,E,Fe,0,0,CD,C,D.5F,F,Fe,0VG,0..YRAB,AB,0,0,7q,0,303e9f,A,B,,.YRCD,CD,0,0,Fe,01a,26A69A,C,D,,.YPBE,BE,0,0,0,0,,B,E,,.YPCF,CF,0,0,0,0,,C,F,,...N_T*0rHTGI',
  Shaper_Quick_Return:
    '2v.Ay,1E8.A,0.1011.6A,A,0,0,0.0B,B,Fe,0,0.4C,C,0,0ku,0.0D,D,Oj,RF,0.0R,R,qW,si,0.1P,P,Fe,0,0,CD,C,D.5Q,Q,qW,si,0..YRAB,AB,0,0,7q,0,303e9f,A,B,,.YRCD,CD,0,0,CN,09q,0d125a,C,D,,.YRDR,DR,0,0,cd,e_,26A69A,D,R,,.YPBP,BP,0,0,0,0,,B,P,,.YPRQ,RQ,0,0,0,0,,R,Q,,...N_9*3EXkfq',
  Slider_Crank:
    '2v.Fe,1E8.A,0.1011.6A,A,0mA,0c,0.0B,B,0Yt,bK,0.0C,C,il,H-,0.5D,D,il,H-,0..YRAB,AB,0,0,0fW,IN,303e9f,A,B,,.YRBC,BC,0,0,4y,Rf,26A69A,B,C,,.YPCD,CD,0,0,0,0,,C,D,,...N_e*14gQsk',
  Slider_Crank_Inversions:
    '2v.Ay,1E8.5,0.1011.6A,A,0,1ba,0,,,,2SG.0B,B,9O,1rp,0.0C,C,kd,1ba,0.4E,E,2M0,1ba,0.6F,F,2em,1ba,0,,,,2SG.0G,G,2z4,28m,0.0H,H,3BQ,2Lg,0.6J,J,0,0,0,,,,2SG.0K,K,0EN,C3,0.4M,M,ee,0,0.0N,N,0QY,Ek,0.6P,P,2M0,0,0,,,,2SG.0Q,Q,2yB,Dv,0.0R,R,38n,0,0.5D,D,kd,1ba,0.1I,I,2z4,28m,0,EH,E,H.1L,L,0EN,C3,0,MN,M,N.5S,S,38n,0,0..YRAB,L2,0,0,4i,1ji,26A69A,A,B,,.YRBC,L3,0,0,S0,1ji,0d125a,B,C,,.YRFG,L3,0,0,2ow,1tA,0d125a,F,G,,.YREH,L1,0,0,2mj,1zd,303e9f,E,H,,.YREF,L2,0,0,2VO,1ba,26A69A,E,F,,.YRJK,L2,0,0,07C,62,26A69A,J,K,,.YRMN,L1,0,0,73,7N,303e9f,M,N,,.YRJM,L3,0,0,KK,0,0d125a,J,M,,.YRPQ,L3,0,0,2f6,6z,0d125a,P,Q,,.YRQR,L2,0,0,32U,6z,26A69A,Q,R,,.YPCD,CD,0,0,0,0,,C,D,,.YPGI,GI,0,0,0,0,,G,I,,.YPKL,KL,0,0,0,0,,K,L,,.YPRS,RS,0,0,0,0,,R,S,,...N_i*2U20tX',
  Three_Machines:
    '2v.Ay,1E8.5,0.1011.6A,A,0,0,0,,,,2SG.0B,B,0,VG,0.GC,C,bx,Lv,0.4D,D,Fe,0,0.6E,E,1z0,0,0,,,,01z0.0F,F,2Ce,0,0.0G,G,2xW,0,0.6H,H,Fe,1Tm,0,,,,2xW.0I,I,Fe,1jO,0.0J,J,vQ,22e,0.4K,K,16K,1Tm,0.5P,P,2xW,0,0..YRAB,Drag crank,0,0,0,Fe,303e9f,A,B,,.YRBC,Drag coupler,0,0,I_,Qb,26A69A,B,C,,.YRCD,Drag output,0,0,Qo,Az,0d125a,C,D,,.YREF,Crank,0,0,24q,0,303e9f,E,F,,.YRFG,Connecting rod,0,0,2a4,0,26A69A,F,G,,.YRHI,Rocker crank,0,0,Fe,1ba,303e9f,H,I,,.YRIJ,Rocker coupler,0,0,aX,1u0,26A69A,I,J,,.YRJK,Rocker,0,0,-t,1mC,0d125a,J,K,,.YPGP,GP,0,0,0,0,,G,P,,...N_m*28tjXl',
  Whitworth_Quick_Return:
    '2v.Ay,1E8.A,0.1011.6A,A,0,0,0.0B,B,0,ku,0.4C,C,Fe,0,0.0D,D,095,1A7,0.1P,P,0,ku,0,CD,C,D..YRAB,AB,0,0,0,NS,303e9f,A,B,,.YRCD,CD,0,0,3H,b4,0d125a,C,D,,.YPBP,BP,0,0,0,0,,B,P,,...N_r*4EPIoh',
};
