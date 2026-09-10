import { nativeTwinCranksOnPinnedFrame } from '../../../test-utils/verification/native-fixed-frame-fixtures';
import { BodyFactory } from './body-factory';
import { compileBodyDocument } from './constraint-compiler';
import { admitBodyPartition, fixedBodyAdmission } from './body-admission';
import { BodyDocument } from './body-document';
import { rebaseBody } from './rebase-body';
import { newRecordId, WORLD } from './body-id';

function compile(document: BodyDocument) {
  const result = compileBodyDocument(document);
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.system;
}

describe('passively fixed native frames', () => {
  it('does not join independent clocks through a twice-pinned material frame', () => {
    for (const size of [1e-8, 1, 1e8])
      for (const offset of [0, size * 1e6]) {
        const fixture = nativeTwinCranksOnPinnedFrame(size, offset);
        const rebased = rebaseBody(fixture.document, fixture.frame, {
          x: 0.7 * size,
          y: -2 * size,
          angle: 0.9,
        });
        for (const document of [
          fixture.document,
          rebased,
          {
            ...rebased,
            bodies: [...rebased.bodies].reverse(),
            joints: [...rebased.joints].reverse(),
          },
        ]) {
          const system = compile(document);
          expect(system.groups.get(fixture.frame)!.fixed).toBe(true);
          expect(system.groupOf.get(fixture.frame)).toBe(fixture.frame);
          expect(system.groups.get(fixture.frame)!.members.size).toBe(1);
          expect(system.fixedRows.length).toBe(4);
          expect(system.partitions.length).toBe(2);
          for (const crank of fixture.cranks) {
            const partition = system.partitions.find((part) =>
              part.materialIds.includes(crank.body)
            )!;
            expect(partition.unknowns).toEqual([crank.body]);
            expect(partition.boundary).toEqual([fixture.frame]);
            expect(partition.drivers.map((driver) => driver.id)).toEqual([crank.driver.id]);
            expect(admitBodyPartition(system, partition).ok, `size ${size}, offset ${offset}`).toBe(
              true
            );
          }
        }
      }
  });

  it('keeps coincident redundant supports and a commanded pin free to rotate', () => {
    const f = new BodyFactory();
    const body = f.body('rod', { x: 0, y: 0, angle: 0.7 }, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
    ]);
    const ground = f.attachment(WORLD, { x: 0, y: 0 }),
      anchor = f.attachment(body, { x: 0, y: 0 });
    const pin = f.joint('revolute', ground, anchor);
    f.joint('revolute', ground, anchor);
    const document = {
      ...f.document,
      drivers: [
        {
          id: newRecordId<'driver'>(),
          coordinate: { jointId: pin.id, coordinate: 'angle' as const },
          profile: { kind: 'constant-speed' as const, initial: 0, speed: 1 },
        },
      ],
    };
    const system = compile(document);
    expect(system.groups.get(body)!.fixed).toBe(false);
    expect(admitBodyPartition(system, system.partitions[0]).ok).toBe(true);
  });

  it('retains a conflicting drive on a frame as a fixed-drive refusal', () => {
    const fixture = nativeTwinCranksOnPinnedFrame();
    const system = compile({
      ...fixture.document,
      drivers: [
        ...fixture.document.drivers,
        {
          id: newRecordId<'driver'>(),
          coordinate: { jointId: fixture.supports[0].id, coordinate: 'angle' },
          profile: { kind: 'constant-speed', initial: 0, speed: 1 },
        },
      ],
    });
    expect(system.fixedDrivers.length).toBe(1);
    expect(fixedBodyAdmission(system)).toBe('fixed-drive');
  });

  it('propagates fixedness through passive frame connections in either enumeration order', () => {
    const fixture = nativeTwinCranksOnPinnedFrame();
    const f = new BodyFactory(fixture.document);
    const pose = fixture.document.bodies.find((body) => body.id === fixture.frame)!.pose;
    const relay = f.body('second frame bar', pose, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
    ]);
    for (const x of [0, 4])
      f.joint(
        'revolute',
        f.attachment(fixture.frame, { x, y: 0 }),
        f.attachment(relay, { x, y: 0 })
      );
    for (const document of [
      f.document,
      {
        ...f.document,
        bodies: [...f.document.bodies].reverse(),
        joints: [...f.document.joints].reverse(),
      },
    ]) {
      const system = compile(document);
      expect(system.groups.get(relay)!.fixed).toBe(true);
      expect(system.partitions.length).toBe(2);
      expect(system.fixedRows.length).toBe(8);
      expect(fixedBodyAdmission(system)).toBeUndefined();
    }
  });

  it('does not discard an inconsistent support while identifying a frame', () => {
    const fixture = nativeTwinCranksOnPinnedFrame();
    const badAnchor = fixture.supports[1].frameA.attachmentId;
    const document = {
      ...fixture.document,
      attachments: fixture.document.attachments.map((anchor) =>
        anchor.id === badAnchor
          ? { ...anchor, point: { ...anchor.point, x: anchor.point.x + 0.01 } }
          : anchor
      ),
    };
    const system = compile(document);
    expect(system.groups.get(fixture.frame)!.fixed).toBe(false);
    expect(system.partitions.length).toBe(1);
    expect(admitBodyPartition(system, system.partitions[0])).toMatchObject({
      ok: false,
      reason: 'inconsistent',
    });
  });
});
