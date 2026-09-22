/**
 * The drawing a maintainer reported four wrong slider plates on, as the URL
 * they sent (decision S18).
 *
 * A URL rather than a `FIXTURE_GALLERY` entry, which is the rule everywhere
 * else, because the reason for that rule is already satisfied here: the point
 * of the gallery is that a reviewer can open a fixture instead of rebuilding it
 * by hand, and this mechanism arrived as something they can open. Paste it
 * after the app's `?` and the four cases below are left to right on the grid.
 *
 * Four cylinders whose end joint is a grounded slider, one per case:
 *
 * - **D** — the barrel's mount is a Prismatic slider. Its plate drew the thin
 *   bar the barrel's two joints describe on top of the barrel, so the part read
 *   as two nested outlines.
 * - **G** — the barrel's mount is a Pin-in-slot slider, which fuses nothing.
 *   The same thin bar was hoisted above the block as a rider, inside the barrel.
 * - **K** — the rod's end joint is a Prismatic slider: a plate holding a thin
 *   rod, and the skin's real rod beside it.
 * - **O** — a rod welded into the body `NOP`, whose joint `O` is a Prismatic
 *   slider. The seal at the rod's other end claimed the body first, so the
 *   Slide had nothing to plate and drew a bare black block.
 *
 * Read by `src/tests/verification/slide-plate-fusion.spec.ts` and, through the
 * file rather than a second copy of the string, by `e2e/cylinder-mount-render.mjs`.
 */
export const SLIDE_FUSION_PAYLOAD =
  '2v.Fe,1E8.A,0.1011.DD,D,1EK,0V-,0.0D1,D1,sS,8X,0.0E,E,QC,uQ,0.fF,F,o5,Fw,0,DD1,D,D1.5G,G,20y,0Um,0.0G1,G1,1bi,7P,0.0H,H,15D,qt,0.fI,I,1WT,Ek,0,GG1,G,G1.0J,J,2-8,0UM,0.0J1,J1,2Kd,Lx,0.DK,K,1ue,uK,0.fL,L,2ZA,43,0,JJ1,J,J1.0M,M,3pN,0UO,0.fN,N,3NO,41,0,MM1,M,M1.DO,O,2it,uI,0.0M1,M1,38r,Lv,0.0P,P,3C3,1Eh,0..ARDD1,DD1,0,0,12O,0Bl,303e9f,D,D1,,.AREF,EF,0,0,c9,aA,B2DFDB,F,E,,.ARHI,HI,0,0,1Ir,Xo,B2DFDB,I,H,,.ARGG1,GG1,0,0,1pK,0Bh,303e9f,G,G1,,.ARJJ1,JJ1,0,0,2ft,04D,303e9f,J,J1,,.ARKL,KL,0,0,2Dv,UB,B2DFDB,L,K,,.ARMM1,MM1,0,0,3U6,04G,303e9f,M,M1,,.ARNOP,NOP,0,0,2-I,mq,B2DFDB,N,O,P,,NO,OP.aRNO,NO,0,0,327,U9,B2DFDB,N,O,,.aROP,OP,0,0,2yT,13V,B2DFDB,O,P,,...N_.KREF,KRHI,KRKL,KRNOr*0tXalK';
