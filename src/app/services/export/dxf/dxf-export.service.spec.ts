import '../../../model/joint';
import { TestBed } from '@angular/core/testing';
import DxfParser from 'dxf-parser';
import { BehaviorSubject } from 'rxjs';
import { RevJoint } from '../../../model/joint';
import { RealLink } from '../../../model/link';
import { MODEL_SCALE } from '../../../model/render-scale';
import { LengthUnit } from '../../../model/unit-enums';
import { MechanismService } from '../../mechanism.service';
import { SettingsService } from '../../settings.service';
import { DEFAULT_DXF_EXPORT_OPTIONS, DxfExportService } from './dxf-export.service';

describe('DxfExportService', () => {
  function setup() {
    const a = new RevJoint('A', 0, 0);
    const b = new RevJoint('B', 2 * MODEL_SCALE, MODEL_SCALE);
    const link = new RealLink('AB', [a, b]);
    a.links.push(link);
    b.links.push(link);
    const mechanism = {
      joints: [a, b],
      links: [link],
      forces: [],
      encodeFromStartPose: vi.fn(<T>(run: (heldStep: number) => T): T => run(27)),
    };
    const settings = {
      lengthUnit: new BehaviorSubject(LengthUnit.METER),
      isInputCW: new BehaviorSubject(false),
    };
    TestBed.configureTestingModule({
      providers: [
        DxfExportService,
        { provide: MechanismService, useValue: mechanism },
        { provide: SettingsService, useValue: settings },
      ],
    });
    return { service: TestBed.inject(DxfExportService), mechanism };
  }

  it('exports the entire editable drawing through the start-pose boundary', () => {
    const { service, mechanism } = setup();

    const file = service.create();
    const parsed = new DxfParser().parseSync(file.content);

    expect(mechanism.encodeFromStartPose).toHaveBeenCalledOnce();
    expect(file.name).toBe('mechanism.dxf');
    expect(file.mime).toBe('application/dxf;charset=utf-8');
    expect(file.blob.type).toBe(file.mime);
    expect(parsed?.header['$INSUNITS']).toBe(6);
    expect(parsed?.entities.some((entity) => entity.type === 'LINE')).toBe(true);
  });

  it('publishes stable UI defaults and sanitizes the requested file name', () => {
    const { service } = setup();

    expect(DEFAULT_DXF_EXPORT_OPTIONS).toEqual({
      fileName: 'mechanism',
      includeLabels: false,
      includeKinematicAnnotations: true,
      includeForces: true,
      includeConstruction: true,
    });
    expect(service.create({ fileName: '  Lab / linkage.DXF  ' }).name).toBe('Lab_linkage.dxf');
    expect(service.create({ fileName: '///' }).name).toBe('mechanism.dxf');
  });

  it('is byte-deterministic for unchanged model state and choices', () => {
    const { service } = setup();
    const options = { fileName: 'drawing', includeLabels: true };

    expect(service.create(options).content).toBe(service.create(options).content);
  });
});
