import { TestBed } from '@angular/core/testing';
import { RealLink } from '../model/link';
import { TEMPLATE_LINKAGES } from '../component/MODALS/templates/template-linkages';
import { MechanismService } from './mechanism.service';
import { SettingsService } from './settings.service';
import { UrlProcessorService } from './url-processor.service';

/**
 * A drawing of several machines is dragged one joint at a time, and only the
 * machine that joint belongs to has anything new to solve. The others keep
 * the frames they had.
 */
describe('rebuilding a drawing of several machines', () => {
  let mechanism: MechanismService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    mechanism = TestBed.inject(MechanismService);
    TestBed.inject(UrlProcessorService).updateFromURL(
      TEMPLATE_LINKAGES['Three_Machines'],
      false,
      true,
      false
    );
  });

  afterEach(() => {
    mechanism.isPlaying = false;
    mechanism.animate(0, false);
  });

  it('keeps the machines a moved joint is not part of', () => {
    expect(mechanism.partitions.length).toBe(3);
    const before = [...mechanism.mechanisms];
    const moved = mechanism.partitions[0].ownJoints.find(
      (joint) => !('ground' in joint && joint.ground)
    )!;
    moved.x += 20;
    mechanism.updateMechanism();
    expect(mechanism.mechanisms[0]).not.toBe(before[0]);
    expect(mechanism.mechanisms[1]).toBe(before[1]);
    expect(mechanism.mechanisms[2]).toBe(before[2]);
  });

  it('solves every machine again when a document-wide input changes', () => {
    const before = [...mechanism.mechanisms];
    const settings = TestBed.inject(SettingsService);
    settings.isGravity.next(!settings.isGravity.value);
    mechanism.updateMechanism();
    expect(mechanism.mechanisms.every((one, index) => one !== before[index])).toBe(true);
  });

  it('solves a machine again when one of its links changes mass', () => {
    const before = [...mechanism.mechanisms];
    const link = mechanism.partitions[1].links.find(
      (candidate): candidate is RealLink => candidate instanceof RealLink
    )!;
    link.mass = link.mass + 1;
    mechanism.updateMechanism();
    expect(mechanism.mechanisms[1]).not.toBe(before[1]);
    expect(mechanism.mechanisms[0]).toBe(before[0]);
  });

  it('solves nothing again when nothing changed', () => {
    const before = [...mechanism.mechanisms];
    mechanism.updateMechanism();
    expect(mechanism.mechanisms).toEqual(before);
    expect(mechanism.mechanisms[0]).toBe(before[0]);
  });
});
