/**
 * The five templates that predate the verification suite.
 *
 * These payloads are hand-authored strings users have already shared, pinned
 * byte-for-byte by template-url.spec.ts against TEMPLATE_BASELINES. They are
 * not regenerated from a fixture the way the library ones below are, so they
 * are edited only deliberately and never by accident — that is what the pin is
 * for.
 *
 * Edited deliberately once, in the 2026 library audit: their link masses were
 * zeroed and their input speed dropped from 20 to 10 RPM, so they follow the
 * same two rules as the rest of the library. Massless, because gravity is on
 * by default and weight counts as a load, so a mechanism published with mass
 * hands a student who opened a plain kinematics example a force problem nobody
 * set; and 10 RPM, because a cycle should take five to eight seconds to watch.
 * The two specs that used to read `4-Bar` as *the* mechanism with mass and a
 * known speed now state their own mechanism instead, which is where that
 * belonged.
 */
export const BUILT_IN_TEMPLATE_IDS = [
  '4-Bar',
  'Watt_I',
  'Watt_II',
  'Stephenson_III',
  'Slider_Crank',
] as const;

export type BuiltInTemplateID = (typeof BUILT_IN_TEMPLATE_IDS)[number];

/**
 * The wider linkage library, every entry of which is a mechanism the
 * verification suite already asserts on.
 *
 * Their payloads are *generated* from those fixtures rather than typed in — see
 * the generated block in TEMPLATE_LINKAGES below — so a template cannot quietly
 * become a different linkage than the one the tests cover.
 */
export const LIBRARY_TEMPLATE_IDS = [
  'Whitworth_Quick_Return',
  'Scotch_Yoke',
  'Cylinder_Boom',
  'Cylinder_Gripper',
  'Radial_Engine',
  'Chebyshev_Straight_Line',
  'Windshield_Wiper',
  'Elliptical_Crank',
  'Jansen_Leg',
  'Backhoe_Bucket',
  // No Toggle_Press: its lesson is the toggle clamp's, which teaches it better
  // by carrying the load that makes the point. Its fixture and gallery entry
  // stay — the verification suite still asserts on them.
  'Scissor_Lift',
  'Shaper_Quick_Return',
  'Pedaling_Leg',
  'Oscillating_Fan',
  'Pumpjack',
  'Punch_Press',
  'Derrick_Crane',
  'Toggle_Clamp',
  'Offset_Load_Rocker',
  // Added with the 2026 library audit: each one is a feature or a classic the
  // library could not show. See LIBRARY_TEMPLATE_SOURCES for what each is.
  'Drag_Link',
  'Bell_Crank',
  'Flywheel_Engine',
  'Screw_Jack',
  'Elliptical_Trammel',
  'Peaucellier',
  'Pantograph',
  'Double_Butterfly',
  'Crane_Two_Loads',
  'Locked_Four_Bar',
  'Three_Machines',
  'Walking_Pair',
  'Straight_Line_Pair',
  'Pumping_Field',
] as const;

export type LibraryTemplateID = (typeof LIBRARY_TEMPLATE_IDS)[number];

export type TemplateID = BuiltInTemplateID | LibraryTemplateID;

/** Every template the library dialog offers, in the order it offers them. */
export const TEMPLATE_IDS: readonly TemplateID[] = [
  ...BUILT_IN_TEMPLATE_IDS,
  ...LIBRARY_TEMPLATE_IDS,
];

/**
 * Production URL payloads used by the template dialog and regression tests.
 *
 * The library entries between the generated markers are written by
 * `npm run template-payloads`, which encodes the matching FIXTURE_GALLERY entry.
 * template-payloads.spec.ts fails if a stored payload stops matching what its
 * fixture encodes to, the same way docs/fixture-urls.md is kept honest.
 *
 * The generator lives in a spec rather than a plain node script because
 * encoding needs the app's own model and codec, and because nothing test-only
 * may be imported from here: this file ships, and importing src/test-utils
 * would drag every fixture into the bundle.
 */
