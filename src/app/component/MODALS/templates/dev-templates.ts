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
  // not simulatable: a bar, a grounded pin, a driven crank, ternary and
  // quaternary links, a traced point and a slider.
  Dev_Object_Gallery:
    '2P.Ay,1E8.K,0.1011.0A,A,0bW,E4,0.0B,B,0U0,E4,0.4C,C,0NS,E4,0.0D,D,0Fy,E4,0.6E,E,09O,E4,0.0F,F,01u,E4,0.0G,G,4i,E4,0.0H,H,CC,E4,0.0I,I,8S,Ke,0.0J,J,Im,E4,0.0K,K,QG,E4,0.0L,L,QG,La,0.0M,M,Im,La,0.0N,N,0bW,0,0.GO,O,0U0,0,0.5P,P,0NS,0,0.0Q,Q,0Fy,0,0.0R,R,09O,0,0.0S,S,01u,0,0.0T,T,05e,06a,0..YRAB,AB,0,Fe,0Xm,E4,c5cae9,A,B,,.YRCD,CD,0,Fe,0Ji,E4,9fa8da,C,D,,.YREF,EF,0,Fe,05e,E4,f4a742,E,F,,.YRGHI,GHI,0,Fe,8S,GG,303e9f,G,H,I,,.YRJKLM,JKLM,0,Fe,MW,Hq,0d125a,J,K,L,M,,.YRNO,NO,0,Fe,0Xm,0,b2dfdb,N,O,,.YRPQ,PQ,0,Fe,0Ji,0,26a69a,P,Q,,.YRRST,RST,0,Fe,05e,02C,00695c,R,S,T,,...N_B',
  // Twenty joints, thirteen links and a traced path on every moving one, all
  // on a single degree of freedom, so the renderer has as much to do per frame
  // as it is ever likely to.
  Dev_Render_Stress:
    '2P.Ay,1E8.K,0.1011.6A,A,0,F0,0.GB,B,3m,F0,0.GC,C,0II,72,0.GD,D,0EY,072,0.4E,E,0Fy,F0,0.GF,F,0Cg,72,0.GG,G,08w,072,0.4H,H,0AK,F0,0.GI,I,7_,72,0.GJ,J,Bk,072,0.4K,K,AK,F0,0.GL,L,Dc,72,0.GM,M,HM,072,0.4N,N,Fy,F0,0.4O,O,F6,F0,0.GP,P,La,La,0.GQ,Q,Pu,PK,0.4R,R,0F6,F0,0.GS,S,0La,Ji,0.GT,T,0Pu,NS,0..YRAB,AB,0,Fe,1u,F0,f4a742,A,B,,.YRBCD,BCD,0,Fe,09i,50,8d6e63,B,C,D,,.YRCE,CE,0,Fe,0H7,B1,c5cae9,C,E,,.YRBFG,BFG,0,Fe,05y,50,a1887f,B,F,G,,.YRFH,FH,0,Fe,0BV,B1,c5cae9,F,H,,.YRBIJ,BIJ,0,Fe,7q,50,8d6e63,B,I,J,,.YRIK,IK,0,Fe,99,B1,c5cae9,I,K,,.YRBLM,BLM,0,Fe,Ba,50,a1887f,B,L,M,,.YRLN,LN,0,Fe,En,B1,c5cae9,L,N,,.YRBPQ,BPQ,0,Fe,H4,Ke,a5d6a7,B,P,Q,,.YRPO,PO,0,Fe,IL,II,81c784,P,O,,.YRBST,BST,0,Fe,0Ea,JO,c8e6c9,B,S,T,,.YRSR,SR,0,Fe,0IL,HM,66bb6a,S,R,,...N_y',
};
