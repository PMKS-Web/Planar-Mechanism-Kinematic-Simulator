import '../../app/model/joint';
import { PrisJoint, RealJoint } from '../../app/model/joint';
import { Mechanism } from '../../app/model/mechanism/mechanism';
import { partitionMechanisms } from '../../app/model/mechanism/mechanism-partition';
import { MODEL_SCALE } from '../../app/model/render-scale';
import { LengthUnit } from '../../app/model/unit-enums';
import { WhatIsThisDrawing } from '../../app/model/what-is-this/machine-sheet';
import { ActiveObjService } from '../../app/services/active-obj.service';
import { MechanismService } from '../../app/services/mechanism.service';
import { SettingsService } from '../../app/services/settings.service';
import { MechanismBuilder } from '../../app/services/transcoding/mechanism-builder';
import { StringTranscoder } from '../../app/services/transcoding/string-transcoder';

/** A drawing decoded from its URL payload, with its joints, links and forces. */
export function decodeDrawing(payload: string) {
  const decoder = new StringTranscoder();
  decoder.decodeURL(payload);
  const settings = new SettingsService();
  const target = {
    joints: [],
    links: [],
    forces: [],
    mechanismTimeStep: 0,
  } as unknown as MechanismService;
  new MechanismBuilder(target, decoder, settings, new ActiveObjService()).build(true, false);
  return { target, settings };
}

/**
 * What the fact sheets are built from, for a drawing decoded from its URL
 * payload: every machine partitioned and solved the way
 * `MechanismService.updateMechanism` solves it.
 */
export function whatIsThisDrawing(payload: string, backdropFileName?: string): WhatIsThisDrawing {
  const { target, settings } = decodeDrawing(payload);
  const unit = settings.lengthUnit.value;
  const lengthUnit = unit === LengthUnit.INCH ? 'in' : unit === LengthUnit.METER ? 'm' : 'cm';
  const defaultClockwise = settings.isInputCW.value;
  const defaultRpm = settings.inputSpeed.value;
  const defaultLinearSpeed = settings.linearInputSpeed.value;
  const partitions = partitionMechanisms(target.joints, target.links, target.forces).mechanisms;
  const mechanisms = partitions.map((partition) => {
    const driven = partition.ownJoints.find((j) => j instanceof RealJoint && j.input) as
      RealJoint | undefined;
    const signed =
      driven && driven.driveSpeed !== 0
        ? driven.driveSpeed
        : (defaultClockwise ? -1 : 1) *
          (driven instanceof PrisJoint ? defaultLinearSpeed : defaultRpm);
    return new Mechanism(
      partition.joints,
      partition.links,
      partition.forces,
      [],
      settings.isGravity.value,
      lengthUnit,
      driven instanceof PrisJoint ? signed * MODEL_SCALE : (signed * Math.PI) / 30,
      'adaptive',
      new Set(partition.ownJoints.map((joint) => joint.id))
    );
  });
  return {
    partitions,
    mechanisms,
    lengthUnit,
    defaultRpm,
    defaultLinearSpeed,
    defaultClockwise,
    backdrop: backdropFileName === undefined ? undefined : { fileName: backdropFileName },
  };
}
