// Enter the model cycle through joint.ts before loading the services.
import '../../app/model/joint';
import { TestBed } from '@angular/core/testing';
import { AUDIT_FIXTURES } from '../../test-utils/verification/audit-fixtures';
import { AnalysisSampleService } from '../../app/services/analysis-sample.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { UrlProcessorService } from '../../app/services/url-processor.service';
import { SettingsService } from '../../app/services/settings.service';
import { AnalysisCompareService } from '../../app/services/analysis-compare.service';
import { LengthUnit } from '../../app/model/unit-enums';
import { siUnitFactorsForLength } from '../../app/model/unit-conversions';

export function openAuditPayload(payload: string) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: AnalysisCompareService,
        useValue: {
          live: false,
          record: undefined,
          compare: true,
          register: () => undefined,
          unregister: () => undefined,
          sync: () => undefined,
        },
      },
    ],
  });
  const service = TestBed.inject(MechanismService);
  const processor = TestBed.inject(UrlProcessorService);
  processor.updateFromURL(payload, false, true);
  return {
    service,
    processor,
    settings: TestBed.inject(SettingsService),
    samples: TestBed.inject(AnalysisSampleService),
    mechanism: service.mechanisms[0],
  };
}

export function openAuditFinding(id: number, source = false) {
  const finding = AUDIT_FIXTURES.find((entry) => entry.id === id)!;
  const opened = openAuditPayload(
    source ? (finding.sourcePayload ?? finding.payload) : finding.payload
  );
  expect(opened.service.joints.length).toBe(finding.joints);
  return opened;
}

/** The same geometry/scale conversion the Settings control commits. */
export function changeAuditUnit(opened: ReturnType<typeof openAuditPayload>, unit: LengthUnit) {
  const from = opened.settings.lengthUnit.value;
  const scale = siUnitFactorsForLength(from).distanceToM / siUnitFactorsForLength(unit).distanceToM;
  opened.settings.lengthUnit.next(unit);
  SettingsService.preservedCylinderScale *= scale;
  SettingsService._objectScale.next(SettingsService.objectScale * scale);
  opened.service.updateLinkageUnits(from, unit);
}
