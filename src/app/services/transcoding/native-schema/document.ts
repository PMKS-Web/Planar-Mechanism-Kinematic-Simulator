import { BodyDocument } from '../../../model/body-system/body-document';
import { material, attachment, group, load } from './material';
import { joint, junction, driver, limit, hold, assembly } from './joints';
import { boundedJson, id, list, literal, object } from './shape';

const documentShape = object({
  version: literal(2),
  units: object({
    length: literal('m', 'cm', 'in'),
    mass: literal('kg', 'g', 'lb'),
    inertia: literal('kg*m2', 'kg*cm2', 'lb*in2'),
    force: literal('N', 'lbf'),
  }),
  bodies: list(material),
  attachments: list(attachment),
  joints: list(joint),
  junctions: list(junction),
  assemblies: list(assembly),
  drivers: list(driver),
  limits: list(limit),
  forces: list(load),
  groups: list(group),
  holds: list(hold),
  locks: list(id),
});

export function hasBodyDocumentShape(value: unknown): value is BodyDocument {
  return boundedJson(value) && documentShape(value);
}