export const TEMPLATE_LINKAGES: Record<TemplateID, string> = {
  '4-Bar':
    '2P.Fe,1E8.A,0.1011.6A,A,0mv,0VU,0.0B,B,0e_,E6,0.0C,C,l1,WW,0.4D,D,qD,0Pk,0..YRAB,AB,0,0,0ix,08i,c5cae9,A,B,,.YRBC,BC,0,0,32,NJ,303e9f,B,C,,.YRCD,CD,0,0,nd,3P,0d125a,C,D,,...N_p',
  Watt_I:
    '2P.Fe,1E8.A,0.1011.6A,A,0Qh,0Kn,0.0B,B,0e1,9i,0.0C,C,bT,LF,0.0D,D,0G5,tZ,0.0E,E,V5,1_z,0.0F,F,1mM,1Gv,0.4G,G,1rt,0ey,0..YRAB,AB,0,0,0XM,05Z,c5cae9,A,B,,.YRBCD,BCD,0,0,06D,Sr,303e9f,B,C,D,,.YRDE,DE,0,0,7W,1RG,0d125a,D,E,,.YREF,EF,0,0,17j,1dx,B2DFDB,E,F,,.YRFCG,FCG,0,0,1PE,KQ,26A69A,F,C,G,,...N_k',
  Watt_II:
    '2P.Fe,1E8.A,0.1011.6A,A,0Vf,0Vd,0.0B,B,0mZ,08A,0.0C,C,06Y,LC,0.0D,D,1MR,J2,0.4E,E,rw,0j2,0.0F,F,2ic,ID,0.4G,G,2lk,0Zt,0..YRAB,AB,0,0,0e6,0Ju,c5cae9,A,B,,.YRBC,BC,0,0,0RY,6X,303e9f,B,C,,.YRCDE,CDE,0,0,ic,01d,0d125a,C,D,E,,.YRDF,DF,0,0,21X,Id,B2DFDB,D,F,,.YRFG,FG,0,0,2kA,08r,26A69A,F,G,,...N_h',
  Stephenson_III:
    '2P.Fe,1E8.A,0.1011.6A,A,0YP,0ce,0.0B,B,0cQ,0FI,0.0C,C,lC,1-,0.4D,D,ow,0U1,0.0E,E,033,D-,0.0F,F,Dc,nj,0.4G,G,1M0,GJ,0..YRAB,AB,0,0,0aP,0Qz,c5cae9,A,B,,.YRBCE,BCE,0,0,1w,E,303e9f,B,C,E,,.YRCD,CD,0,0,n3,0E1,0d125a,C,D,,.YREF,EF,0,0,5H,Vs,B2DFDB,E,F,,.YRFG,FG,0,0,np,X0,26A69A,F,G,,...N_Z',
  Slider_Crank:
    '2P.Fe,1E8.A,0.1011.6A,A,0mA,0c,0.0B,B,0Yt,bK,0.0C,C,il,H-,0.5D,D,il,H-,0..YRAB,AB,0,0,0fW,IN,c5cae9,A,B,,.YRBC,BC,0,0,4y,Rf,303e9f,B,C,,.YPCD,CD,0,0,0,0,,C,D,,...N_e',
  // <generated by `npm run template-payloads` — do not edit by hand>
  Whitworth_Quick_Return:
    '2P.Ay,1E8.A,0.1011.6A,A,0,0,0.0B,B,0,ku,0.4C,C,Fe,0,0.0D,D,095,1A7,0.1P,P,0,ku,0,CD,C,D..YRAB,AB,0,0,0,NS,c5cae9,A,B,,.YRCD,CD,0,0,3H,b4,303e9f,C,D,,.YPBP,BP,0,0,0,0,,B,P,,...N_r',
  Scotch_Yoke:
    '2P.Ay,1E8.A,0.1011.6A,A,0,0,0.0B,B,Fe,0,0.8C,C,Fe,0VG,0.0D,D,Fe,S8,0.1E,E,Fe,0,0,CD,C,D.5F,F,Fe,0VG,0..YRAB,AB,0,0,7q,0,c5cae9,A,B,,.YRCD,CD,0,0,Fe,01a,303e9f,C,D,,.YPBE,BE,0,0,0,0,,B,E,,.YPCF,CF,0,0,0,0,,C,F,,...N_T',
  Cylinder_Boom:
    '2P.Ay,Fe.5,0.1011.4O,O,0,0,0.0C,C,0,_W,0.4G,G,ku,0,0.0N,N,Ju,Z-,0.8P,P,R0,QX,0.ZS,S,R0,QX,0,GN,G,N..YROC,OC,0,0,0,VG,c5cae9,O,C,,.YRGN,GN,0,0,XO,I0,303e9f,G,N,,.YRPC,PC,0,0,DW,iW,0d125a,P,C,,.YPPS,PS,0,0,0,0,,P,S,,...N_X',
  Cylinder_Gripper:
    '2P.Ay,3w.5,0.1011.4A,A,02SG,ku,0.0B,B,0185,uK,0.8C,C,019F,uC,0.0D,D,Ay,11e,0.4G,G,_W,ku,0.0H,H,1HG,S8,0.0I,I,2hu,VG,0.4J,J,_W,0ku,0.0K,K,hm,0S8,0.0L,L,2hu,0VG,0.ZE,E,019F,uC,0,AB,A,B..YRAB,AB,0,0,01oB,pc,c5cae9,A,B,,.YRCD,CD,0,0,0V9,yw,303e9f,C,D,,.YRDGHI,DGHI,0,0,1Hf,g_,0d125a,D,G,H,I,,.YRHK,HK,0,0,_W,0,B2DFDB,H,K,,.YRJKL,JKL,0,0,1Sj,0ZR,26A69A,J,K,L,,.YPCE,CE,0,0,0,0,,C,E,,...N_B',
  Radial_Engine:
    '2P.Ay,1E8.8,0.1011.6O,O,0,0,0.0A,A,Fe,0,0.0B,B,0,iC,0.0C,C,0UD,9q,0.0D,D,0L9,0T6,0.0E,E,Vy,0hz,0.0F,F,wV,J0,0.5P,P,0,iC,OZ.5Q,Q,0UD,9q,iB.5R,R,0L9,0T6,-q.5S,S,Vy,0hz,1JT.5T,T,wV,J0,1d5..YROA,OA,0,0,7q,0,c5cae9,O,A,,.YRAB,AB,0,0,7q,M6,303e9f,A,B,,.YRAC,AC,0,0,07J,4w,0d125a,A,C,,.YRAD,AD,0,0,02m,0EZ,B2DFDB,A,D,,.YRAE,AE,0,0,No,0L_,26A69A,A,E,,.YRAF,AF,0,0,b3,9W,00695C,A,F,,.YPBP,BP,0,0,0,0,,B,P,,.YPCQ,CQ,0,0,0,0,,C,Q,,.YPDR,DR,0,0,0,0,,D,R,,.YPES,ES,0,0,0,0,,E,S,,.YPFT,FT,0,0,0,0,,F,T,,...N_y',
  Chebyshev_Straight_Line:
    '2P.Ay,1E8.3,0.1011.6G,G,0VG,0,0.0A,A,0Fe,_W,0.0B,B,Fe,_W,0.GM,M,0,_W,0.4H,H,VG,0,0..YRGB,GB,0,0,07q,VG,c5cae9,G,B,,.YRABM,ABM,0,0,0,_W,303e9f,A,B,M,,.YRAH,AH,0,0,7q,VG,0d125a,A,H,,...N_z',
  Windshield_Wiper:
    '2P.Ay,1E8.A,0.1011.6O,O,0si,0iC,0.0A,A,0se,0Km,0.0B,B,Dl,0S4,0.4P,P,0,0,0.0C,C,AJ,0L3,0.GT,T,0YM,16B,0.0D,D,1e3,0L3,0.4Q,Q,1Tm,0,0.GU,U,xQ,16B,0..YROA,Motor crank,0,0,0sg,0WU,c5cae9,O,A,,.YRAB,Drive link,0,0,0KS,0OQ,303e9f,A,B,,.YRBCPT,Wiper arm,0,0,02b,5H,0d125a,B,C,P,T,,.YRCD,Tie rod,0,0,vB,0L3,B2DFDB,C,D,,.YRDQU,Passenger arm,0,0,1Ll,GO,26A69A,D,Q,U,,...N_p',
  Elliptical_Crank:
    '2P.Ay,1E8.A,0.1011.6A,A,0ix,X,0.0B,B,0zu,7O,0.0C,C,0qC,Lr,0.GD,D,085,Av,0.0E,E,aY,v,0.4F,F,0,0,0.5P,P,aY,v,03..YRAB,AB,0,0,0rQ,3y,c5cae9,A,B,,.YRBC,BC,0,0,0v2,Ed,303e9f,B,C,,.YRCDE,CDE,0,0,07x,BD,0d125a,C,D,E,,.YRDF,DF,0,0,043,5S,B2DFDB,D,F,,.YPEP,EP,0,0,0,0,,E,P,,...N_M',
  Jansen_Leg:
    '2P.1jO,1E8.8,0.1011.6O,O,0,0,0.0A,A,3gO,0,0.4G,G,09Hm,01vu,0.0B,B,05tE,7ee,0.0C,C,0IGg,1-F,0.0D,D,06b8,0B7B,0.0E,E,0ETW,06sL,0.GF,F,0AYO,0MPj,0..YROA,OA,0,0,1rC,0,c5cae9,O,A,,.YRAB,AB,0,0,016R,3qK,303e9f,A,B,,.YRGBC,GBC,0,0,0B8Z,2ag,0d125a,G,B,C,,.YRAD,AD,0,0,01TO,05Zc,B2DFDB,A,D,,.YRGD,GD,0,0,07xS,06WY,26A69A,G,D,,.YRCE,CE,0,0,0GN5,02RZ,00695C,C,E,,.YRDEF,DEF,0,0,0AXh,0DT4,c5cae9,D,E,F,,...N_O',
  Backhoe_Bucket:
    '2P.Ay,Im.5,0.1011.4A,A,01jO,0,0.0B,B,0sb,Py,0.8C,C,018N,HX,0.0D,D,0Ha,hT,0.4G,G,0,0,0.0H,H,VG,Im,0.4J,J,o0,0P0,0.0K,K,1BI,2i,0.0T,T,1NW,0ee,0.ZE,E,018N,HX,0,AB,A,B..YRAB,AB,0,0,01H-,C_,c5cae9,A,B,,.YRCD,CD,0,0,0iz,UV,303e9f,C,D,,.YRDGH,DGH,0,0,4a,Kl,0d125a,D,G,H,,.YRHK,HK,0,0,rH,Ak,B2DFDB,H,K,,.YRJKT,JKT,0,0,16x,0K-,26A69A,J,K,T,,.YPCE,CE,0,0,0,0,,C,E,,...N_o',
  Scissor_Lift:
    '2P.Ay,Fe.5,0.1011.4A,A,2SG,0,0.0B,B,1fl,a3,0.8C,C,1wL,OD,0.0D,D,17q,yH,0.4G,G,0,0,0.0M,M,1Vm,1GM,0.0K,K,2-X,2Wj,0.0S,S,2-X,0,0.0T,T,0,2Wj,0.0U,U,3_1,2Wj,0.ZE,E,1wL,OD,0,AB,A,B.5N,N,2-X,0,0.1P,P,2-X,2Wj,0,TU,T,U..YRAB,AB,0,0,230,I2,c5cae9,A,B,,.YRCD,CD,0,0,1X5,gF,303e9f,C,D,,.YRGDMK,GDMK,0,0,1Pn,1BL,0d125a,G,D,M,K,,.YRSMT,SMT,0,0,1Vm,1GM,B2DFDB,S,M,T,,.YRTU,TU,0,0,1-0,2Wj,26A69A,T,U,,.YPCE,CE,0,0,0,0,,C,E,,.YPSN,SN,0,0,0,0,,S,N,,.YPKP,KP,0,0,0,0,,K,P,,...N_Q',
  Shaper_Quick_Return:
    '2P.Ay,1E8.A,0.1011.6A,A,0,0,0.0B,B,Fe,0,0.4C,C,0,0ku,0.0D,D,Oj,RF,0.0R,R,qW,si,0.1P,P,Fe,0,0,CD,C,D.5Q,Q,qW,si,0..YRAB,AB,0,0,7q,0,c5cae9,A,B,,.YRCD,CD,0,0,CN,09q,303e9f,C,D,,.YRDR,DR,0,0,cd,e_,0d125a,D,R,,.YPBP,BP,0,0,0,0,,B,P,,.YPRQ,RQ,0,0,0,0,,R,Q,,...N_9',
  Pedaling_Leg:
    '2P.Ay,1E8.4,0.1011.4B,B,0,0,0.GP,P,Qa,0,0.4H,H,0NS,1Qe,0.2K,K,c5,13o,0..YRHK,HK,0,0,7L,1FD,c5cae9,H,K,,.YRKP,KP,0,0,WL,Xv,303e9f,K,P,,.YRBP,BP,0,0,DI,0,0d125a,B,P,,...N_j',
  Oscillating_Fan:
    '2P.Ay,1E8.A,0.1011.4A,A,0,0,0.2C,C,s8,0VG,0.0D,D,k_,0j9,0.4B,B,0GY,0In,0.0N,N,1NW,0,0..YRACN,ACN,0,0,lD,0AR,c5cae9,A,C,N,,.YRCD,CD,0,0,oZ,0cC,303e9f,C,D,,.YRDB,DB,0,0,FE,0Vz,0d125a,D,B,,...N_5',
  Pumpjack:
    '2P.Ay,1E8.3,0.1011.4A,A,0gB,0oI,0.0M,M,0QZ,0o1,0.2P,P,0d4,0,0.4S,S,0,0,0.0H,H,o0,0,0.0R,R,r8,0eW,0.5W,W,r8,0eW,OZ..YRAM,AM,0,0,0YN,0oA,c5cae9,A,M,,.YRMP,MP,0,0,0Wq,0P1,303e9f,M,P,,.YRPSH,PSH,0,0,3f,0,0d125a,P,S,H,,.YRHR,HR,0,0,pa,0KG,B2DFDB,H,R,,.YPRW,RW,0,0,0,0,,R,W,,...N_Q',
  Punch_Press:
    '2P.Ay,1E8.A,0.1011.6A,A,0,0,0.0B,B,0,Im,0.0C,C,0,0r8,0.5P,P,0,0r8,OZ..YRAB,Crank,VG,o,0,9O,c5cae9,A,B,,.YRBC,Connecting rod,ku,6G,0,0HC,303e9f,B,C,,.YPCP,CP,1Tm,0,0,0,,C,P,,..2F1,BC,F1,0,0r8,0,0bW,1Xg0..N_J',
  Derrick_Crane:
    '2P.Ay,1E8.A,0.1011.4O,O,0,0,0.0C,C,Qv,cP,0.0T,T,rn,1Cp,0.6G,G,YO,09O,0.0K,K,Mp,18,0..YRGK,Luffing crank,VG,o,Sc,048,c5cae9,G,K,,.YRCK,Luffing link,ku,6G,Os,Jn,303e9f,C,K,,.YROCT,Boom,2xW,ku,Qv,cP,0d125a,O,C,T,,..2F1,OCT,F1,rn,1Cp,rn,zB,z2G..N_v',
  Toggle_Clamp:
    '2P.Ay,1E8.A,0.1011.6H,H,0ee,Ti,0.0E,E,09O,NS,0.0P,P,P0,5U,0.4N,N,0Lu,09O,0..YRHE,Handle,NS,o,0P0,Qa,c5cae9,H,E,,.YREP,Toggle link,Fe,1G,7q,ET,303e9f,E,P,,.YRNP,Clamp bar,VG,38,1a,01z,0d125a,N,P,,..2F1,NP,F1,P0,5U,P0,L6,hyW..N_e',
  Offset_Load_Rocker:
    '2P.Ay,1E8.G,0.1011.6A,A,0,0,0.0B,B,HC,7q,0.0C,C,104,bW,0.4D,D,1E8,0,0.0L,L,1SC,jK,0..YRAB,Input lever,VG,o,8c,3w,c5cae9,A,B,,.YRBC,Coupler,_W,7q,ee,Mg,303e9f,B,C,,.YRCDL,Rocker,1E8,E4,1E8,Rd,0d125a,C,D,L,,..2F1,CDL,F1,1SC,jK,1Fi,Zy,adm..N_r',
  Drag_Link:
    '2P.Ay,1E8.A,0.1011.6A,A,0,0,0.0B,B,0,YO,0.0C,C,cU,LL,0.4D,D,Fe,0,0..YRAB,AB,0,0,0,HC,c5cae9,A,B,,.YRBC,BC,0,0,JF,Rs,303e9f,B,C,,.YRCD,CD,0,0,R3,Ag,0d125a,C,D,,...N_e',
  Bell_Crank:
    '2P.Ay,1E8.A,0.1011.6A,A,016K,0Fe,0.0B,B,01KV,093,0.0C,C,0R4,Fe,0.CD,D,0,0,0.0E,E,CW,Lg,0.0F,F,pS,Ok,0.4G,G,si,6G,0..YRAB,AB,0,0,01DQ,0CM,c5cae9,A,B,,.YRBC,BC,0,0,0to,3I,303e9f,B,C,,.YRCDE,CDE,0,0,04t,CR,26A69A,C,D,E,,CD,DE.YREF,EF,0,0,V_,NC,00695C,E,F,,.YRFG,FG,0,0,r4,FV,c5cae9,F,G,,.NRCD,CD,0,0,0DY,7q,0d125a,C,D,,.NRDE,DE,0,0,6G,Ar,B2DFDB,D,E,,...N_g',
  Flywheel_Engine:
    '2P.Ay,1E8.5,0.1011.6A,A,0,0,0,,,,2SG.0B,B,Fe,0,0.0R,R,0Lu,0,0.0C,C,17u,0,0.5P,P,17u,0,0..0RABR,Flywheel,0,0,025,0,c5cae9,A,B,R,,.YRBC,Connecting rod,0,0,hm,0,303e9f,B,C,,.YPCP,CP,0,0,0,0,,C,P,,...N_C',
  Screw_Jack:
    '2P.Ay,YO.5,0.1011.0A,A,0ID,0,0.0B,B,G4,FE,0.4C,C,0,YO,0.7P,P,0ID,0,0..YRAB,AB,0,0,014,7d,c5cae9,A,B,,.YRBC,BC,0,0,82,Op,303e9f,B,C,,.YPAP,AP,0,0,0,0,,A,P,,...N_a',
  Elliptical_Trammel:
    '2P.Ay,Im.5,0.1011.0A,A,Fe,0,0.0B,B,0,Fe,0.0T,T,AR,5D,0.7C,C,Fe,0,0.5D,D,0,Fe,OZ..YRABT,ABT,0,0,8i,6y,c5cae9,A,B,T,,.YPAC,AC,0,0,0,0,,A,C,,.YPBD,BD,0,0,0,0,,B,D,,...N_g',
  Peaucellier:
    '2P.Ay,1E8.A,0.1011.4O,O,0,0,0.6C,C,VG,0,0.0P,P,ku,R4,0.0A,A,g5,11r,0.0B,B,1E3,3X,0.GQ,Q,19G,gI,0..YRCP,CP,0,0,d4,DY,c5cae9,C,P,,.YROA,OA,0,0,L2,Wx,303e9f,O,A,,.YROB,OB,0,0,d1,1n,0d125a,O,B,,.YRAP,AP,0,0,iU,kT,B2DFDB,A,P,,.YRBP,BP,0,0,_T,FJ,26A69A,B,P,,.YRAQ,AQ,0,0,vg,s4,00695C,A,Q,,.YRBQ,BQ,0,0,1Bf,Mw,c5cae9,B,Q,,...N_A',
  Pantograph:
    '2P.Ay,1E8.A,0.1011.6G,G,0,0,0.4H,H,_W,0,0.0R,R,0,Im,0.0S,S,pP,bT,0.GT,T,Ib,lh,0.4O,O,01E8,VG,0.0J,J,0ku,1jO,0.0K,K,0_W,16K,0.0L,L,0EA,1EY,0.GP,P,0To,dU,0..YRGR,GR,0,0,0,9O,c5cae9,G,R,,.YRRST,RST,0,0,NL,Ye,303e9f,R,S,T,,.YRHS,HS,0,0,uz,Ik,0d125a,H,S,,.YRJKO,JKO,0,0,0_W,16K,B2DFDB,J,K,O,,.YRJLT,JLT,0,0,0EA,1EY,26A69A,J,L,T,,.YRKP,KP,0,0,0k9,sv,00695C,K,P,,.YRLP,LP,0,0,0L_,x0,c5cae9,L,P,,...N_L',
  Double_Butterfly:
    '2P.Ay,1E8.A,0.1011.6A,A,0,0,0.4B,B,1WQ,0,0.0C,C,03I,UK,0.0D,D,Lu,7W,0.0E,E,g2,qg,0.0F,F,1RG,nY,0.0G,G,1Jw,SS,0.0H,H,uk,G6,0.0I,I,18_,0H2,0.0J,J,10Y,W2,0..YRACD,ACD,0,0,6D,Cd,c5cae9,A,C,D,,.YRCE,CE,0,0,JO,fV,303e9f,C,E,,.YREFG,EFG,0,0,18P,hZ,0d125a,E,F,G,,.YRBFJ,BFJ,0,0,1K4,RC,B2DFDB,B,F,J,,.YRDHI,DHI,0,0,oX,2C,26A69A,D,H,I,,.YRGH,GH,0,0,16K,MH,00695C,G,H,,.YRIJ,IJ,0,0,14m,7W,c5cae9,I,J,,...N_N',
  Crane_Two_Loads:
    '2P.Ay,1E8.5,0.1011.4O,O,0,0,0.0C,C,W9,cJ,0.0T,T,16K,1Jo,0.6G,G,bW,0CW,0,,,,2Ce.0K,K,mB,_,0..YRGK,Luffing crank,VG,o,gr,05n,c5cae9,G,K,,.YRCK,Luffing link,ku,6G,eA,Jf,303e9f,C,K,,.YROCT,Jib,2xW,ku,E4,Gm,0d125a,O,C,T,,..2F1,OCT,F1,16K,1Jo,16K,14A,-UW.3F2,OCT,F2,uG,132,kD,t4,hyW..N_W',
  Locked_Four_Bar:
    '2P.Ay,1E8.5,0.1011.6A,A,0,0,0.0B,B,Nm,0,0.0C,C,126,lL,0.4D,D,17S,0,0.0E,E,1As,PW,0.0F,F,dq,Uc,0.0G,G,W5,tN,0.0H,H,Bu,G4,0.0I,I,11K,UW,0..YRABH,ABH,0,0,01Zi,bM,c5cae9,A,B,H,,.YRBCFG,BCFG,0,0,jM2,p3C,303e9f,B,C,F,G,,.YRCDEI,CDEI,0,0,1pNm,0550,0d125a,C,D,E,I,,...N_.JB,JC,JD,JE,JF,JG,JIZ',
  Three_Machines:
    '2P.Ay,1E8.5,0.1011.6A,A,0,0,0,,,,2SG.0B,B,0,VG,0.GC,C,bx,Lv,0.4D,D,Fe,0,0.6E,E,1z0,0,0,,,,01z0.0F,F,2Ce,0,0.0G,G,2xW,0,0.6H,H,Fe,1Tm,0,,,,2xW.0I,I,Fe,1jO,0.0J,J,vQ,22e,0.4K,K,16K,1Tm,0.5P,P,2xW,0,0..YRAB,Drag crank,0,0,0,Fe,c5cae9,A,B,,.YRBC,Drag coupler,0,0,I_,Qb,303e9f,B,C,,.YRCD,Drag output,0,0,Qo,Az,0d125a,C,D,,.YREF,Crank,0,0,24q,0,B2DFDB,E,F,,.YRFG,Connecting rod,0,0,2a4,0,26A69A,F,G,,.YRHI,Rocker crank,0,0,Fe,1ba,00695C,H,I,,.YRIJ,Rocker coupler,0,0,aX,1u0,c5cae9,I,J,,.YRJK,Rocker,0,0,-t,1mC,303e9f,J,K,,.YPGP,GP,0,0,0,0,,G,P,,...N_m',
  Walking_Pair:
    '2P.1jO,1E8.5,0.1011.6A,A,0,0,0,,,,2SG.0B,B,3gO,0,0.4C,C,09Hm,01vu,0.0D,D,05tE,7ee,0.0E,E,0IGg,1-F,0.0F,F,06b8,0B7B,0.0G,G,0ETW,06sL,0.GH,H,0AYO,0MPj,0.6I,I,adm,0,0,,,,2SG.0J,J,WzO,0,0.4K,K,RM0,01vu,0.0L,L,NDQ,7M8,0.0M,M,IAZ,05Jn,0.0N,N,KhD,08pN,0.0O,O,C-u,0DR3,0.GP,P,SOk,0Hyj,0..YRAB,AB,0,0,1rC,0,c5cae9,A,B,,.YRBD,BD,0,0,016R,3qK,303e9f,B,D,,.YRCDE,CDE,0,0,0B8Z,2ag,0d125a,C,D,E,,.YRBF,BF,0,0,01TO,05Zc,B2DFDB,B,F,,.YRCF,CF,0,0,07xS,06WY,26A69A,C,F,,.YREG,EG,0,0,0GN5,02RZ,00695C,E,G,,.YRFGH,FGH,0,0,0AXh,0DT4,c5cae9,F,G,H,,.YRIJ,IJ,0,0,Yoa,0,303e9f,I,J,,.YRJL,JL,0,0,S5P,3h4,0d125a,J,L,,.YRKLM,KLM,0,0,Mv-,2r,B2DFDB,K,L,M,,.YRJN,JN,0,0,QqI,04Pi,26A69A,J,N,,.YRKN,KN,0,0,O0c,05Me,00695C,K,N,,.YRMO,MO,0,0,FbD,09NQ,c5cae9,M,O,,.YRNOP,NOP,0,0,Khy,0DP2,303e9f,N,O,P,,...N_R',
  Straight_Line_Pair:
    '2P.Ay,1E8.5,0.1011.6A,A,0VG,0,0,,,,2SG.0B,B,0Fe,_W,0.0C,C,Fe,_W,0.GD,D,0,_W,0.4E,E,VG,0,0.4G,G,2Ce,0,0.6H,H,2hu,0,0,,,,2SG.0I,I,2xW,R4,0.0J,J,2sj,11r,0.0K,K,3Qh,3X,0.GL,L,3Lu,gI,0..YRAC,AC,0,0,07q,VG,c5cae9,A,C,,.YRBCD,BCD,0,0,0,_W,303e9f,B,C,D,,.YRBE,BE,0,0,7q,VG,0d125a,B,E,,.YRHI,HI,0,0,2pi,DY,B2DFDB,H,I,,.YRGJ,GJ,0,0,2Xg,Wx,26A69A,G,J,,.YRGK,GK,0,0,2pf,1n,00695C,G,K,,.YRJI,JI,0,0,2v6,kT,c5cae9,J,I,,.YRKI,KI,0,0,3B5,FJ,303e9f,K,I,,.YRJL,JL,0,0,36I,s4,0d125a,J,L,,.YRKL,KL,0,0,3OH,Mw,B2DFDB,K,L,,...N_A',
  Pumping_Field:
    '2P.Ay,1E8.5,0.1011.4A,A,0gB,0oI,0.0B,B,0QZ,0o1,0.2C,C,0d4,0,0,,,,2SG.4D,D,0,0,0.0E,E,o0,0,0.0F,F,r8,0eW,0.4H,H,2Wz,0oI,0.0I,I,2mb,0o1,0.2J,J,2a4,0,0,,,,1z0.4K,K,3B8,0,0.0L,L,3z8,0,0.0M,M,40G,0eW,0.4O,O,5i5,0oI,0.0P,P,5xj,0o1,0.2Q,Q,5lC,0,0,,,,2xW.4R,R,6MG,0,0.0S,S,78G,0,0.0T,T,7BO,0eW,0.5G,G,r8,0eW,OZ.5N,N,40G,0eW,OZ.5U,U,7BO,0eW,OZ..YRAB,AB,0,0,0YN,0oA,c5cae9,A,B,,.YRBC,BC,0,0,0Wq,0P1,303e9f,B,C,,.YRCDE,CDE,0,0,3f,0,0d125a,C,D,E,,.YREF,EF,0,0,pa,0KG,B2DFDB,E,F,,.YRHI,HI,0,0,2en,0oA,26A69A,H,I,,.YRIJ,IJ,0,0,2gK,0P1,00695C,I,J,,.YRJKL,JKL,0,0,3En,0,c5cae9,J,K,L,,.YRLM,LM,0,0,3_i,0KG,303e9f,L,M,,.YROP,OP,0,0,5pv,0oA,0d125a,O,P,,.YRPQ,PQ,0,0,5rS,0P1,B2DFDB,P,Q,,.YRQRS,QRS,0,0,6Pv,0,26A69A,Q,R,S,,.YRST,ST,0,0,79q,0KG,00695C,S,T,,.YPFG,FG,0,0,0,0,,F,G,,.YPMN,MN,0,0,0,0,,M,N,,.YPTU,TU,0,0,0,0,,T,U,,...N_3',
  // </generated>
};
