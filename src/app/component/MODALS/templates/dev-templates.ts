/**
 * Drawings that exist to exercise the app rather than to teach a linkage.
 *
 * Their own file, because template-linkages.ts is generated from the
 * verification fixtures and checked against that generator -- these are
 * neither generated nor fixtures, and they are only ever offered in a
 * development build.
 */
export const DEV_TEMPLATE_IDS = [
  'Dev_All_Mechanism_Types',
  'Dev_Object_Gallery',
  'Dev_Render_Stress',
] as const;

export type DevTemplateID = (typeof DEV_TEMPLATE_IDS)[number];

export const DEV_TEMPLATES: Record<DevTemplateID, string> = {
  // One of each kind of machine in one drawing: a crank that goes round, a
  // ram that goes out and back, a slider, and a chain that never reaches
  // ground -- so every readiness state and every playback row is on screen at
  // once.
  //
  // Two joints in here are named with a backslash and a backtick, which the
  // encoder is entitled to use and a TypeScript string literal is entitled to
  // read as an escape. The backslashes are doubled for that reason; eating one
  // costs the checksum and the whole drawing refuses to load.
  Dev_All_Mechanism_Types:
    '2O.Ay,Fe.5,0.1011.4O,O,0,0,0.0C,C,YJ,qG,0.4G,G,ku,0,0.0N,N,aM,hl,0.8P,P,ir,8X,0.ZS,S,ir,8X,0,GN,G,N.0T,T,nJ,oD,0.0U,U,1Nd,dn,0.6V,V,1ca,jH,0,,,,1E8.6W,W,J-,1GP,0.0X,X,PF,1dt,0.0Y,Y,rW,1g7,0.4Z,Z,-P,1FX,0.0[,[,1Tk,16n,0.0\\,\\,1ft,1bA,0.0^,^,1pZ,1Gc,0.0_,_,1_5,_W,0.0`,`,2AU,1OV,0.1a,a,2AU,1OV,0..YROC,OC,Fe,Fe,HA,Q8,c5cae9,O,C,,.YRGN,GN,Fe,Fe,fd,Lu,303e9f,G,N,,.YRPC,PC,Fe,Fe,da,UO,0d125a,P,C,,.YPPS,PS,Fe,0,0,0,,P,S,,.YRGT,GT,Fe,Fe,m5,P7,c5cae9,G,T,,.YRTU,TU,Fe,Fe,14T,i-,303e9f,T,U,,.YRUV,UV,Fe,Fe,1V5,gX,0d125a,U,V,,.YRWX,WX,Fe,Fe,Md,1S8,B2DFDB,W,X,,.YRXY,XY,Fe,Fe,dN,1f0,26A69A,X,Y,,.YRYZ,YZ,Fe,Fe,wS,1Sr,00695C,Y,Z,,.YR[\\,[\\,Fe,Fe,1Zp,1Lz,c5cae9,[,\\,,.YR_`,_`,Fe,Fe,24I,1BV,B2DFDB,_,`,,.YP`a,`a,Fe,0,0,0,,`,a,,...N_a',
  // One of everything the canvas can draw, laid out in rows and deliberately
  // not simulatable: forty-nine joints and twenty-six links covering every
  // kind of pin, block, weld, slot and cylinder, with forces on the last of
  // them.
  Dev_Object_Gallery:
    '2P.VC,1E8.5,0.1011.0B,B,01RD,10C,0.1C,C,01RD,10C,0.0D,D,0SL,1m0,0.0E,E,0QJ,u2,0.0F,F,Wu,1qh,0.0G,G,Wu,10C,0.0H,H,14R,1Vn,0.0I,I,1pf,1vu,0.8J,J,1pf,10C,0.8K,K,2wH,10C,0.0L,L,1UP,1kQ,0.0M,M,01GC,RG,0.6N,N,01GC,0Vx,0.0O,O,03v,XX,0.4P,P,032,0i-,0.0Q,Q,2Ao,Dj,0.0R,R,1GR,017e,0.1S,S,1GR,017e,0,XY,X,Y.5T,T,2Ao,Dj,0.0U,U,31C,08I,0.0V,V,2s_,0mb,0.5W,W,31C,08I,0CH.0X,X,1ri,015V,0.0Y,Y,0e7,01Ea,0.0Z,Z,07q,01kA,0.0[,[,Ul,01AV,0.3\\,\\,Ul,01AV,0,XY,X,Y.0],],018q,02Dk,0.0^,^,01rc,01Yr,0.8_,_,022a,01MP,0.0`,`,02lM,0hW,0.Xa,a,022a,01MP,0,]^,],^.0b,b,HP,02JO,0.0c,c,0NY,02Gq,0.8d,d,0Vv,02GI,0.Xf,f,0Vv,02GI,0,bc,b,c.0g,g,1AZ,02pW,0.0h,h,2EW,01S2,0.0i,i,2s_,02g6,0.0j,j,1GR,01zf,0.0k,k,2Ao,03Qv,0.0l,l,22b,02JO,0.1m,m,22b,02JO,0,ghij,i,j.0n,n,3tQ,026J,0.8o,o,1ux,01tp,0.1p,p,1ux,01tp,0,ghij,g,h.0q,q,02tY,02sl,0.0r,r,0zX,02sl,0.0s,s,34j,01ci,0..YPBC,BC,Fe,0,0,0,,B,C,,.YRDE,DE,Fe,Fe,0RK,1K1,0d125a,D,E,,.YRFGH,FGH,Fe,Fe,ik,1SD,B2DFDB,F,G,H,,.YRIJKL,IJKL,ku,Azlti,27f,1HW,26A69A,I,J,K,L,,IJ,JK,KL.YRMN,MN,Fe,Fe,01GC,02L,303e9f,M,N,,.YROP,OP,Fe,Fe,03U,05l,0d125a,O,P,,.YRQR,QR,Fe,Fe,1jc,0S_,B2DFDB,Q,R,,.YPRS,RS,Fe,0,0,0,,R,S,,.YPQT,QT,Fe,0,0,0,,Q,T,,.YRUV,UV,Fe,Fe,2y5,0SS,26A69A,U,V,,.YPUW,UW,Fe,0,0,0,,U,W,,.YRXY,XY,Fe,Fe,cp,01A1,00695C,X,Y,,.YRZ[,Z[,Fe,Fe,BU,01SK,c5cae9,Z,[,,.YP[\\,[\\,Fe,0,0,0,,[,\\,,.YR]^,]^,Fe,Fe,01VD,01uH,303e9f,],^,,.YR_`,_`,Fe,Fe,02Oz,010z,0d125a,_,`,,.YP_a,_a,Fe,0,0,0,,_,a,,.YRbc,bc,Fe,Fe,034,02I6,B2DFDB,b,c,,.YR]d,]d,Fe,Fe,0qN,02F0,26A69A,d,],,.YPdf,df,Fe,0,0,0,,d,f,,.YRghij,ghij,Fe,Fe,1u7,02Dq,00695C,g,h,i,j,,.YRkl,kl,Fe,Fe,26h,02t9,c5cae9,k,l,,.YPlm,lm,Fe,0,0,0,,l,m,,.YRnos,nos,Fe,Fe,3ES,024-,303e9f,n,o,s,,.YPop,op,Fe,0,0,0,,o,p,,.YRqr,qr,Fe,Fe,01wX,02sl,B2DFDB,q,r,,.NRIJ,IJ,Fe,Fe,1pf,1T2,26A69A,I,J,,.NRJK,JK,Fe,Fe,2Mz,10C,00695C,J,K,,.NRKL,KL,Fe,Fe,2CL,1NJ,c5cae9,K,L,,..2F1,qr,F1,01-H,02sl,01yD,03jf,2SG.2F2,qr,F2,01Xj,02sl,0wz,03Sd,Fe.3F3,qr,F3,02WB,02sl,032z,03mG,Fe..N_a',
  // Ross McSweeney's Running Horse Automata, converted from the copy MotionGen
  // ships with itself: forty-five joints and twenty-seven links on a single
  // degree of freedom. Its colours are remapped onto this app's own palette,
  // because the ones it arrives with are not colours this app can draw.
  Dev_Render_Stress:
    '2P.Ay,1E8.K,0.1011.0A,A,j,4R,0.0B,B,0Ai,5o,0.6C,C,0O,03,0.0D,D,03U,2j,0.0E,E,09Y,09y,0.4F,F,0Dm,02E,0.0G,G,0Ly,04t,0.4H,H,0Hi,06Q,0.4I,I,9_,025,0.4J,J,GC,0Ca,0.4K,K,Iq,02A,0.0L,L,0ct,09u,0.0M,M,0rG,04U,0.0N,N,0In,5-,0.0O,O,0O_,6t,0.0P,P,0T0,2A,0.0Q,Q,0WR,A3,0.0R,R,0WO,KW,0.0S,S,0UW,F_,0.0T,T,0aA,O8,0.0U,U,0ae,S0,0.0V,V,0fO,PL,0.0W,W,0eK,Uy,0.0X,X,3K,08R,0.0Y,Y,E8,098,0.0Z,Z,GG,q,0.0a,a,Bi,2d,0.0b,b,AJ,7n,0.0c,c,Kh,5P,0.0d,d,XZ,0By,0.0e,e,aN,0Ln,0.0f,f,YQ,08o,0.0g,g,kS,0NB,0.0h,h,rW,09c,0.0i,i,o6,07Z,0.0j,j,SR,0Iu,0.0k,k,Xf,0Ui,0.0l,l,UR,0To,0.0m,m,O9,5X,0.0n,n,Mi,E7,0.0o,o,K4,Aj,0.0p,p,HQ,MY,0.0q,q,G9,J3,0.0r,r,C0,If,0.0s,s,C0,O9,0..YRAB,AB,0,Fe,04-,57,c5cae9,A,B,,.YRCDA,CDA,0,Fe,013,2N,303e9f,C,D,A,,.YRDE,DE,0,Fe,06W,03d,0d125a,D,E,,.YREFG,EFG,0,Fe,0F5,05h,B2DFDB,E,F,G,,.YRHBLM,HBLM,0,Fe,0U8,03l,26A69A,H,B,L,M,,.YRDN,DN,0,Fe,0B7,4M,00695C,D,N,,.YRFN,FN,0,Fe,0GH,1u,c5cae9,F,N,,.YRGOP,GOP,0,Fe,0PJ,1P,303e9f,G,O,P,,.YRPNQ,PNQ,0,Fe,0Qk,64,0d125a,P,N,Q,,.YRORS,ORS,0,Fe,0TI,ES,B2DFDB,O,R,S,,.YRQST,QST,0,Fe,0X2,Gk,26A69A,Q,S,T,,.YRRU,RU,0,Fe,0YW,OG,00695C,R,U,,.YRTUVW,TUVW,0,Fe,0ce,R6,c5cae9,T,U,V,W,,.YRDX,DX,0,Fe,05,02t,303e9f,D,X,,.YRXIY,XIY,0,Fe,99,06Z,0d125a,X,I,Y,,.YRYZa,YZa,0,Fe,E1,01w,B2DFDB,Y,Z,a,,.YRIb,Ib,0,Fe,A9,2s,26A69A,I,b,,.YRDb,Db,0,Fe,3R,5F,00695C,D,b,,.YRAc,Ac,0,Fe,Ai,4w,c5cae9,A,c,,.YRKd,Kd,0,Fe,QC,073,303e9f,K,d,,.YRJefc,Jefc,0,Fe,Qw,09R,0d125a,J,e,f,c,,.YReghidjkl,eghidjkl,0,Fe,d3,0JB,B2DFDB,e,g,h,i,d,j,k,l,,.YRbZm,bZm,0,Fe,Gv,4j,26A69A,b,Z,m,,.YRano,ano,0,Fe,I9,99,00695C,a,n,o,,.YRomp,omp,0,Fe,KY,Cx,c5cae9,o,m,p,,.YRnq,nq,0,Fe,JR,Gb,303e9f,n,q,,.YRqprs,qprs,0,Fe,EP,L6,0d125a,q,p,r,s,,...N_J',
};
