import '../../model/joint';
import { buildMechanism } from '../../../test-utils/verification/fixture';
import { structuralCrankFixture } from '../../../test-utils/verification/structural-fixtures';
import { urlGeneratorFor } from '../../../test-utils/url-encoding';
import { MechanismService } from '../mechanism.service';
import { SettingsService } from '../settings.service';
import { ActiveObjService } from '../active-obj.service';
import { StructuralAnalysisService } from '../structural-analysis.service';
import { MechanismBuilder } from './mechanism-builder';
import { StringTranscoder } from './string-transcoder';
import { Checksum } from './checksum';
import {
  decodeStructuralDocument,
  encodeStructuralDocument,
  StructuralDocument,
} from './structural-codec';

const properties = {
  material: {
    name: 'Steel — Δ, fatigue sample',
    elasticModulusPa: 200e9,
    poissonRatio: 0.3,
    densityKgM3: 7850,
    yieldStrengthPa: 250e6,
    ultimateStrengthPa: 400e6,
  },
  crossSection: { kind: 'rectangle' as const, widthM: 0.02, heightM: 0.04 },
};
const document: StructuralDocument = {
  links: [{ id: 'AB', properties }],
  loadCases: [
    {
      name: 'Tip load',
      loads: [
        {
          kind: 'point-force',
          linkId: 'AB',
          at: { frame: 'link', positionM: { x: 2, y: 0 } },
          forceN: { x: 0, y: -100 },
          directionFrame: 'global',
        },
        { kind: 'moment', linkId: 'AB', momentNm: 2.5 },
      ],
      gravityMPerS2: { x: 0, y: -9.80665 },
    },
  ],
};

function source() {
  return {
    ...buildMechanism(structuralCrankFixture()),
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
}

describe('structural data in PMKS URLs', () => {
  it('round-trips Unicode names, material/section precision, and complete load cases', () => {
    expect(decodeStructuralDocument(encodeStructuralDocument(document))).toEqual(document);
    expect(encodeStructuralDocument(document)[0]).toMatch(/^T1[A-Za-z0-9_-]+$/);
  });

  it('restores structural properties on actual Link instances through the builder', () => {
    const drawing = source();
    drawing.links[0].structural = properties;
    const service = new StructuralAnalysisService();
    service.replaceLoadCases(document.loadCases);
    const encoded = urlGeneratorFor(
      drawing,
      new SettingsService(),
      undefined,
      service
    ).generateUrlQuery();
    const decoder = new StringTranscoder();
    decoder.decodeURL(encoded);
    const target = {
      joints: [],
      links: [],
      forces: [],
      mechanismTimeStep: 0,
    } as unknown as MechanismService;
    new MechanismBuilder(target, decoder, new SettingsService(), new ActiveObjService()).build(
      true
    );
    expect(target.links[0].structural).toEqual(properties);
    expect(decoder.getStructuralDocument().loadCases).toEqual(document.loadCases);
    service.replaceLoadCases(decoder.getStructuralDocument().loadCases);
    expect(service.loadCases).toEqual(document.loadCases);
  });

  it('writes no extension without structural data and leaves existing URL bytes unchanged', () => {
    const drawing = source();
    const settings = new SettingsService();
    const before = urlGeneratorFor(drawing, settings).generateUrlQuery();
    drawing.links[0].structural = properties;
    const withMetadata = urlGeneratorFor(drawing, settings).generateUrlQuery();
    drawing.links[0].structural = undefined;
    expect(urlGeneratorFor(drawing, settings).generateUrlQuery()).toBe(before);
    expect(new Checksum().strip(withMetadata)).toBe(
      new Checksum().strip(before) +
        '.' +
        encodeStructuralDocument({ links: document.links, loadCases: [] })[0]
    );
    const decoder = new StringTranscoder();
    decoder.decodeURL(before);
    expect(decoder.getStructuralDocument()).toEqual({ links: [], loadCases: [] });
  });

  it('retains data through an undo/redo style sequence of URL snapshots', () => {
    const drawing = source();
    const service = new StructuralAnalysisService();
    const encode = () =>
      urlGeneratorFor(drawing, new SettingsService(), undefined, service).generateUrlQuery();
    const old = encode();
    drawing.links[0].structural = properties;
    service.replaceLoadCases(document.loadCases);
    const edited = encode();
    for (const [url, count] of [
      [old, 0],
      [edited, 1],
      [old, 0],
      [edited, 1],
    ] as const) {
      const decoder = new StringTranscoder();
      decoder.decodeURL(url);
      service.replaceLoadCases(decoder.getStructuralDocument().loadCases);
      expect(service.loadCases.length).toBe(count);
      expect(decoder.getStructuralDocument().links.length).toBe(count);
    }
  });

  it('rejects unknown versions, duplicate sections, malformed JSON, and nonphysical properties', () => {
    const valid = encodeStructuralDocument(document);
    for (const entries of [['T2abc'], [valid[0], valid[0]], ['T1abc'], ['T1!']]) {
      expect(() => decodeStructuralDocument(entries)).toThrow();
    }
    expect(() =>
      encodeStructuralDocument({
        ...document,
        links: [{ id: 'AB', properties: { material: { name: 'Bad', densityKgM3: NaN } } }],
      })
    ).toThrow();
  });

  it('refuses metadata targeting a missing link before the builder mutates the drawing', () => {
    const encoder = new StringTranscoder();
    encoder.decodeURL(urlGeneratorFor(source(), new SettingsService()).generateUrlQuery());
    encoder.setStructuralDocument({ links: [{ id: 'missing', properties }], loadCases: [] });
    const invalid = encoder.encodeURL();
    expect(() => new StringTranscoder().decodeURL(invalid)).toThrow(/missing/);
  });

  it('keeps a deleted load target so a later solve diagnoses the missing load instead of dropping it', () => {
    const cases = [
      {
        name: 'Deleted target',
        loads: [{ kind: 'moment' as const, linkId: 'gone', momentNm: 12 }],
      },
    ];
    expect(
      decodeStructuralDocument(encodeStructuralDocument({ links: [], loadCases: cases })).loadCases
    ).toEqual(cases);
  });

  it('does not let callers mutate stored cases or decoded snapshots through aliases', () => {
    const service = new StructuralAnalysisService();
    service.replaceLoadCases(document.loadCases);
    const copied = service.loadCases;
    (copied as unknown as { name: string }[])[0].name = 'Changed';
    expect(service.loadCases[0].name).toBe('Tip load');
    const decoder = new StringTranscoder();
    decoder.setStructuralDocument(document);
    const result = decoder.getStructuralDocument();
    (result.links[0].properties.material as { name: string }).name = 'Changed';
    expect(decoder.getStructuralDocument()).toEqual(document);
  });
});
