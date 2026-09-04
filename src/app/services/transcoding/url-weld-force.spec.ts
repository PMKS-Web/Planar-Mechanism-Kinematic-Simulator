import '../../model/joint';
import { Coord } from '../../model/coord';
import { Force } from '../../model/force';
import { RevJoint } from '../../model/joint';
import { RealLink } from '../../model/link';
import { ForceUnit, GlobalUnit, LengthUnit } from '../../model/unit-enums';
import { ActiveObjService } from '../active-obj.service';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { Checksum } from './checksum';
import { FlagPacker } from './flag-packer';
import { MechanismBuilder } from './mechanism-builder';
import { BoolSetting, EnumSetting } from './stored-settings';
import { StringTranscoder } from './string-transcoder';
import { LEGACY_FORCE_MECHANISM } from '../../../tests/fixtures/mechanism-fixtures';
import { MODEL_SCALE } from '../../model/render-scale';

// Models are built in internal model units (user units x MODEL_SCALE) so the
// encoded URLs carry the same user-unit numbers they always have.
const S = MODEL_SCALE;

function withChecksum(raw: string): string {
  return raw + new Checksum().generateChecksum(raw.length);
}

function targetService(): MechanismService {
  return {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
}

function weldedSource() {
  const a = new RevJoint('A', 0, 0);
  const b = new RevJoint('B', 1 * S, 0);
  const c = new RevJoint('C', 2 * S, 0);
  b.isWelded = true;
  const ab = new RealLink('AB', [a, b], 2, 3, new Coord(0.5 * S, 0));
  const bc = new RealLink('BC', [b, c], 1, 4, new Coord(1.5 * S, 0));
  const root = new RealLink('ABC', [a, b, c], 3, 23 / 3, new Coord((5 / 6) * S, 0), [ab, bc]);
  [a, b, c].forEach((joint) => {
    joint.links = [root];
    joint.connectedJoints = [a, b, c].filter((candidate) => candidate !== joint);
  });
  const force = new Force(
    'F1',
    root,
    new Coord(0.25 * S, 0),
    new Coord(0.25 * S, -1 * S),
    true,
    true,
    10
  );
  root.forces.push(force);
  return { joints: [a, b, c], links: [root], forces: [force], force };
}

describe('welded force URL compatibility', () => {
  it('round-trips production welded forces and the last enum, carrying no selection', () => {
    const source = weldedSource();
    const sourceService = {
      ...source,
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    const settings = new SettingsService();
    settings.lengthUnit.next(LengthUnit.METER);
    settings.forceUnit.next(ForceUnit.NEWTON);
    settings.globalUnit.next(GlobalUnit.SI);
    const active = new ActiveObjService();
    active.updateSelectedObj(source.force);
    const encoded = urlGeneratorFor(sourceService, settings).generateUrlQuery();

    const decoder = new StringTranscoder();
    decoder.decodeURL(encoded);
    expect(decoder.getBoolSetting(BoolSetting.IS_FORCES)).toBe(true);
    expect(decoder.getEnumSetting(EnumSetting.GLOBAL_UNIT, GlobalUnit)).toBe(GlobalUnit.SI);

    const target = targetService();
    const targetSettings = new SettingsService();
    const targetActive = new ActiveObjService();
    new MechanismBuilder(target, decoder, targetSettings, targetActive).build(true);

    expect(target.links).toHaveLength(1);
    expect((target.links[0] as RealLink).subset.map((link) => link.id).sort()).toEqual([
      'AB',
      'BC',
    ]);
    expect(target.forces).toHaveLength(1);
    expect(target.forces[0].link).toBe(target.links[0]);
    expect((target.links[0] as RealLink).forces).toEqual(target.forces);
    // What is selected is deliberately not part of the URL: a shared link
    // should open on the reader's own nothing-selected rather than on whatever
    // the sender last clicked, and undo — which replays these URLs — should
    // move the mechanism rather than the highlight.
    // 'Grid' is how this app spells nothing-selected once something has looked:
    // the grid is what is active when no part is.
    expect(targetActive.objType).toBe('Grid');
    expect(targetSettings.globalUnit.value).toBe(GlobalUnit.SI);
    expect(targetSettings.lengthUnit.value).toBe(LengthUnit.METER);
    expect(targetSettings.forceUnit.value).toBe(ForceUnit.NEWTON);
  });

  it('maps legacy subset-owned forces to the compound root', () => {
    const source = weldedSource();
    const settings = new SettingsService();
    const active = new ActiveObjService();
    const encoded = urlGeneratorFor(
      { ...source, mechanismTimeStep: 0 } as unknown as MechanismService,
      settings
    ).generateUrlQuery();
    const raw = encoded.slice(0, -1).replace('F1,ABC,', 'F1,AB,');
    const decoder = new StringTranscoder();
    decoder.decodeURL(withChecksum(raw));
    const target = targetService();
    new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(
      false
    );
    expect(target.forces[0].link).toBe(target.links[0]);
    expect((target.links[0] as RealLink).forces).toEqual(target.forces);
  });

  it('loads URLs without an active-object section and ignores the legacy force-disable bit', () => {
    const source = weldedSource();
    const encoded = urlGeneratorFor(
      { ...source, mechanismTimeStep: 0 } as unknown as MechanismService,
      new SettingsService()
    ).generateUrlQuery();
    let raw = encoded.slice(0, -1);
    raw = raw.slice(0, raw.lastIndexOf('.'));
    const boolEnd = raw.indexOf('.');
    const flags = FlagPacker.unpack(raw.slice(0, boolEnd), 8);
    flags[BoolSetting.IS_FORCES] = false;
    raw = FlagPacker.pack(flags) + raw.slice(boolEnd);

    const decoder = new StringTranscoder();
    decoder.decodeURL(withChecksum(raw));
    expect(decoder.getBoolSetting(BoolSetting.IS_FORCES)).toBe(false);
    const target = targetService();
    const active = new ActiveObjService();
    new MechanismBuilder(target, decoder, new SettingsService(), active).build(false);
    expect(target.forces).toHaveLength(1);
    expect(active.objType).toBe('Grid');
  });

  it('derives Metric/Newton settings from a legacy three-enum URL', () => {
    const source = weldedSource();
    const encoded = urlGeneratorFor(
      { ...source, mechanismTimeStep: 0 } as unknown as MechanismService,
      new SettingsService()
    ).generateUrlQuery();
    const sections = encoded.slice(0, -1).split('.');
    expect(sections[3]).toHaveLength(4);
    sections[3] = sections[3].slice(0, 3);
    const decoder = new StringTranscoder();
    decoder.decodeURL(withChecksum(sections.join('.')));
    const settings = new SettingsService();
    new MechanismBuilder(targetService(), decoder, settings, new ActiveObjService()).build(true);

    expect(settings.lengthUnit.value).toBe(LengthUnit.CM);
    expect(settings.forceUnit.value).toBe(ForceUnit.NEWTON);
    expect(settings.globalUnit.value).toBe(GlobalUnit.METRIC);
  });

  it('normalizes contradictory four-enum settings from the encoded length unit', () => {
    const source = weldedSource();
    const encoded = urlGeneratorFor(
      { ...source, mechanismTimeStep: 0 } as unknown as MechanismService,
      new SettingsService()
    ).generateUrlQuery();
    const sections = encoded.slice(0, -1).split('.');
    sections[3] = '1002'; // centimeter, degrees, lbf, SI
    const decoder = new StringTranscoder();
    decoder.decodeURL(withChecksum(sections.join('.')));
    const settings = new SettingsService();
    new MechanismBuilder(targetService(), decoder, settings, new ActiveObjService()).build(true);

    expect(settings.lengthUnit.value).toBe(LengthUnit.CM);
    expect(settings.forceUnit.value).toBe(ForceUnit.NEWTON);
    expect(settings.globalUnit.value).toBe(GlobalUnit.METRIC);
  });

  it('terminates and loads the pre-active-object legacy force URL', () => {
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL(LEGACY_FORCE_MECHANISM)).not.toThrow();
    const target = targetService();
    new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(
      false
    );
    expect(target.forces).toHaveLength(1);
    expect(target.forces[0].link.id).toBe('bc');
  });

  it('carries the reader\u2019s force unit, kilograms-force included', () => {
    // The force unit used to be re-derived from the length one on the way out
    // and on the way in, which is fine while there is one metric force unit
    // and wrong the moment there are two: a link shared in kgf opened in N.
    const source = weldedSource();
    const settings = new SettingsService();
    settings.lengthUnit.next(LengthUnit.CM);
    settings.globalUnit.next(GlobalUnit.METRIC);
    settings.forceUnit.next(ForceUnit.KGF);
    const encoded = urlGeneratorFor(
      { ...source, mechanismTimeStep: 0 } as unknown as MechanismService,
      settings
    ).generateUrlQuery();

    const decoder = new StringTranscoder();
    decoder.decodeURL(encoded);
    const restored = new SettingsService();
    new MechanismBuilder(targetService(), decoder, restored, new ActiveObjService()).build(true);

    expect(restored.forceUnit.value).toBe(ForceUnit.KGF);
    expect(restored.lengthUnit.value).toBe(LengthUnit.CM);
  });

  it('lands on pounds-force under English, whatever the panel last held', () => {
    // English has no kilogram-force. The pick survives a trip through metric
    // rather than being spent, but it is never what an inch drawing reads in.
    const source = weldedSource();
    const settings = new SettingsService();
    settings.lengthUnit.next(LengthUnit.INCH);
    settings.globalUnit.next(GlobalUnit.ENGLISH);
    settings.forceUnit.next(ForceUnit.KGF);
    const encoded = urlGeneratorFor(
      { ...source, mechanismTimeStep: 0 } as unknown as MechanismService,
      settings
    ).generateUrlQuery();

    const decoder = new StringTranscoder();
    decoder.decodeURL(encoded);
    expect(decoder.getEnumSetting(EnumSetting.FORCE_UNIT, ForceUnit)).toBe(ForceUnit.LBF);
    const restored = new SettingsService();
    new MechanismBuilder(targetService(), decoder, restored, new ActiveObjService()).build(true);
    expect(restored.forceUnit.value).toBe(ForceUnit.LBF);
  });

  it('rejects malformed or corrupted data instead of partially decoding it', () => {
    const decoder = new StringTranscoder();
    expect(() => decoder.decodeURL('not-a-mechanism')).toThrow();
    expect(() => decoder.decodeURL(LEGACY_FORCE_MECHANISM.slice(0, -1) + '0')).toThrow();
  });
});
