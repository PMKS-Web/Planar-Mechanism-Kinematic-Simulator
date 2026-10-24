import { buildMechanismFixture } from '../../../tests/fixtures/mechanism-fixtures';
import { TEMPLATE_LINKAGES } from '../../component/MODALS/templates/template-linkages';
import { exportNames } from './export-names';

/** Two rams hanging off one bracket, so the bracket's own id holds two buried ends. */
const TWO_IN_ONE_BRACKET =
  '2v.4A,Fe.5,0.1011.8T,T,Ec,18D,0.0T1,T1,hw,1I-,0.0U,U,1PA,1Zf,0.fV,V,UW,1E3,0,TT1T2W,T,T1.' +
  '0W,W,3b,wE,0.0T2,T2,SK,wV,0.0X,X,az,nt,0.fY,Y,NE,-a,0,TT1T2W,T,T2..' +
  'ARUV,UV,0,0,xr,1Os,26A69A,V,U,,.ARXY,XY,0,0,U5,uj,0d125a,Y,X,,.' +
  'ARTT1T2W,TT1T2W,0,0,Jx,15O,26A69A,T,T1,W,T2,,TT1,TW,TT2.' +
  'aRTT1,TT1,0,0,TG,1Dc,26A69A,T,T1,,.aRTW,TW,0,0,95,11D,c5cae9,T,W,,.' +
  'aRTT2,TT2,0,0,LT,11M,0d125a,T,T2,,...N_9*2JUZvL';

describe('what an exported file may call a body', () => {
  it('leaves a drawing with no cylinder in it exactly as it was', () => {
    // The whole reason this is not simply `visibleBodyName`: an export of a
    // drawing that buries nothing has to come out byte for byte as it did
    // before, and so does every row of a drawing that buries something
    // somewhere else.
    const built = buildMechanismFixture(TEMPLATE_LINKAGES['4-Bar']);
    const names = exportNames(built.service.joints, built.service.links);

    expect(names.buried.size).toBe(0);
    expect(built.service.links.map((link) => names.idOf(link))).toEqual(
      built.service.links.map((link) => link.id)
    );
    expect(built.service.links.map((link) => names.nameOf(link))).toEqual(
      built.service.links.map((link) => link.name)
    );
    expect(names.shown(built.service.joints)).toEqual(built.service.joints);
  });

  it('renames only the bodies that carry a buried joint', () => {
    const built = buildMechanismFixture(TWO_IN_ONE_BRACKET);
    const names = exportNames(built.service.joints, built.service.links);
    const bracket = built.service.links.find((link) => link.id === 'TT1T2W')!;
    const rod = built.service.links.find((link) => link.id === 'UV')!;

    expect([...names.buried].sort()).toEqual(['T1', 'T2']);
    // The bracket holds both buried ends, so its id is not a name.
    expect(names.idOf(bracket)).toBe('TW');
    expect(names.nameOf(bracket)).toBe('TW');
    expect(names.shown(bracket.joints).map((joint) => joint.id)).toEqual(['T', 'W']);
    // A rod's id is its seal and its end joint, neither of which is buried, so
    // it is untouched -- which is why the *barrel* is the whole of the problem.
    expect(names.idOf(rod)).toBe('UV');
    expect(names.shown(built.service.joints).map((joint) => joint.id)).toEqual([
      'T',
      'U',
      'V',
      'W',
      'X',
      'Y',
    ]);
  });

  it('says what kind of body it is rather than falling back to the id', () => {
    // A welded body and a plain bar between the same two joints both read
    // `TW`. The key has to stay unique, and the one thing it must not be is
    // the id -- which is the name being avoided.
    const built = buildMechanismFixture(TWO_IN_ONE_BRACKET);
    const bracket = built.service.links.find((link) => link.id === 'TT1T2W')!;
    const rival = built.service.links.find((link) => link.id === 'UV')!;
    // Stand a body called `TW` in the bracket's way.
    rival.name = 'TW';
    Object.defineProperty(rival, 'id', { value: 'TW', configurable: true });

    const names = exportNames(built.service.joints, built.service.links);
    expect(names.idOf(rival)).toBe('TW');
    expect(names.idOf(bracket)).toBe('TW welded');
  });
});
